/**
 * AC-06, AC-11 and layers 1 and 2 of `docs/GITHUB_CONTRACT_STRATEGY.md`.
 *
 * The fixture is a real response, recorded from the GitHub REST API for this
 * repository, not written by hand. That matters: a hand-written fixture only
 * proves the code agrees with its author's memory of the API.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.ts';
import { GitHubClient, githubErrorToApiError, type GitHubTransport } from './client.ts';
import { repositorySchema, toVerifiedRepository } from './schemas.ts';

const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/repository-accessible.json', import.meta.url)), 'utf8'),
) as unknown;

const transportReturning = (value: unknown): GitHubTransport => ({
  getRepository: async () => value,
  listInstallationRepositories: async () => [value],
  getInstallation: async () => value,
});

const transportThrowing = (error: unknown): GitHubTransport => ({
  getRepository: async () => {
    throw error;
  },
  listInstallationRepositories: async () => {
    throw error;
  },
  getInstallation: async () => {
    throw error;
  },
});

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof ApiError ? error.code : `UNEXPECTED:${String(error)}`;
  }
};

describe('recorded fixture', () => {
  it('validates against the schema', () => {
    // If GitHub changes shape, re-recording the fixture makes this fail, which
    // is the signal layer 2 of the strategy exists to produce.
    expect(repositorySchema.safeParse(FIXTURE).success).toBe(true);
  });

  it('maps onto what the system stores', () => {
    const repository = repositorySchema.parse(FIXTURE);
    const verified = toVerifiedRepository(repository);
    expect(verified.ownerLogin).toBe('tkm2dev');
    expect(verified.repositoryName).toBe('kothong_dev_control');
    expect(verified.defaultBranch).toBe('main');
    expect(verified.visibility).toBe('public');
    expect(verified.accessStatus).toBe('ACCESSIBLE');
  });

  it('keeps the numeric id exact by carrying it as a string', () => {
    // Above 2^53 a JSON number loses precision. Turning it into a string at
    // the boundary keeps the binding identity intact.
    const repository = repositorySchema.parse(FIXTURE);
    expect(repository.id).toBe('1315261211');
    expect(typeof repository.id).toBe('string');
  });
});

describe('server-side verification', () => {
  it('takes every stored field from the GitHub response', async () => {
    // AC-06. The client is given no browser input at all, so there is nothing
    // it could take from the browser even by mistake.
    const client = new GitHubClient(transportReturning(FIXTURE));
    const verified = await client.getRepository('1', 'ignored', 'ignored');
    expect(verified.repositoryName).toBe('kothong_dev_control');
  });

  it('records a repository the installation cannot write to as read-only', async () => {
    const readOnly = { ...(FIXTURE as object), permissions: { admin: false, push: false, pull: true } };
    const client = new GitHubClient(transportReturning(readOnly));
    expect((await client.getRepository('1', 'o', 'r')).accessStatus).toBe('READ_ONLY');
  });

  it('records an archived repository as archived', async () => {
    const archived = { ...(FIXTURE as object), archived: true };
    const client = new GitHubClient(transportReturning(archived));
    expect((await client.getRepository('1', 'o', 'r')).accessStatus).toBe('ARCHIVED');
  });

  it('treats a missing permissions block as no write access', async () => {
    const { permissions: _omitted, ...withoutPermissions } = FIXTURE as Record<string, unknown>;
    const client = new GitHubClient(transportReturning(withoutPermissions));
    expect((await client.getRepository('1', 'o', 'r')).accessStatus).toBe('READ_ONLY');
  });
});

describe('contract validation', () => {
  it('refuses a response missing a field the system relies on', async () => {
    const { default_branch: _omitted, ...incomplete } = FIXTURE as Record<string, unknown>;
    const client = new GitHubClient(transportReturning(incomplete));
    expect(await codeOf(client.getRepository('1', 'o', 'r'))).toBe('GITHUB_CONTRACT_MISMATCH');
  });

  it('refuses a response where a field changed type', async () => {
    const wrongType = { ...(FIXTURE as object), id: 'not-a-number' };
    const client = new GitHubClient(transportReturning(wrongType));
    expect(await codeOf(client.getRepository('1', 'o', 'r'))).toBe('GITHUB_CONTRACT_MISMATCH');
  });

  it('refuses a visibility value it does not recognise', async () => {
    const unknownVisibility = { ...(FIXTURE as object), visibility: 'something-new' };
    const client = new GitHubClient(transportReturning(unknownVisibility));
    expect(await codeOf(client.getRepository('1', 'o', 'r'))).toBe('GITHUB_CONTRACT_MISMATCH');
  });

  it('fails a page rather than silently dropping an invalid entry', async () => {
    // A shorter list is indistinguishable from an installation with fewer
    // repositories, so dropping the bad one would hide the problem.
    const client = new GitHubClient({
      ...transportReturning(FIXTURE),
      listInstallationRepositories: async () => [FIXTURE, { id: 1 }],
    });
    expect(await codeOf(client.listRepositories('1'))).toBe('GITHUB_CONTRACT_MISMATCH');
  });
});

describe('failure mapping', () => {
  // The five conditions AC-11 names, one case each.
  it.each([
    ['not found', { status: 404 }, 'GITHUB_REPOSITORY_NOT_FOUND'],
    ['access denied', { status: 403, message: 'Resource not accessible' }, 'GITHUB_ACCESS_DENIED'],
    ['suspended installation', { status: 403, message: 'This installation has been suspended' }, 'GITHUB_INSTALLATION_SUSPENDED'],
    ['timeout', { name: 'AbortError' }, 'GITHUB_TIMEOUT'],
    ['rate limited', { status: 429 }, 'GITHUB_RATE_LIMITED'],
  ])('maps %s', async (_label, error, expected) => {
    const client = new GitHubClient(transportThrowing(error));
    expect(await codeOf(client.getRepository('1', 'o', 'r'))).toBe(expected);
  });

  it('separates rate limiting from a permission problem on a 403', async () => {
    // GitHub uses 403 for both. Confusing them would make AC-14 treat a
    // temporary throttle as a permanent loss of access.
    const throttled = githubErrorToApiError({
      status: 403,
      response: { headers: { 'x-ratelimit-remaining': '0' } },
    });
    const denied = githubErrorToApiError({ status: 403, message: 'Resource not accessible' });
    expect(throttled.code).toBe('GITHUB_RATE_LIMITED');
    expect(denied.code).toBe('GITHUB_ACCESS_DENIED');
  });

  it('reports a suspended installation from the installation endpoint', async () => {
    const client = new GitHubClient(
      transportReturning({
        id: 42,
        account: { id: 1, login: 'acct' },
        suspended_at: '2026-07-29T00:00:00Z',
      }),
    );
    expect(await codeOf(client.getInstallation('42'))).toBe('GITHUB_INSTALLATION_SUSPENDED');
  });

  it('never leaks GitHub error text to the caller', async () => {
    // The message could carry a token or an internal URL. Only catalogue codes
    // are allowed out.
    const client = new GitHubClient(
      transportThrowing({ status: 403, message: 'token ghp_secret_value_here rejected' }),
    );
    const code = await codeOf(client.getRepository('1', 'o', 'r'));
    expect(code).toBe('GITHUB_ACCESS_DENIED');
    expect(code).not.toContain('ghp_');
  });
});
