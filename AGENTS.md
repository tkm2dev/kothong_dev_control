# AGENTS.md

เอกสารนี้เป็นกฎปฏิบัติหลักสำหรับมนุษย์และ AI ทุกตัวที่ทำงานใน repository `tkm2dev/kothong_dev_control`

## 1. Source of Truth

- GitHub repository นี้เป็น source of truth ของโค้ด เอกสาร branch commit Pull Request review และสถานะ CI
- ก่อนออกแบบงาน ออกคำสั่งพัฒนา ตรวจ PR หรือสรุปสถานะ ต้องอ่าน `main` ล่าสุดเสมอ
- ต้องอ่านไฟล์นี้และ `docs/TEAM_DEVELOPMENT_MODEL.md` ก่อนเริ่มงานทุกครั้ง
- เมื่อข้อมูลขัดกัน ให้เชื่อโค้ดและเอกสารบน `main` ล่าสุด
- ห้ามสรุปสถานะจากความจำหรือบทสนทนาเก่าเพียงอย่างเดียว

## 2. Product Boundary

KOTHONG DEV CONTROL เป็น Human-in-the-loop control plane สำหรับประสานงาน Product Owner, GPT, Claude AI, Claude Code และ Codex ผ่าน GitHub

ระบบต้องช่วยจัด Active Lane ป้องกันงานชนกัน จัดคิว Review เก็บ Approval และ Audit Trail แต่ต้องไม่ทำ Autonomous Merge หรือ Autonomous Deploy

## 3. Roles

### Product Owner

- กำหนดเป้าหมายและลำดับงาน
- อนุมัติการเปลี่ยน Active Slice
- อนุมัติ Merge และ Deploy
- อนุมัติ conflict override
- ไม่มี AI ตัวใดอนุมัติแทนได้

### GPT

- System Design
- UX/UI
- Business Rules
- Roadmap
- Acceptance Criteria
- Final Review

### Claude Code

- Main Implementation Developer
- ทำหนึ่ง Vertical Slice ให้ครบ API, Domain, UI, Tests, E2E, Docs และ PR
- ต้องเริ่มจาก `origin/main` ล่าสุด

### Claude AI

- Analysis และ Design Review
- ไม่มีสิทธิ์ Merge หรือ Deploy

### Codex

- Specialist สำหรับ Test, Security, Performance, CI, Migration และงานที่แยกจาก Active Slice
- ห้ามเข้าไปแก้ scope ของ Active Slice โดยไม่ได้รับมอบหมายอย่างชัดเจน

## 4. Active Work Rules

- หนึ่งช่วงเวลามี Active Implementation Item เดียว เว้นแต่ Product Owner เปลี่ยนลำดับอย่างชัดเจน
- หนึ่ง Slice มี Active Implementation Owner ได้หนึ่งราย
- หนึ่ง Pull Request มีเจ้าของหนึ่งราย
- ทุก implementation session ต้องใช้ branch และ worktree แยก
- หลาย session ทำพร้อมกันได้เฉพาะ scope ที่ไม่ชนกัน
- งานนอก scope ต้องบันทึกเป็น backlog ห้ามขยาย Active Slice

## 5. Git Rules

- Branch-first และ Worktree-first
- ห้าม commit ตรงเข้า `main` หลัง initial bootstrap ที่บันทึกใน `docs/BOOTSTRAP_RECORD.md`
- ห้าม rebase
- ห้าม force-push
- ถ้า `main` ขยับ ให้ merge `origin/main` เข้า feature branch
- ห้าม Merge หรือ Deploy โดยไม่มีคำสั่ง Product Owner
- Deploy ได้เฉพาะ commit ที่ merge เข้า `main` แล้ว
- ห้าม Deploy จาก feature branch
- Pull Request ต้องอธิบาย scope, evidence, risks และ known limitations

กฎข้างต้นเป็น **convention ที่ไม่มี technical enforcement** — branch protection ยังใช้กับ repository นี้ไม่ได้ ทุกคนที่มีสิทธิ์ write สามารถ push เข้า `main` ได้ในทางเทคนิค ความรับผิดชอบจึงอยู่ที่ผู้ปฏิบัติทั้งหมด ดู `docs/ROADMAP.md` หัวข้อ "ข้อจำกัดการบังคับใช้ ณ ปัจจุบัน"

## 6. Standard Workflow

1. Product Owner กำหนดเป้าหมาย
2. GPT ตรวจ GitHub ล่าสุดและออกแบบ scope/acceptance
3. Product Owner อนุมัติ Foundation หรือ Slice scope
4. Implementation Owner เริ่มจาก `origin/main` ล่าสุดบน branch/worktree ของตน
5. Implementation Owner ทำงานครบ Vertical Slice และ self-review
6. ส่งสถานะ `READY FOR FINAL REVIEW`
7. GPT ทำ Final Review หนึ่งครั้ง
8. เฉพาะ P0 เท่านั้นที่ขวาง Merge; P1/P2 บันทึก backlog
9. Product Owner อนุมัติ Merge
10. ทดสอบ integrated บน `main`
11. Product Owner อนุมัติ Deploy
12. Backup → Deploy จาก `main` → Smoke Test

