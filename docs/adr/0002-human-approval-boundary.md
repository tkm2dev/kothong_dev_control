# ADR 0002: Human Approval Boundary for Merge and Deploy

- Status: Accepted
- Date: 2026-07-29
- Accepted: 2026-07-29 โดย Product Owner approval ที่ head SHA `7d85fdefb23611957e9c7b279536bc50d30323d6` merged เป็น `e096d1ff5f344f06c90dc8e93aa76b88782eed3f` ผ่าน Pull Request #1

## Context

ระบบประสาน AI หลายตัวที่สามารถวิเคราะห์ เขียนโค้ด และเตรียม evidence ได้ แต่ Merge และ Deploy เป็น action ที่มีผลต่อ source of truth และ production การให้ AI อนุมัติหรือดำเนินการโดยไม่มี human decision เพิ่มความเสี่ยงจาก hallucination, stale context, prompt injection และ authorization confusion

## Decision

- Product Owner เป็น human authority สำหรับ Merge และ Deploy
- AI สามารถสร้าง approval request แต่สร้าง approval decision ไม่ได้
- Merge approval ต้องผูกกับ exact Pull Request head SHA
- Deploy approval ต้องผูกกับ exact commit SHA บน `main` และ environment
- เมื่อ target SHA เปลี่ยน approval เดิมต้อง `SUPERSEDED` หรือหมดผล
- Execution ต้อง re-verify GitHub state, permission, prerequisite evidence และ approval ก่อนดำเนินการ
- เริ่มต้นโดยไม่มี autonomous merge, auto-merge หรือ autonomous deploy
- Approval decision เป็น append-only audit record และต้องผูกกับ authenticated human identity

## Consequences

### Positive

- ป้องกัน AI แอบอ้างสิทธิ์ Product Owner
- ลด stale approval และ revision mismatch
- ตรวจสอบย้อนหลังได้ว่าใครอนุมัติ target ใด
- แยกการเสนอจากการตัดสินใจและ execution ชัดเจน

### Negative

- delivery ต้องรอ human action
- UX ต้องนำเสนอ evidence ให้ตัดสินใจเร็ว
- ต้องจัดการ approval expiration และ superseding

## Security Notes

- ห้ามเชื่อ role หรือ approval flag จาก client
- approval endpoint ต้องตรวจ server-side policy และควรต้อง recent authentication
- AI/service accounts ต้องไม่มี Product Owner role
- authorization headers, token และ authentication secrets ห้ามเข้า audit payload
- execution ต้อง idempotent และ consume approval อย่างปลอดภัย

## Revisit

อาจเพิ่ม automation เพื่อเตรียม request, evidence หรือ recommendation ได้ แต่การย้าย authority ออกจาก Product Owner ต้องมี ADR ใหม่ การวิเคราะห์ภัยคุกคาม และคำอนุมัติชัดเจนจาก Product Owner
