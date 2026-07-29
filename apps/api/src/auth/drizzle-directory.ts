/**
 * Identity and sessions, backed by PostgreSQL.
 *
 * The reads here decide who someone is and what they may do, so every query
 * carries its tenant in the predicate rather than filtering afterwards. That is
 * the same discipline the composite foreign keys enforce at write time; a
 * constraint stops bad data being stored, it does not stop a query from asking
 * the wrong question.
 */

import { and, asc, eq, isNull, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  identities,
  organizationMembers,
  roleAssignments,
  sessions as sessionsTable,
} from '@kdc/db';
import { ApiError } from '../errors.ts';
import type { RoleAssignment, RoleCode } from '../projects/policy.ts';
import type { SessionRecord, SessionStore } from '../sessions.ts';
import type { IdentityDirectory, IdentityRecord } from './sign-in.ts';

const KNOWN_ROLES: readonly string[] = ['PRODUCT_OWNER', 'MEMBER'];

export class DrizzleIdentityDirectory implements IdentityDirectory {
  constructor(private readonly db: NodePgDatabase) {}

  async findByProviderSubject(
    provider: string,
    providerSubject: string,
  ): Promise<IdentityRecord | null> {
    const rows = await this.db
      .select({ userId: identities.userId })
      .from(identities)
      .where(
        and(eq(identities.provider, provider), eq(identities.providerSubject, providerSubject)),
      )
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : this.#withOrganization(row.userId);
  }

  async findByUserId(userId: string): Promise<IdentityRecord | null> {
    return this.#withOrganization(userId);
  }

  /**
   * Resolves which organization a user acts in.
   *
   * A user belonging to more than one organization is refused rather than
   * resolved to whichever row came back first. Choosing arbitrarily would place
   * someone in a tenant they did not ask for, and every authorisation and audit
   * decision after that would be scoped to the wrong one. Organization
   * switching is a deliberate feature, not something to infer from row order.
   */
  async #withOrganization(userId: string): Promise<IdentityRecord | null> {
    const memberships = await this.db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, 'ACTIVE')),
      )
      .orderBy(asc(organizationMembers.organizationId))
      .limit(2);

    if (memberships.length === 0) return null;
    if (memberships.length > 1) throw new ApiError('FORBIDDEN');
    return { userId, organizationId: memberships[0]!.organizationId };
  }

  /**
   * Roles for a user inside one organization.
   *
   * ADR 0004 makes this table the only source of authority — nothing about the
   * user's GitHub organizations or repository permissions is consulted.
   */
  async rolesFor(userId: string, organizationId: string): Promise<RoleAssignment[]> {
    const rows = await this.db
      .select({
        organizationId: roleAssignments.organizationId,
        projectId: roleAssignments.projectId,
        roleCode: roleAssignments.roleCode,
      })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.organizationId, organizationId),
        ),
      );

    return (
      rows
        // A role code the application does not know about grants nothing. The
        // alternative — treating it as valid — would let a typo or a row from a
        // future migration hand out permissions nobody defined.
        .filter((row) => KNOWN_ROLES.includes(row.roleCode))
        .map((row) => ({
          organizationId: row.organizationId,
          projectId: row.projectId,
          roleCode: row.roleCode as RoleCode,
        }))
    );
  }
}

export class DrizzleSessionStore implements SessionStore {
  constructor(private readonly db: NodePgDatabase) {}

  async create(record: SessionRecord): Promise<void> {
    await this.db.insert(sessionsTable).values({
      id: record.id,
      userId: record.userId,
      expiresAt: record.expiresAt,
      absoluteExpiresAt: record.absoluteExpiresAt,
      lastAuthenticatedAt: record.lastAuthenticatedAt,
      revokedAt: record.revokedAt,
    });
  }

  async find(id: string): Promise<SessionRecord | null> {
    const rows = await this.db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.id, id))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      userId: row.userId,
      expiresAt: row.expiresAt,
      absoluteExpiresAt: row.absoluteExpiresAt,
      lastAuthenticatedAt: row.lastAuthenticatedAt,
      revokedAt: row.revokedAt,
    };
  }

  async revoke(id: string): Promise<void> {
    // Only sets the timestamp if it is not already set, so the record keeps the
    // moment of the first revocation rather than the most recent attempt.
    await this.db
      .update(sessionsTable)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessionsTable.id, id), or(isNull(sessionsTable.revokedAt))));
  }
}
