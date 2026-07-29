# ADR 0003: Implementation Technology Stack

- Status: Accepted
- Date: 2026-07-29
- Accepted: 2026-07-29 via Pull Request #2 — approval record อยู่ในคอมเมนต์ของ Pull Request นั้น
- Prerequisite for: Slice 1 implementation ตาม `AGENTS.md` §10 ข้อ 1

## Context

`docs/adr/0001-modular-monolith.md` กำหนดให้เริ่มเป็น Modular Monolith บน PostgreSQL โดยแต่ละ domain module ต้องมี public application boundary และห้ามเข้าถึง persistence internals ของ module อื่น

`docs/SYSTEM_ARCHITECTURE.md` §8 กำหนดให้ business mutation, activity event, audit record และ outbox event commit ใน transaction เดียวกัน

`docs/DATABASE_SCHEMA.md` ต้องการความสามารถระดับ database ที่เฉพาะเจาะจง:

- composite foreign key ที่รวม `organization_id` ตาม Tenant Integrity Rule
- partial unique index สำหรับ active lane, branch และ worktree
- JSONB สำหรับ normalized external payload
- transactional outbox

`docs/SLICE_01_ACCEPTANCE_CRITERIA.md` ต้องการ domain tests, integration tests ที่ mock GitHub แบบ deterministic และ UI E2E รวมถึง responsive viewport

การเลือก stack จึงถูกจำกัดด้วยสามเรื่อง: ความสามารถในการเขียน schema ตามที่ออกแบบไว้จริง, การควบคุม transaction boundary ได้ชัดเจน และการมี GitHub SDK ที่เชื่อถือได้

## Decision

ใช้ TypeScript ตลอดทั้ง stack

| ส่วน | เลือก |
|---|---|
| Language | TypeScript ใน strict mode |
| Runtime | Node.js LTS |
| API framework | NestJS บน Fastify adapter |
| Database | PostgreSQL |
| Database access | Drizzle ORM พร้อม drizzle-kit สำหรับ migration |
| Schema validation | Zod เป็น shared contract ระหว่าง API และ UI |
| GitHub client | Octokit พร้อม GitHub App authentication strategy |
| UI | React + Vite |
| Unit / integration test | Vitest |
| E2E test | Playwright |
| Background worker | process แยกจาก codebase เดียวกัน |

### เหตุผลของแต่ละตัวเลือกที่ไม่ชัดในตัวเอง

**TypeScript ทั้ง stack** — domain type, API contract และ UI prop ใช้ definition ชุดเดียวกันได้ ลดโอกาสที่ UI ส่งค่าที่ไม่ตรงกับ domain ซึ่งเป็นความเสี่ยงที่ AC-06 พยายามป้องกันโดยตรง

**NestJS** — module system ของ NestJS บังคับ boundary ระหว่าง module ผ่าน explicit import/export ตรงกับข้อกำหนดใน ADR 0001 ที่ห้าม module หนึ่งเข้าถึง internals ของอีก module หนึ่ง การใช้ framework ที่ไม่มี module boundary จะทำให้กฎนี้เป็นเพียง convention ที่ไม่มีอะไรบังคับ

**Fastify adapter แทน Express** — เร็วกว่าและมี schema-based validation ที่เข้ากับ Zod ได้ตรงกว่า

**Drizzle ORM แทน Prisma** — Prisma ยังมีข้อจำกัดในการประกาศ composite foreign key และ partial unique index ซึ่งเป็นสิ่งที่ Tenant Integrity Rule และ active lane constraint ต้องการโดยตรง Drizzle เขียน schema เป็น TypeScript ที่ map ลง SQL ตรงตัว ควบคุม transaction ได้ชัดเจน และแทรก raw SQL ได้เมื่อจำเป็น การเลือก ORM ที่ประกาศ constraint ตามออกแบบไม่ได้ จะผลักให้ไปพึ่ง application check ซึ่ง AC-29 ห้ามไว้

**Zod** — ใช้ definition เดียวสร้างทั้ง runtime validation ที่ API boundary และ TypeScript type รองรับ AC-30 ที่ต้องการ contract validation พร้อม stable error codes

**Octokit** — เป็น SDK ที่ GitHub maintain เอง รองรับ GitHub App installation token, rate limit handling และ webhook signature verification ที่ Slice 4 จะต้องใช้

**Playwright** — รองรับ viewport emulation ที่ AC-33 ต้องการ และ trace/screenshot ที่ใช้เป็น evidence ตาม AC-37

### Primary key

ใช้ UUID v7 ปิดข้อค้างใน `docs/DATABASE_SCHEMA.md` §1

UUID v7 เรียงตามเวลาจึงไม่ทำให้ index กระจายแบบ UUID v4 และเป็นชนิด `uuid` ของ PostgreSQL โดยตรง external GitHub IDs ยังเก็บแยกและมี unique constraint ตามเดิม

## Alternatives considered

| ตัวเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| Python + FastAPI | domain logic เขียนได้ดี แต่ต้องดูแลสองภาษาระหว่าง API กับ UI และ GitHub SDK ฝั่ง Python ไม่ได้ maintained โดย GitHub เอง |
| Go | deploy ง่ายและ concurrency ดีสำหรับ reconciliation ใน Slice 4 แต่ boilerplate สำหรับ CRUD, validation และ audit ที่กระจายทุก slice สูงเกินความจำเป็นในระยะนี้ |
| Kotlin + Spring Boot | transaction และ policy enforcement แข็งแรงที่สุด แต่หนักและ startup ช้าเกินสำหรับขนาดทีมปัจจุบัน |

## Consequences

### Positive

- type เดียวกันตั้งแต่ database schema ถึง UI prop
- module boundary มีสิ่งบังคับจริง ไม่ใช่ convention
- schema ที่ออกแบบไว้เขียนได้ครบโดยไม่ต้องลดข้อกำหนด constraint
- GitHub integration ใช้ SDK ที่เจ้าของ platform ดูแล

### Negative

- Node.js เป็น single-threaded ต่อ process งานที่ใช้ CPU หนักต้องแยกไป worker
- Drizzle ยังใหม่กว่า Prisma ecosystem และเครื่องมือรอบข้างน้อยกว่า
- NestJS มี learning curve จาก decorator และ dependency injection
- TypeScript ไม่มี runtime type safety จึงต้องพึ่ง Zod ที่ boundary อย่างเคร่งครัด ไม่ใช่เชื่อ type ที่ compile ผ่าน

## Revisit triggers

- Drizzle ไม่รองรับความสามารถ database ที่ slice ถัดไปต้องการ
- workload ที่ใช้ CPU สูงจน worker แบบ Node ไม่พอ
- ทีมเปลี่ยนองค์ประกอบจนภาษาเดียวไม่ใช่ข้อได้เปรียบอีกต่อไป

การเปลี่ยน stack หลังเริ่ม implementation ต้องมี ADR ใหม่และคำอนุมัติจาก Product Owner
