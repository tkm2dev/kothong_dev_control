# API Error Codes

Catalogue นี้เป็น source of truth ของ error code ที่ API คืนใน Slice 1 `AC-30` และ `AC-11` อ้างอิงเอกสารนี้

## กฎทั่วไป

- error code เป็น string คงที่ ห้ามเปลี่ยนความหมายหลังใช้งานแล้ว การเปลี่ยนต้องเพิ่ม code ใหม่และทำ code เดิมเป็น deprecated
- ข้อความที่แสดงต่อผู้ใช้เปลี่ยนได้ **code ห้ามเปลี่ยน** — client และ test ผูกกับ code ไม่ใช่ข้อความ
- error response ทุกตัวต้องมี `X-Correlation-Id` ตาม AC-21
- error response ห้ามบรรจุ token, secret, authorization header, stack trace หรือ internal identifier ตาม AC-19

## รูปแบบ response

```json
{
  "error": {
    "code": "PROJECT_ALREADY_REGISTERED",
    "message": "ข้อความสำหรับผู้ใช้",
    "correlationId": "..."
  }
}
```

`message` เป็นข้อความที่แสดงได้ ห้ามใส่รายละเอียดที่เปิดเผยข้อมูลนอกสิทธิ์ของผู้เรียก

## Authentication และ session

| Code | HTTP | เมื่อใด |
|---|---|---|
| `UNAUTHENTICATED` | 401 | ไม่มี session หรือ session หมดอายุ |
| `SESSION_EXPIRED` | 401 | session เคยมีแต่หมดอายุตาม absolute timeout |
| `CSRF_TOKEN_INVALID` | 403 | state-changing request ไม่มี CSRF token หรือ token ไม่ถูกต้อง |
| `OAUTH_STATE_INVALID` | 400 | callback ที่ state ไม่ตรงหรือหมดอายุ |
| `REAUTHENTICATION_REQUIRED` | 401 | action ต้องการ recent authentication แต่ยืนยันตัวตนนานเกินกำหนด |

## Authorization

| Code | HTTP | เมื่อใด |
|---|---|---|
| `FORBIDDEN` | 403 | ผู้เรียกเห็น resource ได้อยู่แล้วแต่ไม่มีสิทธิ์ทำ action นั้น |
| `NOT_FOUND` | 404 | resource ไม่มีอยู่ **หรือ** ผู้เรียกไม่มีสิทธิ์เห็นว่ามีอยู่ ตาม Denied Response Policy |

`NOT_FOUND` ถูกใช้สองความหมายโดยตั้งใจ เพื่อไม่เปิดเผยการมีอยู่ของ resource ข้าม tenant การแยกสองกรณีนี้ออกจากกันใน response จะทำลายเจตนาของ policy

## Validation และ contract

| Code | HTTP | เมื่อใด |
|---|---|---|
| `VALIDATION_FAILED` | 422 | payload ไม่ผ่าน schema |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | endpoint ที่บังคับ idempotency key แต่ไม่ได้ส่งมา |
| `IDEMPOTENCY_KEY_REUSED` | 409 | idempotency key เดิมถูกใช้กับ payload ต่างกัน ตาม AC-10 |
| `PAGINATION_INVALID` | 422 | pagination parameter อยู่นอกช่วงที่กำหนด |

## Project และ repository

| Code | HTTP | เมื่อใด |
|---|---|---|
| `PROJECT_ALREADY_REGISTERED` | 409 | external repository ID นี้ถูกลงทะเบียนใน organization เดียวกันแล้ว ตาม AC-08 |
| `VERSION_CONFLICT` | 409 | optimistic concurrency — expected version ไม่ตรง ตาม AC-15 |
| `REPOSITORY_BINDING_MISMATCH` | 409 | GitHub คืน external repository ID ที่ไม่ตรงกับที่บันทึกไว้ ตาม AC-14 |
| `TENANT_BOUNDARY_VIOLATION` | 404 | request อ้าง project หรือ installation ของ organization อื่น ตอบเป็น 404 ตาม Denied Response Policy |

## GitHub upstream

ห้าเงื่อนไขนี้ตรงกับห้าเงื่อนไขใน AC-11 หนึ่งต่อหนึ่ง

| Code | HTTP | เมื่อใด |
|---|---|---|
| `GITHUB_REPOSITORY_NOT_FOUND` | 404 | GitHub คืน not found |
| `GITHUB_ACCESS_DENIED` | 403 | installation ไม่มีสิทธิ์เข้าถึง repository |
| `GITHUB_INSTALLATION_SUSPENDED` | 403 | installation ถูกระงับ |
| `GITHUB_TIMEOUT` | 504 | เรียก GitHub แล้ว timeout |
| `GITHUB_RATE_LIMITED` | 503 | GitHub ตอบ rate limit |

`GITHUB_TIMEOUT` และ `GITHUB_RATE_LIMITED` เป็นความล้มเหลวชั่วคราว ต้องแยกจาก `GITHUB_ACCESS_DENIED` ที่เป็นการเปลี่ยนสิทธิ์จริง ตามข้อกำหนดใน AC-14 หัวข้อ access regression

| Code | HTTP | เมื่อใด |
|---|---|---|
| `GITHUB_CONTRACT_MISMATCH` | 502 | response จาก GitHub ไม่ผ่าน schema validation ตาม `docs/GITHUB_CONTRACT_STRATEGY.md` |

## Rate limiting ของระบบเอง

| Code | HTTP | เมื่อใด |
|---|---|---|
| `RATE_LIMITED` | 429 | เกิน rate limit ของระบบ ตาม AC-39 |

`RATE_LIMITED` ต้องคืนข้อความเดียวกันเสมอ ไม่ว่า account หรือ resource ที่ถูกเรียกจะมีอยู่จริงหรือไม่

## Internal

| Code | HTTP | เมื่อใด |
|---|---|---|
| `INTERNAL_ERROR` | 500 | ข้อผิดพลาดที่ไม่ได้จำแนก ห้ามคืนรายละเอียดภายใน |

## ข้อบังคับสำหรับ test

- ต้องมี test ที่ยืนยันว่า code ทุกตัวในเอกสารนี้ถูกใช้จริงอย่างน้อยหนึ่ง path หรือถูกทำเครื่องหมายว่ายังไม่ใช้ใน Slice นี้
- ต้องมี test ที่ยืนยันว่า API ไม่คืน code ที่ไม่อยู่ในเอกสารนี้
- ต้องมี test ที่ยืนยันว่า error response ไม่มี token, secret หรือ authorization header ตาม AC-34
