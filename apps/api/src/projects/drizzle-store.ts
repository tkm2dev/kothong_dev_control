/**
 * PostgreSQL unit of work.
 *
 * The rules live in `registry.ts`; this only knows how to read and write them.
 * Keeping the two apart is what lets the same rules be exercised quickly
 * against memory and then verified against a real database, rather than tested
 * once against a fake and hoped about.
 *
 * Three things here are the database's job and cannot be checked anywhere else:
 * the transaction boundary AC-28 needs, the compare-and-set that makes AC-15
 * safe under concurrency, and the unique constraint behind AC-08.
 */

import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  activityEvents,
  auditRecords,
  githubRepositories,
  idempotencyKeys,
  projects,
  newId,
} from '@kdc/db';
import type { VerifiedRepository } from '../github/schemas.ts';
import type {
  IdempotencyKey,
  IdempotencyRecord,
  Project,
  RecordedEvent,
  RegistryTransaction,
  UnitOfWork,
} from './registry.ts';

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

interface ProjectRow {
  id: string;
  organizationId: string;
  name: string;
  version: number;
}

interface RepositoryRow {
  externalRepositoryId: string;
  ownerLogin: string;
  repositoryName: string;
  visibility: string;
  defaultBranch: string;
  accessStatus: string;
  lastVerifiedAt: Date | null;
}

function toProject(project: ProjectRow, repository: RepositoryRow): Project {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    version: project.version,
    lastVerifiedAt: repository.lastVerifiedAt,
    repository: {
      externalRepositoryId: repository.externalRepositoryId,
      ownerLogin: repository.ownerLogin,
      repositoryName: repository.repositoryName,
      visibility: repository.visibility as VerifiedRepository['visibility'],
      defaultBranch: repository.defaultBranch,
      accessStatus: repository.accessStatus as VerifiedRepository['accessStatus'],
    },
  };
}

export class DrizzleUnitOfWork implements UnitOfWork {
  constructor(private readonly db: NodePgDatabase) {}

  async run<T>(work: (tx: RegistryTransaction) => Promise<T>): Promise<T> {
    // Drizzle rolls back when the callback throws, which is what gives AC-28
    // its guarantee. Nothing here catches, so nothing can swallow a failure and
    // leave a half-written unit committed.
    return this.db.transaction(async (tx) => work(transactionOver(tx)));
  }
}

