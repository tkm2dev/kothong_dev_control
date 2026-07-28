# Slice 1 Acceptance Criteria — Project Registry and Audit Foundation

## 1. Goal

ส่งมอบ flow end-to-end แรกที่ Product Owner ยืนยันตัวตน เลือก GitHub repository ที่ server ตรวจสิทธิ์แล้ว ลงทะเบียนเป็น Project และเห็นข้อมูลใน Project Registry พร้อม Activity Log และ immutable Audit Record

## 2. In Scope

- human authentication
- organization/project authorization boundary
- GitHub App installation — minimal read-only connection สำหรับ metadata lookup
- server-side GitHub API access และ credential handling ของ installation
- GitHub installation/repository selection or verified `owner/name` fallback
- server-side repository metadata lookup
- Project Registry list/detail/add flow
- idempotent create command
- optimistic concurrency for project settings
- activity and audit foundation
- credential redaction
- domain/API/UI/integration/E2E tests
- API/data/permission/operations documentation

## 3. Out of Scope

- application-controlled branch creation
- Pull Request creation
- GitHub webhooks, signature verification และ delivery dedupe
- scheduled reconciliation และ drift detection
- branch/PR/check projections และ sync health UI
- write operation ใดๆ ไปยัง GitHub
- Task Board, Active Lanes, AI Sessions, Conflicts
- Review Queue and Approval Center
- Merge or Deploy endpoint/UI
- autonomous action

## 3.1 Policy Definitions

หัวข้อนี้นิยาม policy ที่ Acceptance Criteria อ้างถึง เพื่อให้ทุกข้อตัดสิน pass/fail ได้โดยไม่ต้องตีความ

### Recorded Actions

action ที่ต้องบันทึกใน Slice 1 มีเพียงชุดนี้ ชื่อ action code ต้องคงที่:

| Action code | เมื่อใด |
|---|---|
| `PROJECT_CREATE` | พยายามสร้าง project |
| `PROJECT_UPDATE` | พยายามแก้ project settings |
| `PROJECT_REFRESH` | พยายาม re-fetch metadata จาก GitHub |
| `PROJECT_READ_DENIED` | พยายามอ่าน project ที่ไม่มีสิทธิ์ |
| `INSTALLATION_LIST` | เรียกรายการ GitHub installation |
| `REPOSITORY_PREVIEW` | เรียกดู metadata ของ repository ก่อนลงทะเบียน |

### Outcome Values

`SUCCESS`, `DENIED`, `VALIDATION_FAILED`, `CONFLICT`, `UPSTREAM_ERROR`, `IDEMPOTENT_REPLAY`

### Activity Event Policy

- ทุก action ในตาราง Recorded Actions ต้องสร้าง Activity Event **หนึ่งรายการต่อหนึ่ง request** ไม่ว่า outcome จะเป็นอะไร
- request ที่ถูกปฏิเสธเพราะไม่ผ่าน authentication ไม่ต้องสร้าง Activity Event ระดับ project เพราะยังไม่มี actor ที่ระบุตัวตนได้ แต่ต้องนับใน rate-limit counter ตาม AC-39
- request ที่ payload ผิด schema จนระบุ action ไม่ได้ ไม่ต้องสร้าง Activity Event

### Audit Record Policy

ต้องสร้าง Audit Record เมื่อ:

1. outcome เป็น `SUCCESS` และ action ทำให้ persisted state เปลี่ยน
2. outcome เป็น `DENIED` ทุกกรณี โดยไม่คำนึงถึง action — การถูกปฏิเสธคือ security-significant เสมอ
3. outcome เป็น `CONFLICT` ที่เกิดจาก tenant boundary หรือ optimistic concurrency

ไม่ต้องสร้าง Audit Record เมื่อ outcome เป็น `VALIDATION_FAILED`, `UPSTREAM_ERROR` หรือ `IDEMPOTENT_REPLAY`

### Idempotency Replay Policy

เมื่อ retry ด้วย idempotency key เดิมและ payload เดิม:

