# Security Baseline

PipHackLup is public and handles Discord organizer workflows, so new features should keep this baseline intact.

## Required Controls

- RBAC: privileged dashboard actions require Discord OAuth plus Manage Server-equivalent guild access.
- Bot permissions: staff commands require Discord permissions such as Manage Server or Moderate Members.
- Rate limiting: protect OAuth, dashboard APIs, exports, slash commands, mutation commands, and ambient Q&A mentions.
- Prompt-injection filtering: reject unsafe staff training content and escalate suspicious participant questions to staff.
- Secrets: never commit live tokens, OAuth secrets, database URLs, API keys, or private keys.
- Dependencies: keep Dependabot enabled and run a moderate-or-higher audit before public pushes.

## Current Implementation

- Web rate limiting lives in `apps/web/lib/rate-limit.ts`, uses atomic Postgres buckets in configured deployments, and removes expired rows before each upsert.
- Dashboard RBAC lives in `apps/web/lib/dashboard-security.ts`.
- Bot command throttling lives in `apps/bot/src/lib/rate-limit.ts`.
- Prompt-injection filtering lives in `packages/core/src/security.ts`.
- Staff-trained Q&A uses the filter before saving training and before answering suspicious questions.
- Sensitive Q&A details are sent only to a live-verified staff-private channel; public mentor notifications are redacted.

## Future Hardening

- Consider a dedicated rate-limit service only if Postgres bucket traffic becomes a measurable bottleneck.
- Keep audit events and primary writes atomic where the workflow cannot safely tolerate a post-commit audit warning.
- Keep configured staff-role and Discord-permission checks aligned as new dashboard or bot actions are added.
- Add security regression tests for any new API route or bot command.
