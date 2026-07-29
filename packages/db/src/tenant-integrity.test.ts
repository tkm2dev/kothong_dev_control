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
        [id, slug, `${slug}-${id}`],
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
        [id, org, `ext-${id}`, 'acct', 'ACTIVE'],
      );
    }
  });

  afterAll(async () => {
    await client?.end();
  });

  /** UUID v7 is time-ordered, so a prefix of one is not unique. Identifiers
   * derived from an id must use the whole thing. */
  const newProject = async (org: string): Promise<string> => {
    const id = newId();
    await client.query(
      'INSERT INTO projects (id, organization_id, name, status) VALUES ($1, $2, $3, $4)',
      [id, org, 'project', 'ACTIVE'],
    );
    return id;
  };

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

  it('allows two organizations to register the same external repository', () => {
    // Global uniqueness would fail here, letting one tenant block another and
    // revealing that the other tenant had registered it.
    const shared = `shared-${newId()}`;
    return (async () => {
      await insertRepository({
        org: orgA,
        project: await newProject(orgA),
        installation: installA,
        externalId: shared,
      });
      await expect(
        insertRepository({
          org: orgB,
          project: await newProject(orgB),
          installation: installB,
          externalId: shared,
        }),
      ).resolves.toBeDefined();
    })();
  });

  it('rejects the same external repository twice inside one organization', async () => {
    const duplicate = `dup-${newId()}`;
    await insertRepository({
      org: orgA,
      project: await newProject(orgA),
      installation: installA,
      externalId: duplicate,
    });
    await expect(
      insertRepository({
        org: orgA,
        project: await newProject(orgA),
        installation: installA,
        externalId: duplicate,
      }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
  // -- constraints added after the security review found the first pass
  //    covered only github_repositories -------------------------------------

  const newUser = async (): Promise<string> => {
    const id = newId();
    await client.query(
      'INSERT INTO users (id, display_name, status) VALUES ($1, $2, $3)',
      [id, 'user', 'ACTIVE'],
    );
    return id;
  };

  const newSecret = async (org: string): Promise<string> => {
    const id = newId();
    await client.query(
      `INSERT INTO secrets (id, organization_id, purpose, algorithm, ciphertext,
                            wrapped_data_key, nonce, auth_tag, key_version)
       VALUES ($1, $2, 'GITHUB_APP_PRIVATE_KEY', 'AES-256-GCM', 'c', 'w', 'n', 't', 'v1')`,
      [id, org],
    );
    return id;
  };

  const insertRoleAssignment = (org: string, project: string | null, user: string) =>
    client.query(
      `INSERT INTO role_assignments (id, organization_id, project_id, user_id, role_code)
       VALUES ($1, $2, $3, $4, 'PRODUCT_OWNER')`,
      [newId(), org, project, user],
    );

  it('rejects a role assignment scoped to another organization project', async () => {
    // role_assignments is the only source of authorisation. A row scoped to one
    // organization but pointing at another's project would grant merge and
    // deploy approval rights across the tenant boundary.
    await expect(insertRoleAssignment(orgA, projectB, await newUser())).rejects.toThrow(
      /foreign key|violates/i,
    );
  });

  it('accepts an organization-wide role assignment with no project', async () => {
    await expect(insertRoleAssignment(orgA, null, await newUser())).resolves.toBeDefined();
  });

  it('accepts a role assignment scoped to a project in the same organization', async () => {
    await expect(insertRoleAssignment(orgA, projectA, await newUser())).resolves.toBeDefined();
  });

  it('rejects an installation referencing another organization secret', async () => {
    // This is the GitHub App private key. A reference that crosses tenants
    // would let one organization decrypt another's key material.
    const secretB = await newSecret(orgB);
    await expect(
      client.query(
        `INSERT INTO github_installations
           (id, organization_id, external_installation_id, account_login, status, secret_reference)
         VALUES ($1, $2, $3, 'acct', 'ACTIVE', $4)`,
        [newId(), orgA, `ext-${newId()}`, secretB],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('accepts an installation referencing a secret in its own organization', async () => {
    const secretA = await newSecret(orgA);
    await expect(
      client.query(
        `INSERT INTO github_installations
           (id, organization_id, external_installation_id, account_login, status, secret_reference)
         VALUES ($1, $2, $3, 'acct', 'ACTIVE', $4)`,
        [newId(), orgA, `ext-${newId()}`, secretA],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects an audit record filed against another organization project', async () => {
    await expect(
      client.query(
        `INSERT INTO audit_records
           (id, organization_id, project_id, actor_type, actor_reference, action_code,
            target_type, outcome, correlation_id)
         VALUES ($1, $2, $3, 'HUMAN', 'u', 'PROJECT_CREATE', 'PROJECT', 'SUCCESS', 'c')`,
        [newId(), orgA, projectB],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it('rejects an activity event filed against another organization project', async () => {
    await expect(
      client.query(
        `INSERT INTO activity_events
           (id, organization_id, project_id, actor_type, actor_reference, action_code,
            target_type, outcome, summary, correlation_id)
         VALUES ($1, $2, $3, 'HUMAN', 'u', 'PROJECT_CREATE', 'PROJECT', 'SUCCESS', 's', 'c')`,
        [newId(), orgA, projectB],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
