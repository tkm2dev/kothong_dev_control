# Vertical Slices

## Slice F0 — Repository Governance Foundation

### Outcome

มีชุดเอกสารที่เป็น source of truth สำหรับวิธีทำงาน Architecture, Business Rules, UX, Data Model, Roadmap และ Slice 1 Acceptance Criteria โดยยังไม่มี application code

### Scope

- repository operating rules
- team development model
- architecture and domain decisions
- UX direction and visual tokens
- initial database design
- roadmap and backlog
- architecture decision records

### Excluded

- authentication implementation
- GitHub App code
- database migrations
- UI code
- merge/deploy automation

### Evidence

- branch และ PR แยก
- documentation-only diff
- no application code
- Product Owner approval before merge

---

## Slice 1 — Project Registry and Audit Foundation

### User Outcome

Product Owner สามารถยืนยันตัวตน เลือก GitHub repository ที่เข้าถึงได้ ลงทะเบียนเป็น Project และเห็นข้อมูลที่ตรวจจาก GitHub พร้อม Activity/Audit evidence

### End-to-End Scope

- human authentication
- server-side authorization
- Project Registry UI ตาม Warm Operational Console
- repository metadata verification
- idempotent project registration
- optimistic concurrency
- activity and audit records
- tests and operational documentation

### Excluded

- branch/PR creation
- webhook sync
- task board
- lane/session management
- review/approval
- merge/deploy

---

## Slice 2 — Work Items and Active Lane Control

### User Outcome

Product Owner จัดลำดับ Slice และมอบ Active Lane ให้ Implementation Owner ได้โดยระบบบังคับ one-owner, branch-first และ worktree-first

### Scope

- Task Board
- Slice lifecycle
- claim/release/pause lane
- owner uniqueness
- branch/worktree/base SHA metadata
- manual scope claims
- lane activity/audit

### Excluded

- automatic GitHub diff analysis
- merge/deploy

---

## Slice 3 — AI Session Registry and Conflict Detection

### User Outcome

ทีมเห็นว่า AI session ใดกำลังทำอะไร และระบบเตือนหรือขวาง scope ที่ชนกันก่อนเกิดความเสียหาย

### Scope

- register/close AI sessions
- AI type and purpose
- lane/specialist association
- path/domain/API/database/resource claims
- blocking/warning conflicts
- Product Owner override

### Excluded

- arbitrary prompt execution
- autonomous assignment

---

## Slice 4 — GitHub Read Synchronization

### User Outcome

สถานะ repository, branch, PR และ checks ในระบบตรงกับ GitHub และแสดง freshness/drift ได้

### Scope

- GitHub App installation
- server-side GitHub API access
- webhook signature verification and delivery dedupe
- repository/branch/PR/check projections
- scheduled reconciliation
- sync health UI

### Excluded

- write operations to GitHub

---

## Slice 5 — Review Queue

### User Outcome

Implementation Owner ส่ง exact revision พร้อม evidence และ GPT/Reviewer บันทึกผล Final Review เป็น P0/P1/P2 ได้

### Scope

- READY FOR FINAL REVIEW handoff
- review requests bound to head SHA
- evidence bundle
- findings and resolution
- P1/P2 backlog linking
- review queue UI

### Excluded

- Product Owner merge decision
- merge execution

---

## Slice 6 — Merge Approval Governance

### User Outcome

Product Owner ตัดสินใจอนุมัติหรือปฏิเสธ Merge จากข้อมูลครบ และ approval หมดผลเมื่อ revision เปลี่ยน

### Scope

- approval requests
- Product Owner-only decision
- exact PR head SHA binding
- unresolved P0/freshness/conflict gates
- decision audit trail
- approval center UI

### Excluded

- GitHub merge execution

---

## Slice 7 — Controlled Merge Execution

### User Outcome

หลัง Product Owner ออกคำสั่งชัดเจน ระบบ merge PR ด้วย valid approval และ fresh GitHub verification โดยไม่ใช้ rebase

### Scope

- explicit merge command
- approval consumption
- fresh PR/head/base verification
- permitted merge method enforcement
- idempotent GitHub write
- result/activity/audit

### Excluded

- auto-merge
- deploy

---

## Slice 8 — Integrated Verification and Deploy Approval

### User Outcome

Product Owner เห็น integrated evidence บน `main` และอนุมัติ exact commit สำหรับ environment ที่กำหนดได้

### Scope

- verify commit reachable on main
- integrated test evidence
- environment registry
- backup readiness
- deploy approval bound to commit/environment

### Excluded

- actual deployment

---

## Slice 9 — Controlled Deployment

### User Outcome

ระบบ deploy exact approved commit จาก `main`, เก็บ backup/deploy/smoke-test evidence และรายงาน failure ตามจริง

### Scope

- explicit PO deploy command
- provider adapter
- main-only and approval checks
- backup gate
- deployment record
- smoke test and rollback evidence

### Excluded

- autonomous deployment
- unapproved production changes

## Slice Rules

ทุก Slice ต้องมี:

- user outcome
- business rules
- included/excluded scope
- active owner
- branch/worktree/base SHA
- acceptance criteria
- tests/E2E/docs evidence
- security and audit consideration

ห้ามรวมงานจาก Slice ถัดไปเพื่อความสะดวก หากพบ dependency ให้บันทึก backlog หรือปรับลำดับโดย Product Owner