## 7. Review Severity

- `P0`: ความถูกต้อง ความปลอดภัย data loss authorization audit หรือ delivery gate ที่ผิด ต้องแก้ก่อน Merge
- `P1`: ปัญหาสำคัญแต่ไม่ขวาง Mergeตาม governance ให้บันทึก backlog พร้อม owner
- `P2`: งานปรับปรุงคุณภาพหรือ usability ให้บันทึก backlog

ห้ามเรียก GitHub Actions ที่เป็น `startup_failure` ว่า CI ผ่าน ต้องรายงาน local test evidence และข้อจำกัดตามจริง

## 8. Security and Audit

- ห้ามเชื่อ role permission repository identity approval หรือยอดสถานะจาก client โดยไม่ตรวจ server-side
- Credentials, tokens, webhook secrets และ authorization headers ห้ามเก็บหรือ log เป็น plaintext
- ทุก action สำคัญต้องมี Activity Log และ Audit Trail
- Approval ต้องผูกกับ authenticated human identity และ exact target เช่น PR head SHA หรือ deploy commit SHA
- การเปลี่ยน head SHA ทำให้ approval เดิมหมดผล
- AI service account ต้องไม่มี Product Owner permission

## 9. Current Foundation Gate

จนกว่า Foundation Pack และ Acceptance Criteria ของ Slice 1 จะถูกอนุมัติและ merge เข้า `main`:

- ห้ามเริ่ม application code
- ห้ามสร้าง Merge หรือ Deploy automation
- ทำได้เฉพาะเอกสาร governance, architecture, domain, UX, schema, roadmap และ slice planning

## 10. Slice 1 Implementation Prerequisites

Foundation Merge **ไม่ได้** ปลดล็อกการเขียน application code โดยอัตโนมัติ การ merge Foundation ปลดล็อกเพียงการวางแผนและการตัดสินใจที่เหลือ

Implementation ของ Slice 1 เริ่มได้เมื่อครบทุกข้อต่อไปนี้ และแต่ละข้อต้องมีหลักฐานบน `main`:

1. ADR เลือก implementation technology stack — `docs/adr/0003-technology-stack.md` merged และสถานะ `Accepted`
2. ADR เลือก authentication provider — `docs/adr/0004-authentication-provider.md` merged และสถานะ `Accepted`
3. Secret management approach — `docs/adr/0005-secret-management.md` merged และสถานะ `Accepted`
4. Slice 1 Acceptance Criteria ไม่มีข้อที่เขียน test ไม่ได้เหลืออยู่
5. Product Owner กำหนด Implementation Owner และอนุมัติ Active Lane

ห้ามเริ่มเขียน application code ของ Slice 1 ก่อนครบทั้ง 5 ข้อ แม้ Foundation Pack จะ merge แล้วก็ตาม

ADR ที่ยังมีสถานะ `Proposed` ไม่นับว่าตัดสินแล้ว

### ADR Status Lifecycle

- `Proposed` — เสนอแล้วแต่ยังไม่ผ่านการอนุมัติ อ้างอิงเป็นข้อผูกพันไม่ได้
- `Accepted` — ได้รับ Product Owner approval และ merge เข้า `main` แล้ว ต้องบันทึก **วันที่และหมายเลข Pull Request** ไว้ในหัวเอกสาร
- `Superseded` — ถูกแทนที่ด้วย ADR ใหม่ ต้องอ้างเลข ADR ที่มาแทน และห้ามลบเนื้อหาเดิม

**หัว ADR ต้องไม่บันทึก approved head SHA หรือ merge commit เป็นข้อบังคับ** เพราะทั้งสองค่ารู้ได้หลังจากเขียนคอมมิตที่บรรจุข้อความนั้นไปแล้ว การบังคับให้บันทึกทำให้ ADR เป็น `Accepted` ในคอมมิตที่ถูกอนุมัติไม่ได้เลย และต้องมี Pull Request ตามทุกครั้งไม่รู้จบ

หลักฐานการอนุมัติที่ผูกกับ exact SHA อยู่ใน approval record บน Pull Request ซึ่งเป็นที่ที่ถูกต้องตาม `docs/DOMAIN_MODEL.md` §1 ที่ระบุว่า approval เป็น decision record ที่ผูกกับ exact target ไม่ใช่ field บนเอกสารอื่น หัว ADR จึงอ้างถึงหลักฐานนั้น ไม่ทำสำเนา

บันทึก approved head SHA เพิ่มเติมได้หากทราบและต้องการความสะดวกในการตรวจ แต่ไม่ใช่เงื่อนไขของสถานะ

การเปลี่ยนสถานะเป็น `Accepted` ต้องเกิดใน Pull Request ไม่ใช่แก้ตรงบน `main`
