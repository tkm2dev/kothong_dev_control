# Roadmap and Backlog

## Status Legend

- `FOUNDATION_REVIEW`
- `READY`
- `ACTIVE`
- `BLOCKED`
- `IN_REVIEW`
- `READY_FOR_PO`
- `DONE`

## Phase 1 — Foundation

### F0 Repository Governance Foundation

Status: `ACTIVE` on branch `agent/foundation-pack`

Deliverables:

- AGENTS.md
- Team Development Model
- Product and Business Rules
- System Architecture
- Domain Model
- UX Flows and Visual System
- Database Schema
- Roadmap and Backlog
- Vertical Slices
- Slice 1 Acceptance Criteria
- Architecture Decision Records

Exit gate:

- Product Owner approves Foundation Pack
- Foundation PR receives final review
- Product Owner explicitly approves Merge
- documents are merged to `main`

No application code is allowed in this phase

## Phase 2 — Control Plane MVP

### Slice 1 Project Registry and Audit Foundation

- human authentication and authorization boundary
- register accessible GitHub repository metadata
- Project Registry UI
- idempotent project creation
- activity and immutable audit foundation

### Slice 2 Work Items and Active Lane Control

- task board
- slice lifecycle
- claim/release lane
- one-owner enforcement
- branch/worktree/base SHA metadata
- manual scope claims

### Slice 3 AI Session Registry and Conflict Detection

- AI session registration
- lane/session relationship
- path/domain/resource claims
- blocking/warning conflict rules
- PO conflict override

## Phase 3 — GitHub Integration

### Slice 4 GitHub Read Synchronization

- GitHub App installation
- repository/branch/PR/check sync
- webhook validation and deduplication
- scheduled reconciliation
- drift and freshness UI

### Slice 5 Review Queue

- review requests
- evidence bundle
- exact revision tracking
- P0/P1/P2 findings
- READY FOR FINAL REVIEW workflow

## Phase 4 — Approval Governance

### Slice 6 Merge Approval Center

- request and record PO merge decisions
- exact head SHA binding
- approval expiration/superseding
- unresolved P0 gate
- no automatic merge yet

### Slice 7 Controlled Merge Execution

- explicit PO command
- fresh GitHub verification
- consume valid approval
- merge with rebase prohibited
- capture result and activity/audit evidence

## Phase 5 — Deploy Governance

### Slice 8 Integrated Verification and Deploy Approval

- verify commit on `main`
- integrated test evidence
- environment registry
- backup evidence
- exact commit deploy approval

### Slice 9 Controlled Deployment

- explicit PO command
- deploy adapter
- main-only enforcement
- smoke test
- failure and rollback evidence

## Phase 6 — Advanced Coordination

Candidate capabilities after operational evidence:

- automatic scope inference from diff
- conflict prediction before implementation starts
- policy-as-code
- notification routing
- multi-project capacity and queue analytics
- delivery lead time metrics
- additional source/deployment providers

## Initial Product Backlog

### P0 Foundation / Governance

- disable rebase merge in repository settings
- protect `main` from direct push and force-push
- require PR before merge
- define protected status checks when CI exists
- establish secret management approach
- select authentication provider
- select implementation technology stack

Repository setting changes require Product Owner approval and are not part of the current documentation write unless explicitly ordered

### P1 Product

- project switcher and search
- stale GitHub data warning
- human-readable conflict explanations
- approval evidence completeness score
- activity export
- accessibility validation

### P1 Engineering

- webhook replay test harness
- idempotency conformance tests
- audit redaction tests
- disaster recovery runbook
- security threat model
- observability baseline

### P2 Product

- customizable dashboard widgets
- saved filters
- notification preferences
- keyboard command palette
- historical trend charts

## Roadmap Rules

- เปิด active implementation item ใหม่ไม่ได้จนกว่า item ปัจจุบันปิดหรือ PO เปลี่ยนลำดับชัดเจน
- งานนอก scope เข้า backlog ตาม severity ห้ามแทรกใน active slice
- ทุก Slice ต้องมี acceptance criteria, owner, declared scope และ evidence requirements ก่อนเริ่ม
- Deploy capability ต้องมาหลัง read sync, review, approval และ integrated verification เท่านั้น
