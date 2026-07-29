/**
 * Database schema for Slice 1.
 *
 * `docs/DATABASE_SCHEMA.md` is the design source of truth. This file is the
 * executable form of the tables that Slice 1 needs, and no more — tables
 * belonging to Slice 2 and later are deliberately absent.
 *
 * The Tenant Integrity Rule in that document is the reason several tables carry
 * a denormalised `organization_id` and a composite unique key. Cross-aggregate
 * references inside a tenant use composite foreign keys that include
 * `organization_id`, so a row cannot point at another tenant's data. A
 * single-column foreign key would allow exactly that, and AC-29 forbids relying
 * on application checks to prevent it.
 */

import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Identity and access
// ---------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt,
  updatedAt,
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name').notNull(),
  status: text('status').notNull(),
  createdAt,
  updatedAt,
});

/**
 * `provider_subject` holds the provider's immutable numeric identifier, never a
 * login name. ADR 0004 requires this: a GitHub login can be changed and later
 * reused by someone else, so keying identity on it would let one account
 * inherit another's history.
 */
export const identities = pgTable(
  'identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    emailNormalized: text('email_normalized'),
    createdAt,
    updatedAt,
  },
  (t) => [unique('identities_provider_subject_key').on(t.provider, t.providerSubject)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [unique('organization_members_key').on(t.organizationId, t.userId)],
);


/**
 * Server-side sessions, not JWTs. AC-38 requires logout to make a session
 * unusable server-side, which a self-contained token cannot offer.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
    lastAuthenticatedAt: timestamp('last_authenticated_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt,
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ---------------------------------------------------------------------------
// Projects and GitHub
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    status: text('status').notNull(),
    policyVersion: integer('policy_version').notNull().default(1),
    version: integer('version').notNull().default(1),
    createdAt,
    updatedAt,
  },
  // Composite key so children can reference this row together with its tenant.
  (t) => [unique('projects_id_organization_key').on(t.id, t.organizationId)],
);

/**
 * Envelope-encrypted secrets, per ADR 0005. Only ciphertext and the wrapped
 * data key live here; the key encryption key never leaves the KMS.
 *
 * Kept in its own table so ordinary queries never touch it, and so a leaked
 * dump of business data does not carry credentials with it.
 */
/**
 * Roles live here and nowhere else. ADR 0004 forbids deriving authorisation
 * from GitHub organization membership or repository permission: holding write
 * access on GitHub is not the same thing as being allowed to approve a merge.
 */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleCode: text('role_code').notNull(),
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id),
    createdAt,
    updatedAt,
  },
  // This table is the only place authorisation is read from. A row scoped to
  // one organization but pointing at another's project would grant approval
  // rights across a tenant boundary. NULL project_id stays legal for
  // organization-wide roles.
  (t) => [
    foreignKey({
      name: 'role_assignments_project_tenant_fk',
      columns: [t.projectId, t.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }),
  ],
);

export const secrets = pgTable(
  'secrets',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    purpose: text('purpose').notNull(),
    algorithm: text('algorithm').notNull(),
    ciphertext: text('ciphertext').notNull(),
    wrappedDataKey: text('wrapped_data_key').notNull(),
    nonce: text('nonce').notNull(),
    authTag: text('auth_tag').notNull(),
    keyVersion: text('key_version').notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    index('secrets_org_purpose_idx').on(t.organizationId, t.purpose),
    // Referenced by github_installations together with the tenant, so an
    // installation cannot point at another organization's key material.
    unique('secrets_id_organization_key').on(t.id, t.organizationId),
  ],
);

export const githubInstallations = pgTable(
  'github_installations',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    externalInstallationId: text('external_installation_id').notNull().unique(),
    accountLogin: text('account_login').notNull(),
    status: text('status').notNull(),
    // Points at a row in `secrets`. Never the value itself — see ADR 0005.
    secretReference: uuid('secret_reference'),
    createdAt,
    updatedAt,
  },
  (t) => [
    unique('github_installations_id_organization_key').on(t.id, t.organizationId),
    // Nullable: an installation may exist before its key is stored. Postgres
    // skips a composite foreign key when any column is NULL, so that case
    // stays legal while a populated reference is still tenant-checked.
    foreignKey({
      name: 'github_installations_secret_tenant_fk',
      columns: [t.secretReference, t.organizationId],
      foreignColumns: [secrets.id, secrets.organizationId],
    }),
  ],
);

/**
 * The composite foreign keys below are the whole point of this table's shape.
 *
 * With single-column keys a row could hold organization A's `organization_id`
 * while pointing `installation_id` at organization B's installation. Every
 * subsequent authorisation and audit decision made from that row would then be
 * scoped to the wrong tenant, and nothing in the database would object.
 */
