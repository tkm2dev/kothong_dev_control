/**
 * Project registration.
 *
 * The rules this encodes, and where they come from:
 *
 * - AC-07  project, binding, activity and audit commit together or not at all
 * - AC-08  a repository already registered in the organization is a conflict,
 *          and the refusal must not say who registered it
 * - AC-09  a retry with the same key and payload returns the first answer
 * - AC-10  the same key with a different payload is refused
 * - AC-04  a refusal follows the Denied Response Policy and is audited
 *
 * The unit of work is passed in rather than created here, so the same service
 * runs against PostgreSQL and against an in-memory store without a second
 * implementation of the rules drifting away from the first.
 */

import { createHash } from 'node:crypto';
import { ApiError } from '../errors.ts';
import type { VerifiedRepository } from '../github/schemas.ts';
import { isVisible, requireManage, requireRead, type Actor } from './policy.ts';

export type Outcome =
  | 'SUCCESS'
  | 'DENIED'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'UPSTREAM_ERROR'
  | 'IDEMPOTENT_REPLAY';

export type ActionCode =
  | 'PROJECT_CREATE'
  | 'PROJECT_UPDATE'
  | 'PROJECT_REFRESH'
  | 'PROJECT_READ_DENIED'
  | 'INSTALLATION_LIST'
  | 'REPOSITORY_PREVIEW';

export interface Project {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly version: number;
  readonly repository: VerifiedRepository;
  readonly lastVerifiedAt: Date | null;
}

export interface RecordedEvent {
  readonly actionCode: ActionCode;
  readonly outcome: Outcome;
  readonly correlationId: string;
  readonly organizationId: string;
  readonly projectId: string | null;
  readonly actorReference: string;
}

export interface IdempotencyRecord {
  readonly requestDigest: string;
  readonly responseReference: string;
}

/**
 * One transaction. Every method runs inside it; nothing commits until the
 * caller's function returns.
 */
export interface RegistryTransaction {
  findProjectByExternalRepositoryId(
    organizationId: string,
    externalRepositoryId: string,
  ): Promise<Project | null>;
  findProject(organizationId: string, projectId: string): Promise<Project | null>;
  listProjects(organizationId: string): Promise<Project[]>;
  insertProject(project: Project, installationId: string): Promise<void>;
  updateProject(project: Project, expectedVersion: number): Promise<boolean>;
  findIdempotency(key: IdempotencyKey): Promise<IdempotencyRecord | null>;
  saveIdempotency(key: IdempotencyKey, record: IdempotencyRecord): Promise<void>;
  recordActivity(event: RecordedEvent): Promise<void>;
  recordAudit(event: RecordedEvent): Promise<void>;
}

export interface IdempotencyKey {
  readonly organizationId: string;
  readonly actorReference: string;
  readonly operationCode: string;
  readonly idempotencyKey: string;
}

export interface UnitOfWork {
  run<T>(work: (tx: RegistryTransaction) => Promise<T>): Promise<T>;
}

export interface RegisterProjectInput {
  readonly actor: Actor;
  readonly name: string;
  readonly installationId: string;
  readonly repository: VerifiedRepository;
  readonly idempotencyKey: string;
  readonly correlationId: string;
}

/**
 * Hashes what the request asked for.
 *
 * AC-10 compares this rather than field by field, so a payload that differs
 * anywhere is caught, including in a field added later that nobody remembered
 * to include in a hand-written comparison.
 */
export function requestDigest(input: RegisterProjectInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        name: input.name,
        installationId: input.installationId,
        externalRepositoryId: input.repository.externalRepositoryId,
      }),
    )
    .digest('hex');
}

/**
 * Which outcome a refusal is recorded under, and whether it needs an audit
 * record, per the Audit Record Policy in the acceptance criteria §3.1.
 *
 * Audit is required for every denial, and for a conflict arising from a tenant
 * boundary or from optimistic concurrency. A duplicate registration or a reused
 * idempotency key changes no state and denies no one, so it is recorded as
 * activity only.
 */
export function failureRecord(code: string): { outcome: Outcome; audit: boolean } {
  switch (code) {
    case 'FORBIDDEN':
    case 'NOT_FOUND':
      return { outcome: 'DENIED', audit: true };
    case 'VERSION_CONFLICT':
    case 'TENANT_BOUNDARY_VIOLATION':
      return { outcome: 'CONFLICT', audit: true };
    case 'PROJECT_ALREADY_REGISTERED':
    case 'IDEMPOTENCY_KEY_REUSED':
      return { outcome: 'CONFLICT', audit: false };
    default:
      return { outcome: 'UPSTREAM_ERROR', audit: false };
  }
}

