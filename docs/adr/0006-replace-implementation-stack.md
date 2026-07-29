# ADR 0006: เปลี่ยน Implementation Stack เป็น Vue + Express + Prisma + MySQL

- Status: Accepted
- Date: 2026-07-29
- Supersedes: `docs/adr/0003-technology-stack.md`
- Accepted: 2026-07-29 โดย Product Owner — บันทึกคำอนุมัติอยู่ในคอมเมนต์ของ Pull Request ที่ ADR ฉบับนี้เข้ามา

## Context

`docs/adr/0003-technology-stack.md` §"Revisit triggers" เขียนไว้ว่า การเปลี่ยน stack หลังเริ่ม implementation ต้องมี ADR ใหม่และคำอนุมัติจาก Product Owner ADR นี้คือ ADR ใหม่นั้น

Product Owner กำหนด stack ของ DEV Control ใหม่ทั้งชุด และกำหนด GitHub Policy ที่ห้ามมี CI/CD บน GitHub โดยสิ้นเชิง ข้อกำหนดที่ได้รับมีดังนี้

| ส่วน | ที่กำหนดใหม่ |
|---|---|
| Frontend | Vue 3 + TypeScript + Vite + Pinia |
| Backend | Node.js + Express + TypeScript |
| Database access | Prisma |
| Database | MySQL |
| Deployment | commit → push → SSH VPS → git pull → pm2 reload เท่านั้น |
| GitHub | source control อย่างเดียว ห้ามมี Actions, CI, CD, workflow yaml |

ตอนที่ได้รับข้อกำหนดนี้ Pull Request #14 ได้ implement Slice 1 ไปแล้ว 16 commits บน stack เดิม คือ NestJS บน Fastify, Drizzle ORM, PostgreSQL และ React ทั้ง `main` ยังมี `.github/workflows/` สองไฟล์ที่ merge ไปแล้วและถูกตั้งเป็น required status check บน branch protection

Pull Request #14 ถูก Product Owner สั่ง PAUSE ไว้ที่ head `f42d3a4691914c9d7870dfc6467b1cfe21b2ea96` และยังเป็น Draft งานบน stack เดิมจึงไม่ได้ถูกลบทิ้ง แต่ถูกหยุดไว้ให้ยังอ่านย้อนได้ ADR ฉบับนี้และงาน implementation ตาม stack ใหม่อยู่บน branch แยกที่แตกจาก `main` โดยตรง ไม่ได้ต่อจาก PR #14 เพราะ diff ที่ลบทุกอย่างแล้วเขียนใหม่ในที่เดียวกันจะ review ไม่ได้จริง

## Decision

รับ stack ใหม่ทั้งชุดตามที่ Product Owner กำหนด และ implement Slice 1 ใหม่บน stack นั้น

ADR 0003 ถูก supersede ทั้งฉบับ ไม่ใช่เฉพาะบางแถวในตาราง เพราะเหตุผลของ ADR 0003 อ้างอิงกันเป็นชุด — เลือก Fastify เพราะเข้ากับ Zod, เลือก Drizzle เพราะ PostgreSQL constraint, เลือก NestJS เพราะ module boundary การเก็บบางส่วนไว้จะได้เอกสารที่ให้เหตุผลของทางเลือกที่ไม่ได้ใช้แล้ว

ADR 0001 (Modular Monolith), ADR 0002 (Human Approval Boundary), ADR 0004 (Authentication Provider) และ ADR 0005 (Secret Management) ยังมีผลบังคับตามเดิม ADR เหล่านั้นตัดสินเรื่องขอบเขตและกฎ ไม่ได้ตัดสินเรื่องเครื่องมือ

### สิ่งที่ ADR 0001 บังคับต่อ และวิธีทำให้ยังจริงบน Express

ADR 0001 ห้าม module หนึ่งเข้าถึง persistence internals ของอีก module หนึ่ง NestJS บังคับข้อนี้ด้วย module system ของตัวเอง Express ไม่มีอะไรแบบนั้น

จึงบังคับด้วย layered architecture ที่ dependency ชี้ทางเดียว

