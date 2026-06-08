# Security Policy

PipHackLup is a public hackathon Discord bot and organizer dashboard. Please report security issues privately before opening a public issue.

## Reporting a Vulnerability

Email Rupayon Haldar or use GitHub private vulnerability reporting if it is enabled for the repository. Do not post secrets, exploit details, Discord tokens, database URLs, OAuth secrets, or live server identifiers in public issues.

Include:

- Affected URL, command, or package.
- Steps to reproduce.
- Expected impact.
- Whether any secret or user data may be exposed.

## Secret Handling

Never commit these values:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_SECRET`
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- API keys, GitHub tokens, private keys, or OAuth refresh tokens

Use `.env.local` for local development and Vercel/host environment variables for production.

## Supported Versions

PipHackLup is currently public alpha. Security fixes should target the `main` branch.