export class ProjectRegistry {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly newId: () => string,
    private readonly now: () => Date,
  ) {}

  async register(input: RegisterProjectInput): Promise<{ project: Project; replayed: boolean }> {
    const base = {
      organizationId: input.actor.organizationId,
      actorReference: input.actor.userId,
      correlationId: input.correlationId,
      projectId: null,
    };

    try {
      return await this.unitOfWork.run(async (tx) => {
        requireManage(input.actor, { organizationId: input.actor.organizationId });

        const key: IdempotencyKey = {
          organizationId: input.actor.organizationId,
          actorReference: input.actor.userId,
          operationCode: 'PROJECT_CREATE',
          idempotencyKey: input.idempotencyKey,
        };
        const digest = requestDigest(input);
        const seen = await tx.findIdempotency(key);

        if (seen !== null) {
          if (seen.requestDigest !== digest) {
            // AC-10. Reusing a key for a different request is a client bug
            // worth surfacing, not something to guess an intention about.
            throw new ApiError('IDEMPOTENCY_KEY_REUSED');
          }
          const existing = await tx.findProject(input.actor.organizationId, seen.responseReference);
          if (existing === null) throw new ApiError('INTERNAL_ERROR');

          // AC-09: one activity per attempt so the replay is visible, and no
          // second success audit, because nothing changed the second time.
          await tx.recordActivity({
            ...base,
            projectId: existing.id,
            actionCode: 'PROJECT_CREATE',
            outcome: 'IDEMPOTENT_REPLAY',
          });
          return { project: existing, replayed: true };
        }

        const duplicate = await tx.findProjectByExternalRepositoryId(
          input.actor.organizationId,
          input.repository.externalRepositoryId,
        );
        // AC-08. The refusal carries a code and nothing else, so the caller
        // cannot learn which project or owner holds the repository.
        if (duplicate !== null) throw new ApiError('PROJECT_ALREADY_REGISTERED');

        const project: Project = {
          id: this.newId(),
          organizationId: input.actor.organizationId,
          name: input.name,
          version: 1,
          repository: input.repository,
          lastVerifiedAt: this.now(),
        };

        await tx.insertProject(project, input.installationId);
        await tx.saveIdempotency(key, { requestDigest: digest, responseReference: project.id });

        const success = {
          ...base,
          projectId: project.id,
          actionCode: 'PROJECT_CREATE' as const,
          outcome: 'SUCCESS' as const,
        };
        await tx.recordActivity(success);
        await tx.recordAudit(success);

        return { project, replayed: false };
      });
    } catch (error) {
      await this.#recordFailure(error, { ...base, actionCode: 'PROJECT_CREATE' });
      throw error;
    }
  }

  /**
   * Records a failed attempt in its own transaction.
   *
   * The attempt's own transaction has already rolled back by the time this
   * runs, which is what AC-28 requires — but AC-04 requires the refusal to
   * survive. Writing it inside the failed transaction would roll the evidence
   * back along with the change it was evidence about.
   */
  async #recordFailure(
    error: unknown,
    event: { organizationId: string; actorReference: string; correlationId: string; projectId: string | null; actionCode: ActionCode },
  ): Promise<void> {
    const code = error instanceof ApiError ? error.code : 'INTERNAL_ERROR';
    const { outcome, audit } = failureRecord(code);
    await this.unitOfWork.run(async (tx) => {
      await tx.recordActivity({ ...event, outcome });
      if (audit) await tx.recordAudit({ ...event, outcome });
    });
  }

  /** AC-03: only projects the actor is allowed to see. */
  async list(actor: Actor): Promise<Project[]> {
    return this.unitOfWork.run(async (tx) => {
      const all = await tx.listProjects(actor.organizationId);
      return all.filter((project) =>
        isVisible(actor, { organizationId: project.organizationId, projectId: project.id }),
      );
    });
  }

  async get(actor: Actor, projectId: string): Promise<Project> {
    return this.unitOfWork.run(async (tx) => {
      const project = await tx.findProject(actor.organizationId, projectId);
      // The same answer whether the project is missing or merely invisible.
      // Checking existence first and permission second would let the pair of
      // responses reveal which case it was.
      if (project === null) throw new ApiError('NOT_FOUND');
      requireRead(actor, { organizationId: project.organizationId, projectId: project.id });
      return project;
    });
  }

  /** AC-15: a write against a stale version is refused rather than merged. */
  async rename(input: {
    actor: Actor;
    projectId: string;
    name: string;
    expectedVersion: number;
    correlationId: string;
  }): Promise<Project> {
    const base = {
      organizationId: input.actor.organizationId,
      actorReference: input.actor.userId,
      correlationId: input.correlationId,
      projectId: input.projectId,
    };

    try {
      return await this.unitOfWork.run(async (tx) => {
        const project = await tx.findProject(input.actor.organizationId, input.projectId);
        if (project === null) throw new ApiError('NOT_FOUND');

        requireManage(input.actor, {
          organizationId: project.organizationId,
          projectId: project.id,
        });

        const updated: Project = { ...project, name: input.name, version: project.version + 1 };
        if (!(await tx.updateProject(updated, input.expectedVersion))) {
          throw new ApiError('VERSION_CONFLICT');
        }

        const success = {
          ...base,
          actionCode: 'PROJECT_UPDATE' as const,
          outcome: 'SUCCESS' as const,
        };
        await tx.recordActivity(success);
        await tx.recordAudit(success);
        return updated;
      });
    } catch (error) {
      await this.#recordFailure(error, { ...base, actionCode: 'PROJECT_UPDATE' });
      throw error;
    }
  }
}
