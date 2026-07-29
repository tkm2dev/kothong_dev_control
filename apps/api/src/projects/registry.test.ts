/**
 * AC-03, AC-04, AC-07, AC-08, AC-09, AC-10, AC-15 and AC-28.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.ts';
import type { VerifiedRepository } from '../github/schemas.ts';
import { InMemoryUnitOfWork } from './memory-store.ts';
import { can, denialFor, type Actor } from './policy.ts';
import { ProjectRegistry, type RegisterProjectInput } from './registry.ts';

const ORG = 'org-a';
const OTHER_ORG = 'org-b';

const repository: VerifiedRepository = {
  externalRepositoryId: '1315261211',
  ownerLogin: 'tkm2dev',
  repositoryName: 'kothong_dev_control',
  visibility: 'public',
  defaultBranch: 'main',
  accessStatus: 'ACCESSIBLE',
};

const owner: Actor = {
  userId: 'user-owner',
  organizationId: ORG,
  roles: [{ organizationId: ORG, projectId: null, roleCode: 'PRODUCT_OWNER' }],
};

const member: Actor = {
  userId: 'user-member',
  organizationId: ORG,
  roles: [{ organizationId: ORG, projectId: null, roleCode: 'MEMBER' }],
};

const outsider: Actor = { userId: 'user-outsider', organizationId: OTHER_ORG, roles: [] };

let counter = 0;
const build = () => {
  const uow = new InMemoryUnitOfWork();
  const registry = new ProjectRegistry(
    uow,
    () => `project-${(counter += 1)}`,
    () => new Date('2026-07-29T00:00:00Z'),
  );
  return { uow, registry };
};

const input = (overrides: Partial<RegisterProjectInput> = {}): RegisterProjectInput => ({
  actor: owner,
  name: 'KOTHONG DEV CONTROL',
  installationId: 'install-1',
  repository,
  idempotencyKey: 'key-1',
  correlationId: 'corr-1',
  requestFingerprint: JSON.stringify(['KOTHONG DEV CONTROL', 'install-1', 'tkm2dev', 'repo']),
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

describe('registration', () => {
  it('records the project with activity and audit together', async () => {
    const { uow, registry } = build();
    const { project } = await registry.register(input());

    expect(uow.projects).toHaveLength(1);
    expect(uow.activity.filter((e) => e.outcome === 'SUCCESS')).toHaveLength(1);
    expect(uow.audit.filter((e) => e.outcome === 'SUCCESS')).toHaveLength(1);
    expect(uow.audit[0]?.projectId).toBe(project.id);
    expect(uow.audit[0]?.correlationId).toBe('corr-1');
  });

  it('leaves nothing behind when the work throws', async () => {
    // AC-28. The refusal below happens after the duplicate check has already
    // written events into the draft, so this only passes if the whole unit is
    // discarded rather than partially kept.
    const { uow, registry } = build();
    await registry.register(input());
    const before = uow.projects.length;

    await codeOf(registry.register(input({ idempotencyKey: 'key-2' })));

    expect(uow.projects).toHaveLength(before);
  });
});

describe('duplicate repository', () => {
  it('refuses a repository already registered in the organization', async () => {
    const { registry } = build();
    await registry.register(input());
    expect(await codeOf(registry.register(input({ idempotencyKey: 'key-2' })))).toBe(
      'PROJECT_ALREADY_REGISTERED',
    );
  });

  it('says nothing about who registered it', async () => {
    // AC-08. The error carries a code and nothing else, so the caller cannot
    // learn which project or which owner holds the repository.
    const { registry } = build();
    await registry.register(input());
    try {
      await registry.register(input({ idempotencyKey: 'key-2' }));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(Object.keys(error as object)).not.toContain('projectId');
      expect(String((error as Error).message)).toBe('PROJECT_ALREADY_REGISTERED');
    }
  });
});

describe('idempotency', () => {
  it('returns the first result for a retry with the same payload', async () => {
    const { uow, registry } = build();
    const first = await registry.register(input());
    const second = await registry.register(input());

    expect(second.project.id).toBe(first.project.id);
    expect(second.replayed).toBe(true);
    expect(uow.projects).toHaveLength(1);
  });

  it('does not write a second success audit for a replay', async () => {
    // AC-09. Two audit records saying a project was created would make the
    // trail claim something happened twice when it happened once.
    const { uow, registry } = build();
    await registry.register(input());
    await registry.register(input());

    expect(uow.audit.filter((e) => e.outcome === 'SUCCESS')).toHaveLength(1);
    expect(uow.activity.filter((e) => e.outcome === 'IDEMPOTENT_REPLAY')).toHaveLength(1);
  });

  it('records one activity event per attempt', async () => {
    const { uow, registry } = build();
    await registry.register(input());
    await registry.register(input());
    await registry.register(input());
    expect(uow.activity).toHaveLength(3);
  });

  it('refuses the same key with a different payload', async () => {
    const { registry } = build();
    await registry.register(input());
    expect(
      await codeOf(
        registry.register(
          input({
            name: 'A different name',
            requestFingerprint: JSON.stringify(['A different name', 'install-1', 'tkm2dev', 'repo']),
          }),
        ),
      ),
    ).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('authorisation', () => {
  it('refuses a member who may see the organization but not manage it', async () => {
    // Visible, so the honest answer is "you may not", not "it is not there".
    const { registry } = build();
    expect(await codeOf(registry.register(input({ actor: member })))).toBe('FORBIDDEN');
  });

  it('tells an outsider only that there is nothing there', async () => {
    const { registry } = build();
    expect(await codeOf(registry.register(input({ actor: outsider })))).toBe('NOT_FOUND');
  });

  it('audits a refusal', async () => {
    const { uow, registry } = build();
    await codeOf(registry.register(input({ actor: member })));
    expect(uow.audit.filter((e) => e.outcome === 'DENIED')).toHaveLength(1);
  });

  it('answers the same for an invisible project and a missing one', async () => {
    // The pair of responses must not differ, or comparing them reveals which
    // projects exist.
    const { registry } = build();
    const { project } = await registry.register(input());
    const invisible = await codeOf(registry.get(outsider, project.id));
    const missing = await codeOf(registry.get(outsider, 'project-does-not-exist'));
    expect(invisible).toBe('NOT_FOUND');
    expect(missing).toBe('NOT_FOUND');
  });

  it('lists only what the actor may see', async () => {
    const { registry } = build();
    await registry.register(input());
    expect((await registry.list(owner, { limit: 25 })).items).toHaveLength(1);
    expect((await registry.list(outsider, { limit: 25 })).items).toHaveLength(0);
  });

  it('ignores a role assignment belonging to another organization', async () => {
    // The composite foreign key stops such a row being written; this stops a
    // query from honouring one if it ever appeared.
    const smuggled: Actor = {
      userId: 'u',
      organizationId: ORG,
      roles: [{ organizationId: OTHER_ORG, projectId: null, roleCode: 'PRODUCT_OWNER' }],
    };
    expect(can(smuggled, 'project:manage', { organizationId: ORG })).toBe(false);
  });

  it('confines a project-scoped role to its own project', async () => {
    const scoped: Actor = {
      userId: 'u',
      organizationId: ORG,
      roles: [{ organizationId: ORG, projectId: 'project-x', roleCode: 'PRODUCT_OWNER' }],
    };
    expect(can(scoped, 'project:manage', { organizationId: ORG, projectId: 'project-x' })).toBe(true);
    expect(can(scoped, 'project:manage', { organizationId: ORG, projectId: 'project-y' })).toBe(false);
  });

  it('chooses the refusal from visibility alone', () => {
    expect(denialFor({ visible: true }).code).toBe('FORBIDDEN');
    expect(denialFor({ visible: false }).code).toBe('NOT_FOUND');
  });
});

describe('optimistic concurrency', () => {
  it('applies a rename against the current version', async () => {
    const { registry } = build();
    const { project } = await registry.register(input());
    const renamed = await registry.rename({
      actor: owner,
      projectId: project.id,
      name: 'Renamed',
      expectedVersion: project.version,
      correlationId: 'corr-2',
    });
    expect(renamed.name).toBe('Renamed');
    expect(renamed.version).toBe(project.version + 1);
  });

  it('refuses a stale version instead of overwriting', async () => {
    const { registry } = build();
    const { project } = await registry.register(input());
    await registry.rename({
      actor: owner,
      projectId: project.id,
      name: 'First',
      expectedVersion: project.version,
      correlationId: 'corr-2',
    });

    expect(
      await codeOf(
        registry.rename({
          actor: owner,
          projectId: project.id,
          name: 'Second',
          expectedVersion: project.version,
          correlationId: 'corr-3',
        }),
      ),
    ).toBe('VERSION_CONFLICT');
  });

  it('keeps the first write when a stale one is refused', async () => {
    const { registry } = build();
    const { project } = await registry.register(input());
    await registry.rename({
      actor: owner,
      projectId: project.id,
      name: 'First',
      expectedVersion: project.version,
      correlationId: 'corr-2',
    });
    await codeOf(
      registry.rename({
        actor: owner,
        projectId: project.id,
        name: 'Second',
        expectedVersion: project.version,
        correlationId: 'corr-3',
      }),
    );
    expect((await registry.get(owner, project.id)).name).toBe('First');
  });
});