- จำนวน Project ที่ถูกสร้าง = 1
- จำนวน Audit Record ที่มี outcome `SUCCESS` = 1
- จำนวน Activity Event = เพิ่มขึ้น 1 รายการต่อ retry หนึ่งครั้ง โดยมี outcome `IDEMPOTENT_REPLAY`
- response body และ status code ต้องเหมือน response แรกทุกประการ

### Denied Response Policy

เมื่อ authenticated user ไม่มีสิทธิ์เข้าถึง resource ที่มีอยู่จริง server ต้องคืน `404 Not Found` ไม่ใช่ `403 Forbidden` เพื่อไม่เปิดเผยการมีอยู่ของ resource ข้าม tenant

`403 Forbidden` ใช้เฉพาะกรณีที่ผู้เรียกมีสิทธิ์เห็น resource นั้นอยู่แล้วแต่ไม่มีสิทธิ์ทำ action ที่ร้องขอ

ทั้งสองกรณีต้องสร้าง Audit Record ด้วย outcome `DENIED`

## 4. Functional Acceptance Criteria

### AC-01 Protected Access

Given ผู้ใช้ยังไม่ยืนยันตัวตน
When เปิด Project Registry หรือเรียก protected API
Then ระบบไม่คืน project data และนำเข้าสู่ authentication flow หรือคืนมาตรฐาน unauthorized response

### AC-02 Human Identity Boundary

Given request มาจาก AI session, service account หรือ client payload ที่อ้าง role เอง
When เรียก action สงวนสำหรับ Product Owner
Then server ปฏิเสธตาม authenticated identity/policy โดยไม่เชื่อ role จาก client

### AC-03 Authorized Read

Given authenticated user มี read permission ใน organization
When เปิด Project Registry
Then เห็นเฉพาะ projects ใน scope ที่ได้รับอนุญาต

### AC-04 Authorized Mutation

Given authenticated user ไม่มี project management permission
When พยายาม add/edit project
Then server คืน response ตาม Denied Response Policy ในหัวข้อ 3.1 และสร้าง Activity Event กับ Audit Record ที่มี outcome `DENIED` ทั้งคู่

### AC-05 Repository Selection

Given Product Owner มี GitHub installation ที่ระบบเข้าถึงได้
When เปิด Add Project
Then UI ให้เลือก repository จากรายการที่ server ดึงจาก GitHub ลดการกรอกข้อมูลเอง

Fallback แบบกรอก `owner/name` ทำได้เมื่อ provider flow รองรับและยังต้องตรวจ server-side

### AC-06 Server-side Verification

Given Product Owner เลือก repository
When preview หรือ submit
Then server อ่านและใช้ external repository ID, owner, name, visibility, default branch และ permission/access status จาก GitHub response ไม่ใช้ค่าจาก browser เป็น source of truth

### AC-07 Successful Registration

Given repository เข้าถึงได้และยังไม่ถูกลงทะเบียนใน organization
When Product Owner ยืนยัน
Thenระบบสร้าง Project และ GitHub repository binding ใน transaction เดียว พร้อม Activity Event, Audit Record และ correlation ID

### AC-08 Duplicate Repository

Given external repository ID เดิมถูกลงทะเบียนใน organization เดียวกันแล้ว
When submit ซ้ำ
Then ระบบไม่สร้าง duplicate และคืน conflict response พร้อม stable error code เดิมทุกครั้ง ห้ามคืน existing resource เป็น success เพราะจะซ้อนกับ semantics ของ idempotent retry ใน AC-09

Error response ต้องไม่เปิดเผยว่า repository ถูกลงทะเบียนโดย organization หรือ project ใด หากผู้เรียกไม่มีสิทธิ์อ่าน resource นั้น

### AC-09 Idempotent Retry

Given create request ใช้ idempotency key และ payload เดิม
When client retry
Then ระบบคืนผลเดิมตาม Idempotency Replay Policy ในหัวข้อ 3.1 — Project = 1, Audit Record ที่มี outcome `SUCCESS` = 1, Activity Event เพิ่มหนึ่งรายการต่อ retry ด้วย outcome `IDEMPOTENT_REPLAY` และ response body กับ status code เหมือนเดิมทุกประการ

### AC-10 Idempotency Misuse

