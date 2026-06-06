# PipHackLup

![PipHackLup avatar](assets/piphacklup-avatar.png)

PipHackLup is a hackathon operations Discord bot for 100-500 person events. It helps organizers make Discord feel less chaotic by guiding newcomers, assigning roles, managing mentor queues, forming teams, tracking moderation cases, and giving staff a dashboard for event day.

> Branding note: PipHackLup uses an original blue penguin mascot. Do not commit Pokemon/Piplup artwork or other protected assets to this repository.

## What It Does

- Guided server setup with roles, channels, queues, moderation logs, and onboarding mode.
- Newcomer onboarding for nicknames, roles, hacker profiles, team finding, and help queues.
- Mentor, tech help, and judging queues with claim, escalation, close, and transcripts.
- Team formation with solo profiles, recruiting teams, join requests, matching, and team channels.
- Moderation reports, staff actions, case history, audit logs, and Discord AutoMod setup guidance.
- Organizer dashboard for setup, queues, teams, moderation, settings, and CSV import/export.

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

## Discord Permissions

Required scopes: `bot`, `applications.commands`.

Recommended permissions: View Channels, Send Messages, Embed Links, Attach Files, Read Message History, Manage Roles, Manage Nicknames, Manage Channels, Manage Threads, Moderate Members, Manage Guild, and optional Kick/Ban.

Enable the Guild Members intent. Keep Message Content intent disabled for v1.

## Status

This repository is in active first-build mode. The first launch target is a working test-server demo, not an App Directory-ready public listing.
