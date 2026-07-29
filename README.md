# KOTHONG DEV CONTROL

Human-in-the-loop development control plane for coordinating Product Owner decisions, AI development sessions, GitHub work, reviews, merge approvals, and deploy approvals.

## Repository status

The Foundation Pack is approved and merged. All five Slice 1 implementation prerequisites in [`AGENTS.md`](AGENTS.md) §10 are satisfied, so application code for Slice 1 may begin.

Current work: Slice 1 — Project Registry and Audit Foundation. The Active Lane record is issue #4.

## Non-negotiable rules

- GitHub is the source of truth.
- Use branch-first and worktree-first development.
- One active implementation owner per slice.
- One owner per pull request.
- No rebase and no force-push.
- No direct commits to `main` after the one-time bootstrap recorded in `docs/BOOTSTRAP_RECORD.md`.
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
- [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md)
- [`docs/GITHUB_CONTRACT_STRATEGY.md`](docs/GITHUB_CONTRACT_STRATEGY.md)
- [`docs/adr/0001-modular-monolith.md`](docs/adr/0001-modular-monolith.md)
- [`docs/adr/0002-human-approval-boundary.md`](docs/adr/0002-human-approval-boundary.md)
- [`docs/adr/0003-technology-stack.md`](docs/adr/0003-technology-stack.md)
- [`docs/adr/0004-authentication-provider.md`](docs/adr/0004-authentication-provider.md)
- [`docs/adr/0005-secret-management.md`](docs/adr/0005-secret-management.md)

## UX Direction

The proposed interface is a warm operational console: cream canvas, dark brown/olive navigation, amber decision actions, muted green healthy states, brick-red blocking states, rounded cards, and low-input selection flows.

## Current gate

Status: `ACTIVE` — Slice 1 implementation

Slice 1 work is bounded by the scope declared in issue #4. Work outside that scope goes to the backlog rather than expanding the active slice.

Merge and deploy automation must still not be built. Every merge requires explicit Product Owner approval bound to an exact head SHA.

`main` is protected as of 2026-07-29: direct pushes and force pushes are rejected, a pull request is required, and the rules apply to the repository owner as well.

**CI still does not run.** Workflow files are on `main` and start correctly, but every job is rejected because the account's billing is locked. Until that is resolved, no test result in this repository has been verified by a machine — each one is a claim made by whoever submitted the work. Tracked in issue #8.
