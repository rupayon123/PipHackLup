# PipHackLup Security Defaults

When coding in this repository, treat these as default requirements:

- Follow OWASP guidance for common web risks: broken access control, injection, auth/session handling, insecure design, vulnerable dependencies, logging hygiene, and SSRF-style outbound fetches.
- Add explicit role-based access control for every privileged action. Dashboard organizer actions require a Discord login and Manage Server-equivalent guild access. Bot staff actions should require the matching Discord permission or configured staff role.
- Rate limit public endpoints, auth flows, dashboard writes, bot commands, and ambient chat triggers. Prefer shared helpers over one-off counters.
- For AI, agent, or staff-trained Q&A flows, add prompt-injection filtering before content is saved or used as model/context input. Suspicious questions should escalate to staff instead of receiving an automated answer.
- Never commit secrets. Keep Discord tokens, OAuth client secrets, `NEXTAUTH_SECRET`, database URLs, private keys, and provider API keys in local or hosting environment variables only.
- Add or update tests for new auth, RBAC, rate-limit, and prompt-injection behavior.
- Before pushing public changes, run type checks, tests, dependency audit, and a secret-pattern scan.

## Website Design Defaults

Before building or redesigning a website, do not default to generic SaaS, startup, AI-tool, or "modern landing page" aesthetics.

- Act as a senior web designer, brand strategist, copywriter, and front-end developer.
- Ask for or infer: business name, offer, target audience, primary goal, brand personality, main CTA, liked references, and disliked references.
- Before building, give three creative directions, choose the strongest one, and build from that.
- Avoid purple-blue gradients, glassmorphism cards, floating dashboards, random glowing blobs, generic feature grids, startup-style hero sections, vague corporate copy, and buzzwords like "unlock", "supercharge", "streamline", and "seamless".
- Create a distinct visual concept, strong typography, specific human copy, purposeful spacing, a memorable hero section, layout choices that fit the audience, and a clear conversion path.
- Keep the result responsive, fast, clean, conversion-focused, and visually custom.
