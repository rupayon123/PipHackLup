"use client";

import {
  BarChart3,
  Bot,
  ClipboardList,
  Download,
  FileText,
  LogIn,
  LogOut,
  MessageCircleQuestion,
  MoreHorizontal,
  Server,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { DiscordSession } from "@/lib/discord-auth";
import { ThemeToggle } from "@/components/ThemeToggle";

type DashboardTheme = "light" | "dark";

interface AppShellClientProps {
  children: React.ReactNode;
  session: DiscordSession | null;
  authReady: boolean;
  authRequired: boolean;
  sessionUnavailable: boolean;
}

const themeStorageKey = "piphacklup-dashboard-theme";
const guildWorkspacePaths = new Set([
  "/dashboard",
  "/dev-fixtures/control-room",
  "/moderation",
  "/queues",
  "/setup",
  "/teams",
  "/training",
]);

const primaryNavItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/setup", label: "Setup", icon: Wrench },
  { href: "/training", label: "Q&A Training", icon: MessageCircleQuestion },
  {
    href: "/queues",
    label: "Queues",
    icon: ClipboardList,
    mobileOverflow: true,
  },
  { href: "/teams", label: "Teams", icon: Users, mobileOverflow: true },
];

const mobileOverflowNavItems = primaryNavItems.filter(
  (item) => item.mobileOverflow,
);

const secondaryNavItems = [
  { href: "/moderation", label: "Moderation", icon: Shield },
  { href: "/privacy", label: "Privacy", icon: FileText },
];