```
interfaces/http   →  application  →  domain
infrastructure    →  application  →  domain
```

- `domain/` ไม่ import อะไรจากชั้นอื่นและไม่ import framework ใด ๆ
- `application/` ประกาศ port เป็น interface และเรียกผ่าน port เท่านั้น ไม่รู้จัก Prisma และไม่รู้จัก Express
- `infrastructure/` implement port ด้วย Prisma และ Octokit
- `interfaces/http/` แปลง request เป็น input ของ use case และแปลงผลลัพธ์เป็น response ไม่มี business rule

ข้อนี้เป็น convention ที่ไม่มี compiler บังคับ ต่างจาก NestJS ที่ fail ตอน build จึงต้องตรวจใน review เป็นข้อประจำ นี่คือราคาที่จ่ายจริงของการเปลี่ยนมา Express และบันทึกไว้ตรงนี้เพื่อไม่ให้ลืมว่ามันเป็นราคา ไม่ใช่ของฟรี

### ผลกระทบต่อ schema จาก PostgreSQL → MySQL

`docs/DATABASE_SCHEMA.md` พึ่งความสามารถของ PostgreSQL อยู่สี่อย่าง ต้องแปลงทุกอย่างและบางอย่างไม่ได้แปลงตรงตัว

**composite foreign key ที่รวม `organization_id`** — Tenant Integrity Rule ยังทำได้ครบ Prisma ประกาศ relation ที่อ้างหลาย column ได้ผ่าน `references: [id, organizationId]` คู่กับ `@@unique([id, organizationId])` บนฝั่ง parent และ MySQL/InnoDB บังคับ composite foreign key ได้จริง กฎนี้จึงไม่ถูกลดระดับลงเป็น application check

**partial unique index** — MySQL ไม่มี ใช้ไม่ได้เลย ไม่ใช่แค่ syntax ต่าง สำหรับ active lane, branch และ worktree ที่ Slice 3 ต้องใช้ จะใช้ generated column ที่มีค่าเมื่อ row ยัง active และเป็น `NULL` เมื่อไม่ active แล้วตั้ง unique index บน column นั้น เพราะ unique index ของ MySQL ยอมให้มี `NULL` ซ้ำได้หลายแถว ผลลัพธ์เท่ากับ partial unique index แต่ต้องเขียน column เพิ่มและอธิบายไว้ในที่ที่เห็น มิฉะนั้นจะดูเหมือน column ที่ไม่มีใครใช้

**JSONB** — MySQL มีชนิด `JSON` ที่เก็บแบบ binary เหมือนกัน แต่ index ไม่ได้โดยตรง ถ้าต้อง query ตาม field ภายใน ต้องสร้าง generated column แล้ว index column นั้น ตอนนี้ยังไม่มี query แบบนั้น จึงยังไม่สร้าง

**UUID v7 เป็นชนิด `uuid`** — MySQL ไม่มีชนิด `uuid` เก็บเป็น `CHAR(36)` เหตุผลที่ไม่เลือก `BINARY(16)` ซึ่งกินที่น้อยกว่า คือทุกครั้งที่อ่าน row ด้วยเครื่องมือภายนอกจะเห็นเป็น binary อ่านไม่ออก และงานที่ทำบ่อยที่สุดตอนนี้คือการไล่ audit trail ด้วยมือ ค่า index ที่เสียไปยังเล็กกว่าราคาของการอ่าน audit ไม่ออก UUID v7 ยังเรียงตามเวลาอยู่ ดังนั้น keyset pagination บน `id` ยังใช้ได้เหมือนเดิม

**CHECK constraint** — MySQL 8.0.16 ขึ้นไปบังคับ `CHECK` ได้จริง จึงกำหนดขั้นต่ำที่ MySQL 8.0.16 เวอร์ชันก่อนหน้า parse `CHECK` แล้วเงียบ ๆ ไม่บังคับ ซึ่งอันตรายกว่าไม่รองรับเลย

### ผลกระทบต่อการตรวจสอบ เมื่อไม่มี CI

