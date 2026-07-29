# UX Flows and Visual System

## 1. UX Direction

KOTHONG DEV CONTROL ใช้แนวทาง **Warm Operational Console** ตามภาพอ้างอิงที่ Product Owner ให้ไว้:

- พื้นหลังครีมอุ่น ลดความแข็งของระบบควบคุมงาน
- sidebar น้ำตาลดำหรือ olive-brown เข้ม
- accent สีทองอำพันสำหรับ action หลักและจุดที่ต้องสนใจ
- สีเขียวหม่นสำหรับสถานะปกติ/ผ่าน
- สีแดงอิฐใช้เฉพาะ blocking conflict, failed check หรือ action ที่ทำต่อไม่ได้
- card สีขาวนวล มุมโค้ง เงาบาง และมีพื้นที่หายใจ
- typography ชัด อ่านง่าย ไม่ใช้ข้อมูลหนาแน่นแบบ monitoring dashboard
- interaction เน้นกดเลือกและตัดสินใจ ลดการกรอกข้อความยาว

## 2. Design Tokens

ค่าด้านล่างผ่านการวัด contrast แล้วและเป็น production baseline ทิศทาง Warm Operational Console คงเดิม สิ่งที่เปลี่ยนคือแยก token สำหรับ **พื้น** ออกจาก token สำหรับ **ข้อความและไอคอน** เพราะสีอำพันที่สวยเมื่อใช้เป็นพื้นปุ่ม จะอ่านไม่ออกเมื่อเอาไปเป็นตัวอักษรบนพื้นครีม

```css
:root {
  /* พื้นหลัง */
  --color-bg-canvas: #F5F0E6;
  --color-bg-surface: #FFFDF8;
  --color-bg-sidebar: #292A20;
  --color-bg-sidebar-hover: #3A392B;

  /* ข้อความ */
  --color-text-primary: #2E2B24;
  --color-text-secondary: #736D62;
  --color-text-on-dark: #F8F3E8;

  /* เส้นขอบ */
  --color-border: #DDD5C8;        /* ตกแต่งเท่านั้น ห้ามใช้เป็นขอบเขตเดียวที่สื่อความหมาย */
  --color-border-strong: #9E8863; /* form control, ขอบเขตที่สื่อความหมาย */
  --color-focus: #2E2B24;         /* focus ring */

  /* พื้นสำหรับ action */
  --color-accent: #D79A1E;        /* พื้นปุ่มหลัก ใช้คู่กับ --color-text-primary เท่านั้น */
  --color-accent-hover: #E0A62E;  /* hover สว่างขึ้น ไม่เข้มลง เพื่อให้ข้อความเข้มยังอ่านออก */

  /* ข้อความและไอคอนบนพื้นสว่าง */
  --color-accent-text: #8F6614;
  --color-success-text: #64725C;
  --color-warning-text: #916520;
  --color-danger-text: #A84E3F;
  --color-info-text: #617076;

  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --shadow-card: 0 8px 24px rgba(46, 43, 36, 0.08);
  --space-page: clamp(16px, 3vw, 40px);
}
```

### Contrast ที่วัดได้

| การใช้งาน | คู่สี | อัตราส่วน | เกณฑ์ |
|---|---|---|---|
| ข้อความหลักบน canvas | `text-primary` / `bg-canvas` | 12.43:1 | AA normal ผ่าน |
| ข้อความรองบน canvas | `text-secondary` / `bg-canvas` | 4.52:1 | AA normal ผ่าน |
| ข้อความบน sidebar | `text-on-dark` / `bg-sidebar` | 13.12:1 | AA normal ผ่าน |
| ข้อความบนปุ่มหลัก | `text-primary` / `accent` | 5.74:1 | AA normal ผ่าน |
| ข้อความบนปุ่มหลักตอน hover | `text-primary` / `accent-hover` | 6.50:1 | AA normal ผ่าน |
| ข้อความ/ไอคอน amber บน canvas | `accent-text` / `bg-canvas` | 4.53:1 | AA normal ผ่าน |
| ข้อความ/ไอคอน success บน canvas | `success-text` / `bg-canvas` | 4.51:1 | AA normal ผ่าน |
| ข้อความ/ไอคอน warning บน canvas | `warning-text` / `bg-canvas` | 4.52:1 | AA normal ผ่าน |
| ข้อความ/ไอคอน danger บน canvas | `danger-text` / `bg-canvas` | 4.83:1 | AA normal ผ่าน |
| ข้อความ/ไอคอน info บน canvas | `info-text` / `bg-canvas` | 4.52:1 | AA normal ผ่าน |
| ขอบเขตที่สื่อความหมาย | `border-strong` / `bg-canvas` | 3.00:1 | 1.4.11 ผ่าน |
| focus ring | `focus` / `bg-canvas` | 12.43:1 | 1.4.11 ผ่าน |