function transactionOver(tx: Tx): RegistryTransaction {
  const selectProject = async (
    where: ReturnType<typeof and>,
  ): Promise<Project | null> => {
    const rows = await tx
      .select({
        id: projects.id,
        organizationId: projects.organizationId,
        name: projects.name,
        version: projects.version,
        externalRepositoryId: githubRepositories.externalRepositoryId,
        ownerLogin: githubRepositories.ownerLogin,
        repositoryName: githubRepositories.repositoryName,
        visibility: githubRepositories.visibility,
        defaultBranch: githubRepositories.defaultBranch,
        accessStatus: githubRepositories.accessStatus,
        lastVerifiedAt: githubRepositories.lastVerifiedAt,
      })
      .from(projects)
      .innerJoin(githubRepositories, eq(githubRepositories.projectId, projects.id))
      .where(where)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toProject(row, row);
  };

  return {
    async findProjectByExternalRepositoryId(organizationId, externalRepositoryId) {
      return selectProject(
        and(
          eq(projects.organizationId, organizationId),
          eq(githubRepositories.externalRepositoryId, externalRepositoryId),
        ),
      );
    },

    async findProject(organizationId, projectId) {
      // The organization is part of the predicate rather than checked after the
      // row comes back. A query that fetches first and compares later is one
      // forgotten comparison away from crossing a tenant boundary.
      return selectProject(
        and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)),
      );
    },

    async listProjects(organizationId, page) {
      const rows = await tx
        .select({
          id: projects.id,
          organizationId: projects.organizationId,
          name: projects.name,
          version: projects.version,
          externalRepositoryId: githubRepositories.externalRepositoryId,
          ownerLogin: githubRepositories.ownerLogin,
          repositoryName: githubRepositories.repositoryName,
          visibility: githubRepositories.visibility,
          defaultBranch: githubRepositories.defaultBranch,
          accessStatus: githubRepositories.accessStatus,
          lastVerifiedAt: githubRepositories.lastVerifiedAt,
        })
        .from(projects)
        .innerJoin(githubRepositories, eq(githubRepositories.projectId, projects.id))
        .where(
          page.cursor === undefined
            ? eq(projects.organizationId, organizationId)
            : and(eq(projects.organizationId, organizationId), gt(projects.id, page.cursor)),
        )
        .orderBy(asc(projects.id))
        .limit(page.limit);
      return rows.map((row) => toProject(row, row));
    },

    async insertProject(project, installationId) {
      await tx.insert(projects).values({
        id: project.id,
        organizationId: project.organizationId,
        name: project.name,
        status: 'ACTIVE',
        version: project.version,
      });
      await tx.insert(githubRepositories).values({
        id: newId(),
        organizationId: project.organizationId,
        projectId: project.id,
        installationId,
        externalRepositoryId: project.repository.externalRepositoryId,
        ownerLogin: project.repository.ownerLogin,
        repositoryName: project.repository.repositoryName,
        visibility: project.repository.visibility,
        defaultBranch: project.repository.defaultBranch,
        accessStatus: project.repository.accessStatus,
        lastVerifiedAt: project.lastVerifiedAt,
      });
    },

    async updateProject(project, expectedVersion) {
      // Compare-and-set in one statement. Reading the version and then writing
      // would leave a window where two requests both read the same value and
      // both believe they are current.
      const updated = await tx
        .update(projects)
        .set({ name: project.name, version: project.version, updatedAt: new Date() })
        .where(and(eq(projects.id, project.id), eq(projects.version, expectedVersion)))
        .returning({ id: projects.id });
      return updated.length === 1;
    },

    async findIdempotency(key) {
      const rows = await tx
        .select({
          requestDigest: idempotencyKeys.requestDigest,
          responseReference: idempotencyKeys.responseReference,
        })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.organizationId, key.organizationId),
            eq(idempotencyKeys.actorReference, key.actorReference),
            eq(idempotencyKeys.operationCode, key.operationCode),
            eq(idempotencyKeys.idempotencyKey, key.idempotencyKey),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row?.responseReference == null
        ? null
        : { requestDigest: row.requestDigest, responseReference: row.responseReference };
    },

    async saveIdempotency(key: IdempotencyKey, record: IdempotencyRecord) {
      await tx.insert(idempotencyKeys).values({
        id: newId(),
        organizationId: key.organizationId,
        actorReference: key.actorReference,
        operationCode: key.operationCode,
        idempotencyKey: key.idempotencyKey,
        requestDigest: record.requestDigest,
        responseReference: record.responseReference,
        expiresAt: sql`now() + interval '24 hours'`,
      });
    },

    async recordActivity(event: RecordedEvent) {
      await tx.insert(activityEvents).values({
        id: newId(),
        organizationId: event.organizationId,
        projectId: event.projectId,
        actorType: 'HUMAN',
        actorReference: event.actorReference,
        actionCode: event.actionCode,
        targetType: 'PROJECT',
        targetReference: event.projectId,
        outcome: event.outcome,
        summary: `${event.actionCode} ${event.outcome}`,
        correlationId: event.correlationId,
      });
    },

    async recordAudit(event: RecordedEvent) {
      await tx.insert(auditRecords).values({
        id: newId(),
        organizationId: event.organizationId,
        projectId: event.projectId,
        actorType: 'HUMAN',
        actorReference: event.actorReference,
        actionCode: event.actionCode,
        targetType: 'PROJECT',
        targetReference: event.projectId,
        outcome: event.outcome,
        correlationId: event.correlationId,
      });
    },
  };
}
