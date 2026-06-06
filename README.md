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
  <a href="https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958">Add to Discord</a>
  |
  <a href="docs/discord-setup.md">Discord setup</a>
  |
  <a href="docs/deployment.md">Deployment</a>
</p>

<p align="center">
  <img src="assets/piphacklup-avatar.png" alt="PipHackLup blue penguin mascot logo" width="144">
</p>

PipHackLup is a hackathon operations Discord bot for 100-500 person events. It helps organizers make Discord feel less chaotic by guiding newcomers, assigning roles, managing mentor queues, forming teams, tracking moderation cases, and giving staff a dashboard for event day.

> Branding note: PipHackLup uses an original blue penguin mascot. Do not commit Pokemon/Piplup artwork or other protected assets to this repository.

Brand assets live in `assets/`:

- Discord/app icon: `assets/piphacklup-avatar.png`
- Discord banner: `assets/piphacklup-banner.png`
- GitHub social preview: `assets/piphacklup-social-preview.png`

## Public Links

- Website: https://piphacklup.vercel.app
- Public repo: https://github.com/rupayon123/PipHackLup
- Add to Discord: https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958
- Support and bugs: https://github.com/rupayon123/PipHackLup/issues

## What It Does

- Guided server setup with roles, channels, queues, moderation logs, and onboarding mode.
- Newcomer onboarding for nicknames, roles, hacker profiles, team finding, and help queues.
- Mentor, tech help, and judging queues with claim, escalation, close, and transcripts.
- Team formation with solo profiles, recruiting teams, join requests, matching, and team channels.
- Moderation reports, staff actions, case history, audit logs, and Discord AutoMod setup guidance.
- Organizer dashboard for setup, queues, teams, moderation, settings, and CSV import/export.

## Slash Commands

- `/setup`: guided server setup for roles, channels, queues, moderation logs, and onboarding.
- `/onboard`: newcomer checklist for nickname, roles, profile, team, and help.
- `/queue`: mentor, tech help, and judging/demo queues.
- `/team`: solo profiles, recruiting teams, join requests, matching, and team channels.
- `/mod`: reports, warns, timeouts, case history, and audit logs.

## Workspace

```text
apps/bot      Discord gateway bot and slash command handlers
apps/web      Next.js organizer dashboard
packages/core Product logic shared by bot, dashboard, and tests
packages/db   Drizzle schema and lazy database client
packages/ui   Small shared UI helpers
docs          Setup and deployment documentation
assets        Public mascot/profile assets
```

## Quick Start

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm test
pnpm dev:web
```

To run the bot locally, create a Discord app in the Developer Portal, add the bot token/client ID to `.env.local`, then run:

```bash
pnpm dev:bot
```

Register slash commands:

```bash
pnpm --filter @piphacklup/bot deploy:commands
```

## Discord Permissions

Required scopes: `bot`, `applications.commands`.

Recommended permissions: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles, Manage Nicknames, Manage Channels, Manage Threads, Moderate Members, Manage Guild, and optional Kick/Ban.

Enable the Guild Members intent. Keep Message Content intent disabled for v1.

## Status

PipHackLup is in public alpha. The website, repo, slash commands, and install link are live; the next major milestone is a hosted always-on bot process plus production database-backed dashboard flows.