ทุกคู่วัดบน `--color-bg-canvas` ซึ่งเป็นพื้นที่สว่างน้อยกว่า `--color-bg-surface` ค่าบน surface จึงสูงกว่านี้ทุกคู่

### กฎการใช้ token สี

1. **ห้ามใช้ `--color-accent` เป็นสีข้อความหรือไอคอนบนพื้นสว่าง** ให้ใช้ `--color-accent-text` — `--color-accent` มี contrast 2.17:1 บน canvas ซึ่งไม่ผ่านแม้เกณฑ์ non-text
2. status indicator ทุกชนิด รวมถึงจุดสีและไอคอน ต้องใช้ token ตระกูล `-text` เพราะผ่านทั้งเกณฑ์ 4.5:1 และ 3:1
3. `--color-border` ใช้ได้เฉพาะเส้นแบ่งเชิงตกแต่ง เมื่อเส้นขอบเป็นสิ่งเดียวที่สื่อขอบเขตของ control ต้องใช้ `--color-border-strong`
4. hover ของปุ่มหลักสว่างขึ้น ไม่เข้มลง เพราะการทำให้เข้มลงจะดัน contrast กับข้อความเข้มให้ต่ำกว่า 4.5:1
5. ค่าใดที่เปลี่ยนภายหลังต้องวัด contrast ใหม่และอัปเดตตารางด้านบนในคอมมิตเดียวกัน

### Status Semantics

- Green: healthy, passed, active without conflict
- Amber: waiting, review required, sync stale, attention
- Red: blocked, rejected, security issue, unresolved P0
- Gray: draft, inactive, unknown, cancelled
- Blue-gray: informational system state

ห้ามใช้สีเพียงอย่างเดียว ต้องมี icon, label และข้อความประกอบเสมอ

## 3. Layout

### Breakpoints

| ชื่อ | ช่วงความกว้าง | viewport ที่ใช้ทดสอบ |
|---|---|---|
| `mobile` | `< 768px` | 375 × 812 |
| `tablet` | `768px – 1119px` | 834 × 1112 |
| `desktop` | `≥ 1120px` | 1440 × 900 |

viewport ที่ระบุคือค่าที่ automated test ต้องใช้จริง ไม่ใช่ค่าตัวอย่าง

### Critical actions ที่ต้องเข้าถึงได้ทุก breakpoint

action ต่อไปนี้ห้ามหายไปหรือถูกซ่อนหลัง interaction ที่มองไม่เห็นในทุกขนาดหน้าจอ

1. เข้าถึง Command Center และรายการที่ต้องตัดสินใจ
2. `Add Project` และการยืนยันการลงทะเบียน
3. `Refresh` metadata ของ project
4. เปิด Project detail และเห็น access status กับ last verified timestamp
5. Approve และ Reject ใน Approval Center
6. เปิด Activity Log และคัดลอก correlation ID
7. Sign out

การย้าย action ไปอยู่ใน overflow menu ทำได้ แต่ต้องเข้าถึงได้ด้วย keyboard และมี accessible name

### Desktop

- Fixed/collapsible sidebar 248–280px
- Header แสดง project context, GitHub sync freshness และ human identity
- Main content กว้างสูงสุดประมาณ 1440px
- Command Center ใช้ card grid 12 columns
- critical decision panel อยู่ด้านบนก่อน analytics

### Tablet

- sidebar ยุบเป็น icon rail หรือ drawer
- card grid ลดเป็น 2 columns
- approval details ใช้ full-width drawer

### Mobile

- navigation เป็น bottom navigation สำหรับเมนูหลัก และ More drawer
- 1 column cards
- sticky bottom action สำหรับ approve/reject เฉพาะเมื่อ context ครบ
- ตารางเปลี่ยนเป็น stacked records

## 4. Navigation

Primary navigation:

1. Command Center
2. Projects
3. Task Board
4. Active Lanes
5. AI Sessions
6. Conflicts
7. GitHub Sync
8. Review Queue
9. Approvals
10. Activity Log

Sidebar แสดง badge เฉพาะรายการที่ต้องตัดสินใจ เช่น blocking conflicts, reviews waiting และ approvals waiting

## 5. Command Center

### Goal

ให้ Product Owner ตอบคำถามภายในไม่กี่วินาที:

- ตอนนี้ active slice คืออะไร
- ใครกำลังทำงาน บน branch/worktree ใด
- มีอะไรชนหรือค้าง
- งานใดต้อง Review/Approve
- GitHub sync สดแค่ไหน

### Layout Priority

