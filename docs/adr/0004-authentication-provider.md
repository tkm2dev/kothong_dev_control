# ADR 0004: Authentication Provider

- Status: Proposed
- Date: 2026-07-29
- Prerequisite for: Slice 1 implementation ตาม `AGENTS.md` §10 ข้อ 2

## Context

`docs/SYSTEM_ARCHITECTURE.md` §9 กำหนด OIDC/OAuth สำหรับ human authentication และห้ามสร้างระบบ password เอง

`docs/adr/0002-human-approval-boundary.md` กำหนดว่า approval decision ต้องผูกกับ authenticated human identity และ approval endpoint ควรต้องการ recent authentication

`docs/SLICE_01_ACCEPTANCE_CRITERIA.md` AC-02 กำหนดว่า server ต้องไม่เชื่อ role ที่ client ส่งมา และ AC-38 กำหนดข้อบังคับเรื่อง session cookie, session rotation และ logout ที่ทำให้ session ฝั่ง server ใช้ต่อไม่ได้

ผู้ใช้ทุกคนของระบบนี้เป็นผู้ที่ทำงานกับ GitHub อยู่แล้ว และ Slice 1 ต้องใช้ GitHub App installation สำหรับอ่าน repository metadata อยู่แล้วตาม ADR ที่เกี่ยวข้อง

## Decision

ใช้ GitHub เป็น identity provider เดียวในระยะแรก โดยแยกสองกลไกออกจากกันอย่างชัดเจน

| กลไก | ใช้ทำอะไร |
|---|---|
| GitHub OAuth (Authorization Code + PKCE) | ยืนยันตัวตนมนุษย์ สร้าง session ของ KOTHONG DEV CONTROL |
| GitHub App installation | เข้าถึง repository metadata ฝั่ง server |

**GitHub OAuth token ของผู้ใช้ห้ามถูกใช้เป็น credential สำหรับอ่าน repository** การอ่าน repository ต้องผ่าน installation token เสมอ เพื่อให้ access status ที่ระบบแสดงสะท้อนสิทธิ์ของ installation ไม่ใช่สิทธิ์ส่วนตัวของผู้ที่บังเอิญกดปุ่ม

### Session model

- session ฝั่ง server เก็บใน PostgreSQL ไม่ใช้ JWT ที่ revoke ไม่ได้
- session cookie ตั้ง `HttpOnly`, `Secure`, `SameSite=Lax`
- สร้าง session identifier ใหม่หลัง authentication สำเร็จทุกครั้ง
- logout ลบ session record ฝั่ง server ไม่ใช่เพียงลบ cookie
- session มีอายุจำกัดและ absolute timeout ค่าที่ใช้จริงต้องบันทึกใน operational documentation ตาม AC-36

### Identity mapping

- GitHub account map เข้าตาราง `identities` ด้วย `(provider, provider_subject)` โดย `provider_subject` ใช้ GitHub user ID ที่เป็นตัวเลข **ไม่ใช้ login name** เพราะ login name เปลี่ยนได้และนำกลับมาใช้ซ้ำได้
- role ของผู้ใช้มาจาก `role_assignments` ในระบบนี้เท่านั้น **ไม่ derive จาก GitHub organization membership หรือ repository permission** เพราะสิทธิ์บน GitHub ไม่ใช่สิทธิ์ในการอนุมัติ Merge หรือ Deploy
- AI และ service account ต้องไม่ถูกสร้างเป็น user ที่ถือ role Product Owner ตาม `docs/DATABASE_SCHEMA.md` §2

### Recent authentication สำหรับ approval

approval action ที่สำคัญต้องผ่าน re-authentication ผ่าน GitHub OAuth ด้วย `prompt=login` และบันทึกเวลาที่ยืนยันล่าสุดลงใน `approval_decisions.authentication_context_reference`

**ข้อจำกัดที่ยอมรับ:** GitHub OAuth ไม่ส่งสัญญาณกลับมาว่าผู้ใช้ผ่าน MFA ในรอบนั้นจริงหรือไม่ ระบบจึงบังคับได้เพียง recent authentication ไม่ใช่ MFA step-up ที่ตรวจสอบได้ ข้อจำกัดนี้ต้องบันทึกใน operational documentation และเป็นเหตุผลหลักที่อาจต้องทบทวน ADR นี้

## Alternatives considered

| ตัวเลือก | เหตุผลที่ไม่เลือก |
|---|---|
| Hosted IdP เช่น Auth0 หรือ Clerk | ได้ MFA และ step-up ที่ตรวจสอบได้จริง ซึ่งแก้ข้อจำกัดข้างต้นได้ แต่เพิ่ม vendor dependency, ค่าใช้จ่าย และ identity source ที่สองตั้งแต่ Slice 1 ทั้งที่ผู้ใช้ทุกคนมี GitHub account อยู่แล้ว |
| Keycloak self-hosted | ควบคุมได้เต็มและไม่มี vendor lock-in แต่เพิ่ม component ที่ต้อง operate, backup และ patch ตั้งแต่ Slice 1 ซึ่งขัดกับเจตนาให้ Slice 1 เล็กที่สุดที่ยังส่งมอบ outcome ได้ |
| Password ที่ระบบจัดการเอง | ขัดกับ `docs/SYSTEM_ARCHITECTURE.md` §9 โดยตรง |

## Consequences

### Positive

- ไม่ต้องเก็บหรือจัดการ password
- identity กับ repository access มาจาก platform เดียวกัน ลด provider ที่ต้องดูแล
- ผู้ใช้ไม่ต้องสร้าง account ใหม่
- การแยก user token ออกจาก installation token ทำให้ access status ที่แสดงมีความหมายคงที่

### Negative

- **GitHub ล่มแปลว่าล็อกอินไม่ได้เลย** ไม่มีทางเข้าสำรอง ความเสี่ยงนี้ต้องบันทึกใน operational documentation และเชื่อมกับ backlog เรื่อง Product Owner continuity
- บังคับ MFA step-up ที่ตรวจสอบได้ไม่ได้ ทำได้เพียง recent authentication
- ผูกกับ GitHub ในระดับ identity ไม่ใช่แค่ระดับ integration หากภายหลังต้องรองรับผู้ใช้ที่ไม่มี GitHub account จะต้องเพิ่ม provider

## Revisit triggers

- ต้องการ MFA step-up ที่ตรวจสอบได้สำหรับ approval
- ต้องรองรับผู้ใช้ที่ไม่มี GitHub account
- ต้องการ SSO ระดับองค์กรที่ GitHub ไม่รองรับ
- GitHub availability กระทบการอนุมัติจนยอมรับไม่ได้

การย้าย identity provider ต้องมี ADR ใหม่และแผน migration ของ `identities` ที่ไม่ทำให้ audit trail เดิมขาด
