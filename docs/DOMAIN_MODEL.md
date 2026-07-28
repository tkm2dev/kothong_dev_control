# Domain Model

## 1. Aggregate Overview

### Organization

ขอบเขตหลักของ users, projects และ policies

### User

มนุษย์ที่ยืนยันตัวตนผ่าน identity provider

### RoleAssignment

กำหนด role แบบ organization-scoped หรือ project-scoped โดย permission ถูกประเมินฝั่ง server

### Project

ตัวแทน GitHub repository ที่ลงทะเบียนในระบบ

Fields สำคัญ:

- repository provider และ external repository ID
- owner/name
- visibility
- default branch
- access status
- sync status
- policy version
- optimistic version

### WorkItem

หน่วยวางแผนทั่วไป เช่น Epic, Feature, Slice หรือ Task

### Slice

Vertical Slice ที่มี outcome end-to-end และมี active implementation owner ได้หนึ่งราย

### ActiveLane

สิทธิ์ครอบครอง implementation scope ชั่วคราว

Invariant:

- หนึ่ง active lane ต่อ Slice
- owner, branch และ worktree ต้องระบุเมื่อ active
- base commit ต้องอ้างอิง GitHub snapshot

### AISession

session ของ GPT, Claude AI, Claude Code หรือ Codex เชื่อมกับ purpose, lane และ scope

AI type ไม่เท่ากับ authorization role และห้ามใช้แทน human identity

### ScopeClaim

ขอบเขตที่ session คาดว่าจะอ่านหรือเขียน เช่น path, module, API route, database object, migration หรือ infrastructure resource

### Conflict

ผลวิเคราะห์การทับซ้อนระหว่าง claims หรือ GitHub changes

Severity:

- `BLOCKING`
- `WARNING`
- `INFORMATIONAL`

### GitHubSnapshot

ภาพสถานะ GitHub ณ เวลาหนึ่ง เช่น repository, branch, PR, check และ SHA พร้อม source timestamps

### ReviewRequest

คำขอ review สำหรับ exact revision และ reviewer role

### ReviewFinding

ข้อค้นพบ P0/P1/P2 พร้อม evidence, status และ backlog link เมื่อไม่แก้ใน active slice

### ApprovalRequest

คำขอ Product Owner ตัดสินใจ Merge หรือ Deploy

### ApprovalDecision

ผล immutable: `APPROVED`, `REJECTED`, `EXPIRED`, `SUPERSEDED`

Approval ไม่ใช่ boolean field บน PR แต่เป็น decision record ที่ผูกกับ exact target

### Deployment

บันทึก deployment ของ exact commit บน `main` ไปยัง environment พร้อม backup และ smoke-test evidence

### ActivityEvent

เหตุการณ์สำหรับ human-readable timeline

### AuditRecord

หลักฐานเชิง compliance แบบ append-only

## 2. State Machines

### Slice

`BACKLOG → READY → ACTIVE → IN_REVIEW → READY_FOR_PO → APPROVED_FOR_MERGE → MERGED → INTEGRATED_VERIFIED → APPROVED_FOR_DEPLOY → DEPLOYED`

Alternative states: `BLOCKED`, `CANCELLED`

### ActiveLane

`RESERVED → ACTIVE → REVIEWING → RELEASED`

Exceptional states: `CONFLICTED`, `EXPIRED`, `REVOKED`

### AISession

`REGISTERED → ACTIVE → PAUSED | COMPLETED | FAILED | CANCELLED`

### ReviewRequest

`DRAFT → REQUESTED → IN_PROGRESS → CHANGES_REQUIRED | PASSED → SUPERSEDED`

### ApprovalRequest

`REQUESTED → APPROVED → CONSUMED`

Terminal states without execution: `REJECTED`, `EXPIRED`, `SUPERSEDED`

เฉพาะ `APPROVED` เท่านั้นที่ consume ได้ และ consume ได้เพียงครั้งเดียว

`APPROVED` ต้องเปลี่ยนเป็น `SUPERSEDED` หรือ `EXPIRED` ทันทีที่ target SHA เปลี่ยนหรือหมดอายุ และเมื่อเปลี่ยนแล้วจะกลับมา consume ไม่ได้อีก

## 3. Important Invariants

1. Active Slice มี Implementation Owner เดียว
2. Pull Request มี owner เดียวใน KOTHONG DEV CONTROL
3. AI identity ไม่สามารถ grant approval decision
4. Merge approval valid เฉพาะ exact PR head SHA
5. Deploy approval valid เฉพาะ exact main commit SHA และ environment
6. head/commit target เปลี่ยนทำให้ approval เดิม superseded
7. deployment target ต้องเป็น ancestor/reachable จาก `main` ล่าสุดตาม policy
8. audit record ไม่ถูกแก้หรือลบผ่าน business API
9. credential values ไม่อยู่ใน domain events, activity หรือ audit payload
10. idempotency key เดิมกับ payload ต่างกันต้องถูกปฏิเสธ

## 4. Domain Services

### LanePolicyService

ตรวจ owner uniqueness, branch/worktree reuse และ slice eligibility

### ConflictDetectionService

เปรียบเทียบ scope claims และ GitHub changed paths/resources

### GitHubReconciliationService

normalize external state และตรวจ drift

### ReviewReadinessService

ตรวจ evidence และ unresolved P0

### ApprovalPolicyService

ตรวจ human authority, target SHA, freshness และ prerequisite evidence

### DeploymentEligibilityService

ตรวจว่า exact commit อยู่บน `main`, มี integrated evidence และ valid deploy approval

## 5. Domain Events

ตัวอย่าง:

- `ProjectRegistered`
- `ProjectVerificationFailed`
- `LaneClaimed`
- `LaneReleased`
- `AISessionRegistered`
- `ConflictDetected`
- `ConflictOverridden`
- `ReviewRequested`
- `ReviewPassed`
- `FindingRecorded`
- `MergeApprovalRequested`
- `MergeApproved`
- `ApprovalSuperseded`
- `DeploymentApproved`
- `DeploymentRecorded`

ทุก event ต้องไม่บรรจุ plaintext secret
