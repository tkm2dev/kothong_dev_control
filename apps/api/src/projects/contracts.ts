/**
 * The API boundary.
 *
 * AC-30 requires identifiers, strings, enums, pagination and the idempotency
 * header to be validated before anything reaches domain logic, with codes drawn
 * only from `docs/ERROR_CODES.md`. Everything crossing the boundary is parsed
 * here, so a handler downstream never has to wonder whether a value was checked.
 */

import { z } from 'zod';
import { ApiError } from '../errors.ts';
import type { Project } from './registry.ts';

/** Pagination Contract, acceptance criteria §3.1. */
export const PAGE_LIMIT_DEFAULT = 25;
export const PAGE_LIMIT_MAX = 100;

const uuid = z.string().uuid();

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  // Opaque to the caller. It happens to be an id, but nothing outside this
  // module may rely on that, or the cursor becomes a permanent commitment to
  // one storage layout.
  cursor: uuid.optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  installationId: uuid,
  owner: z.string().trim().min(1).max(100),
  repo: z.string().trim().min(1).max(100),
});

export const renameProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  expectedVersion: z.coerce.number().int().min(1),
});

/**
 * Parses input, turning any failure into the catalogue code for that shape.
 *
 * The distinction matters: pagination that is out of range answers
 * PAGINATION_INVALID so a caller can tell it from a malformed body, which is
 * what AC-30 asks for.
 */
export function parseOrThrow<T>(
  schema: { safeParse(input: unknown): { success: boolean; data?: T } },
  input: unknown,
  code: 'VALIDATION_FAILED' | 'PAGINATION_INVALID' = 'VALIDATION_FAILED',
): T {
  const result = schema.safeParse(input);
  if (!result.success || result.data === undefined) throw new ApiError(code);
  return result.data;
}

/**
 * The idempotency key, required on creation.
 *
 * AC-09 only means anything if the client actually sends one, so a missing
 * header is refused rather than quietly generating a key that would make every
 * retry look like a new request.
 */
export function requireIdempotencyKey(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError('IDEMPOTENCY_KEY_REQUIRED');
  }
  if (value.length > 200) throw new ApiError('VALIDATION_FAILED');
  return value;
}

export interface ProjectView {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly repository: {
    readonly externalRepositoryId: string;
    readonly ownerLogin: string;
    readonly repositoryName: string;
    readonly visibility: string;
    readonly defaultBranch: string;
    readonly accessStatus: string;
  };
  readonly lastVerifiedAt: string | null;
  readonly freshness: 'FRESH' | 'AGING' | 'STALE';
}

/** Freshness Policy, acceptance criteria §3.1. Seconds. */
export const FRESH_WITHIN_SECONDS = 60 * 60;
export const STALE_AFTER_SECONDS = 60 * 60 * 24;

export function freshnessOf(lastVerifiedAt: Date | null, now: Date): ProjectView['freshness'] {
  if (lastVerifiedAt === null) return 'STALE';
  const age = (now.getTime() - lastVerifiedAt.getTime()) / 1000;
  if (age < FRESH_WITHIN_SECONDS) return 'FRESH';
  if (age < STALE_AFTER_SECONDS) return 'AGING';
  return 'STALE';
}

/**
 * What a project looks like on the wire.
 *
 * `organizationId` is absent on purpose. The caller's organization is already
 * settled by their session, so echoing it back adds nothing and gives a client
 * something to start trusting.
 *
 * AC-16 requires the timestamp to travel with the data rather than being
 * available somewhere else, so freshness is computed here and not left to each
 * client to work out.
 */
export function toProjectView(project: Project, now: Date): ProjectView {
  return {
    id: project.id,
    name: project.name,
    version: project.version,
    repository: {
      externalRepositoryId: project.repository.externalRepositoryId,
      ownerLogin: project.repository.ownerLogin,
      repositoryName: project.repository.repositoryName,
      visibility: project.repository.visibility,
      defaultBranch: project.repository.defaultBranch,
      accessStatus: project.repository.accessStatus,
    },
    lastVerifiedAt: project.lastVerifiedAt?.toISOString() ?? null,
    freshness: freshnessOf(project.lastVerifiedAt, now),
  };
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
