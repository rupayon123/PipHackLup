# Free-First Deployment

PipHackLup is designed to start on free tiers and move to paid hosting later without a rewrite.

Public links:

- Website: https://piphacklup.vercel.app
- GitHub repo: https://github.com/rupayon123/PipHackLup
- Add to Discord: https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1099914365968

## Dashboard: Vercel

Connect the repository to Vercel and keep the repository root as the project root. The checked-in `vercel.json` installs the pinned pnpm version, builds `@piphacklup/web`, and serves `apps/web/.next`.

Environment variables:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_TOKEN`
- optional `DISCORD_INSTALL_PERMISSIONS`

The dashboard uses Discord OAuth to show only servers the connected account owns or can manage. `DISCORD_TOKEN` is server-side only and lets the dashboard verify installations, list setup options, and remove the bot after an exact-name confirmation. Website training and `/train` share the same guild-scoped Q&A entries and escalation settings. Missing OAuth or database configuration disables protected flows; there is no production preview-data fallback.

Scope the live Discord credentials, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and production `DATABASE_URL` to **Production**. Do not give arbitrary branch previews access to the production bot token or database. Use a separate staging Discord app/database for authenticated preview testing; unauthenticated visual previews need neither.

## Database: Neon Free

Create a Neon Postgres database and copy the pooled connection string into `DATABASE_URL`.

Generate migrations locally:

```bash
pnpm --filter @piphacklup/db db:generate
```

Apply migrations:

```bash
pnpm --filter @piphacklup/db db:migrate
```

Apply every committed migration before promoting the web or bot release. Use the pooled Neon connection string for runtime traffic and keep it only in hosting environment variables.

## Bot: long-running Node host

The gateway connection cannot run inside a request-based Vercel Function. Use a long-running Node 24 host. Oracle Cloud Ampere A1 remains an Always Free option when capacity is available; a paid container host is easier operationally if reliable capacity matters. Install Docker or Node 24 with Corepack.

Basic Node path:

```bash
git clone https://github.com/rupayon123/PipHackLup.git
cd PipHackLup
npm install --global pnpm@10.25.0
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @piphacklup/bot start
```

Recommended process manager:

```bash
npm install -g pm2
pm2 start "pnpm --filter @piphacklup/bot start" --name piphacklup
pm2 save
```

Required bot env:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DATABASE_URL`
- `PORT=8787`
- `PIPHACKLUP_PUBLIC_URL=https://piphacklup.vercel.app`
- `PIPHACKLUP_AMBIENT_QA_ENABLED=false`

Keep ambient Q&A disabled unless you have enabled the Discord Message Content intent and want the bot to answer when mentioned in normal chat messages. Slash-command Q&A through `/ask` works without Message Content intent.

Health check:

```bash
curl http://localhost:8787/health
```

Do not route traffic to the bot until `/health` returns 200. A 503 means database configuration or startup hydration is not ready. Configure the host to restart the process after crashes and deploy only one command-registration job at a time.

## Release order

1. Create the production database and apply all committed migrations.
2. Configure Vercel production environment variables and deploy the web app.
3. Add the exact callback `https://piphacklup.vercel.app/api/auth/discord/callback` in the Discord Developer Portal.
4. Configure the bot host with the same `DATABASE_URL`, then register commands and start the bot.
5. Verify `/health`, Discord login, managed-server discovery, guild-locked install, setup, Q&A, queues, teams, moderation, export, removal, and reinstall in an isolated test server.
6. Promote the release only after the automated and isolated-server checks both pass.

## Repo creation note

The public repository is live at `rupayon123/PipHackLup`. Keep the repo public, MIT licensed, and linked to `https://piphacklup.vercel.app` for discovery.
