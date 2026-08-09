# Product Spec

## Users

- Participants who need to understand where to go, what role to pick, how to get help, and how to find a team.
- Organizers who need queues, moderation, team visibility, and setup confidence.
- Mentors and judges who need clear assignments and fewer repeated questions.

## V1 Modules

### Onboarding

Guided or gated mode. The checklist covers rules, nickname, roles, profile, and team.

### Queues

Built-in queues: mentor, tech, staff follow-up, judging. Tickets support open, claim, escalate, close, and transcript references.

### Staff-Trained Q&A

Staff can train PipHackLup with hackathon details from Discord using `/train add` and `/train import`, or from the website trainer after linking a Discord organizer account and selecting a managed server. Participants can ask `/ask` questions in chat, and PipHackLup answers from the staff-approved knowledge base. Low-confidence, mentor-needed, safety, conduct, judging, and staff-needed questions create durable follow-up tickets. Private or staff-sensitive escalations share full details only in a verified staff-private channel; any public mentor notification is redacted and never falls back with the participant's question or identity.

### Teams

Participants can save profiles, create recruiting teams, and receive match suggestions based on skills/interests.

### Moderation

Reports and staff actions create cases. Discord AutoMod templates are suggested for common hackathon risks.

### Dashboard

Organizers sign in with Discord, see only servers they own or can manage, choose one explicit workspace, and add, manage, or remove PipHackLup for that server. The dashboard shows real guild-scoped setup, Q&A training, queues, teams, moderation, and CSV exports. Protected pages fail closed when identity, permission, installation, or database state cannot be verified; they never substitute demo records.

### Account and server boundaries

- Each browser session belongs to one Discord account and expires within 12 hours.
- Manage Server-equivalent access is refreshed before privileged dashboard actions.
- A requested server that is missing or no longer manageable never falls back to another server.
- Install links are locked to the server the organizer selected.
- Removing the bot affects only that server and retains saved event data for an intentional reinstall.
- Bot operational state and dashboard data survive process restarts in the shared database.

## Not in V1

- Message Content intent-based custom spam scanning.
- Paid premium features.
- Generative AI answers from external model providers.
- App Directory/discovery submission.