export function AppShellClient({
  children,
  session,
  authReady,
  authRequired,
  sessionUnavailable,
}: Readonly<AppShellClientProps>) {
  const [theme, setTheme] = useState<DashboardTheme>("light");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedGuildId = searchParams.get("guildId");
  const shouldRestoreGuild = Boolean(
    session?.guilds.length &&
    !requestedGuildId &&
    guildWorkspacePaths.has(pathname),
  );
  const [restoringGuild, setRestoringGuild] = useState(shouldRestoreGuild);
  const requestedGuild = session?.guilds.find(
    (guild) => guild.id === requestedGuildId,
  );
  const requestedGuildUnavailable = Boolean(
    session && requestedGuildId && !requestedGuild,
  );
  const selectedGuildId = requestedGuildUnavailable
    ? ""
    : restoringGuild
      ? ""
      : (requestedGuild?.id ?? session?.guilds[0]?.id ?? "");
  const selectedGuild = session?.guilds.find(
    (guild) => guild.id === selectedGuildId,
  );
  const authMessage = getAuthMessage(searchParams.get("auth"));

  useEffect(() => {
    const initial = readPreparedTheme();
    setTheme(initial);
    document.documentElement.dataset.dashboardTheme = initial;
  }, []);

  useEffect(() => {
    if (!session?.guilds.length || !guildWorkspacePaths.has(pathname)) {
      setRestoringGuild(false);
      return;
    }

    const storageKey = lastGuildStorageKey(session.user.id);
    if (requestedGuildId) {
      if (requestedGuild) {
        storeLastGuild(storageKey, requestedGuild.id);
      }
      setRestoringGuild(false);
      return;
    }

    const fallbackGuildId = session.guilds[0]!.id;
    const savedGuildId = readLastGuild(storageKey);
    const savedGuild = session.guilds.find(
      (guild) => guild.id === savedGuildId,
    );
    if (savedGuild && savedGuild.id !== fallbackGuildId) {
      setRestoringGuild(true);
      router.replace(withGuild(pathname, savedGuild.id), { scroll: false });
      return;
    }

    storeLastGuild(storageKey, fallbackGuildId);
    setRestoringGuild(false);
  }, [pathname, requestedGuild, requestedGuildId, router, session]);

  useEffect(() => {
    let canceled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    async function retryPendingRevocations() {
      let completed = false;
      try {
        const response = await fetch("/api/auth/session/revoke-pending", {
          method: "POST",
        });
        completed = response.status === 204;
      } catch {
        completed = false;
      }

      if (canceled) return;
      if (completed) {
        if (searchParams.get("auth") === "logout_incomplete") {
          const next = new URLSearchParams(searchParams.toString());
          next.delete("auth");
          router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
            scroll: false,
          });
        }
        return;
      }

      attempt += 1;
      retryTimer = setTimeout(
        () => void retryPendingRevocations(),
        Math.min(60_000, 2_000 * 2 ** Math.min(attempt, 5)),
      );
    }

    void retryPendingRevocations();
    return () => {
      canceled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [pathname, router, searchParams]);

  const navigation = useMemo(
    () =>
      primaryNavItems.map((item) => ({
        ...item,
        href: withGuild(item.href, selectedGuildId),
      })),
    [selectedGuildId],
  );
  const secondaryNavigation = useMemo(
    () =>
      secondaryNavItems.map((item) => ({
        ...item,
        href: withGuild(item.href, selectedGuildId),
      })),
    [selectedGuildId],
  );

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      window.localStorage.setItem(themeStorageKey, next);
    } catch {
      // The theme still changes for this page when browser storage is blocked.
    }
    document.documentElement.dataset.dashboardTheme = next;
  }

  function selectGuild(guildId: string) {
    if (!guildId) return;
    router.push(withGuild(pathname, guildId));
  }

  const showAuthGate = authRequired && !session;

  return (
    <div className="shell" data-theme={theme}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link
            className="brand"
            href={session ? withGuild("/dashboard", selectedGuildId) : "/"}
          >
            <span className="brand-mark" aria-hidden>
              P
            </span>
            <span>PipHackLup</span>
          </Link>
          <ThemeToggle onToggle={toggleTheme} theme={theme} />
        </div>

        {session ? (
          <label className="server-switcher">
            <span>
              <Server aria-hidden size={15} />
              Server workspace
            </span>
            <select
              aria-label="Selected Discord server"
              disabled={restoringGuild}
              value={selectedGuildId}
              onChange={(event) => selectGuild(event.target.value)}
            >
              {restoringGuild ? (
                <option value="" disabled>
                  Opening last server…
                </option>
              ) : requestedGuildUnavailable ? (
                <option value="" disabled>
                  Choose a server
                </option>
              ) : null}
              {session.guilds.length ? (
                session.guilds.map((guild) => (
                  <option key={guild.id} value={guild.id}>
                    {guild.name}
                  </option>
                ))
              ) : (
                <option value="">No manageable servers</option>
              )}
            </select>
          </label>
        ) : null}

        {session && !restoringGuild ? (
          <nav className="nav" aria-label="Main navigation">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href.split("?")[0] ||
                pathname.startsWith(`${item.href.split("?")[0]}/`);

              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={`${active ? "active" : ""} ${
                    item.mobileOverflow ? "mobile-overflow" : ""
                  }`.trim()}
                  key={item.href}
                  href={item.href}
                >
                  <Icon aria-hidden size={18} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <details
              className="nav-more"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
              <summary>
                <MoreHorizontal aria-hidden size={18} />
                <span>More</span>
              </summary>
              <div className="nav-more-menu">
                {mobileOverflowNavItems.map((item) => {
                  const Icon = item.icon;
                  const href = withGuild(item.href, selectedGuildId);
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={`mobile-nav-only ${active ? "active" : ""}`.trim()}
                      key={`mobile-${item.href}`}
                      href={href}
                    >
                      <Icon aria-hidden size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                {secondaryNavigation.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href.split("?")[0] ||
                    pathname.startsWith(`${item.href.split("?")[0]}/`);
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      className={active ? "active" : undefined}
                      key={item.href}
                      href={item.href}
                    >
                      <Icon aria-hidden size={18} />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <a
                  href={withGuild("/api/export", selectedGuildId)}
                  title="Download CSV export"
                >
                  <Download aria-hidden size={18} />
                  <span>Export</span>
                </a>
              </div>
            </details>
          </nav>
        ) : null}

        <div className="account-dock">
          {session ? (
            <>
              <div className="account-identity">
                {session.user.avatarUrl ? (
                  <Image
                    src={session.user.avatarUrl}
                    alt=""
                    className="avatar"
                    width={36}
                    height={36}
                  />
                ) : (
                  <span className="avatar fallback" aria-hidden>
                    {session.user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span>
                  <strong>
                    {session.user.globalName ?? session.user.username}
                  </strong>
                  <small>
                    {selectedGuild ? selectedGuild.name : "Discord connected"}
                  </small>
                </span>
              </div>
              <form action="/api/auth/logout" method="post">
                <button className="button account-action" type="submit">
                  <LogOut aria-hidden size={16} />
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <div className="account-identity signed-out">
              <Bot aria-hidden size={20} />
              <span>
                <strong>Organizer account</strong>
                <small>Discord is your sign-in</small>
              </span>
            </div>
          )}
        </div>
      </aside>
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="page-surface" key={pathname}>
          {restoringGuild ? (
            <section className="workspace-restoring" role="status">
              <Server aria-hidden size={26} />
              <div>
                <h1>Opening your last server workspace…</h1>
                <p>PipHackLup is checking that you can still manage it.</p>
              </div>
            </section>
          ) : showAuthGate ? (
            <AuthGate
              authMessage={authMessage}
              authReady={authReady}
              sessionUnavailable={sessionUnavailable}
            />
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  );
}

function AuthGate({
  authMessage,
  authReady,
  sessionUnavailable,
}: {
  authMessage: string | undefined;
  authReady: boolean;
  sessionUnavailable: boolean;
}) {
  const unavailable = sessionUnavailable || !authReady;
  return (
    <section className="auth-gate" aria-labelledby="auth-gate-title">
      <div className="auth-gate-mark" aria-hidden>
        <Bot size={30} />
      </div>
      <p className="eyebrow">Organizer control room</p>
      <h1 id="auth-gate-title">Sign in with Discord to manage your servers</h1>
      <p>
        PipHackLup uses your Discord identity to show only servers you own or
        where you currently have Manage Server permission.
      </p>
      {authMessage ? (
        <p className="auth-alert" role="alert">
          {authMessage}
        </p>
      ) : null}
      {unavailable ? (
        <div className="dependency-alert" role="status">
          <strong>Discord account login is temporarily unavailable.</strong>
          <span>
            Nothing is wrong with your Discord account. Please try again a
            little later.
          </span>
        </div>
      ) : (
        <a className="button primary large" href="/api/auth/discord/start">
          <LogIn aria-hidden size={18} />
          Continue with Discord
        </a>
      )}
      <small>
        PipHackLup never asks for your Discord password and does not request
        access to read your messages.
      </small>
    </section>
  );
}

function withGuild(href: string, guildId: string): string {
  if (!guildId) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}guildId=${encodeURIComponent(guildId)}`;
}

function lastGuildStorageKey(discordUserId: string): string {
  return `piphacklup:last-guild:${discordUserId}`;
}

function readPreparedTheme(): DashboardTheme {
  const prepared = document.documentElement.dataset.dashboardTheme;
  if (prepared === "dark" || prepared === "light") return prepared;

  try {
    const saved = window.localStorage.getItem(themeStorageKey);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Fall through to the operating-system preference.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readLastGuild(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function storeLastGuild(storageKey: string, guildId: string): void {
  try {
    window.localStorage.setItem(storageKey, guildId);
  } catch {
    // The workspace remains usable when browser storage is unavailable.
  }
}

function getAuthMessage(status: string | null): string | undefined {
  switch (status) {
    case "denied":
      return "Discord sign-in was canceled. Nothing was changed; try again when you are ready.";
    case "expired":
      return "Your sign-in request expired. Start again to reconnect securely.";
    case "failed":
      return "Discord sign-in could not be completed. Try again, then contact support if it keeps failing.";
    case "missing":
      return "Discord sign-in is not configured on this deployment yet.";
    case "logout_incomplete":
      return "You are signed out on this browser. PipHackLup could not immediately end the previous server session. It will retry while this page is open and when this browser returns; that session expires automatically within 12 hours.";
    default:
      return undefined;
  }
}
