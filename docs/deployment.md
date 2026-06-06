# Free-First Deployment

PipHackLup is designed to start on free tiers and move to paid hosting later without a rewrite.

Public links:

- Website: https://piphacklup.vercel.app
- GitHub repo: https://github.com/rupayon123/PipHackLup
- Add to Discord: https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958

## Dashboard: Vercel Hobby

Deploy `apps/web` as the Vercel project root.

Environment variables:

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`

The current dashboard uses demo data until the database-backed routes are wired for production.

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

## Bot: Oracle Cloud Always Free

Use an Ampere A1 Always Free VM for the bot process. Install Docker or Node 24 with Corepack.

Basic Node path:

```bash
git clone https://github.com/rupayon123/PipHackLup.git
cd PipHackLup
corepack enable
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

Health check:

```bash
curl http://localhost:8787/health
```

## Repo creation note

The public repository is live at `rupayon123/PipHackLup`. Keep the repo public, MIT licensed, and linked to `https://piphacklup.vercel.app` for discovery.
