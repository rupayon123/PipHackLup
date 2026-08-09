# Discord Setup

Public app name: `PipHackLup`

Public install link:

```text
https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1099914365968
```

## 1. Create the app

1. Go to the Discord Developer Portal.
2. Create an application named `PipHackLup`.
3. Add a bot user.
4. Copy the application/client ID and bot token into your local `.env.local`.
5. Use `assets/piphacklup-discord-avatar.png` for the app icon and `assets/piphacklup-banner.png` for the app banner.
6. Use `assets/piphacklup-social-preview.png` for the GitHub repository social preview image.
7. In OAuth2 redirects, add `https://piphacklup.vercel.app/api/auth/discord/callback` so the website trainer can link organizer Discord accounts.

Never commit or paste the bot token in chat.

## 2. Enable intents

Enable the Guild Members intent.

Leave Message Content intent disabled for slash-command Q&A. If you want PipHackLup to answer when participants mention it in a normal chat message, enable Message Content intent in the Developer Portal and set:

```bash
PIPHACKLUP_AMBIENT_QA_ENABLED=true
```

## 3. Invite permissions

Use scopes:

- `bot`
- `applications.commands`

Recommended bot permissions:

- View Channels
- Send Messages
- Embed Links
- Read Message History
- Manage Roles
- Manage Nicknames
- Manage Channels
- Moderate Members

PipHackLup does not request Kick Members or Ban Members. Its moderation action is a Discord timeout, protected by Moderate Members and staff RBAC.

## 4. Register commands

For a test server, set `DISCORD_TEST_GUILD_ID` so commands register instantly:

```bash
npx --yes pnpm@10.25.0 --filter @piphacklup/bot deploy:commands
```

After the isolated release test passes, run the same command once with `DISCORD_TEST_GUILD_ID` unset to publish the commands globally. Do not register global commands from multiple deploy jobs at the same time.

Then run the bot:

```bash
npx --yes pnpm@10.25.0 dev:bot
```

## 5. Isolated release test

Use a new server that contains no real participant data and no unrelated bots.

1. Sign in at `https://piphacklup.vercel.app/dashboard`; confirm only servers you own or can manage are listed.
2. Choose the isolated server and use **Add to this server**. Confirm Discord locks the install to the selected server and the dashboard recognizes it after returning.
3. Run `/setup`; verify the expected roles, channels, and panels are created once and a second run safely reuses them.
4. Run `/train settings`, `/train add`, and `/train import`; confirm the website shows the same server-specific entries and settings.
5. Ask a known question with `/ask`, then ask an uncertain, safety-sensitive, and prompt-injection-style question. Known content should answer; suspicious or low-confidence content should escalate to staff.
6. Run `/onboard checklist` as a participant. In gated mode, set a nickname, click **Acknowledge rules**, verify the participant role is granted and newcomer role removed, and confirm gated channels become visible.
7. Create profiles, recruiting teams, and matches with `/team`; verify the dashboard reflects only this server.
8. Open, claim, escalate, and close each `/queue` type with participant and staff accounts. Confirm unauthorized members cannot perform staff transitions.
9. Create and review `/mod` cases; confirm staff permission checks, audit events, and safe error messages.
10. Export CSV and verify spreadsheet-looking content cannot become a formula.
11. Restart the bot and confirm setup, profiles, teams, tickets, cases, Q&A, and installation state survive.
12. Remove the bot from the dashboard using the exact server-name confirmation. Confirm another managed server is unchanged, then reinstall and verify retained event data is available.

Record pass/fail evidence for every step. Do not use a production community server for release testing.
