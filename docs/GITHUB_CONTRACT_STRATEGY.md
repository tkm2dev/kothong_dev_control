# GitHub Contract Strategy

เอกสารนี้กำหนดวิธีรักษาความตรงกันระหว่างสิ่งที่ระบบคาดหวังจาก GitHub API กับสิ่งที่ GitHub ส่งมาจริง `AC-32` อ้างอิงเอกสารนี้

## ปัญหาที่ต้องแก้

`AC-32` บังคับให้ mock GitHub แบบ deterministic ใน automated test ซึ่งจำเป็นเพื่อให้ test เสถียร แต่สร้างความเสี่ยงที่ตรงข้ามกัน — **test ทั้งชุดผ่านได้ในขณะที่ระบบพังกับ GitHub จริง** เพราะ mock สะท้อนความเข้าใจของผู้เขียน ไม่ใช่พฤติกรรมของ GitHub

GitHub เป็น external system ที่เปลี่ยนได้โดยไม่แจ้ง และ `docs/SYSTEM_ARCHITECTURE.md` §4 ระบุว่า GitHub API response เป็น external source ที่ต้อง normalize และ audit

## แนวทาง

ใช้สามชั้นร่วมกัน ไม่มีชั้นใดชั้นเดียวเพียงพอ

### ชั้นที่ 1 — Schema validation ตอน runtime

ทุก response จาก GitHub ต้องผ่าน Zod schema ก่อนถูกใช้ ไม่ว่าจะเป็น production หรือ test

- schema ครอบคลุมเฉพาะ field ที่ระบบใช้จริง ไม่ validate ทั้ง payload เพื่อไม่ให้พังเมื่อ GitHub เพิ่ม field ใหม่
- field ที่ระบบใช้ต้องประกาศเป็น required หากขาดหายให้ถือว่า contract ผิด
- response ที่ไม่ผ่าน schema ต้องคืน `GITHUB_CONTRACT_MISMATCH` และบันทึก audit record **ห้าม fallback ไปใช้ค่าที่เดาเอาเอง**

ชั้นนี้ทำให้ contract drift ปรากฏเป็น error ที่ตรวจจับได้ แทนที่จะกลายเป็นข้อมูลผิดที่ถูกบันทึกลง database เงียบๆ

### ชั้นที่ 2 — Recorded fixtures

mock ใน automated test ต้องสร้างจาก response จริงของ GitHub ไม่ใช่เขียนขึ้นเอง

- เก็บ fixture เป็นไฟล์ใน repository พร้อมบันทึกวันที่บันทึกและ endpoint ที่เรียก
- fixture ต้องถูก redact ก่อน commit — ห้ามมี token, installation ID จริงที่ใช้งานอยู่ หรือข้อมูลส่วนบุคคล
- fixture ต้องผ่าน schema เดียวกับชั้นที่ 1 หาก fixture ไม่ผ่าน schema แปลว่า schema หรือ fixture ผิด อย่างใดอย่างหนึ่ง
- ครอบคลุมอย่างน้อย: repository ที่เข้าถึงได้, repository ที่เป็น private, installation ที่มีหลาย repository, not found, access denied, suspended installation และ rate limit response

### ชั้นที่ 3 — Contract verification ที่รันแยกจาก test ปกติ

test ชุดหนึ่งที่เรียก GitHub จริงด้วย credential ของ development เพื่อยืนยันว่า fixture ยังตรงกับความจริง

- **ไม่รันใน test suite ปกติ** เพราะต้องใช้เครือข่ายและ credential จริง จึงไม่ deterministic
- รันด้วยคำสั่งแยกที่ระบุใน `docs/LOCAL_SETUP.md`
- หน้าที่คือ re-capture response แล้ว diff กับ fixture ที่เก็บไว้ ความต่างที่กระทบ field ที่ระบบใช้ถือเป็น P0
- ต้องรันอย่างน้อยหนึ่งครั้งก่อนส่ง `READY FOR FINAL REVIEW` และรายงานผลจริงใน evidence ตาม AC-37

## สิ่งที่ยังไม่ทำใน Slice 1

- ไม่ทำ automated scheduled contract verification เพราะยังไม่มี CI
- ไม่ทำ consumer-driven contract testing แบบเต็มรูปแบบ เนื่องจากเราเป็นผู้บริโภคฝ่ายเดียวและไม่มีอิทธิพลต่อ provider

เมื่อมี CI แล้ว ควรย้ายชั้นที่ 3 ไปรันตามกำหนดเวลาและแจ้งเตือนเมื่อ diff ปรากฏ — บันทึกเป็น backlog

## ข้อจำกัดที่ต้องระบุใน evidence

Implementation Owner ต้องระบุใน `READY FOR FINAL REVIEW` ว่า:

- fixture ชุดใดถูกบันทึกเมื่อใด
- ชั้นที่ 3 ถูกรันเมื่อใดและผลเป็นอย่างไร
- endpoint ใดที่ยังไม่มี fixture จากของจริงและใช้ข้อมูลที่เขียนขึ้นเอง

การไม่ระบุข้อสุดท้ายทำให้ evidence ทั้งชุดตีความผิดได้ว่าทุก mock มาจากของจริง
