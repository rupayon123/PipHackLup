import { Bot, Database, LogIn, ServerCog } from "lucide-react";
import { isDatabaseConfigured } from "@piphacklup/db";
import { AppShell } from "@/components/AppShell";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import {
  isDiscordAuthConfigured,
  readDiscordSession,
} from "@/lib/discord-auth";
import { TrainingConsole } from "./TrainingConsole";

const installUrl =
  "https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands&permissions=1117094267958";

export default async function TrainingPage() {
  const session = await readDiscordSession();
  const authReady = isDiscordAuthConfigured();
  const databaseReady = isDatabaseConfigured();

  return (
    <AppShell>
      <PageHeader
        eyebrow="Discord-linked Q&A"
        title="Train PipHackLup from the site"
        subtitle="Connect a Discord organizer account, pick a server where you have Manage Server, feed event details, and test the answers participants will get."
        actions={
          <>
            {session ? (
              <a className="button" href="/api/auth/logout">
                <LogIn aria-hidden size={16} />
                Sign out
              </a>
            ) : (
              <a className="button primary" href="/api/auth/discord/start">
                <LogIn aria-hidden size={16} />
                Connect Discord
              </a>
            )}
            <a className="button" href={installUrl}>
              <Bot aria-hidden size={16} />
              Add bot
            </a>
          </>
        }
      />

      <div className="grid metrics">
        <MetricCard
          label="Discord account"
          value={session ? "Linked" : "Preview"}
          detail={
            session
              ? (session.user.globalName ?? session.user.username)
              : authReady
                ? "Ready to connect"
                : "OAuth env needed"
          }
        />
        <MetricCard
          label="Manageable servers"
          value={String(session?.guilds.length ?? 1)}
          detail="Servers shown from the linked Discord account"
        />
        <MetricCard
          label="Training sync"
          value={databaseReady ? "Database" : "Preview"}
          detail={
            databaseReady
              ? "Shared by bot and site"
              : "Set DATABASE_URL for live training"
          }
        />
        <MetricCard
          label="Deployment"
          value="Vercel + Bot"
          detail="Dashboard on Vercel, bot process on server host"
        />
      </div>

      <div className="status-cards">
        <div className="mini-status">
          <ServerCog aria-hidden size={18} />
          <span>
            Server training is scoped to Discord guilds the signed-in organizer
            can manage.
          </span>
        </div>
        <div className="mini-status">
          <Database aria-hidden size={18} />
          <span>
            With Postgres attached, website training and slash-command training
            use the same source.
          </span>
        </div>
      </div>

      <TrainingConsole
        session={session}
        databaseReady={databaseReady}
        installUrl={installUrl}
      />
    </AppShell>
  );
}
