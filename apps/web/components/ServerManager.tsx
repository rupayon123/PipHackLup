"use client";

import {
  BookOpen,
  Bot,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  Search,
  ServerOff,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface ManagedServerView {
  id: string;
  name: string;
  iconUrl?: string;
  isOwner: boolean;
  installed: boolean | null;
  installUrl: string;
}

interface ServerManagerProps {
  servers: ManagedServerView[];
  installationStatusError?: string;
}

type ServerFilter = "all" | "installed" | "needs_setup" | "unknown";

export function ServerManager({
  servers,
  installationStatusError,
}: Readonly<ServerManagerProps>) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogErrorRef = useRef<HTMLParagraphElement>(null);
  const [installedState, setInstalledState] = useState<
    Record<string, boolean | null>
  >(Object.fromEntries(servers.map((server) => [server.id, server.installed])));
  const [removeTarget, setRemoveTarget] = useState<ManagedServerView | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ServerFilter>("all");
  const [busyGuildId, setBusyGuildId] = useState<string | null>(null);
  const [pendingInstallGuildId, setPendingInstallGuildId] = useState<
    string | null
  >(null);
  const [status, setStatus] = useState(
    installationStatusError ?? "Server installation status is up to date.",
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleServers = servers.filter((server) => {
    const installed = Object.hasOwn(installedState, server.id)
      ? installedState[server.id]!
      : server.installed;
    const matchesQuery =
      !normalizedQuery ||
      server.name.toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter =
      filter === "all" ||
      (filter === "installed" && installed === true) ||
      (filter === "needs_setup" && installed === false) ||
      (filter === "unknown" && installed === null);
    return matchesQuery && matchesFilter;
  });

  useEffect(() => {
    if (!pendingInstallGuildId) return;
    const refreshWhenOrganizerReturns = () => {
      setStatus("Checking whether Discord finished adding PipHackLup...");
      window.location.reload();
    };
    window.addEventListener("focus", refreshWhenOrganizerReturns, {
      once: true,
    });
    return () =>
      window.removeEventListener("focus", refreshWhenOrganizerReturns);
  }, [pendingInstallGuildId]);

  function openRemoval(server: ManagedServerView) {
    setRemoveTarget(server);
    setConfirmation("");
    setDialogError(null);
    dialogRef.current?.showModal();
  }

  function closeRemoval() {
    if (busyGuildId) return;
    dialogRef.current?.close();
    setRemoveTarget(null);
    setConfirmation("");
    setDialogError(null);
  }

  async function removeBot() {
    if (!removeTarget || confirmation !== removeTarget.name) return;
    setBusyGuildId(removeTarget.id);
    setDialogError(null);
    setStatus(`Removing PipHackLup from ${removeTarget.name}...`);

    try {
      const response = await fetch(
        `/api/discord/guilds/${encodeURIComponent(removeTarget.id)}/bot`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ confirmGuildName: confirmation }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        warning?: string;
      } | null;
      if (!response.ok) {
        throw new Error(removalErrorMessage(body?.error));
      }

      setInstalledState((current) => ({
        ...current,
        [removeTarget.id]: false,
      }));
      setStatus(
        body?.warning === "record_update_failed"
          ? `Discord removed PipHackLup from ${removeTarget.name}, and its saved event data was retained. PipHackLup could not update its activity record, so refresh the status before relying on the dashboard record.`
          : `PipHackLup was removed from ${removeTarget.name}. Its saved event data was retained for a future reinstall.`,
      );
      dialogRef.current?.close();
      setRemoveTarget(null);
      setConfirmation("");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PipHackLup could not be removed. Try again.";
      setStatus(message);
      setDialogError(message);
      window.requestAnimationFrame(() => dialogErrorRef.current?.focus());
    } finally {
      setBusyGuildId(null);
    }
  }

  if (!servers.length) {
    return (
      <section className="empty-state card" aria-labelledby="no-servers-title">
        <ServerOff aria-hidden size={32} />
        <h2 id="no-servers-title">No manageable Discord servers found</h2>
        <p>
          Discord only returns servers you own or where your account currently
          has Manage Server. Create a test server or ask its owner for that
          permission, then reconnect Discord.
        </p>
        <div className="button-row">
          <a className="button primary" href="/api/auth/discord/start">
            <RefreshCw aria-hidden size={16} />
            Reconnect Discord
          </a>
          <a
            className="button"
            href="https://support.discord.com/hc/en-us/articles/204849977-How-do-I-create-a-server"
          >
            Create a Discord server
            <ExternalLink aria-hidden size={15} />
          </a>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="server-manager-toolbar">
        <div>
          <h2>Server workspaces</h2>
          <p className="small">
            Add, open, or remove PipHackLup without losing track of which server
            you are changing.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => {
            setStatus("Refreshing installation status...");
            window.location.reload();
          }}
        >
          <RefreshCw aria-hidden size={16} />
          Refresh status
        </button>
      </div>

      <p
        className="sr-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {status}
      </p>

      <div
        className="server-manager-filters"
        aria-label="Filter server workspaces"
      >
        <label className="server-search">
          <span className="visually-hidden">Search servers by name</span>
          <Search aria-hidden size={17} />
          <input
            type="search"
            placeholder="Find a server"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="server-filter">
          <span>Status</span>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ServerFilter)}
          >
            <option value="all">All servers</option>
            <option value="installed">Installed</option>
            <option value="needs_setup">Needs setup</option>
            <option value="unknown">Status unavailable</option>
          </select>
        </label>
      </div>

      <div className="server-card-grid">
        {visibleServers.map((server) => {
          const installed = Object.hasOwn(installedState, server.id)
            ? installedState[server.id]!
            : server.installed;
          return (
            <article className="server-card" key={server.id}>
              <div className="server-card-head">
                {server.iconUrl ? (
                  <Image
                    className="server-avatar"
                    src={server.iconUrl}
                    alt=""
                    width={48}
                    height={48}
                  />
                ) : (
                  <span className="server-avatar fallback" aria-hidden>
                    {server.name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div>
                  <h3>{server.name}</h3>
                  <p>{server.isOwner ? "Server owner" : "Manage Server"}</p>
                </div>
                <InstallationBadge installed={installed} />
              </div>

              <div className="server-permission-note">
                <ShieldCheck aria-hidden size={17} />
                <span>Your organizer access was checked with Discord</span>
              </div>

              <div className="server-actions">
                {installed === true ? (
                  <>
                    <Link
                      className="button primary"
                      href={`/setup?guildId=${encodeURIComponent(server.id)}`}
                    >
                      <Settings aria-hidden size={16} />
                      Set up event
                    </Link>
                    <Link
                      className="button"
                      href={`/training?guildId=${encodeURIComponent(server.id)}`}
                    >
                      <BookOpen aria-hidden size={16} />
                      Q&amp;A answers
                    </Link>
                    <button
                      className="button danger-ghost"
                      type="button"
                      onClick={() => openRemoval(server)}
                    >
                      <Trash2 aria-hidden size={16} />
                      Remove bot
                    </button>
                  </>
                ) : installed === false ? (
                  <>
                    <a
                      aria-label={`Add PipHackLup to ${server.name} in Discord (opens in a new tab)`}
                      className="button primary"
                      href={server.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => {
                        setPendingInstallGuildId(server.id);
                        setStatus(
                          `Discord opened for ${server.name}. This page will check the installation when you return.`,
                        );
                      }}
                    >
                      <Bot aria-hidden size={16} />
                      Add to this server
                      <ExternalLink aria-hidden size={14} />
                    </a>
                    <span className="server-action-note">
                      Opens Discord in a new tab; this page checks again when
                      you return.
                    </span>
                  </>
                ) : (
                  <button className="button" type="button" disabled>
                    <ServerOff aria-hidden size={16} />
                    Status unavailable
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!visibleServers.length ? (
        <div className="filtered-empty" role="status">
          <strong>No servers match those filters.</strong>
          <button
            className="button"
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
          >
            Clear filters
          </button>
        </div>
      ) : null}

      <dialog
        className="confirm-dialog"
        ref={dialogRef}
        aria-labelledby="remove-bot-title"
        onCancel={(event) => {
          if (busyGuildId) event.preventDefault();
          else closeRemoval();
        }}
        onClose={() => {
          if (!busyGuildId) {
            setRemoveTarget(null);
            setConfirmation("");
            setDialogError(null);
          }
        }}
      >
        {removeTarget ? (
          <div className="confirm-dialog-body">
            <button
              aria-label="Close remove bot dialog"
              className="dialog-close"
              type="button"
              onClick={closeRemoval}
              disabled={Boolean(busyGuildId)}
            >
              <X aria-hidden size={20} />
            </button>
            <div className="danger-mark" aria-hidden>
              <Trash2 size={24} />
            </div>
            <h2 id="remove-bot-title">
              Remove PipHackLup from {removeTarget.name}?
            </h2>
            <p>
              The bot will immediately lose access to this Discord server and
              its commands will stop working. Saved hackathon data will be kept
              so an organizer can reinstall later.
            </p>
            {dialogError ? (
              <p
                className="dialog-error"
                id="remove-bot-error"
                ref={dialogErrorRef}
                role="alert"
                tabIndex={-1}
              >
                {dialogError}
              </p>
            ) : null}
            <label className="field">
              <span>
                Type <strong>{removeTarget.name}</strong> to confirm
              </span>
              <input
                autoFocus
                autoComplete="off"
                aria-describedby={dialogError ? "remove-bot-error" : undefined}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <button
                className="button"
                type="button"
                onClick={closeRemoval}
                disabled={Boolean(busyGuildId)}
              >
                Cancel
              </button>
              <button
                className="button danger"
                type="button"
                disabled={
                  confirmation !== removeTarget.name || Boolean(busyGuildId)
                }
                onClick={removeBot}
              >
                <Trash2 aria-hidden size={16} />
                {busyGuildId ? "Removing..." : "Remove bot"}
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

function InstallationBadge({ installed }: { installed: boolean | null }) {
  if (installed === true) {
    return (
      <span className="badge green">
        <CheckCircle2 aria-hidden size={13} />
        Installed
      </span>
    );
  }
  if (installed === false) {
    return <span className="badge amber">Not installed</span>;
  }
  return <span className="badge gray">Unavailable</span>;
}

function removalErrorMessage(code: string | undefined): string {
  switch (code) {
    case "missing_manage_server":
      return "Your Discord account no longer has Manage Server permission.";
    case "guild_name_confirmation_required":
      return "The server name confirmation did not match.";
    case "untrusted_request_origin":
      return "The removal request could not be verified. Refresh and try again.";
    case "rate_limited":
      return "Too many removal attempts. Wait a moment and try again.";
    case "discord_bot_api_failed":
      return "Discord did not complete the removal. Try again in a moment.";
    default:
      return "PipHackLup could not be removed. Refresh the page and try again.";
  }
}