Given idempotency key เดิมถูกใช้กับ payload ต่างกัน
When submit
Thenระบบปฏิเสธด้วย conflict/validation response และไม่ mutate project state

### AC-11 Repository Unavailable

Given GitHub คืน not found, access denied, suspended installation, timeout หรือ rate limit
When preview/register/refresh
Thenระบบไม่สร้าง project ที่ดู valid, แสดงข้อความที่แยกประเภทได้ และไม่เปิดเผย token/secret

### AC-12 Project Registry List

List ต้องแสดงอย่างน้อย:

- project name
- repository owner/name
- visibility
- default branch
- access status
- sync/verification status
- last verified timestamp

UI ใช้ visual direction และ status semantics จาก `docs/UX_FLOWS.md`

### AC-13 Project Detail

Project detail ต้องแสดง source metadata, verification freshness, access status, activity timeline และ identifier ที่ใช้ตรวจสอบได้ โดยไม่แสดง credential

### AC-14 Refresh Verification

Given registered project
When authorized userกด refresh
Then server re-fetch GitHub metadata, update allowed fields ด้วย optimistic concurrency และบันทึก success/failure activity/audit

### AC-15 Optimistic Concurrency

Given project configuration ถูกแก้โดย session อื่นหลังผู้ใช้เปิดหน้า
When submit ด้วย stale version
Thenระบบปฏิเสธด้วย conflict response แทนการเขียนทับ และ UI เสนอ refresh/review changes

### AC-16 Explicit Status Freshness

ทุก metadata ที่มาจาก GitHub ต้องแสดงหรือเข้าถึง `last verified/synced at` ได้ ห้ามแสดง cached state เหมือนเป็น real-time โดยไม่มี timestamp

## 5. Audit and Security Acceptance Criteria

AC-38 ถึง AC-40 ถูกเพิ่มภายหลังและวางไว้ในหัวข้อนี้ตามเนื้อหา หมายเลข AC เดิมทั้งหมดคงเดิมเพื่อไม่ให้การอ้างอิงจากเอกสารและ review ก่อนหน้าเสีย ลำดับหมายเลขจึงไม่เรียงตามลำดับในเอกสาร

### AC-17 Activity Event

ทุก action ในตาราง Recorded Actions หัวข้อ 3.1 ต้องสร้าง human-readable Activity Event ตาม Activity Event Policy พร้อม actor, action code, target, outcome, timestamp และ correlation ID

### AC-18 Immutable Audit Record

ต้องสร้าง Audit Record ตาม Audit Record Policy ในหัวข้อ 3.1

ความ immutable ต้องพิสูจน์ได้สองระดับ:

1. ไม่มี HTTP route ใดใน application รองรับ `PUT`, `PATCH` หรือ `DELETE` บน audit resource — ยืนยันด้วยการตรวจ route inventory
2. database role ที่ application ใช้เชื่อมต่อ ต้องไม่มีสิทธิ์ `UPDATE` หรือ `DELETE` บนตาราง `audit_records` — ยืนยันด้วย test ที่พยายามรันคำสั่งแล้วต้องได้ permission error

### AC-19 Sanitized Audit Payload

Audit/activity/outbox/log ต้องไม่บรรจุ:

- access token
- refresh token
- GitHub App private key
- webhook secret
- authorization/cookie header
- plaintext credential

### AC-20 Secret Storage

Slice 1 มี GitHub App installation และ server-side GitHub API access อยู่ใน scope จึงต้องจัดการ credential แน่นอน AC ข้อนี้เป็นข้อบังคับ ไม่ใช่เงื่อนไข

- GitHub App private key และ installation access token ต้องเก็บผ่าน secret manager reference หรือ approved encrypted mechanism ตาม secret management approach ที่ merged แล้วตาม `AGENTS.md` §10 ข้อ 3
- secret ต้องเก็บแยกจาก project metadata และไม่อยู่ในตารางที่ query ทั่วไปเข้าถึง
- ไม่คืน secret value กลับ UI หรือ API response ในทุกกรณี รวมถึงหลังบันทึกสำเร็จ
- installation access token ที่มีอายุสั้นต้องไม่ถูก persist เกินความจำเป็น และต้องระบุอายุที่ใช้จริงในเอกสาร operational limitations ตาม AC-36
- ต้องมี test ที่ยืนยันว่า secret ไม่ปรากฏใน API response, log, activity, audit และ rendered UI ตาม AC-34

