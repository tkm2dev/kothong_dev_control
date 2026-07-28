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
- GitHub App installation — minimal read-only connection
- server-side GitHub API access for repository metadata
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

- repository/branch/PR/check sync
- webhook validation and deduplication
- scheduled reconciliation
- drift and freshness UI

GitHub App installation และ server-side API access ส่งมอบใน Slice 1 แล้ว Slice นี้ต่อยอด ไม่ได้สร้างใหม่

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

| รายการ | สถานะ |
|---|---|
| disable rebase merge in repository settings | DONE 2026-07-29 — `allow_rebase_merge: false` |
| protect `main` from direct push and force-push | BLOCKED — ดู "ข้อจำกัดการบังคับใช้" ด้านล่าง |
| require PR before merge | BLOCKED — ดู "ข้อจำกัดการบังคับใช้" ด้านล่าง |
| define protected status checks when CI exists | BLOCKED — ต้องมี branch protection ก่อน |
| establish secret management approach | OPEN |
| select authentication provider | OPEN |
| select implementation technology stack | OPEN |

Repository setting changes require Product Owner approval and are not part of the current documentation write unless explicitly ordered

### ข้อจำกัดการบังคับใช้ ณ ปัจจุบัน

ตรวจเมื่อ 2026-07-29: `GET /repos/tkm2dev/kothong_dev_control/branches/main/protection` และ `GET /repos/tkm2dev/kothong_dev_control/rulesets` คืน HTTP 403 พร้อมข้อความ `"Upgrade to GitHub Pro or make this repository public to enable this feature"`

branch protection และ repository rulesets จึงยังใช้กับ repository นี้ไม่ได้ภายใต้ plan และ visibility ปัจจุบัน กฎต่อไปนี้เป็น **convention ที่ไม่มี technical enforcement ที่ platform layer**:

- no direct commit to `main`
- no force-push
- require Pull Request before merge
- required status checks

**Product Owner decision (2026-07-29):** ยอมรับสถานะ convention-only ในระยะแรก ไม่ upgrade plan และไม่เปลี่ยน repository เป็น public

Compensating controls ที่บังคับใช้ได้จริงและถือเป็นข้อผูกพัน:

1. `allow_rebase_merge: false` — ปิดแล้ว ปุ่ม Rebase and merge ไม่ปรากฏ
2. `allow_auto_merge: false` — ปิดแล้ว ไม่มี auto-merge
3. ทุกการเปลี่ยนแปลงต้องผ่าน Pull Request แม้ระบบจะไม่บังคับ
4. Merge ทุกครั้งต้องมี Product Owner approval ที่บันทึกบน Pull Request และผูกกับ exact head SHA
5. ตรวจ direct commit ย้อนหลังเป็นระยะด้วย `git log main --first-parent --no-merges` — commit ที่ไม่ใช่ merge commit และไม่ใช่ bootstrap commit ถือเป็นการละเมิด ต้องบันทึกเป็น incident

**Revisit trigger:** ต้องทบทวนหัวข้อนี้ทันทีเมื่อ repository เปลี่ยน plan เปลี่ยน visibility หรือเพิ่มผู้มีสิทธิ์ write นอกเหนือจาก Product Owner

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
