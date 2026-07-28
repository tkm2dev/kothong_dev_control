# KOTHONG DEV CONTROL

Human-in-the-loop development control plane for coordinating Product Owner decisions, AI development sessions, GitHub work, reviews, merge approvals, and deploy approvals.

## Repository status

This repository is in the governance and architecture foundation phase. Application code must not begin until the Foundation Pack and Slice 1 acceptance criteria are approved and merged to `main`.

Current Foundation branch: `agent/foundation-pack`

## Non-negotiable rules

- GitHub is the source of truth.
- Use branch-first and worktree-first development.
- One active implementation owner per slice.
- One owner per pull request.
- No rebase and no force-push.
- No direct application commits to `main`.
- No merge or deploy without explicit Product Owner approval.
- Deploy only commits already merged into `main`.
- AI cannot approve on behalf of the Product Owner.
- Every important action requires an activity log and audit trail.
- Credentials and tokens must never be stored as plaintext.
- Start human-in-the-loop; no autonomous merge or deploy.

## Foundation Pack

- [`AGENTS.md`](AGENTS.md)
- [`docs/BOOTSTRAP_RECORD.md`](docs/BOOTSTRAP_RECORD.md)
- [`docs/TEAM_DEVELOPMENT_MODEL.md`](docs/TEAM_DEVELOPMENT_MODEL.md)
- [`docs/PRODUCT_AND_BUSINESS_RULES.md`](docs/PRODUCT_AND_BUSINESS_RULES.md)
- [`docs/SYSTEM_ARCHITECTURE.md`](docs/SYSTEM_ARCHITECTURE.md)
- [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md)
- [`docs/UX_FLOWS.md`](docs/UX_FLOWS.md)
- [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`docs/VERTICAL_SLICES.md`](docs/VERTICAL_SLICES.md)
- [`docs/SLICE_01_ACCEPTANCE_CRITERIA.md`](docs/SLICE_01_ACCEPTANCE_CRITERIA.md)
- [`docs/adr/0001-modular-monolith.md`](docs/adr/0001-modular-monolith.md)
- [`docs/adr/0002-human-approval-boundary.md`](docs/adr/0002-human-approval-boundary.md)

## UX Direction

The proposed interface is a warm operational console: cream canvas, dark brown/olive navigation, amber decision actions, muted green healthy states, brick-red blocking states, rounded cards, and low-input selection flows.

## Current gate

Status: `FOUNDATION_REVIEW`

No application code, merge automation, or deployment automation may begin until the Foundation Pack receives Product Owner approval and is merged through an explicitly approved Pull Request.
