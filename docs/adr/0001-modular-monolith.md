# ADR 0001: Start with a Modular Monolith

- Status: Accepted
- Date: 2026-07-29
- Accepted: 2026-07-29 โดย Product Owner approval ที่ head SHA `7d85fdefb23611957e9c7b279536bc50d30323d6` merged เป็น `e096d1ff5f344f06c90dc8e93aa76b88782eed3f` ผ่าน Pull Request #1

## Context

KOTHONG DEV CONTROL ต้องบังคับ authorization, idempotency, audit, conflict rules และ approval workflow ที่มี transaction boundary ชัดเจน ขณะเริ่มต้น domain และ scale ยังไม่เสถียร การแยก microservices เร็วเกินไปเพิ่ม distributed consistency, deployment และ observability complexity

## Decision

เริ่ม application เป็น Modular Monolith โดยมี domain modules แยกชัดเจน:

- Identity and Access
- Project Registry
- Work Planning
- Active Lanes
- AI Sessions
- Conflict Detection
- GitHub Integration
- Reviews
- Approvals
- Deployment Governance
- Activity and Audit

ใช้ PostgreSQL เป็น primary database และใช้ transactional outbox สำหรับ integration events

แต่ละ module ต้องมี public application boundary และห้ามเข้าถึง persistence internals ของ module อื่นโดยพลการ

## Consequences

### Positive

- business mutation และ audit commit ใน transaction เดียวกันได้
- policy และ authorization review ง่ายขึ้น
- deploy/operate ง่ายในช่วงแรก
- refactor domain boundaries ได้เร็ว

### Negative

- scale และ release แยก module ไม่ได้ทันที
- ต้องมี discipline ป้องกัน coupling ภายใน codebase
- background worker อาจแชร์ deployment lifecycle

## Revisit Triggers

พิจารณาแยก service เมื่อมีหลักฐานอย่างน้อยหนึ่งข้อ:

- workload หรือ scaling profile แตกต่างอย่างมีนัยสำคัญ
- security boundary ต้องแยก process
- ทีมแยก ownership และ release cadence จริง
- integration workload กระทบ transactional application

ห้ามแยก service เพียงเพื่อใช้เทคโนโลยีที่ต่างกันโดยไม่มี product/operational evidence