1. **Action Required** — blocking conflicts, stale approval, failed checks
2. **Active Work** — slice, owner, branch, base SHA, elapsed time
3. **Review and Approval Queue**
4. **GitHub Health**
5. **Recent Activity**

ไม่ควรเริ่มด้วยกราฟจำนวนมาก ตัวเลขสรุปต้องนำไปสู่ action ได้

## 6. Project Registry Flow

### List

Card/table hybrid แสดง:

- project/repository
- visibility
- default branch
- access status
- sync status
- last verified time

Primary action: `Add Project`

### Add Project

1. เลือก GitHub installation
2. เลือก repository จากรายการที่ server ดึงมา
3. preview metadata และ permission
4. confirm registration
5. result พร้อม activity reference

ลดการพิมพ์ `owner/name` เมื่อสามารถเลือกจาก GitHub installation ได้

## 7. Task Board Flow

Columns:

- Backlog
- Ready
- Active
- Review
- PO Decision
- Done

Slice card แสดง owner, dependency, PR, conflicts และ evidence completeness

การย้ายเข้า Active ต้องผ่าน lane eligibility check ก่อน ไม่ใช้ drag-and-drop แบบเขียนสถานะทันทีโดยไม่ตรวจ policy

## 8. Active Lane Flow

Lane card:

- Slice และ outcome
- Implementation Owner / AI type
- branch และ worktree
- base SHA
- declared scope summary
- session duration
- conflict status

Actions:

- View Scope
- Pause
- Release
- Request Scope Change

Blocking conflict แสดงเป็น top banner พร้อมคู่ conflict และทางเลือก resolve ไม่ซ่อนอยู่ในรายละเอียด

## 9. AI Session Registry Flow

- Register session
- เลือก AI type และ purpose
- เชื่อมกับ lane หรือ specialist task
- เลือก scope claims จาก path/domain/resource selector
- start session
- update status/heartbeat
- close พร้อม outcome และ evidence link

ห้ามให้ AI type selector เปลี่ยน authorization role

## 10. Conflict Flow

Conflict detail แสดงแบบ comparison สองฝั่ง:

- session/owner
- claimed scope
- overlapping paths/resources
- severity และ rule ที่ trigger
- suggested resolution

Actions:

- Change Scope
- Pause One Lane
- Release Lane
- Request PO Override

Override modal ต้องแสดง risk summary และบังคับเหตุผล/expiry

## 11. Review Queue Flow

Queue card แสดง:

- Slice / PR / owner
- exact head SHA แบบย่อพร้อม copy
- evidence completeness
- CI/local test status
- unresolved P0/P1/P2
- waiting time

Review detail แยก tab:

- Summary
- Changed Scope
- Evidence
- Findings
- Activity

สถานะ `READY FOR FINAL REVIEW` ต้องมาจาก explicit handoff ไม่อนุมานจาก PR ที่เปิดอยู่เพียงอย่างเดียว

## 12. Approval Center Flow

Merge และ Deploy แยก section ชัดเจน

Approval detail ต้องแสดงก่อนปุ่มตัดสินใจ:

- exact target SHA
- source branch / main verification
- owner
- review outcome
- unresolved P0
- CI/local evidence และ limitation
- conflicts
- sync freshness
- audit trail

Actions:

- Approve
- Reject
- Request Changes

ปุ่ม Approve ใช้ accent amber ไม่ใช้ green เพื่อสื่อว่าเป็นการตัดสินใจที่มีผล ส่วน green ใช้กับผลลัพธ์ที่ผ่านแล้ว

Confirmation ต้องย้ำ exact SHA และห้ามใช้ generic browser confirm

## 13. Activity Log

- filter chips สำหรับ project, slice, actor, action, outcome และเวลา
- timeline view สำหรับอ่านเร็ว
- detail drawer สำหรับ raw audit metadata
- correlation ID copyable
- secret redaction indicator เมื่อ payload ถูก sanitize

## 14. Accessibility and Interaction Rules

- contrast เป้าหมาย WCAG AA
- keyboard navigation ครบ
- visible focus ring
- touch target อย่างน้อย 44px
- status ไม่พึ่งสีอย่างเดียว
- destructive action ต้องแยกจาก primary action
- loading แสดง scope ของสิ่งที่กำลัง sync
- stale data ต้องแสดง timestamp ที่ชัดเจน
- exact SHA และ external evidence ต้อง copy/open ได้ง่าย

## 15. Empty and Error States

Empty state ต้องบอก next safe action เช่น `Connect GitHub Project` หรือ `Create First Slice`

Error state ต้องแยก:

- permission denied
- repository unavailable
- GitHub rate limited
- stale data
- policy conflict
- validation error

ห้ามแสดง token, raw authorization header หรือ secret ในข้อความ error