GitHub Policy ห้าม CI ทั้งหมด `.github/workflows/` จึงถูกลบใน Pull Request นี้

การลบไฟล์อย่างเดียวยังไม่พอ **required status checks บน branch protection ต้องถูกถอดออกด้วย** มิฉะนั้น Pull Request ทุกอันจะรอ `Governance checks`, `Typecheck, lint, test` และ `End-to-end` ที่ไม่มีวันรัน แล้ว merge ไม่ได้ตลอดไป Product Owner รับไปดำเนินการเองสองคำสั่ง คือถอด required status checks และปิด GitHub Actions ทั้ง repository

การป้องกันที่เหลือหลังจากนั้นและต้องคงไว้ คือห้าม push ตรงเข้า `main` ห้าม force push ห้ามลบ branch บังคับผ่าน Pull Request และมีผลกับเจ้าของ repository ด้วย

สิ่งที่หายไปพร้อมกับ CI คือหลักฐานว่า typecheck, lint, test และ governance check ผ่านจริงบนเครื่องที่ไม่ใช่เครื่องของคนเขียน ต่อจากนี้หลักฐานเหลือเพียงคำบอกเล่าของผู้ implement

จึงกำหนดเป็นข้อบังคับว่า ทุก Pull Request ต้องแนบ output จริงของ

```
pnpm typecheck && pnpm lint && pnpm test
```

โดยติดมาทั้งบรรทัดสรุป ไม่ใช่คำว่า "ผ่านแล้ว" การอ้างว่า test ผ่านโดยไม่มี output ถือว่าไม่ผ่าน

## Alternatives considered

| ตัวเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| เก็บ stack เดิมไว้ แล้วรับเฉพาะกฎ process | Product Owner กำหนด stack โดยตรง ไม่ใช่ให้เลือก |
| ย้ายทีละส่วน เช่น เปลี่ยน UI ก่อนแล้วค่อยเปลี่ยน backend | ระหว่างทางจะมีสอง stack อยู่พร้อมกันใน repo เดียว ทั้งสองไม่สมบูรณ์ และไม่มี CI คอยจับว่าอันไหนพัง |
| เก็บ PostgreSQL ไว้ ใช้ Prisma + Vue + Express | ขัดข้อกำหนดที่ระบุ MySQL ชัดเจน |

## Consequences

### Positive

- stack ตรงกับที่ Product Owner ดูแลอยู่จริงบน VPS
- Prisma มี migration workflow และ schema เดียวที่อ่านออกทั้งไฟล์
- Pinia ทำให้ state ฝั่ง UI มีที่อยู่ที่เดียว
- deployment เรียบง่ายและย้อนกลับได้ด้วย `git checkout` commit ก่อนหน้าแล้ว `pm2 reload`

### Negative

- งาน implementation ของ Slice 1 บน stack เดิมถูกทิ้งทั้งหมด
- layered boundary ไม่มีอะไรบังคับตอน build ต้องอาศัย review
- partial unique index ต้องเขียนเป็น generated column ซึ่งอ่านแล้วไม่ตรงไปตรงมา
- ไม่มี CI แปลว่าไม่มีการตรวจอัตโนมัติก่อน merge เลย ความเสี่ยงนี้ไม่ได้ถูกกำจัด เพียงถูกย้ายไปอยู่กับคน
- `docs/DATABASE_SCHEMA.md`, `docs/SYSTEM_ARCHITECTURE.md` และ `docs/GITHUB_CONTRACT_STRATEGY.md` อ้าง PostgreSQL, Drizzle และ CI อยู่ ต้องแก้ตามและยังไม่ได้แก้ ณ เวลาที่เขียน ADR นี้

## Revisit triggers

- MySQL ไม่รองรับ constraint ที่ slice ถัดไปต้องการ จนต้องย้ายกฎขึ้นไปอยู่ที่ application
- จำนวนความผิดพลาดที่หลุดถึง `main` เพิ่มขึ้นจนเห็นได้ ซึ่งจะเป็นหลักฐานว่าการไม่มี CI มีราคาที่วัดได้
