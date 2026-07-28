# System Architecture

## 1. Architecture Decision

เริ่มด้วย Modular Monolith เพื่อให้ authorization, transaction, audit consistency และ workflow rules ควบคุมได้ง่าย ก่อนพิจารณาแยก service เมื่อมีหลักฐานด้าน scale หรือ ownership ที่ชัดเจน

## 2. Context

ผู้ใช้งานหลักคือ Product Owner และทีมพัฒนาที่ใช้ GPT, Claude AI, Claude Code และ Codex ระบบเชื่อม GitHub เพื่ออ่านสถานะจริงและใน phase หลังจึงค่อยดำเนินการ write action ที่ได้รับอนุมัติ

External systems:

- GitHub App / GitHub API / Webhooks
- Identity Provider
- Secret Manager
- Deployment Provider ใน phase หลัง
- Notification provider ใน phase หลัง

## 3. Logical Layers

### Web UI

- Command Center
- Project Registry
- Task Board
- Active Lanes
- AI Session Registry
- Conflict Detection
- GitHub Sync
- Review Queue
- Approval Center
- Activity Log

### Application API

- authenticated commands and queries
- server-side authorization
- idempotency
- optimistic concurrency
- validation และ policy enforcement

### Domain Modules

1. Identity and Access
2. Project Registry
3. Work Planning
4. Active Lane Control
5. AI Session Registry
6. Conflict Detection
7. GitHub Integration
8. Review Management
9. Approval Governance
10. Deployment Governance
11. Activity and Audit

### Infrastructure

- PostgreSQL
- transactional outbox
- background job queue
- secret manager adapter
- GitHub adapter
- structured logs and metrics

## 4. Trust Boundaries

- Browser/client เป็น untrusted
- AI clients เป็น untrusted สำหรับ role, permission, target SHA และ approval
- GitHub webhook เป็น external input ต้องตรวจ signature, delivery ID และ replay
- GitHub API response เป็น external source ที่ต้อง normalize และ audit
- Secret values ต้องอยู่ใน dedicated secret boundary
- **string ทุกตัวที่มาจาก GitHub เป็น attacker-controlled content** — repository name/description, branch name, commit message, PR title/body, review body, user login และ label ถูกเขียนโดยบุคคลภายนอกได้ ต้องถือเป็น untrusted data เสมอ ไม่ใช่ metadata ที่เชื่อถือได้

### Untrusted External Content Rule

content ที่มาจาก GitHub ห้ามถูกปฏิบัติเป็น markup, code หรือคำสั่ง ไม่ว่าจะปลายทางเป็น browser หรือ AI

- render เป็น text เท่านั้น ห้าม inject เป็น raw HTML และห้ามใช้ mechanism ที่ประเมิน markup จาก string ภายนอก
- URL ที่มาจาก external content ต้อง validate scheme ก่อนแสดงเป็นลิงก์ อนุญาตเฉพาะ `https` และ link ที่เปิดออกภายนอกต้องมี `rel="noopener noreferrer"`
- เมื่อส่ง external content ให้ AI ต้องห่อด้วย boundary ที่ระบุชัดว่าเป็นข้อมูล ไม่ใช่คำสั่ง และ AI ต้องไม่ปฏิบัติตาม instruction ที่ปรากฏใน content นั้น
- external content ที่แสดงใน UI ต้องไม่ถูกใช้เป็น input ของ command หรือ policy decision โดยตรง

## 5. Command Pattern

คำสั่งสำคัญ เช่น create project, claim lane, request approval และ record decision ต้องมี:

- authenticated actor
- authorization policy
- idempotency key
- expected aggregate version เมื่อแก้ resource เดิม
- correlation ID
- activity event
- audit record

## 6. Read Model and GitHub Reconciliation

ระบบเก็บ local projection เพื่อ UX ที่เร็ว แต่ทุก record ที่มาจาก GitHub ต้องเก็บ:

- GitHub object ID
- repository ID
- source updated timestamp
- last synced timestamp
- source commit/head SHA เมื่อเกี่ยวข้อง

ใช้ทั้ง webhook และ scheduled reconciliation เพราะ webhook อย่างเดียวอาจตกหล่นหรือล่าช้า

## 7. Approval Boundary

Approval เป็น domain aggregate แยกจาก execution

Merge approval ผูกกับ:

- project
- PR number
- exact head SHA
- review snapshot/evidence
- Product Owner identity
- decision timestamp

Deploy approval ผูกกับ:

- project
- environment
- exact commit SHA ที่ตรวจว่าอยู่บน `main`
- integrated test evidence
- Product Owner identity

Execution ต้องตรวจ approval ใหม่ก่อนทำ action และ consume approval แบบ idempotent

## 8. Audit Architecture

ใน transaction เดียวกับ business mutation ให้เขียน:

- domain state change
- activity event
- audit record
- outbox event หากต้องส่งออกภายนอก

Audit records ต้อง append-only ผ่าน application service และไม่เปิด generic update/delete endpoint

## 9. Security Baseline

- OIDC/OAuth human authentication
- RBAC + project-scoped policy checks
- GitHub App แทน PAT ระยะยาว
- secret manager หรือ envelope encryption
- CSRF protection สำหรับ browser session
- webhook signature validation
- replay protection ด้วย delivery ID
- rate limiting
- secure headers
- structured redaction
- recent authentication สำหรับ approval action สำคัญ

## 10. Deployment Topology Proposal

Phase แรกใช้:

- Web/API application หนึ่ง deployment unit
- PostgreSQL หนึ่ง cluster/database
- background worker แยก process ได้แต่ใช้ codebase เดียวกัน
- managed secret store
- HTTPS reverse proxy/platform ingress

ยังไม่กำหนด cloud vendor ใน Foundation Pack

## 11. Non-Goals for Initial Slices

- autonomous coding orchestration
- autonomous merge/deploy
- full IDE/worktree control จาก browser
- arbitrary shell execution
- multi-provider deployment automation
- microservices

## 12. Quality Attributes

ลำดับความสำคัญ:

1. Authorization correctness
2. Auditability
3. Conflict prevention
4. Data integrity and idempotency
5. GitHub consistency
6. Clear UX for decisions
7. Performance and scale
