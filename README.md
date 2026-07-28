# KOTHONG DEV CONTROL

Human-in-the-loop development control plane for coordinating Product Owner decisions, AI development sessions, GitHub work, reviews, merge approvals, and deploy approvals.

## Repository status

This repository is in the governance and architecture foundation phase. Application code must not begin until the Foundation Pack and Slice 1 acceptance criteria are approved.

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

See `AGENTS.md` and the documents under `docs/` for the approved operating model once the Foundation Pack PR is merged.