export const githubRepositories = pgTable(
  'github_repositories',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id').notNull(),
    installationId: uuid('installation_id').notNull(),
    externalRepositoryId: text('external_repository_id').notNull(),
    ownerLogin: text('owner_login').notNull(),
    repositoryName: text('repository_name').notNull(),
    visibility: text('visibility').notNull(),
    defaultBranch: text('default_branch').notNull(),
    accessStatus: text('access_status').notNull(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [
    // Scoped to the organization, never global. A global unique would let one
    // tenant block another from registering a repository, and would leak the
    // existence of that registration through the conflict response.
    unique('github_repositories_org_external_key').on(t.organizationId, t.externalRepositoryId),
    unique('github_repositories_project_key').on(t.projectId),
    foreignKey({
      name: 'github_repositories_project_tenant_fk',
      columns: [t.projectId, t.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }),
    foreignKey({
      name: 'github_repositories_installation_tenant_fk',
      columns: [t.installationId, t.organizationId],
      foreignColumns: [githubInstallations.id, githubInstallations.organizationId],
    }),
  ],
);

// ---------------------------------------------------------------------------
// Activity and audit
// ---------------------------------------------------------------------------

export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id'),
    actorType: text('actor_type').notNull(),
    actorReference: text('actor_reference').notNull(),
    actionCode: text('action_code').notNull(),
    targetType: text('target_type').notNull(),
    targetReference: text('target_reference'),
    outcome: text('outcome').notNull(),
    summary: text('summary').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt,
  },
  (t) => [
    index('activity_events_org_created_idx').on(t.organizationId, t.createdAt),
    index('activity_events_correlation_idx').on(t.correlationId),
    // An event filed against another tenant's project would make a timeline
    // query return evidence from outside the caller's organization. Evidence
    // that can be wrong about whose project it describes is not evidence.
    foreignKey({
      name: 'activity_events_project_tenant_fk',
      columns: [t.projectId, t.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }),
  ],
);

/**
 * Append-only in business terms. AC-18 requires this to be provable two ways:
 * no route exposes update or delete, and the database role the application
 * connects with holds no UPDATE or DELETE privilege on this table. The second
 * part is a grant, applied by migration, not something expressible here.
 */
export const auditRecords = pgTable(
  'audit_records',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: uuid('project_id'),
    actorType: text('actor_type').notNull(),
    actorReference: text('actor_reference').notNull(),
    actionCode: text('action_code').notNull(),
    targetType: text('target_type').notNull(),
    targetReference: text('target_reference'),
    outcome: text('outcome').notNull(),
    beforeDigest: text('before_digest'),
    afterDigest: text('after_digest'),
    changeSetSanitized: jsonb('change_set_sanitized'),
    evidenceReference: text('evidence_reference'),
    correlationId: text('correlation_id').notNull(),
    createdAt,
  },
  (t) => [
    index('audit_records_org_created_idx').on(t.organizationId, t.createdAt),
    foreignKey({
      name: 'audit_records_project_tenant_fk',
      columns: [t.projectId, t.organizationId],
      foreignColumns: [projects.id, projects.organizationId],
    }),
  ],
);

// ---------------------------------------------------------------------------
// Reliability
// ---------------------------------------------------------------------------

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorReference: text('actor_reference').notNull(),
    operationCode: text('operation_code').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestDigest: text('request_digest').notNull(),
    responseStatus: integer('response_status'),
    responseReference: text('response_reference'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt,
  },
  (t) => [
    unique('idempotency_keys_scope_key').on(
      t.organizationId,
      t.actorReference,
      t.operationCode,
      t.idempotencyKey,
    ),
  ],
);


export const APPEND_ONLY_TABLES = ['activity_events', 'audit_records'] as const;

export const SLICE_1_TABLES = [
  'organizations',
  'users',
  'identities',
  'organization_members',
  'role_assignments',
  'sessions',
  'projects',
  'github_installations',
  'github_repositories',
  'activity_events',
  'audit_records',
  'idempotency_keys',
  'secrets',
] as const;

export type Slice1Table = (typeof SLICE_1_TABLES)[number];

/** Tables that belong to Slice 2 and later. Creating any of these in Slice 1
 * would be a scope violation under the Active Lane declaration in issue #4. */
export const OUT_OF_SLICE_TABLES = [
  'work_items',
  'slices',
  'active_lanes',
  'ai_sessions',
  'scope_claims',
  'conflicts',
  'pull_request_links',
  'review_requests',
  'approval_requests',
  'deployments',
] as const;
