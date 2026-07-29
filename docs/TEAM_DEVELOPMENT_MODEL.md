# Team Development Model

## 1. Purpose

เอกสารนี้กำหนดวิธีทำงานร่วมกันของ Product Owner และ AI หลายตัวใน KOTHONG DEV CONTROL โดยเน้น ownership ที่ชัดเจน ป้องกันงานชนกัน และเก็บหลักฐานการตัดสินใจทุกขั้นตอน

## 2. Core Principles

- GitHub เป็น source of truth
- Human-in-the-loop เป็นค่าเริ่มต้น
- Product Owner เป็นผู้อนุมัติ Merge และ Deploy แต่เพียงผู้เดียว
- หนึ่ง Active Implementation Owner ต่อหนึ่ง Slice
- หนึ่ง Pull Request มีเจ้าของหนึ่งราย
- Branch-first และ Worktree-first
- งานขนานต้องแยก scope ได้จริง
- ทุก handoff ต้องมีหลักฐานที่ตรวจสอบย้อนกลับได้

## 3. Responsibility Matrix

| Activity | Product Owner | GPT | Claude AI | Claude Code | Codex |
|---|---|---|---|---|---|
| Prioritize roadmap | Approve | Propose | Advise | Consult | Consult |
| System architecture | Approve | Own | Review | Consult | Specialist review |
| UX and business rules | Approve | Own | Review | Consult | Consult |
| Slice implementation | Monitor | Define/Review | Consult | Own | Specialist only |
| Final review | Decide merge readiness | Own | Optional review | Respond/fix | Specialist evidence |
| Merge approval | Own | No authority | No authority | No authority | No authority |
| Deploy approval | Own | No authority | No authority | No authority | No authority |

## 4. Work Hierarchy

`Project → Epic → Feature → Vertical Slice → Task`

Vertical Slice คือหน่วย implementation หลัก ต้องส่งมอบ behavior end-to-end พร้อม API, domain logic, UI, tests, E2E, docs และ PR ตาม scope ที่กำหนด

งาน specialist ทำขนานได้เมื่อแยกจาก Active Slice อย่างชัดเจนและไม่มี write scope ทับซ้อน

## 5. Active Lane Model

Active Lane คือสิทธิ์ครอบครอง implementation scope ชั่วคราว ต้องระบุ:

- Project และ Slice
- Implementation Owner
- AI/session identity
- Branch
- Worktree identifier
- Base commit SHA
- Declared file/domain/resource scope
- Start time และ status

หนึ่ง Slice มี Active Lane ที่อยู่ในสถานะ active ได้หนึ่งรายการเท่านั้น

## 6. Session Lifecycle

1. `PROPOSED` — เสนอ session และ scope
2. `RESERVED` — จอง lane แล้วแต่ยังไม่เริ่มแก้ไข
3. `ACTIVE` — กำลังพัฒนา
4. `SELF_REVIEW` — implementation owner ตรวจงานตนเอง
5. `READY_FOR_FINAL_REVIEW` — ส่ง GPT ตรวจครั้งสุดท้าย
6. `CHANGES_REQUIRED` หรือ `READY_FOR_PO`
7. `CLOSED` — lane ถูก release หลัง merge/cancel

Session ต้องไม่ claim role หรือ permission จาก client payload โดยไม่มี server-side verification

## 7. Branch and Worktree Rules

- เริ่มจาก `origin/main` ล่าสุด
- ใช้ branch ชื่อสื่อถึง slice เช่น `claude/slice-01-project-registry`
- แต่ละ session ใช้ worktree แยก
- ห้าม rebase และ force-push
- หาก `main` ขยับ ให้ merge `origin/main` เข้า feature branch
- ห้ามใช้ branch เดียวกันร่วมกันหลาย implementation owners
- ห้าม commit ตรงเข้า `main` หลัง initial bootstrap ที่บันทึกใน `docs/BOOTSTRAP_RECORD.md`

## 8. Scope Declaration and Conflict Handling

ก่อนเริ่มแก้ไข Implementation Owner ต้องประกาศอย่างน้อย:

- repository paths
- domain modules
- API routes
- database tables/migrations
- shared contracts
- infrastructure resources

Blocking conflict ได้แก่ slice เดียวกันมี owner หลายราย, write path ทับซ้อน, migration/schema object เดียวกัน, branch/worktree ซ้ำ หรือ specialist เข้า active scope โดยไม่ได้รับมอบหมาย

Warning conflict ได้แก่ shared module, shared types, main ขยับ, PR มีไฟล์นอก scope หรือ GitHub snapshot เก่า

Product Owner เท่านั้นที่ override conflict ได้ และต้องบันทึกเหตุผล ขอบเขต ระยะเวลา และความเสี่ยง

## 9. Review Model

Implementation Owner ต้องส่งหลักฐาน:

- commit SHA
- diff summary
- test commands และผลจริง
- E2E/screenshots เมื่อเกี่ยวข้อง
- migration summary
- security self-review
- known limitations
- files outside declared scope

GPT ทำ Final Review หนึ่งครั้งต่อ revision ที่ส่ง `READY FOR FINAL REVIEW`

- P0 ขวาง Merge
- P1/P2 บันทึก backlog และไม่ขยาย Active Slice

repository นี้ไม่มี CI ตาม GitHub Policy ของ Product Owner หลักฐานการทดสอบมาจาก output จริงที่แนบใน Pull Request เท่านั้น ห้ามอ้างว่าผ่านโดยไม่มี output

## 10. Approval and Delivery

Merge Approval ต้องผูกกับ PR และ exact head SHA หาก SHA เปลี่ยน approval หมดผล

Deploy Approval ต้องผูกกับ exact commit SHA บน `main` และ environment

Flow มาตรฐาน:

`Review Passed → PO Merge Approval → Merge → Integrated Test on main → PO Deploy Approval → Backup → Deploy from main → Smoke Test`

AI ไม่มีสิทธิ์สร้าง approval decision ในนาม Product Owner

## 11. Audit Expectations

ทุก action สำคัญต้องมี actor, actor type, timestamp, action, target, outcome, before/after, correlation ID และ external evidence reference

Approval decision และ audit record ต้องเป็น append-only ในเชิงธุรกิจ

## 12. Current Phase Gate

ระหว่าง Foundation Phase ทำได้เฉพาะ governance, architecture, business rules, domain, UX, schema, roadmap และ acceptance criteria

ห้ามเริ่ม application code จนกว่า Foundation Pack และ Slice 1 Acceptance Criteria จะได้รับอนุมัติและ merge เข้า `main`
