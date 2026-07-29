/**
 * Layer 1 of `docs/GITHUB_CONTRACT_STRATEGY.md`: every GitHub response is
 * validated before anything reads it.
 *
 * The schemas cover only the fields the system actually uses. GitHub adds
 * fields regularly and a schema that insisted on the whole payload would break
 * on additions that do not concern us. The fields we do use are required, so a
 * response that stops carrying one is a contract break rather than a silent
 * `undefined` written into the database.
 *
 * Anything that fails validation becomes GITHUB_CONTRACT_MISMATCH. There is
 * deliberately no fallback to a guessed value: drift should surface as an error
 * a person sees, not as wrong data recorded as if it were verified.
 */

import { z } from 'zod';

/**
 * `id` is the immutable numeric identifier. AC-06 makes it the source of truth
 * for the binding, and AC-14 forbids overwriting it, because owner and name
 * both change when a repository is renamed or transferred while `id` does not.
 *
 * It arrives as a JSON number. Numbers above 2^53 lose precision, so it is
 * normalised to a string at the boundary rather than after it has been through
 * arithmetic somewhere.
 */
export const externalRepositoryId = z
  .number()
  .int()
  .positive()
  .transform((value) => String(value));

export const repositoryPermissionsSchema = z.object({
  admin: z.boolean(),
  push: z.boolean(),
  pull: z.boolean(),
});

export const repositorySchema = z.object({
  id: externalRepositoryId,
  name: z.string().min(1),
  full_name: z.string().min(1),
  private: z.boolean(),
  // GitHub reports both `private` and `visibility`. `visibility` carries the
  // third state, `internal`, that `private` cannot express.
  visibility: z.enum(['public', 'private', 'internal']),
  default_branch: z.string().min(1),
  archived: z.boolean(),
  disabled: z.boolean(),
  owner: z.object({
    id: z.number().int().positive(),
    login: z.string().min(1),
    type: z.string().min(1),
  }),
  // Absent when the token cannot see permissions. Treated as no permissions
  // rather than as full ones.
  permissions: repositoryPermissionsSchema.optional(),
});

export type GitHubRepository = z.infer<typeof repositorySchema>;

export const installationSchema = z.object({
  id: z.number().int().positive().transform(String),
  account: z.object({
    id: z.number().int().positive(),
    login: z.string().min(1),
  }),
  suspended_at: z.string().nullable().optional(),
});

export type GitHubInstallation = z.infer<typeof installationSchema>;

/** What the application records after verifying a repository server-side. */
export interface VerifiedRepository {
  readonly externalRepositoryId: string;
  readonly ownerLogin: string;
  readonly repositoryName: string;
  readonly visibility: 'public' | 'private' | 'internal';
  readonly defaultBranch: string;
  readonly accessStatus: 'ACCESSIBLE' | 'ARCHIVED' | 'DISABLED' | 'READ_ONLY';
}

/**
 * Derives what the system stores from what GitHub said.
 *
 * Nothing here reads a value supplied by the browser. AC-06 requires the server
 * to use GitHub's answer as the source of truth, and the only way to guarantee
 * that is for the mapping to have no other input.
 */
export function toVerifiedRepository(repository: GitHubRepository): VerifiedRepository {
  return {
    externalRepositoryId: repository.id,
    ownerLogin: repository.owner.login,
    repositoryName: repository.name,
    visibility: repository.visibility,
    defaultBranch: repository.default_branch,
    accessStatus: accessStatusOf(repository),
  };
}

function accessStatusOf(repository: GitHubRepository): VerifiedRepository['accessStatus'] {
  if (repository.disabled) return 'DISABLED';
  if (repository.archived) return 'ARCHIVED';
  // No write permission is a real state to record, not an error. A repository
  // the installation can only read is still a repository worth registering.
  if (repository.permissions?.push !== true) return 'READ_ONLY';
  return 'ACCESSIBLE';
}
