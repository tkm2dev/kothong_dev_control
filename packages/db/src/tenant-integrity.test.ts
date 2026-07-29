/**
 * AC-29 — tenant boundaries must hold at the database level, not only in
 * application code.
 *
 * These tests write to PostgreSQL directly, bypassing every service layer. That
 * is deliberate: a check that only holds when the application remembers to
 * apply it is not the guarantee AC-29 asks for. If a constraint is missing,
 * these inserts succeed and the test fails.
 *
 * They need a real database. CI provides one; a developer machine may not, so
 * the suite skips when `DATABASE_URL` is absent — except in CI, where a skip
 * would quietly turn a required check green without asserting anything.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from './id.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const IN_CI = process.env['CI'] === 'true';
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

describe('database availability', () => {
  it('has DATABASE_URL when running in CI', () => {
    // Without this, a missing service container would skip the whole suite and
    // report the required check as passing.
    if (IN_CI) expect(DATABASE_URL, 'CI must provide DATABASE_URL').toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)('tenant integrity', () => {
  let client: pg.Client;

  // Two organizations. Every test below tries to make data from one reference
  // data from the other.
  const orgA = newId();
  const orgB = newId();
  const projectA = newId();
  const projectB = newId();
  const installA = newId();
  const installB = newId();

  beforeAll(async () => {
    client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();

    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      const sql = readFileSync(`${MIGRATIONS}/${file}`, 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        if (statement.trim()) await client.query(statement);
      }
    }

    for (const [id, slug] of [
      [orgA, 'org-a'],
      [orgB, 'org-b'],
    ] as const) {
      await client.query(
        'INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [id, slug, `${slug}-${id.slice(0, 8)}`],
      );
    }
    for (const [id, org] of [
      [projectA, orgA],
      [projectB, orgB],
    ] as const) {
      await client.query(
        'INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, $3, $4)',
        [id, org, 'project', 'ACTIVE'],
      );
    }
    for (const [id, org] of [
      [installA, orgA],
      [installB, orgB],
    ] as const) {
      await client.query(
        `INSERT INTO github_installations (id, organization_id, external_installation_id, account_login, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, org, `ext-${id.slice(0, 8)}`, 'acct', 'ACTIVE'],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  const insertRepository = (values: {
    org: string;
    project: string;
    installation: string;
    externalId: string;
  }) =>
    client.query(
      `INSERT INTO github_repositories
         (id, organization_id, project_id, installation_id, external_repository_id,
          owner_login, repository_name, visibility, default_branch, access_status)
       VALUES ($1, $2, $3, $4, $5, 'owner', 'repo', 'private', 'main', 'ACCESSIBLE')`,
      [newId(), values.org, values.project, values.installation, values.externalId],
    );

  it('rejects a repository whose project belongs to another organization', async () => {
    await expect(
      insertRepository({
        org: orgA,
        project: projectB,
        installation: installA,
        externalId: `x-${newId()}`,
      }),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('rejects a repository whose installation belongs to another organization', async () => {
    await expect(
      insertRepository({
        org: orgA,
        project: projectA,
        installation: installB,
        externalId: `x-${newId()}`,
      }),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('accepts a repository whose references all sit in one organization', async () => {
    await expect(
      insertRepository({
        org: orgA,
        project: projectA,
        installation: installA,
        externalId: `x-${newId()}`,
      }),
    ).resolves.toBeDefined();
  });

  it('allows two organizations to register the same external repository', async () => {
    // Global uniqueness would fail here, letting one tenant block another and
    // revealing that the other tenant had registered it.
    const shared = `shared-${newId()}`;
    await insertRepository({
      org: orgA,
      project: newId(),
      installation: installA,
      externalId: shared,
    }).catch(async () => {
      // projectA already holds a repository, so use a fresh project for this org.
      const fresh = newId();
      await client.query(
        'INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, $3, $4)',
        [fresh, orgA, 'project', 'ACTIVE'],
      );
      await insertRepository({
        org: orgA,
        project: fresh,
        installation: installA,
        externalId: shared,
      });
    });

    const freshB = newId();
    await client.query(
      'INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, $3, $4)',
      [freshB, orgB, 'project', 'ACTIVE'],
    );
    await expect(
      insertRepository({
        org: orgB,
        project: freshB,
        installation: installB,
        externalId: shared,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects the same external repository twice inside one organization', async () => {
    const duplicate = `dup-${newId()}`;
    const first = newId();
    const second = newId();
    for (const id of [first, second]) {
      await client.query(
        'INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, $3, $4)',
        [id, orgA, 'project', 'ACTIVE'],
      );
    }
    await insertRepository({
      org: orgA,
      project: first,
      installation: installA,
      externalId: duplicate,
    });
    await expect(
      insertRepository({
        org: orgA,
        project: second,
        installation: installA,
        externalId: duplicate,
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});
