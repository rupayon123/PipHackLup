"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Save, Sparkles, Trash2, Upload } from "lucide-react";
import {
  answerHackathonQuestion,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
  type KnowledgeEscalationTarget,
} from "@piphacklup/core";
import type { ManagedDiscordGuild } from "@/lib/discord-auth";

interface TrainingConsoleProps {
  guild: ManagedDiscordGuild;
  initialEntries: HackathonKnowledgeEntry[];
  initialSettings: KnowledgeAssistantSettings;
  botInstallation: boolean | null;
}

interface DiscordOption {
  id: string;
  name: string;
}

interface DiscordGuildOptions {
  roles: DiscordOption[];
  channels: DiscordOption[];
}

type BusyAction = "add" | "import" | "settings" | `delete:${string}`;
type Notice = { kind: "status" | "error"; message: string };
type DiscordOptionsStatus = "not-needed" | "loading" | "ready" | "error";

export function TrainingConsole({
  guild,
  initialEntries,
  initialSettings,
  botInstallation,
}: Readonly<TrainingConsoleProps>) {
  const [entries, setEntries] =
    useState<HackathonKnowledgeEntry[]>(initialEntries);
  const [settings, setSettings] =
    useState<KnowledgeAssistantSettings>(initialSettings);
  const [discordOptions, setDiscordOptions] =
    useState<DiscordGuildOptions | null>(null);
  const [discordOptionsStatus, setDiscordOptionsStatus] =
    useState<DiscordOptionsStatus>(
      botInstallation === true ? "loading" : "not-needed",
    );
  const [title, setTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");
  const [escalationTarget, setEscalationTarget] =
    useState<KnowledgeEscalationTarget>("none");
  const [importText, setImportText] = useState("");
  const [question, setQuestion] = useState("Where do I check in?");
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [removeConfirmationId, setRemoveConfirmationId] = useState<
    string | null
  >(null);
  const deleteConfirmRef = useRef<HTMLButtonElement>(null);
  const returnDeleteFocusIdRef = useRef<string | null>(null);
  const [notice, setNotice] = useState<Notice>({
    kind: "status",
    message: `Ready to edit answers for ${guild.name}.`,
  });

  useEffect(() => {
    if (botInstallation !== true) {
      setDiscordOptions(null);
      setDiscordOptionsStatus("not-needed");
      return;
    }

    const controller = new AbortController();
    setDiscordOptions(null);
    setDiscordOptionsStatus("loading");
    async function loadDiscordOptions() {
      try {
        const response = await fetch(
          `/api/discord/guilds/${encodeURIComponent(guild.id)}/options`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("options_unavailable");
        const body = (await response.json()) as DiscordGuildOptions;
        if (!controller.signal.aborted) {
          setDiscordOptions(body);
          setDiscordOptionsStatus("ready");
        }
      } catch {
        if (controller.signal.aborted) return;
        console.error("PipHackLup could not load Discord roles and channels.");
        setDiscordOptions(null);
        setDiscordOptionsStatus("error");
        setNotice({
          kind: "error",
          message:
            "Discord roles and channels could not be loaded. Your saved answers are still available.",
        });
      }
    }
    void loadDiscordOptions();
    return () => controller.abort();
  }, [botInstallation, guild.id]);

  useEffect(() => {
    if (removeConfirmationId !== null) {
      if (busyAction !== null) return;
      const frame = window.requestAnimationFrame(() => {
        deleteConfirmRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!returnDeleteFocusIdRef.current) return;
    const entryId = returnDeleteFocusIdRef.current;
    returnDeleteFocusIdRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-remove-entry-id="${CSS.escape(entryId)}"]`,
        )
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [busyAction, removeConfirmationId]);

  const previewAnswer = useMemo(
    () => answerHackathonQuestion(question, entries, settings),
    [entries, question, settings],
  );
  const busy = busyAction !== null;

  async function addEntry() {
    if (!title.trim() || !answer.trim()) {
      setNotice({
        kind: "error",
        message:
          "Add both a participant question and the answer they should receive.",
      });
      return;
    }

    setBusyAction("add");
    setNotice({ kind: "status", message: "Saving this answer…" });
    try {
      const response = await trainingFetch("/api/training/entries", guild.id, {
        method: "POST",
        body: JSON.stringify({ title, answer, tags, escalationTarget }),
      });
      const body = (await response.json()) as {
        entry: HackathonKnowledgeEntry;
        warning?: string | null;
      };
      setEntries((current) => [body.entry, ...current]);
      setTitle("");
      setAnswer("");
      setTags("");
      setEscalationTarget("none");
      setNotice({
        kind: body.warning ? "error" : "status",
        message: body.warning
          ? `Saved “${body.entry.title}” for ${guild.name}, but its activity-log entry could not be recorded. The answer itself is safe.`
          : `Saved “${body.entry.title}” for ${guild.name}.`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: trainingErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function importEntries() {
    if (!importText.trim()) {
      setNotice({
        kind: "error",
        message: "Paste at least one event detail before importing.",
      });
      return;
    }

    setBusyAction("import");
    setNotice({ kind: "status", message: "Checking and importing details…" });
    try {
      const response = await trainingFetch("/api/training/entries", guild.id, {
        method: "POST",
        body: JSON.stringify({ importText, escalationTarget }),
      });
      const body = (await response.json()) as {
        entries: HackathonKnowledgeEntry[];
        warning?: string | null;
      };
      setEntries((current) => [...body.entries, ...current]);
      setImportText("");
      setNotice({
        kind: body.warning ? "error" : "status",
        message: body.warning
          ? `Imported ${body.entries.length} answer${body.entries.length === 1 ? "" : "s"}, but the activity-log entry could not be recorded. The answers themselves are safe.`
          : `Imported ${body.entries.length} answer${body.entries.length === 1 ? "" : "s"}.`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: trainingErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function saveSettings() {
    setBusyAction("settings");
    setNotice({ kind: "status", message: "Saving answer settings…" });
    try {
      const response = await trainingFetch("/api/training/settings", guild.id, {
        method: "POST",
        body: JSON.stringify({
          ...settings,
          staffRoleId: settings.staffRoleId ?? null,
          mentorRoleId: settings.mentorRoleId ?? null,
          helpChannelId: settings.helpChannelId ?? null,
        }),
      });
      const body = (await response.json()) as { warning?: string | null };
      setNotice({
        kind: body.warning ? "error" : "status",
        message: body.warning
          ? `Settings were saved for ${guild.name}, but the activity-log entry could not be recorded.`
          : `Answer and follow-up settings saved for ${guild.name}.`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: trainingErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  async function removeEntry(entry: HackathonKnowledgeEntry) {
    setBusyAction(`delete:${entry.id}`);
    setNotice({ kind: "status", message: `Removing “${entry.title}”…` });
    try {
      const response = await trainingFetch(
        "/api/training/entries",
        guild.id,
        { method: "DELETE" },
        { entryId: entry.id },
      );
      const body = (await response.json()) as { warning?: string | null };
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setRemoveConfirmationId(null);
      returnDeleteFocusIdRef.current = null;
      setNotice({
        kind: body.warning ? "error" : "status",
        message: body.warning
          ? `Removed “${entry.title}” from ${guild.name}, but the activity-log entry could not be recorded.`
          : `Removed “${entry.title}” from ${guild.name}.`,
      });
    } catch (error) {
      setNotice({ kind: "error", message: trainingErrorMessage(error) });
    } finally {
      setBusyAction(null);
    }
  }

  function askToRemoveEntry(entryId: string): void {
    setRemoveConfirmationId(entryId);
  }

  function cancelEntryRemoval(): void {
    returnDeleteFocusIdRef.current = removeConfirmationId;
    setRemoveConfirmationId(null);
  }

  function updateOptionalSetting(
    key: "staffRoleId" | "mentorRoleId" | "helpChannelId",
    value: string,
  ) {
    setSettings((current) => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
  }

  return (
    <div className="training-grid" aria-busy={busy}>
      <div
        className={`training-notice ${notice.kind}`}
        role={notice.kind === "error" ? "alert" : "status"}
        aria-live="polite"
      >
        {notice.message}
      </div>

      <section className="card training-panel">
        <div className="section-heading">
          <div>
            <h2>Add an answer</h2>
            <p className="small">
              Use the words participants are likely to use.
            </p>
          </div>
          <Sparkles aria-hidden size={20} />
        </div>
        <label className="field">
          <span>Participant question or topic</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="When does the opening ceremony start?"
            disabled={busy}
          />
        </label>
        <label className="field">
          <span>Answer PipHackLup should give</span>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={5}
            placeholder="The opening ceremony starts at 9:30 AM in the main auditorium."
            disabled={busy}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Helpful keywords</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="opening, schedule, auditorium"
              disabled={busy}
            />
          </label>
          <label className="field">
            <span>When a person should follow up</span>
            <select
              value={escalationTarget}
              onChange={(event) =>
                setEscalationTarget(
                  event.target.value as KnowledgeEscalationTarget,
                )
              }
              disabled={busy}
            >
              <option value="none">No automatic follow-up</option>
              <option value="mentor">Ask a mentor to follow up</option>
              <option value="staff">Ask staff to follow up</option>
            </select>
          </label>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={addEntry}
          disabled={busy}
        >
          <Save aria-hidden size={16} />
          {busyAction === "add" ? "Saving…" : "Save answer"}
        </button>
      </section>

      <section className="card training-panel">
        <h2>Import several details</h2>
        <p className="small training-help">
          Put one detail on each line: question | answer | comma-separated
          keywords | optional mentor or staff follow-up.
        </p>
        <label className="field">
          <span>Event details</span>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={8}
            placeholder="When is judging? | Judging starts at 1 PM in the demo rooms. | judging,demo | staff"
            disabled={busy}
          />
        </label>
        <button
          className="button"
          type="button"
          onClick={importEntries}
          disabled={busy}
        >
          <Upload aria-hidden size={16} />
          {busyAction === "import" ? "Importing…" : "Import details"}
        </button>
      </section>

      <section className="card training-panel">
        <h2>Human follow-up</h2>
        <p className="small training-help">
          Choose existing Discord roles and a help channel. PipHackLup never
          creates a hidden destination from a pasted ID.
        </p>
        <div className="form-grid">
          <DiscordSelect
            label="Staff role"
            value={settings.staffRoleId ?? ""}
            options={discordOptions?.roles ?? []}
            disabled={busy || discordOptionsStatus !== "ready"}
            onChange={(value) => updateOptionalSetting("staffRoleId", value)}
          />
          <DiscordSelect
            label="Mentor role"
            value={settings.mentorRoleId ?? ""}
            options={discordOptions?.roles ?? []}
            disabled={busy || discordOptionsStatus !== "ready"}
            onChange={(value) => updateOptionalSetting("mentorRoleId", value)}
          />
          <DiscordSelect
            label="Help channel"
            value={settings.helpChannelId ?? ""}
            options={discordOptions?.channels ?? []}
            disabled={busy || discordOptionsStatus !== "ready"}
            onChange={(value) => updateOptionalSetting("helpChannelId", value)}
          />
          <label className="field">
            <span>Minimum answer confidence</span>
            <input
              type="number"
              min={1}
              max={100}
              value={settings.minConfidence}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  minConfidence: Number(event.target.value),
                }))
              }
              disabled={busy}
            />
          </label>
        </div>
        {botInstallation === false ? (
          <p className="field-help">
            Add PipHackLup to this server before choosing Discord roles and
            channels. Saved answers can be prepared now.
          </p>
        ) : botInstallation === null ? (
          <p className="field-help">
            Installation status is temporarily unavailable, so Discord roles and
            channels cannot be loaded. Refresh this page, then try again.
          </p>
        ) : discordOptionsStatus === "error" ? (
          <p className="field-help">
            Discord roles and channels could not be loaded. Refresh this page,
            then try again. Your saved answers are still available.
          </p>
        ) : discordOptionsStatus === "loading" ? (
          <p className="field-help">Loading Discord roles and channels…</p>
        ) : null}
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.publicAnswers}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                publicAnswers: event.target.checked,
              }))
            }
            disabled={busy}
          />
          <span>Answer in the channel by default</span>
        </label>
        <button
          className="button"
          type="button"
          onClick={saveSettings}
          disabled={busy}
        >
          <Save aria-hidden size={16} />
          {busyAction === "settings" ? "Saving…" : "Save follow-up settings"}
        </button>
      </section>

      <section className="card training-panel">
        <h2>Try a participant question</h2>
        <label className="field">
          <span>Question</span>
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
        </label>
        <div className="answer-preview">
          <div className="metric-value">{previewAnswer.confidence}%</div>
          <div>
            <strong>
              {previewAnswer.shouldEscalate
                ? "Answer with human follow-up"
                : "Answer from saved details"}
            </strong>
            <p>{previewAnswer.answer}</p>
            <div className="small">{previewAnswer.escalationReason}</div>
          </div>
        </div>
      </section>

      <section className="card training-panel wide">
        <div className="section-heading">
          <div>
            <h2>Saved answers</h2>
            <p className="small">
              {entries.length} in {guild.name}
            </p>
          </div>
        </div>
        {entries.length ? (
          <div className="training-library">
            {entries.map((entry) => (
              <article key={entry.id}>
                <div>
                  <h3>{entry.title}</h3>
                  <p>{entry.answer}</p>
                  <div className="training-tags">
                    {entry.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                    <span>
                      {entry.escalationTarget === "none"
                        ? "No automatic follow-up"
                        : `${entry.escalationTarget} follow-up`}
                    </span>
                  </div>
                </div>
                {removeConfirmationId === entry.id ? (
                  <div
                    className="training-delete-confirm"
                    role="group"
                    aria-label={`Confirm removal of ${entry.title}`}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape" || busy) return;
                      event.preventDefault();
                      cancelEntryRemoval();
                    }}
                  >
                    <p>
                      Remove <strong>“{entry.title}”</strong>? Participants will
                      no longer receive this saved answer.
                    </p>
                    <div>
                      <button
                        className="button danger"
                        type="button"
                        disabled={busy}
                        onClick={() => removeEntry(entry)}
                        ref={deleteConfirmRef}
                      >
                        <Trash2 aria-hidden size={16} />
                        {busyAction === `delete:${entry.id}`
                          ? "Removing…"
                          : "Confirm remove"}
                      </button>
                      <button
                        className="button"
                        type="button"
                        disabled={busy}
                        onClick={cancelEntryRemoval}
                      >
                        Keep answer
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="button danger-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => askToRemoveEntry(entry.id)}
                    aria-label={`Remove ${entry.title}`}
                    data-remove-entry-id={entry.id}
                  >
                    <Trash2 aria-hidden size={16} />
                    Remove
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="inline-empty">
            No answers have been saved for this server yet. Add the event basics
            above, then try the participant question preview.
          </p>
        )}
      </section>
    </div>
  );
}

function DiscordSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: Readonly<{
  label: string;
  value: string;
  options: DiscordOption[];
  disabled: boolean;
  onChange: (value: string) => void;
}>) {
  const currentOptionExists = options.some((option) => option.id === value);
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Not selected</option>
        {value && !currentOptionExists ? (
          <option value={value}>Previously selected</option>
        ) : null}
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

async function trainingFetch(
  path: string,
  guildId: string,
  init: RequestInit,
  extraQuery: Record<string, string> = {},
): Promise<Response> {
  const query = new URLSearchParams({ guildId, ...extraQuery });
  const response = await fetch(`${path}?${query.toString()}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
  if (response.ok) return response;
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  throw new Error(body?.error ?? `request_failed_${response.status}`);
}

function trainingErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "unknown";
  switch (code) {
    case "training_content_rejected":
      return "That text looks like an instruction-override attempt, so it was not saved. Rewrite it as plain event information or ask staff to review it.";
    case "training_import_empty":
      return "No usable event details were found. Add one detail per line, then import again.";
    case "training_import_too_many_entries":
      return "This import has more than 50 event details. Split it into smaller groups so every answer can be reviewed and saved.";
    case "missing_manage_server":
      return "Your Discord account no longer has permission to manage this server.";
    case "untrusted_request_origin":
      return "This save could not be verified. Refresh the page and try again.";
    case "rate_limited":
      return "Too many changes were sent at once. Wait a moment, then try again.";
    case "database_not_configured":
    case "database_unavailable":
      return "Your saved answers are temporarily unavailable. Nothing was changed; try again shortly.";
    default:
      return "That change could not be saved. Nothing was lost; try again.";
  }
}
