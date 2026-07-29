/**
 * GitHub access, behind an interface.
 *
 * Everything the application knows about GitHub comes through here, so the
 * mapping from GitHub's failures to this system's error catalogue lives in one
 * place and AC-11 has one thing to test rather than one per call site.
 *
 * ADR 0004 forbids using a user's OAuth token to read repositories: reads go
 * through the installation token so the access status recorded reflects the
 * installation's rights, not those of whoever happened to click.
 */

import { ApiError } from '../errors.ts';
import {
  installationSchema,
  repositorySchema,
  toVerifiedRepository,
  type GitHubInstallation,
  type VerifiedRepository,
} from './schemas.ts';

/** The shape of a failure as GitHub's client reports it. */
export interface GitHubHttpError {
  readonly status?: number;
  readonly name?: string;
  readonly message?: string;
  readonly response?: { readonly headers?: Record<string, string | undefined> };
}

/**
 * Maps a GitHub failure onto a catalogue entry.
 *
 * The five conditions AC-11 names map one to one, so each has a test. A
 * timeout and a rate limit are transient; access denied is a real change in
 * permission. AC-14 depends on telling those apart, because one of them means
 * the recorded access status is now wrong and the other means GitHub was busy.
 */
export function githubErrorToApiError(error: unknown): ApiError {
  const failure = error as GitHubHttpError | null;
  const status = failure?.status;
  const name = failure?.name ?? '';
  const message = failure?.message ?? '';

  if (name === 'AbortError' || /timeout|ETIMEDOUT|ECONNRESET/i.test(message)) {
    return new ApiError('GITHUB_TIMEOUT');
  }

  // GitHub answers 403 for both a permission problem and rate limiting, and
  // the remaining-requests header is what separates them.
  const remaining = failure?.response?.headers?.['x-ratelimit-remaining'];
  if ((status === 403 || status === 429) && remaining === '0') {
    return new ApiError('GITHUB_RATE_LIMITED');
  }
  if (status === 429) return new ApiError('GITHUB_RATE_LIMITED');

  if (status === 403) {
    if (/suspend/i.test(message)) return new ApiError('GITHUB_INSTALLATION_SUSPENDED');
    return new ApiError('GITHUB_ACCESS_DENIED');
  }

  // A private repository the installation cannot see answers 404, not 403.
  // Recording it as "not found" is correct and is also what GitHub intends:
  // saying "forbidden" would confirm the repository exists.
  if (status === 404) return new ApiError('GITHUB_REPOSITORY_NOT_FOUND');
  if (status === 401) return new ApiError('GITHUB_ACCESS_DENIED');

  return new ApiError('GITHUB_TIMEOUT');
}

/** Minimal surface of the underlying client, so tests need no network. */
export interface GitHubTransport {
  getRepository(input: { owner: string; repo: string }): Promise<unknown>;
  listInstallationRepositories(): Promise<unknown[]>;
  getInstallation(input: { installationId: string }): Promise<unknown>;
}

export class GitHubClient {
  constructor(private readonly transport: GitHubTransport) {}

  async getRepository(owner: string, repo: string): Promise<VerifiedRepository> {
    const raw = await this.#call(() => this.transport.getRepository({ owner, repo }));
    return toVerifiedRepository(this.#parse(repositorySchema, raw));
  }

  async listRepositories(): Promise<VerifiedRepository[]> {
    const raw = await this.#call(() => this.transport.listInstallationRepositories());
    // One bad entry fails the whole page rather than being quietly dropped. A
    // silently shorter list looks identical to an installation with fewer
    // repositories, and the user would have no way to tell.
    return raw.map((entry) => toVerifiedRepository(this.#parse(repositorySchema, entry)));
  }

  async getInstallation(installationId: string): Promise<GitHubInstallation> {
    const raw = await this.#call(() => this.transport.getInstallation({ installationId }));
    const installation = this.#parse(installationSchema, raw);
    if (installation.suspended_at != null) {
      throw new ApiError('GITHUB_INSTALLATION_SUSPENDED');
    }
    return installation;
  }

  async #call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw githubErrorToApiError(error);
    }
  }

  #parse<T>(schema: { safeParse(input: unknown): { success: boolean; data?: T } }, raw: unknown): T {
    const result = schema.safeParse(raw);
    if (!result.success || result.data === undefined) {
      // No fallback and no partial acceptance. Drift becomes an error someone
      // sees rather than wrong data written as if it had been verified.
      throw new ApiError('GITHUB_CONTRACT_MISMATCH');
    }
    return result.data;
  }
}
