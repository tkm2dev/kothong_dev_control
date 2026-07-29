# ADR 0005: Secret Management Approach

- Status: Accepted
- Date: 2026-07-29
- Accepted: 2026-07-29 via Pull Request #2 — approval record อยู่ในคอมเมนต์ของ Pull Request นั้น
- Prerequisite for: Slice 1 implementation ตาม `AGENTS.md` §10 ข้อ 3

## Context

`docs/PRODUCT_AND_BUSINESS_RULES.md` §9 ห้ามเก็บ token หรือ secret เป็น plaintext และห้ามคืน secret value หลังบันทึก

`docs/SLICE_01_ACCEPTANCE_CRITERIA.md` AC-20 กำหนดให้ Slice 1 จัดการ credential แน่นอน เพราะมี GitHub App installation อยู่ใน scope และ AC-19 กับ AC-34 กำหนดว่า secret ต้องไม่ปรากฏใน log, activity, audit, API response หรือ rendered UI

`docs/DATABASE_SCHEMA.md` §9 กำหนดว่า secret ต้องใช้ external reference หรือ encrypted column ที่แยกจาก general query

`docs/SYSTEM_ARCHITECTURE.md` §10 ระบุว่า Foundation Pack ยังไม่กำหนด cloud vendor ข้อจำกัดนี้ทำให้ยังเลือก managed secret manager ของ vendor รายใดรายหนึ่งไม่ได้ โดยไม่ตัดสินใจเรื่อง deployment ไปพร้อมกัน

## Decision

ใช้ envelope encryption โดยเก็บ ciphertext ใน PostgreSQL และ wrap data key ด้วย KMS ภายนอก

### โครงสร้าง

1. แต่ละ secret ถูกเข้ารหัสด้วย data key ที่สุ่มเฉพาะรายการนั้น ด้วย AES-256-GCM
2. data key ถูก wrap ด้วย key encryption key ที่อยู่ใน KMS และ **ไม่เคยออกจาก KMS ในรูป plaintext**
3. เก็บ ciphertext, wrapped data key, nonce, auth tag, key version และ algorithm identifier
4. เก็บในตารางเฉพาะที่แยกจาก business table และ query ทั่วไปไม่แตะ
5. `secret_reference` ในตาราง business ชี้ไปยัง record นั้น ไม่เก็บค่า secret เอง

### KMS adapter

KMS ถูกซ่อนหลัง adapter interface ที่มีเพียง `wrap` และ `unwrap`

- production ใช้ KMS ของ provider ที่เลือกภายหลัง การเปลี่ยน provider กระทบเฉพาะ adapter ไม่กระทบ schema
- local development ใช้ dev KMS แบบไฟล์ที่ **ต้อง fail ตอน startup หากตรวจพบว่ากำลังรันใน production configuration** ไม่ใช่เพียงเตือน

การซ่อน KMS หลัง adapter คือเหตุผลหลักที่เลือกแนวทางนี้ — ทำให้เลื่อนการเลือก cloud vendor ออกไปได้ตามที่ Foundation Pack ตั้งใจ โดยไม่ต้องออกแบบ schema ใหม่ภายหลัง

### secret ที่อยู่ในขอบเขต Slice 1

| Secret | การจัดการ |
|---|---|
| GitHub App private key | envelope encrypted หนึ่งรายการต่อ app |
| GitHub OAuth client secret | envelope encrypted |
| Session signing key | envelope encrypted พร้อมรองรับ rotation |
| GitHub installation access token | **ไม่ persist** — เป็น token อายุสั้น ให้ cache ในหน่วยความจำของ process และขอใหม่เมื่อหมดอายุ |

การไม่ persist installation token คือการลดพื้นที่ความเสียหายโดยตรง ถ้า database รั่ว token ที่ใช้เข้าถึง repository ได้ทันทีจะไม่อยู่ในนั้น

### ข้อบังคับการใช้งาน

- ไม่มี API endpoint ใดคืน secret value ไม่ว่ากรณีใด รวมถึงทันทีหลังบันทึกสำเร็จ
- decrypt ได้เฉพาะใน service layer ที่ต้องใช้จริง ห้าม decrypt เพื่อแสดงผล
- ค่าที่ decrypt แล้วห้ามเข้า log, activity event, audit record, outbox payload หรือ error message
- redaction ต้องทำก่อน persist ไม่ใช่กรองตอนแสดงผล
- ต้องมี test ที่ใส่ sentinel secret แล้ว assert ว่าไม่ปรากฏในทุก sink ตาม AC-34

### Rotation

- key version ถูกเก็บกับทุก record เพื่อให้ re-wrap ทีละรายการได้โดยไม่ต้องหยุดระบบ
- rotation ของ GitHub App private key และ OAuth client secret เป็น operational procedure ที่ต้องบันทึกใน runbook ตาม AC-36
- ระบบต้อง decrypt record ที่ใช้ key version เก่าได้ระหว่าง rotation ยังไม่เสร็จ

## Alternatives considered

| ตัวเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| Managed secret manager ของ cloud vendor | ได้ rotation และ audit สำเร็จรูป แต่บังคับให้เลือก cloud vendor ตั้งแต่ Slice 1 ซึ่ง Foundation Pack ตั้งใจเลื่อนออกไป และผูก schema กับ vendor นั้น |
| Vault หรือ Infisical แบบ self-hosted | ควบคุมได้เต็ม แต่เพิ่ม component ที่ต้อง operate, backup และ unseal ตั้งแต่ Slice 1 ซึ่งเป็นภาระที่มากกว่าประโยชน์ในขั้นนี้ |
| pgcrypto พร้อม key ใน environment variable | ง่ายที่สุด แต่ key อยู่ในที่เดียวกับ application config ทำให้การรั่วของ config เท่ากับการรั่วของ secret ทั้งหมด และไม่มี key rotation ที่ทำได้จริง |

## Consequences

### Positive

- เลื่อนการเลือก cloud vendor ออกไปได้โดยไม่ต้องออกแบบ schema ใหม่
- ciphertext อยู่ใน backup เดียวกับ database แต่ decrypt ไม่ได้หากไม่มีสิทธิ์ใน KMS
- rotation ทำได้ทีละรายการ
- installation token ที่อันตรายที่สุดไม่อยู่ใน database เลย

### Negative

- ต้องเขียน envelope encryption เอง ซึ่งเป็นโค้ดที่ผิดแล้วเสียหายมาก ต้องมี test ครอบคลุมและ review เป็นพิเศษ
- ไม่ได้ audit log ของการเข้าถึง secret แบบที่ managed secret manager ให้มา ต้องบันทึกการ decrypt เป็น activity event เอง
- dev KMS แบบไฟล์เป็นความเสี่ยงถ้าหลุดไป production จึงต้องมี guard ที่ fail ตอน startup ไม่ใช่แค่เตือน
- การรั่วของสิทธิ์ KMS พร้อมกับ database dump เท่ากับ secret รั่วทั้งหมด

## Revisit triggers

- เลือก cloud vendor แล้ว และ managed secret manager ให้ audit หรือ rotation ที่ดีกว่าอย่างมีนัยสำคัญ
- ต้องการ compliance ที่บังคับให้ใช้ HSM หรือ managed KMS ที่ผ่านการรับรอง
- จำนวน secret มากจนการจัดการ key version ด้วยตนเองไม่คุ้ม

การย้ายไป managed secret manager ต้องมี ADR ใหม่ แผน migration ของ record ที่เข้ารหัสไว้แล้ว และคำอนุมัติจาก Product Owner