### AC-21 Correlation

API response/error ที่เหมาะสมต้องมี correlation reference ที่เชื่อมกับ Activity/Audit ได้โดยไม่เปิด internal secret

### AC-22 Server-side Authorization Tests

ต้องมี negative tests ที่แก้ payload, role field, organization ID และ project ID เพื่อยืนยันว่า horizontal/vertical privilege escalation ถูกปฏิเสธ

### AC-38 Session and CSRF Protection

Slice 1 เป็น Slice ที่ส่งมอบ authentication และ authenticated mutation จึงต้องมี browser-security gate ตาม `docs/SYSTEM_ARCHITECTURE.md` §9

- state-changing request ทุกตัวที่ใช้ browser session ต้องมี CSRF protection ที่ตรวจฝั่ง server
- request ที่ไม่มี CSRF token หรือมี token ที่ไม่ถูกต้อง ต้องถูกปฏิเสธและไม่ mutate state
- session cookie ต้องตั้ง `HttpOnly`, `Secure` และ `SameSite` อย่างน้อยระดับ `Lax`
- session identifier ต้องถูกสร้างใหม่หลัง authentication สำเร็จ เพื่อป้องกัน session fixation
- ต้องมี logout ที่ทำให้ session ฝั่ง server ใช้ต่อไม่ได้จริง ไม่ใช่เพียงลบ cookie ฝั่ง browser
- ต้องมี test ที่ยืนยันทั้ง 5 ข้อข้างต้น

### AC-39 Rate Limiting

- authentication endpoint และ mutation endpoint ต้องมี rate limit ฝั่ง server
- เมื่อเกิน limit ต้องคืน `429` พร้อม stable error code และไม่ mutate state
- rate-limit counter ต้องนับ request ที่ไม่ผ่าน authentication ด้วย
- rate-limit response ต้องไม่เปิดเผยว่า account หรือ resource นั้นมีอยู่จริงหรือไม่
- ค่า limit ที่เลือกต้องบันทึกในเอกสาร operational limitations ตาม AC-36

### AC-40 Secure Headers

response ของ HTML document ต้องมี header อย่างน้อย:

