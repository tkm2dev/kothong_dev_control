# Repository Bootstrap Record

## Purpose

บันทึกข้อยกเว้นครั้งเดียวที่เกิดขึ้นระหว่างเริ่ม repository ว่าง เพื่อให้ตรวจสอบย้อนกลับได้และไม่ถูกตีความเป็นแบบอย่างสำหรับ direct commit เข้า `main`

## Initial State

วันที่ตรวจ: 2026-07-29 (Asia/Bangkok)

Repository `tkm2dev/kothong_dev_control` มี metadata ระบุ default branch เป็น `main` แต่ Git repository ยังว่าง ไม่มี commit และไม่มี branch ref จริง จึงยังไม่สามารถสร้าง feature branch จาก `main` หรือเปิด Pull Request เข้าหา `main` ได้

## Bootstrap Action

สร้างไฟล์ `README.md` ขั้นต่ำเป็น initial commit บน default branch เพื่อสร้าง Git history และ branch ref แรก

- Commit SHA: `72e06466e9dc78ecc8d59816ab23a5c0d9746399`
- Commit message: `bootstrap empty repository`
- Content type: repository description and governance warning only
- Application code: none
- CI/deploy configuration: none
- Merge/deploy action: none

หลังจาก bootstrap แล้ว งาน Foundation ทั้งหมดดำเนินการบน branch:

- `agent/foundation-pack`

และส่งผ่าน Draft Pull Request เข้าสู่ `main`

## Governance Interpretation

นี่เป็น technical bootstrap exception เพราะไม่มี base commit/branch สำหรับทำ branch-first workflow ไม่ใช่การอนุญาตให้ commit โค้ด เอกสาร configuration หรือการเปลี่ยนแปลงอื่นใดตรงเข้า `main` ในอนาคต

ตั้งแต่ initial bootstrap commit เป็นต้นไป ให้บังคับกฎ:

- branch-first
- worktree-first สำหรับ implementation
- no direct commit to `main`
- no rebase
- no force-push
- no Merge/Deploy without Product Owner approval

## Follow-up Control

| การตั้งค่าที่เสนอ | สถานะ |
|---|---|
| disable rebase merge | DONE 2026-07-29 |
| protect `main` | ใช้ไม่ได้ — branch protection ไม่มีให้ใช้บน plan/visibility ปัจจุบัน |
| require Pull Request | ใช้ไม่ได้ — เหตุผลเดียวกัน |
| prohibit force-push | ใช้ไม่ได้ — เหตุผลเดียวกัน |
| require status checks เมื่อ CI พร้อม | ใช้ไม่ได้ — ต้องมี branch protection ก่อน |

`GET /branches/main/protection` และ `GET /rulesets` คืน HTTP 403 `"Upgrade to GitHub Pro or make this repository public to enable this feature"` (ตรวจเมื่อ 2026-07-29)

Product Owner ตัดสินใจเมื่อ 2026-07-29 ให้ยอมรับสถานะ convention-only กฎ no-direct-commit, no-force-push และ require-PR จึงมีผลผูกพันในเชิงกระบวนการแต่ **ไม่มี technical enforcement** รายละเอียดและ compensating controls อยู่ใน `docs/ROADMAP.md` หัวข้อ "ข้อจำกัดการบังคับใช้ ณ ปัจจุบัน"
