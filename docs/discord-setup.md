# Discord Setup

Public app name: `PipHackLup`

Public install link:

```text
https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958
```

## 1. Create the app

1. Go to the Discord Developer Portal.
2. Create an application named `PipHackLup`.
3. Add a bot user.
4. Copy the application/client ID and bot token into your local `.env.local`.
5. Use `assets/piphacklup-discord-avatar.png` for the app icon and `assets/piphacklup-banner.png` for the app banner.
6. Use `assets/piphacklup-social-preview.png` for the GitHub repository social preview image.

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
- Attach Files
- Read Message History
- Manage Roles
- Manage Nicknames
- Manage Channels
- Manage Threads
- Moderate Members
- Manage Guild
- Kick Members and Ban Members only if you want live kick/ban actions

## 4. Register commands

For a test server, set `DISCORD_TEST_GUILD_ID` so commands register instantly:

```bash
pnpm --filter @piphacklup/bot deploy:commands
```

Then run the bot:

```bash
pnpm dev:bot
```

## 5. Test server demo

1. Invite the bot to a new test server.
2. Run `/setup`.
3. Run `/train settings` to set the staff role, mentor role, help channel, and confidence threshold.
4. Run `/train add` or `/train import` with schedule, venue, prizes, judging, team, and rules details.
5. Ask a participant question with `/ask`.
6. Run `/onboard checklist`.
7. Create a profile with `/team profile`.
8. Create help tickets with `/queue open`.
9. Create a report with `/mod report`.
