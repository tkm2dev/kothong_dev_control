/**
 * The same rules, against PostgreSQL.
 *
 * The in-memory tests prove the rules are right. These prove the database
 * agrees, which is a different claim: transaction rollback, compare-and-set
 * under a concurrent writer, and the unique constraint behind AC-08 are all
 * behaviours a fake can only imitate.
 *
 * Skips without DATABASE_URL, because a developer machine may have no
 * PostgreSQL — but never in CI, where a skip would turn a required check green
 * having asserted nothing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newId } from '@kdc/db';
import { ApiError } from '../errors.ts';
import type { VerifiedRepository } from '../github/schemas.ts';
import { DrizzleUnitOfWork } from './drizzle-store.ts';
import type { Actor } from './policy.ts';
import { ProjectRegistry, type RegisterProjectInput } from './registry.ts';

const DATABASE_URL = process.env['DATABASE_URL'];
const IN_CI = process.env['CI'] === 'true';
const MIGRATIONS = fileURLToPath(new URL('../../../../packages/db/migrations', import.meta.url));

describe('database availability', () => {
  it('has DATABASE_URL when running in CI', () => {
    if (IN_CI) expect(DATABASE_URL, 'CI must provide DATABASE_URL').toBeTruthy();
  });
});

describe.skipIf(!DATABASE_URL)('registry on PostgreSQL', () => {
  let client: pg.Client;
  let registry: ProjectRegistry;
  let uow: DrizzleUnitOfWork;

  const organizationId = newId();
  const installationId = newId();
  let actor: Actor;

  const repository = (externalId: string): VerifiedRepository => ({
    externalRepositoryId: externalId,
    ownerLogin: 'tkm2dev',
    repositoryName: 'repo',
    visibility: 'private',
    defaultBranch: 'main',
    accessStatus: 'ACCESSIBLE',
  });

  const input = (overrides: Partial<RegisterProjectInput> = {}): RegisterProjectInput => ({
    actor,
    name: 'Project',
    installationId,
    repository: repository(`ext-${newId()}`),
    idempotencyKey: `key-${newId()}`,
    correlationId: `corr-${newId()}`,
    ...overrides,
  });

  const codeOf = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
      return 'NO_ERROR';
    } catch (error) {
      return error instanceof ApiError ? error.code : `UNEXPECTED:${String(error)}`;
    }
  };

  const countRows = async (table: string, where: string, params: unknown[]): Promise<number> => {
    const result = await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params);
    return result.rows[0].n as number;
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

    const userId = newId();
    await client.query('INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3)', [
      organizationId,
      'org',
      `org-${organizationId}`,
    ]);
    await client.query('INSERT INTO users (id, display_name, status) VALUES ($1, $2, $3)', [
      userId,
      'owner',
      'ACTIVE',
    ]);
    await client.query(
      `INSERT INTO github_installations (id, organization_id, external_installation_id, account_login, status)
       VALUES ($1, $2, $3, 'acct', 'ACTIVE')`,
      [installationId, organizationId, `ext-${installationId}`],
    );

    actor = {
      userId,
      organizationId,
      roles: [{ organizationId, projectId: null, roleCode: 'PRODUCT_OWNER' }],
    };

    uow = new DrizzleUnitOfWork(drizzle(client));
    registry = new ProjectRegistry(uow, newId, () => new Date());
  });

  afterAll(async () => {
    await client?.end();
  });

  it('commits the project, binding, activity and audit together', async () => {
    const { project } = await registry.register(input());

    expect(await countRows('projects', 'id = $1', [project.id])).toBe(1);
    expect(await countRows('github_repositories', 'project_id = $1', [project.id])).toBe(1);
    expect(
      await countRows('activity_events', "project_id = $1 AND outcome = 'SUCCESS'", [project.id]),
    ).toBe(1);
    expect(
      await countRows('audit_records', "project_id = $1 AND outcome = 'SUCCESS'", [project.id]),
    ).toBe(1);
  });

  it('rolls the whole unit back when the work fails', async () => {
    // AC-28 against the real transaction rather than a copied map. The refusal
    // happens after the project row has already been inserted in this
    // transaction, so anything left behind would show up here.
    const first = input();
    await registry.register(first);
    const before = await countRows('projects', 'organization_id = $1', [organizationId]);

    expect(await codeOf(registry.register({ ...first, idempotencyKey: `key-${newId()}` }))).toBe(
      'PROJECT_ALREADY_REGISTERED',
    );

    expect(await countRows('projects', 'organization_id = $1', [organizationId])).toBe(before);
  });

  it('keeps the refusal even though the attempt rolled back', async () => {
    // The pairing that matters: the change is gone, the record of refusing it
    // is not.
    const outsider: Actor = { userId: newId(), organizationId: newId(), roles: [] };
    const correlationId = `corr-${newId()}`;
    await codeOf(registry.register(input({ actor: outsider, correlationId })));

    expect(await countRows('activity_events', 'correlation_id = $1', [correlationId])).toBe(1);
    expect(
      await countRows('audit_records', "correlation_id = $1 AND outcome = 'DENIED'", [correlationId]),
    ).toBe(1);
  });

  it('returns the first answer for a retry and writes no second project', async () => {
    const request = input();
    const first = await registry.register(request);
    const second = await registry.register(request);

    expect(second.project.id).toBe(first.project.id);
    expect(second.replayed).toBe(true);
    expect(
      await countRows('audit_records', "project_id = $1 AND outcome = 'SUCCESS'", [first.project.id]),
    ).toBe(1);
    expect(
      await countRows('activity_events', "project_id = $1 AND outcome = 'IDEMPOTENT_REPLAY'", [
        first.project.id,
      ]),
    ).toBe(1);
  });

  it('refuses a reused key carrying a different payload', async () => {
    const request = input();
    await registry.register(request);
    expect(await codeOf(registry.register({ ...request, name: 'Different' }))).toBe(
      'IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('applies exactly one of two writes racing on the same version', async () => {
    // The point of compare-and-set. Both callers hold the same version, so one
    // must be told to refresh rather than silently overwriting the other.
    const { project } = await registry.register(input());

    const rename = (name: string) =>
      registry.rename({
        actor,
        projectId: project.id,
        name,
        expectedVersion: project.version,
        correlationId: `corr-${newId()}`,
      });

    const outcomes = await Promise.allSettled([rename('A'), rename('B')]);
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);

    const stored = await registry.get(actor, project.id);
    expect(stored.version).toBe(project.version + 1);
    expect(['A', 'B']).toContain(stored.name);
  });

  it('tells an actor from another organization only that there is nothing there', async () => {
    const { project } = await registry.register(input());
    const outsider: Actor = { userId: newId(), organizationId: newId(), roles: [] };

    expect(await codeOf(registry.get(outsider, project.id))).toBe('NOT_FOUND');
    expect(await codeOf(registry.get(outsider, newId()))).toBe('NOT_FOUND');
  });

  it('lists only the projects of the actor organization', async () => {
    const { project } = await registry.register(input());
    const listed = await registry.list(actor);
    expect(listed.map((p) => p.id)).toContain(project.id);
    expect(listed.every((p) => p.organizationId === organizationId)).toBe(true);
  });
});
