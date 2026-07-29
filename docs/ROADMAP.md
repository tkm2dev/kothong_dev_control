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

### Foundation Merge ปลดล็อกอะไร

Foundation Merge ปลดล็อกเฉพาะการตัดสินใจที่เหลือของ Phase 1 — technology stack, authentication provider และ secret management approach — **ไม่ได้ปลดล็อกการเขียน application code**

prerequisite ทั้ง 5 ข้อตาม `AGENTS.md` §10 ปิดครบแล้วเมื่อ 2026-07-29 ผ่าน Pull Request #2, #3, #5 และ Active Lane approval ใน issue #4

## Phase 2 — Control Plane MVP

### Slice 1 Project Registry and Audit Foundation

Status: `ACTIVE` ตั้งแต่ 2026-07-29

| | |
|---|---|
| Implementation Owner | Claude Code |
| Active Lane | issue #4 — สถานะ `RESERVED` จนกว่าจะแก้ไฟล์แรก |
| Branch | `claude/slice-01-project-registry` |
| Base commit | `6682bc2c58c41d072cbdc6413a22f6551b6dc5b0` |

Acceptance criteria อยู่ใน `docs/SLICE_01_ACCEPTANCE_CRITERIA.md` — AC-01 ถึง AC-41 ทุกข้อเขียน test ได้

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
| protect `main` from direct push and force-push | DONE 2026-07-29 — branch protection เปิดใช้งานแล้ว |
| require PR before merge | DONE 2026-07-29 — บังคับผ่าน branch protection |
| define protected status checks when CI exists | BLOCKED — รอ workflow run ที่สำเร็จ ดู issue #8 |
| establish secret management approach | DONE 2026-07-29 — ADR 0005 `Accepted` |
| select authentication provider | DONE 2026-07-29 — ADR 0004 `Accepted` |
| select implementation technology stack | DONE 2026-07-29 — ADR 0003 `Accepted` |
| ตั้ง CI ที่รัน test, lint และ scope check | **OPEN** — workflow อยู่บน `main` แล้วแต่ job ถูกปฏิเสธเพราะบัญชีถูกล็อกการเรียกเก็บเงิน evidence จึงยังเป็นคำรายงานของผู้ส่งงาน ดู issue #8 |

Repository setting changes require Product Owner approval and are not part of the current documentation write unless explicitly ordered

### สถานะการบังคับใช้ ณ ปัจจุบัน

**Product Owner decision (2026-07-29):** เปลี่ยน repository เป็น public เพื่อปลดล็อก branch protection ซึ่งไม่มีให้ใช้บน private repository ภายใต้ plan เดิม

หัวข้อนี้เคยบันทึกว่ากฎทั้งหมดเป็น convention ที่ไม่มี technical enforcement บันทึกนั้นไม่เป็นจริงอีกต่อไปสำหรับ branch protection แต่ยังเป็นจริงสำหรับ CI

#### บังคับใช้ได้จริงแล้ว

branch protection บน `main` เปิดใช้งานเมื่อ 2026-07-29

| Setting | ค่า | บังคับกฎข้อใด |
|---|---|---|
| `enforce_admins` | `true` | กฎมีผลกับเจ้าของ repository ด้วย ไม่มีข้อยกเว้น |
| Pull Request required | `true` | ห้าม push ตรงเข้า `main` |
| required approving reviews | `0` | Product Owner merge Pull Request ของตนเองได้ การตั้งเป็น `1` จะล็อกตัวเองเพราะ GitHub ไม่นับ self-approval |
| `dismiss_stale_reviews` | `true` | review หมดผลเมื่อ head SHA เปลี่ยน ตรงกับ `AGENTS.md` §8 |
| `allow_force_pushes` | `false` | ห้าม force-push |
| `allow_deletions` | `false` | ลบ branch `main` ไม่ได้ |
| `required_linear_history` | `false` | **จงใจปิด** — การเปิดจะบังคับ rebase หรือ squash ซึ่งขัดกับกฎห้าม rebase โดยตรง |

รวมกับ repository setting เดิม `allow_rebase_merge: false` และ `allow_auto_merge: false`

#### ยังบังคับใช้ไม่ได้

**required status checks** — ตั้งไม่ได้เพราะยังไม่มี workflow run ที่สำเร็จให้เลือกชื่อ check

สาเหตุคือบัญชีถูกล็อกการเรียกเก็บเงิน หน้า Actions แสดง `"Your account's billing is currently locked"` และ job ถูกปฏิเสธด้วยข้อความ `"The job was not started because your account is locked due to a billing issue"`

การเปลี่ยนเป็น public แก้เรื่องโควตา minutes แล้ว — workflow ผ่านขั้นตอน startup และมีชื่อจริง ไม่ใช่ `startup_failure` อีกต่อไป แต่ billing lock เป็นสถานะระดับบัญชีที่ยังบล็อกการรัน job อยู่

ติดตามใน issue #8

#### สิ่งที่ยังต้องอาศัยกระบวนการ

1. Merge ทุกครั้งต้องมี Product Owner approval ที่บันทึกบน Pull Request และผูกกับ exact head SHA — GitHub บังคับให้ผ่าน PR ได้ แต่บังคับให้มี approval record ไม่ได้
2. ความถูกต้องของ evidence ที่ Implementation Owner รายงาน — จนกว่า CI จะรันได้
3. ตรวจ direct commit ย้อนหลังเป็นระยะด้วย `git log main --first-parent --no-merges` — ยังคงไว้เป็นการตรวจซ้ำแม้ platform จะบังคับแล้ว

**Revisit trigger:** ทบทวนหัวข้อนี้เมื่อ billing กลับมาปกติ เมื่อเพิ่มผู้มีสิทธิ์ write หรือเมื่อเปลี่ยน visibility กลับเป็น private ซึ่งจะทำให้ branch protection หายไปอีกครั้ง

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
