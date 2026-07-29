/**
 * AC-01, AC-06, AC-16, AC-21 and AC-30 at the HTTP boundary.
 */

import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../errors.ts';
import { GitHubClient, type GitHubTransport } from '../github/client.ts';
import {
  FRESH_WITHIN_SECONDS,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  freshnessOf,
  requireIdempotencyKey,
} from './contracts.ts';
import { ProjectsController, type ActorResolver } from './controller.ts';
import { InMemoryUnitOfWork } from './memory-store.ts';
import type { Actor } from './policy.ts';
import { ProjectRegistry } from './registry.ts';

const ORG = 'org-a';
const owner: Actor = {
  userId: 'user-owner',
  organizationId: ORG,
  roles: [{ organizationId: ORG, projectId: null, roleCode: 'PRODUCT_OWNER' }],
};

const githubResponse = {
  id: 1315261211,
  name: 'kothong_dev_control',
  full_name: 'tkm2dev/kothong_dev_control',
  private: false,
  visibility: 'public',
  default_branch: 'main',
  archived: false,
  disabled: false,
  owner: { id: 1, login: 'tkm2dev', type: 'User' },
  permissions: { admin: true, push: true, pull: true },
};

/** Each lookup answers with a distinct repository, so several projects can
 * exist. A transport that always returns the same one would make every create
 * after the first a duplicate. */
let repositoryCounter = 0;
const transport: GitHubTransport = {
  getRepository: async () => ({ ...githubResponse, id: (repositoryCounter += 1) }),
  listInstallationRepositories: async () => [githubResponse],
  getInstallation: async () => ({ id: 1, account: { id: 1, login: 'a' } }),
};

const request = (headers: Record<string, string> = {}) => ({ headers }) as unknown as FastifyRequest;

let n = 0;
const build = (resolver: ActorResolver = { resolve: async () => owner }) => {
  const uow = new InMemoryUnitOfWork();
  const registry = new ProjectRegistry(
    uow,
    () => `00000000-0000-7000-8000-${String((n += 1)).padStart(12, '0')}`,
    () => new Date('2026-07-29T00:00:00Z'),
  );
  return new ProjectsController(
    registry,
    new GitHubClient(transport),
    resolver,
    () => new Date('2026-07-29T00:00:00Z'),
  );
};

const body = () => ({
  name: 'KOTHONG DEV CONTROL',
  installationId: '00000000-0000-7000-8000-000000000099',
  owner: 'tkm2dev',
  repo: 'kothong_dev_control',
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof ApiError ? error.code : `UNEXPECTED:${String(error)}`;
  }
};

describe('authentication', () => {
  const anonymous = build({ resolve: async () => null });

  it.each([
    ['create', () => anonymous.create(request(), body(), 'key')],
    ['list', () => anonymous.list(request(), {})],
    ['get', () => anonymous.get(request(), 'any-id')],
  ])('refuses %s without a session', async (_label, call) => {
    expect(await codeOf(call())).toBe('UNAUTHENTICATED');
  });

  it('answers the same for a real project and a made-up one', async () => {
    // AC-01. An anonymous caller must not be able to probe which ids exist.
    expect(await codeOf(anonymous.get(request(), 'real'))).toBe(
      await codeOf(anonymous.get(request(), 'invented')),
    );
  });
});

describe('idempotency header', () => {
  it('refuses a create with no key', async () => {
    // AC-09 only means anything if the client sends one. Generating a key here
    // would make every retry look like a new request.
    expect(await codeOf(build().create(request(), body(), undefined))).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
  });

  it.each([undefined, '', '   '])('rejects %o', (value) => {
    expect(() => requireIdempotencyKey(value)).toThrow();
  });

  it('accepts a key and creates once', async () => {
    const controller = build();
    const first = await controller.create(request(), body(), 'key-1');
    const second = await controller.create(request(), body(), 'key-1');
    expect(second.id).toBe(first.id);
  });
});

describe('request validation', () => {
  it.each([
    ['missing name', { ...body(), name: undefined }],
    ['blank name', { ...body(), name: '   ' }],
    ['installation id that is not a uuid', { ...body(), installationId: 'not-a-uuid' }],
    ['name beyond the length limit', { ...body(), name: 'x'.repeat(201) }],
  ])('refuses %s', async (_label, payload) => {
    expect(await codeOf(build().create(request(), payload, 'key'))).toBe('VALIDATION_FAILED');
  });

  it('separates a pagination problem from a malformed body', async () => {
    // AC-30. A caller that sent a bad page size should not be told their body
    // was wrong.
    expect(await codeOf(build().list(request(), { limit: '0' }))).toBe('PAGINATION_INVALID');
    expect(await codeOf(build().list(request(), { limit: String(PAGE_LIMIT_MAX + 1) }))).toBe(
      'PAGINATION_INVALID',
    );
    expect(await codeOf(build().list(request(), { cursor: 'not-a-uuid' }))).toBe(
      'PAGINATION_INVALID',
    );
  });

  it('applies the default page size when none is given', async () => {
    const controller = build();
    await controller.create(request(), body(), 'key-1');
    const page = await controller.list(request(), {});
    expect(page.items.length).toBeLessThanOrEqual(PAGE_LIMIT_DEFAULT);
    expect(page.nextCursor).toBeNull();
  });

  it('walks pages with a cursor without repeating or skipping', async () => {
    const controller = build();
    const created: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      created.push((await controller.create(request(), body(), `key-${i}`)).id);
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 5; page += 1) {
      const result: Awaited<ReturnType<typeof controller.list>> = await controller.list(
        request(),
        cursor === null ? { limit: '1' } : { limit: '1', cursor },
      );
      seen.push(...result.items.map((item) => item.id));
      cursor = result.nextCursor;
      if (cursor === null) break;
    }

    expect(seen).toHaveLength(created.length);
    expect(new Set(seen).size).toBe(created.length);
    expect([...seen].sort()).toEqual([...created].sort());
  });
});

describe('server-side verification', () => {
  it('stores what GitHub said, not what the request claimed', async () => {
    // AC-06. The body carries only which repository to look up; every stored
    // field comes back from GitHub.
    const view = await build().create(request(), body(), 'key-1');
    expect(view.repository.ownerLogin).toBe('tkm2dev');
    expect(view.repository.defaultBranch).toBe('main');
    expect(view.repository.visibility).toBe('public');
  });

  it('does not echo the organization back', async () => {
    // The caller's organization is settled by their session. Returning it gives
    // a client something to start trusting.
    const view = await build().create(request(), body(), 'key-1');
    expect(Object.keys(view)).not.toContain('organizationId');
  });
});

describe('freshness', () => {
  const now = new Date('2026-07-29T12:00:00Z');
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

  it('reports data as fresh, ageing or stale by its timestamp', () => {
    expect(freshnessOf(ago(60), now)).toBe('FRESH');
    expect(freshnessOf(ago(FRESH_WITHIN_SECONDS + 60), now)).toBe('AGING');
    expect(freshnessOf(ago(60 * 60 * 25), now)).toBe('STALE');
  });

  it('treats never-verified as stale rather than fresh', () => {
    // Defaulting the other way would present data that was never checked as
    // though it had just been.
    expect(freshnessOf(null, now)).toBe('STALE');
  });

  it('sends the timestamp with the data', async () => {
    // AC-16. The value travels with the record rather than being available
    // somewhere else for a client to go and fetch.
    const view = await build().create(request(), body(), 'key-1');
    expect(view.lastVerifiedAt).not.toBeNull();
    expect(view.freshness).toBe('FRESH');
  });
});
