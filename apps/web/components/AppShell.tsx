import {
  isDiscordAuthConfigured,
  readDiscordSession,
  type DiscordSession,
} from "@/lib/discord-auth";
import { Suspense } from "react";
import { AppShellClient } from "./AppShellClient";

interface AppShellProps {
  children: React.ReactNode;
  session?: DiscordSession | null;
  authRequired?: boolean;
  sessionUnavailable?: boolean;
}

export async function AppShell({
  children,
  session: providedSession,
  authRequired = true,
  sessionUnavailable: providedSessionUnavailable = false,
}: Readonly<AppShellProps>) {
  let session = providedSession ?? null;
  let sessionUnavailable = providedSessionUnavailable;

  if (providedSession === undefined && isDiscordAuthConfigured()) {
    try {
      session = await readDiscordSession();
    } catch {
      sessionUnavailable = true;
      console.error("PipHackLup could not read the organizer session.");
    }
  }

  return (
    <Suspense fallback={<AppShellFallback />}>
      <AppShellClient
        authReady={isDiscordAuthConfigured()}
        authRequired={authRequired}
        session={session}
        sessionUnavailable={sessionUnavailable}
      >
        {children}
      </AppShellClient>
    </Suspense>
  );
}

function AppShellFallback() {
  return (
    <div className="shell shell-loading" aria-busy="true" aria-live="polite">
      <aside className="sidebar">
        <div className="sidebar-head">
          <span className="brand">
            <span className="brand-mark" aria-hidden>
              P
            </span>
            <span>PipHackLup</span>
          </span>
        </div>
      </aside>
      <main className="main" id="main-content">
        <div className="page-surface">
          <p className="eyebrow">Organizer control room</p>
          <h1>Opening your server workspace…</h1>
        </div>
      </main>
    </div>
  );
}
