/**
 * Identity and session reads against PostgreSQL.
 *
 * These decide who someone is and what they may do, so they are verified
 * against the real database rather than a stand-in.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@kdc/db';
import { ApiError } from '../errors.ts';
import { SignIn } from './sign-in.ts';
import { DrizzleIdentityDirectory, DrizzleSessionStore } from './drizzle-directory.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const IN_CI = process.env['CI'] === 'true';
const MIGRATIONS = fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url));

describe('database availability', () => {
  it('has DATABASE_URL when running in CI', () => {
    if (IN_CI) expect(DATABASE_URL, 'CI must provide DATABASE_URL').toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)('identity directory on PostgreSQL', () => {
  let client: pg.Client;
  let pool: pg.Pool;
  let directory: DrizzleIdentityDirectory;
  let sessions: DrizzleSessionStore;

  const orgA = newId();
  const orgB = newId();
  const soleMember = newId();
  const dualMember = newId();
  const strayRoleUser = newId();
  const subjectFor = (userId: string) => `gh-${userId}`;

  const addUser = async (userId: string, organizationIds: string[]) => {
    await client.query('INSERT INTO users (id, display_name, status) VALUES ($1, $2, $3)', [
      userId,
      'user',
      'ACTIVE',
    ]);
    await client.query(
      'INSERT INTO identities (id, user_id, provider, provider_subject) VALUES ($1, $2, $3, $4)',
      [newId(), userId, 'github', subjectFor(userId)],
    );
    for (const organizationId of organizationIds) {
      await client.query(
        'INSERT INTO organization_members (organization_id, user_id, status) VALUES ($1, $2, $3)',
        [organizationId, userId, 'ACTIVE'],
      );
    }
  };

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      for (const statement of readFileSync(`${MIGRATIONS}/${file}`, 'utf8').split(
        '--> statement-breakpoint',
      )) {
        if (statement.trim()) await client.query(statement).catch(() => undefined);
      }
    }

    for (const id of [orgA, orgB]) {
      await client.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
        id,
        'org',
        `org-${id}`,
      ]);
    }
    await addUser(soleMember, [orgA]);
    await addUser(dualMember, [orgA, orgB]);
    await addUser(strayRoleUser, [orgA]);

    await client.query(
      'INSERT INTO role_assignments (id, organization_id, user_id, role_code) VALUES ($1, $2, $3, $4)',
      [newId(), orgA, soleMember, 'PRODUCT_OWNER'],
    );
    // A role belonging to the other organization, and a code the application
    // does not know. Neither may grant anything.
    await client.query(
      'INSERT INTO role_assignments (id, organization_id, user_id, role_code) VALUES ($1, $2, $3, $4)',
      [newId(), orgB, dualMember, 'PRODUCT_OWNER'],
    );
    await client.query(
      'INSERT INTO role_assignments (id, organization_id, user_id, role_code) VALUES ($1, $2, $3, $4)',
      [newId(), orgA, strayRoleUser, 'SUPER_ADMIN'],
    );

    pool = new pg.Pool({ connectionString: DATABASE_URL, max: 5 });
    directory = new DrizzleIdentityDirectory(drizzle(pool));
    sessions = new DrizzleSessionStore(drizzle(pool));
  });

  afterAll(async () => {
    await pool?.end();
    await client?.end();
  });

  it('resolves an identity from the provider account', async () => {
    const identity = await directory.findByProviderSubject('github', subjectFor(soleMember));
    expect(identity).toEqual({ userId: soleMember, organizationId: orgA });
  });

  it('returns nobody for a provider account it has never seen', async () => {
    expect(await directory.findByProviderSubject('github', 'gh-unknown')).toBeNull();
  });

  it('refuses rather than guessing when a user belongs to two organizations', async () => {
    // Picking one would place someone in a tenant they did not ask for, and
    // every authorisation and audit decision after that would be scoped wrong.
    await expect(directory.findByProviderSubject('github', subjectFor(dualMember))).rejects.toThrow(
      ApiError,
    );
  });

  it('reads only the roles held inside the organization asked about', async () => {
    expect(await directory.rolesFor(dualMember, orgA)).toEqual([]);
    expect(await directory.rolesFor(dualMember, orgB)).toHaveLength(1);
  });

  it('grants nothing for a role code the application does not define', async () => {
    // A typo or a row from a future migration must not hand out permissions
    // nobody wrote down.
    expect(await directory.rolesFor(strayRoleUser, orgA)).toEqual([]);
  });

  it('stores and reads a session', async () => {
    const signIn = new SignIn(directory, sessions, newId, () => new Date());
    const { session, actor } = await signIn.completeSignIn({
      account: { provider: 'github', providerSubject: subjectFor(soleMember), login: 'x' },
    });

    expect(actor.roles).toHaveLength(1);
    expect(await signIn.actorForSession(session.id)).not.toBeNull();
  });

  it('makes a session unusable after signing out', async () => {
    const signIn = new SignIn(directory, sessions, newId, () => new Date());
    const { session } = await signIn.completeSignIn({
      account: { provider: 'github', providerSubject: subjectFor(soleMember), login: 'x' },
    });

    await signIn.signOut(session.id);
    expect(await signIn.actorForSession(session.id)).toBeNull();
  });

  it('revokes the previous session when a new one is issued', async () => {
    const signIn = new SignIn(directory, sessions, newId, () => new Date());
    const account = {
      provider: 'github' as const,
      providerSubject: subjectFor(soleMember),
      login: 'x',
    };
    const first = await signIn.completeSignIn({ account });
    const second = await signIn.completeSignIn({ account, previousSessionId: first.session.id });

    expect(await signIn.actorForSession(first.session.id)).toBeNull();
    expect(await signIn.actorForSession(second.session.id)).not.toBeNull();
  });

  it('keeps the moment of the first revocation', async () => {
    const signIn = new SignIn(directory, sessions, newId, () => new Date());
    const { session } = await signIn.completeSignIn({
      account: { provider: 'github', providerSubject: subjectFor(soleMember), login: 'x' },
    });

    await signIn.signOut(session.id);
    const firstRevocation = (await sessions.find(session.id))?.revokedAt;
    await signIn.signOut(session.id);

    expect((await sessions.find(session.id))?.revokedAt).toEqual(firstRevocation);
  });
});
