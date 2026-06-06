# Discord Setup

## 1. Create the app

1. Go to the Discord Developer Portal.
2. Create an application named `PipHackLup`.
3. Add a bot user.
4. Copy the application/client ID and bot token into your local `.env.local`.

Never commit or paste the bot token in chat.

## 2. Enable intents

Enable the Guild Members intent. Leave Message Content intent disabled for v1.

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
3. Run `/onboard checklist`.
4. Create a profile with `/team profile`.
5. Create help tickets with `/queue open`.
6. Create a report with `/mod report`.
