# Database Schema

## 1. Database Direction

ใช้ PostgreSQL เป็น primary transactional database รองรับ foreign keys, partial unique indexes, JSONB สำหรับ normalized external payload บางส่วน, optimistic concurrency และ transactional outbox

ชื่อ primary key ใช้ UUID/ULID ตาม technology decision ใน Slice 1 แต่ external GitHub IDs ต้องเก็บแยกและมี unique constraint

ทุก business table ควรมี `created_at`, `updated_at` และ `version` เมื่อมี concurrent mutation ยกเว้น append-only records

## 2. Identity and Access

### organizations

- `id`
- `name`
- `slug` unique
- timestamps

### users

- `id`
- `display_name`
- `status`
- timestamps

### identities

- `id`
- `user_id`
- `provider`
- `provider_subject`
- `email_normalized`
- unique `(provider, provider_subject)`

### organization_members

- `organization_id`
- `user_id`
- `status`
- unique `(organization_id, user_id)`

### role_assignments

- `id`
- `organization_id`
- `project_id` nullable
- `user_id`
- `role_code`
- `granted_by_user_id`
- timestamps

AI session identities must not be stored as human users with Product Owner roles

## 3. Projects and GitHub

### projects

- `id`
- `organization_id`
- `name`
- `status`
- `policy_version`
- `version`
- timestamps

### github_installations

- `id`
- `organization_id`
- `external_installation_id`
- `account_login`
- `status`
- `secret_reference` nullable; never plaintext token
- unique `external_installation_id`

### github_repositories

- `id`
- `organization_id`
- `project_id`
- `installation_id`
- `external_repository_id`
- `owner_login`
- `repository_name`
- `visibility`
- `default_branch`
- `access_status`
- `last_verified_at`
- unique `(organization_id, external_repository_id)`
- unique `project_id`

`organization_id` ต้อง denormalize ลงตารางนี้เพื่อให้ unique constraint บังคับได้ที่ระดับ database และต้องสอดคล้องกับ `projects.organization_id` เสมอ

ห้ามใช้ global unique บน `external_repository_id` เพราะจะทำให้ organization หนึ่งบล็อกการลงทะเบียนของอีก organization และทำให้ error response เปิดเผยการมีอยู่ของ registration ข้าม tenant

### github_sync_runs

- `id`
- `project_id`
- `sync_type`
- `status`
- `started_at`
- `completed_at`
- `error_code`
- `correlation_id`

### github_snapshots

- `id`
- `project_id`
- `object_type`
- `external_object_id`
- `head_sha` nullable
- `source_updated_at`
- `synced_at`
- `normalized_payload` JSONB
- index `(project_id, object_type, external_object_id)`

### github_webhook_deliveries

- `id`
- `external_delivery_id` unique
- `installation_id`
- `event_name`
- `signature_valid`
- `received_at`
- `processed_at`
- `status`
- `payload_digest`

Raw secret-bearing headers must not be persisted

## 4. Planning

### work_items

- `id`
- `project_id`
- `parent_id` nullable
- `type`
- `title`
- `description`
- `priority`
- `status`
- `version`
- timestamps

### work_item_dependencies

- `work_item_id`
- `depends_on_work_item_id`
- `dependency_type`
- unique pair

### slices

- `id`
- `work_item_id` unique
- `sequence_number`
- `outcome`
- `acceptance_criteria`
- `status`
- `active_owner_type` nullable projection only
- `version`

### slice_status_history

- `id`
- `slice_id`
- `from_status`
- `to_status`
- `actor_type`
- `actor_id`
- `reason`
- `created_at`

## 5. Execution Control

### active_lanes

- `id`
- `project_id`
- `slice_id`
- `owner_type`
- `owner_reference`
- `branch_name`
- `worktree_identifier`
- `base_commit_sha`
- `status`
- `lease_expires_at` nullable
- `version`
- timestamps

Partial unique index: one row per `slice_id` where status in active states

Partial unique indexes for active `branch_name` and active `worktree_identifier` within project

### ai_sessions

- `id`
- `project_id`
- `active_lane_id` nullable
- `ai_type`
- `purpose`
- `external_session_reference` nullable
- `status`
- `started_at`
- `ended_at`
- `last_heartbeat_at`
- `version`