- `Content-Security-Policy` ที่ไม่อนุญาต `unsafe-inline` สำหรับ script
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy` ที่ไม่ส่ง full URL ข้าม origin
- `Strict-Transport-Security` เมื่อให้บริการผ่าน HTTPS

ต้องมี test ที่ assert header เหล่านี้บน response จริง ไม่ใช่ตรวจจาก configuration file อย่างเดียว

## 6. UX Acceptance Criteria

### AC-23 Visual Baseline

Project Registry ต้องใช้:

- warm cream canvas
- dark brown/olive sidebar
- amber primary action
- muted green healthy status
- brick red blocking/error status
- rounded light cards และ readable spacing

ต้องผ่าน contrast review และไม่พึ่งสีเพียงอย่างเดียว

### AC-24 Low-input Add Flow

ผู้ใช้ต้องเพิ่ม project ด้วยการเลือกเป็นหลัก ไม่บังคับกรอก metadata ที่ GitHub มีอยู่แล้ว

### AC-25 Responsive

Flow หลักใช้งานได้บน desktop/tablet/mobile ตาม layout rules ใน UX document โดยไม่มี action สำคัญหายไป

### AC-26 Accessibility

- keyboard navigation
- visible focus
- semantic labels
- touch target อย่างน้อย 44px สำหรับ primary controls
- error/status มีข้อความและ icon
- target WCAG AA contrast

### AC-27 Loading, Empty, Error

ต้องมี states สำหรับ:

- no projects
- loading repositories
- verifying repository
- permission denied
- repository unavailable
- rate limited
- stale data
- optimistic concurrency conflict

## 7. Technical and Test Acceptance Criteria

### AC-28 Transactional Consistency

Project mutation, Activity Event, Audit Record และ Outbox Event (ถ้ามี) ต้อง commit/rollback สอดคล้องกัน

### AC-29 Database Constraints

ต้องมี database-level unique constraint บน `(organization_id, external_repository_id)` ในตาราง `github_repositories` ไม่พึ่ง application check อย่างเดียว

ต้องมี composite foreign key ที่บังคับ tenant boundary ที่ระดับ database ตาม `docs/DATABASE_SCHEMA.md` หัวข้อ Tenant Integrity Rule:

- `(project_id, organization_id)` → `projects (id, organization_id)`
- `(installation_id, organization_id)` → `github_installations (id, organization_id)`

ต้องมี test ครอบคลุมอย่างน้อย:

1. concurrent insert ของ external repository ID เดียวกันใน organization เดียวกัน สำเร็จเพียงรายการเดียว
2. request ที่อ้าง `project_id` ของ organization อื่น ถูกปฏิเสธที่ระดับ database ไม่ใช่เฉพาะที่ application layer
3. request ที่อ้าง `installation_id` ของ organization อื่น ถูกปฏิเสธที่ระดับ database
4. การพยายาม insert โดยข้าม application service ไปเขียน database ตรง ด้วยชุดค่าที่ข้าม tenant ต้อง fail ด้วย constraint violation

### AC-30 Contract Validation

API validate identifiers, strings, enum, pagination และ idempotency header อย่างชัดเจน พร้อม stable error codes

### AC-31 Domain Tests

ครอบคลุมอย่างน้อย:

- repository uniqueness
- tenant integrity เมื่ออ้าง Project หรือ Installation ข้าม organization
- authorization policy
- idempotency semantics
- optimistic concurrency
- audit sanitization

### AC-32 Integration Tests

ครอบคลุมอย่างน้อย:

- successful GitHub verification and registration
- duplicate/retry
- denied access
- unavailable/rate-limited GitHub
- transaction rollback

External GitHub calls ต้อง mock/fake อย่าง deterministic ใน automated tests และมี contract strategy ที่ระบุไว้

### AC-33 UI E2E

ครอบคลุมอย่างน้อย:

- authenticated Product Owner adds project
- duplicate submission/retry
- read-only user cannot add
- GitHub access denied
- stale version conflict
- responsive critical flow อย่างน้อยหนึ่ง viewport ขนาดเล็ก

### AC-34 Credential Redaction Tests

ใส่ sentinel secret ใน test input แล้ว assert ว่าไม่ปรากฏใน logs, activity, audit, API response และ rendered UI

### AC-35 No Delivery Actions

Repository diff และ runtime routes ต้องไม่มี application feature สำหรับ:

- create branch/PR
- merge/auto-merge
- deploy
- arbitrary repository write

## 8. Documentation Acceptance Criteria

### AC-36 Required Documentation

PR ต้องอัปเดต:

- implementation architecture
- API contract
- database migration/schema
- permission matrix
- local setup
- test commands
- operational limitations
- secret configuration without secret values

### AC-37 READY FOR FINAL REVIEW Evidence

Implementation Owner ต้องแนบ:

- branch และ base commit
- head commit SHA
- changed files/scope summary
- migration summary
- test commands และผลจริง
- E2E/screenshots
- security self-review
- known limitations
- files outside declared scope
- CI status และ startup failure limitation หากมี

## 9. Definition of Done

Slice 1 เริ่มเขียน code ได้เมื่อครบ prerequisite ทั้ง 5 ข้อตาม `AGENTS.md` §10 — technology stack ADR, authentication provider ADR, secret management approach, Acceptance Criteria ที่ทดสอบได้ครบทุกข้อ และ Active Lane ที่ Product Owner อนุมัติ

Slice 1 ถือว่าเสร็จเมื่อ:

1. Acceptance Criteria ทั้ง AC-01 ถึง AC-40 ผ่านตาม evidence
2. ไม่มี unresolved P0
3. P1/P2 ถูกบันทึก backlog
4. GPT Final Review เสร็จ
5. Product Owner อนุมัติ Merge สำหรับ exact head SHA
6. PR merge เข้า `main`
7. integrated tests บน `main` ผ่านหรือมี limitation ที่ PO รับทราบ

การ deploy ไม่ใช่ส่วนของ Slice 1
