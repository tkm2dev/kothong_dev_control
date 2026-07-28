# Product and Business Rules

## 1. Product Goal

KOTHONG DEV CONTROL เป็น Web Application สำหรับควบคุมงานพัฒนาที่มีมนุษย์และ AI หลายตัวทำงานร่วมกัน โดยทำให้ Product Owner เห็นสถานะจริง ป้องกันงานชนกัน จัดคิว Review และเก็บหลักฐาน Approval สำหรับ Merge/Deploy

ระบบต้องลดความเสี่ยงจาก:

- หลาย session แก้ scope เดียวกัน
- สถานะในแชตไม่ตรง GitHub
- AI อ้างว่าพร้อม merge โดยไม่มีหลักฐาน
- Approval ที่ไม่ผูกกับ revision จริง
- Token หรือ credential รั่วไหล
- Deploy จาก feature branch หรือ commit ที่ยังไม่อยู่บน `main`

## 2. Source-of-Truth Rules

1. GitHub เป็น source of truth สำหรับ repository, branch, commit, PR, review, checks และ merge state
2. ข้อมูลในระบบเป็น projection/cache และต้องมี `lastSyncedAt` กับ source reference
3. เมื่อข้อมูลขัดกัน ให้ GitHub ล่าสุดเป็นฝ่ายถูก
4. การแสดงสถานะ `MERGED` ต้องยืนยันจาก GitHub
5. การแสดงสถานะ `DEPLOYED` ต้องมี deployment record และ evidence จาก provider/smoke test

## 3. Human Authority Rules

1. Product Owner เป็นผู้จัดลำดับ Active Slice
2. Product Owner เท่านั้นที่อนุมัติ Merge
3. Product Owner เท่านั้นที่อนุมัติ Deploy
4. Product Owner เท่านั้นที่ override blocking conflict
5. AI สามารถเสนอ ขออนุมัติ หรือเตรียม evidence ได้ แต่ตัดสินใจแทนไม่ได้
6. AI/service account ต้องไม่มี role ที่ให้ approval decision

## 4. Active Work Rules

1. หนึ่งช่วงเวลามี Active Implementation Item เดียว เว้นแต่ PO เปลี่ยนลำดับชัดเจน
2. หนึ่ง Slice มี Active Implementation Owner หนึ่งราย
3. หนึ่ง PR มี owner หนึ่งราย
4. Branch และ worktree ต้องไม่ถูกแชร์ข้าม implementation owners
5. Session ขนานทำได้เฉพาะ write scope ไม่ทับซ้อน
6. งานนอก scope ต้องเข้า backlog ห้ามขยาย Active Slice โดยอัตโนมัติ

## 5. Git and Delivery Rules

- ห้าม rebase
- ห้าม force-push
- ห้าม commit ตรงเข้า `main` หลัง initial bootstrap ที่บันทึกใน `docs/BOOTSTRAP_RECORD.md`
- เมื่อ `main` ขยับ ให้ merge `origin/main` เข้า feature branch
- ห้าม Merge/Deploy โดยไม่มีคำสั่ง PO
- Deploy ได้เฉพาะ exact commit ที่อยู่บน `main`
- ห้าม Deploy จาก feature branch
- Approval ต้อง invalidate เมื่อ target SHA เปลี่ยน
- Auto-merge และ autonomous deploy ปิดในช่วงเริ่มต้น

## 6. Review Rules

- Review ต้องอ้างอิง exact revision
- `P0` ขวาง Merge
- `P1` และ `P2` ไม่ขยาย Active Slice ให้บันทึก backlog
- `startup_failure` ของ GitHub Actions ห้ามเรียกว่า CI ผ่าน
- local test evidence ต้องระบุ command, result และ limitation ตามจริง

## 7. Conflict Rules

### Blocking

- active owner มากกว่าหนึ่งรายใน Slice เดียว
- write path หรือ schema resource ทับซ้อน
- migration sequence เดียวกัน
- PR owner มากกว่าหนึ่งราย
- branch/worktree ถูกใช้งานซ้ำ
- specialist เข้า active scope โดยไม่ได้รับมอบหมาย
- merge/deploy request ไม่มี valid PO approval

### Warning

- shared module หรือ contract ทับซ้อน
- main ขยับหลัง session เริ่ม
- PR มีไฟล์นอก declared scope
- GitHub sync เกิน freshness threshold

Override ต้องบันทึกเหตุผล ความเสี่ยง scope ผู้อนุมัติ และเวลาหมดอายุ

## 8. Audit Rules

ทุก mutation สำคัญต้องสร้าง Activity Event และ Audit Record โดยมี:

- actor และ actor type
- action และ target
- timestamp
- outcome
- before/after หรือ normalized change set
- correlation ID
- source/evidence reference

Approval และ audit record เป็น append-only ในเชิงธุรกิจ

## 9. Credential Rules

- ห้ามเก็บ token/secret เป็น plaintext
- ใช้ GitHub App และ secret manager เมื่อเป็นไปได้
- log และ UI ต้อง redact credential
- ไม่คืน secret value หลังบันทึก
- webhook ต้องตรวจ signature และ replay
- permission ตรวจ server-side ทุกครั้ง

## 10. Phase 1 Prohibition

จนกว่า Foundation Pack และ Slice 1 Acceptance Criteria จะได้รับอนุมัติและ merge:

- ห้ามเขียน application code
- ห้ามสร้าง merge/deploy automation
- ห้ามเพิ่ม autonomous behavior