### scope_claims

- `id`
- `ai_session_id`
- `access_mode` (`READ`, `WRITE`)
- `scope_type`
- `scope_value_normalized`
- timestamps
- unique `(ai_session_id, access_mode, scope_type, scope_value_normalized)`

### conflicts

- `id`
- `project_id`
- `severity`
- `rule_code`
- `status`
- `summary`
- `detected_at`
- `resolved_at`
- `version`

### conflict_participants

- `conflict_id`
- `ai_session_id` nullable
- `active_lane_id` nullable
- `scope_claim_id` nullable

### conflict_overrides

- `id`
- `conflict_id`
- `approved_by_user_id`
- `reason`
- `accepted_risk`
- `effective_until`
- `created_at`

## 6. Reviews and Approvals

### pull_request_links

- `id`
- `project_id`
- `slice_id`
- `external_pr_id`
- `pr_number`
- `owner_reference`
- `head_branch`
- `head_sha`
- `base_branch`
- `state`
- unique `(project_id, pr_number)`

### review_requests

- `id`
- `slice_id`
- `pull_request_link_id`
- `target_head_sha`
- `reviewer_role`
- `status`
- `requested_at`
- `completed_at`
- `version`

### review_findings

- `id`
- `review_request_id`
- `severity` (`P0`, `P1`, `P2`)
- `title`
- `detail`
- `evidence_reference`
- `status`
- `backlog_work_item_id` nullable
- timestamps

### review_evidence

- `id`
- `review_request_id`
- `evidence_type`
- `label`
- `reference`
- `result`
- `limitations`
- `created_at`

### approval_requests

- `id`
- `project_id`
- `approval_type` (`MERGE`, `DEPLOY`)
- `target_type`
- `target_reference`
- `target_sha`
- `environment_id` nullable
- `status`
- `requested_by_actor_type`
- `requested_by_actor_reference`
- `requested_at`
- `expires_at` nullable
- `version`

### approval_decisions

- `id`
- `approval_request_id`
- `decision`
- `decided_by_user_id`
- `reason`
- `decided_at`
- `authentication_context_reference`

Append-only; one terminal valid decision per request enforced by transaction/policy

## 7. Delivery

### deployment_environments

- `id`
- `project_id`
- `name`
- `status`
- `provider_type`
- `provider_configuration_reference`
- unique `(project_id, name)`

### deployments

- `id`
- `project_id`
- `environment_id`
- `commit_sha`
- `approval_request_id`
- `status`
- `started_at`
- `completed_at`
- `external_deployment_reference`
- unique idempotency policy per environment/commit

### deployment_checks

- `id`
- `deployment_id`
- `check_type` (`BACKUP`, `INTEGRATED_TEST`, `SMOKE_TEST`)
- `status`
- `evidence_reference`
- `performed_at`

## 8. Audit and Reliability

### activity_events

- `id`
- `organization_id`
- `project_id` nullable
- `actor_type`
- `actor_reference`
- `action_code`
- `target_type`
- `target_reference`
- `outcome`
- `summary`
- `correlation_id`
- `created_at`

### audit_records

- `id`
- `organization_id`
- `project_id` nullable
- `actor_type`
- `actor_reference`
- `action_code`
- `target_type`
- `target_reference`
- `before_digest` nullable
- `after_digest` nullable
- `change_set_sanitized` JSONB
- `evidence_reference` nullable
- `correlation_id`
- `created_at`

No business update/delete API

### idempotency_keys

- `id`
- `organization_id`
- `actor_reference`
- `operation_code`
- `idempotency_key`
- `request_digest`
- `response_status`
- `response_reference`
- `expires_at`
- unique `(organization_id, actor_reference, operation_code, idempotency_key)`

### outbox_events

- `id`
- `aggregate_type`
- `aggregate_id`
- `event_type`
- `payload_sanitized` JSONB
- `created_at`
- `published_at` nullable
- `attempt_count`

## 9. Data Protection

- secret values use external reference or encrypted secret column isolated from general queries
- redact payload before activity/audit/outbox persistence
- retention policy must distinguish operational events from immutable approval/audit evidence
- backup and restore tests are required before deploy automation phase
