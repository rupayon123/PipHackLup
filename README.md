<p align="center">
  <img src="assets/piphacklup-banner.png" alt="PipHackLup 8-bit hackathon banner" width="680">
</p>

<h1 align="center">PipHackLup</h1>

<p align="center">
  <strong>A public Discord bot for calmer, better-run hackathons.</strong>
</p>

<p align="center">
  <a href="https://piphacklup.vercel.app">Website</a>
  |
  <a href="https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1099914365968">Add to Discord</a>
  |
  <a href="docs/discord-setup.md">Discord setup</a>
  |
  <a href="docs/deployment.md">Deployment</a>
</p>

<p align="center">
  <img src="assets/piphacklup-discord-avatar.png" alt="PipHackLup Discord bot avatar" width="144">
</p>

PipHackLup is a hackathon operations Discord bot for 100-500 person events. It helps organizers make Discord feel less chaotic by guiding newcomers, provisioning event roles and channels, managing mentor queues, suggesting team matches, tracking moderation cases, and giving staff a dashboard for event day.

Brand assets live in `assets/`:

- Discord/app icon: `assets/piphacklup-discord-avatar.png`
- Web favicon/app icon: `assets/piphacklup-avatar.png`
- Discord banner: `assets/piphacklup-banner.png`
- Website hero: `assets/piphacklup-site-hero.png`
- GitHub social preview: `assets/piphacklup-social-preview.png`

## Public Links

- Website: https://piphacklup.vercel.app
- Public repo: https://github.com/rupayon123/PipHackLup
- Add to Discord: https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1099914365968
- Support and bugs: https://github.com/rupayon123/PipHackLup/issues

## What It Does

- Idempotent server setup with event roles, channels, onboarding/help/team panels, and durable configuration.
- Staff-trained hackathon Q&A so participants can ask event questions and get instant answers.
- Discord-linked website training where organizers sign in, pick a managed server, add FAQs, import event details, and preview answers.
- Human escalation for uncertain, mentor-needed, safety, conduct, judging, and staff-needed questions.
- Newcomer onboarding with nickname changes, Discord-native rules acknowledgement, participant-role access, hacker profiles, and honest team guidance. Gated servers restrict event channels until that role is present.
- Durable mentor, tech help, staff follow-up, and judging queues with open, claim, escalation, and close transitions.
- Team formation with participant profiles, recruiting teams, staff-run match suggestions, and a shared team-finder channel.
- Moderation reports, Discord timeouts, durable cases/audit events, and Discord AutoMod guidance.
- Organizer dashboard for setup, Q&A training, queues, teams, moderation, settings, and CSV import/export.

## Slash Commands

- `/ask`: ask PipHackLup a staff-trained question about the hackathon.
- `/train`: staff-only training for event details, FAQs, escalation rules, roles, and help channels.
- `/setup`: idempotent provisioning for event roles, channels, durable panels, and guided or participant-role-gated onboarding.
- `/onboard`: evidence-based checklist plus nickname and profile updates; the onboarding panel grants only the configured participant role after explicit rules acknowledgement.
- `/queue`: mentor, tech help, staff follow-up, and judging/demo queues.
- `/team`: participant profiles, recruiting teams, and staff-run suggestions from opt-in profiles.
- `/mod`: reports, durable warning cases, and Discord timeouts with audit events.

## Workspace

```text
apps/bot      Discord gateway bot and slash command handlers
apps/web      Next.js organizer dashboard and Discord-linked Q&A trainer
packages/core Product logic shared by bot, dashboard, and tests
packages/db   Drizzle schema, lazy database client, and shared knowledge storage
packages/ui   Small shared UI helpers
docs          Setup and deployment documentation
assets        Public mascot/profile assets
```

## Quick Start

```bash
npx --yes pnpm@10.25.0 install --frozen-lockfile
cp .env.example .env.local
npx --yes pnpm@10.25.0 test
npx --yes pnpm@10.25.0 dev:web
```

To run the bot locally, create a Discord app in the Developer Portal, add the bot token/client ID to `.env.local`, then run:

```bash
npx --yes pnpm@10.25.0 dev:bot
```

Register slash commands:

```bash
npx --yes pnpm@10.25.0 --filter @piphacklup/bot deploy:commands
```

## Website Q&A Training

Staff can train PipHackLup from `/training` on the website. Discord OAuth links the dashboard to the organizer account, shows servers where that account has Manage Server, and saves Q&A entries/settings for the selected server.

The live organizer dashboard needs these server-side env vars:

```bash
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_TOKEN=
NEXTAUTH_URL=https://piphacklup.vercel.app
NEXTAUTH_SECRET=
DATABASE_URL=
```

Website training and `/train` use the same guild-scoped Postgres knowledge source. Dashboard login and protected data routes fail closed when OAuth or database configuration is missing; production never substitutes sample data.

## Discord Permissions

Required scopes: `bot`, `applications.commands`.

Recommended permissions: View Channels, Send Messages, Embed Links, Read Message History, Manage Roles, Manage Nicknames, Manage Channels, and Moderate Members. PipHackLup does not request Kick or Ban Members, Manage Server, Attach Files, or Manage Threads.

Enable the Guild Members intent. Keep Message Content intent disabled unless you intentionally enable ambient mention Q&A with `PIPHACKLUP_AMBIENT_QA_ENABLED=true`.

## Security Baseline

PipHackLup is built for public hackathon servers, so the codebase includes organizer RBAC, shared API and bot rate limiting, prompt-injection filtering for staff-trained Q&A, opaque database-backed Discord sessions with encrypted OAuth tokens, Dependabot, and a CI secret-pattern scan.

See `docs/security-baseline.md` and `SECURITY.md` before adding new public endpoints, bot commands, or AI-assisted workflows.

## Production readiness

PipHackLup is a two-service product: the Next.js organizer dashboard runs on Vercel, while the Discord gateway bot runs as a long-lived Node process. Both share one migrated Postgres database. A deployment is ready only when the environment variables are configured, migrations are applied, the bot health endpoint is healthy, Discord OAuth succeeds, and the isolated-server release checklist in `docs/discord-setup.md` passes.
