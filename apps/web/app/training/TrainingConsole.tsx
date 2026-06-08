"use client";

import { useEffect, useMemo, useState } from "react";
import {
  answerHackathonQuestion,
  createKnowledgeEntry,
  defaultKnowledgeSettings,
  parseKnowledgeImportText,
  type HackathonKnowledgeEntry,
  type KnowledgeAssistantSettings,
  type KnowledgeEscalationTarget,
} from "@piphacklup/core";
import type { DiscordSession, ManagedDiscordGuild } from "@/lib/discord-auth";

interface TrainingConsoleProps {
  session: DiscordSession | null;
  databaseReady: boolean;
  installUrl: string;
}

const previewGuild: ManagedDiscordGuild = {
  id: "preview-guild",
  name: "Preview Hackathon Server",
  isOwner: true,
  permissions: "32",
  canManage: true,
};

const previewEntries: HackathonKnowledgeEntry[] = [
  createKnowledgeEntry({
    guildId: previewGuild.id,
    title: "Check-in location",
    answer:
      "Check-in is at the main registration desk. Staff can update this from the website trainer or `/train add`.",
    tags: ["check-in", "registration", "badge"],
    createdBy: "preview",
  }),
  createKnowledgeEntry({
    guildId: previewGuild.id,
    title: "Submission deadline",
    answer:
      "Project submissions close at 10:00 AM on demo day. Ask staff to change this for the real event.",
    tags: ["deadline", "submit", "demo"],
    escalationTarget: "staff",
    createdBy: "preview",
  }),
];

export function TrainingConsole({
  session,
  databaseReady,
  installUrl,
}: TrainingConsoleProps) {
  const guilds = session?.guilds.length ? session.guilds : [previewGuild];
  const [selectedGuildId, setSelectedGuildId] = useState(
    guilds[0]?.id ?? previewGuild.id,
  );
  const selectedGuild =
    guilds.find((guild) => guild.id === selectedGuildId) ??
    guilds[0] ??
    previewGuild;
  const liveMode = Boolean(session && databaseReady);
  const [entries, setEntries] =
    useState<HackathonKnowledgeEntry[]>(previewEntries);
  const [settings, setSettings] = useState<KnowledgeAssistantSettings>({
    ...defaultKnowledgeSettings,
  });
  const [title, setTitle] = useState("");
  const [answer, setAnswer] = useState("");
  const [tags, setTags] = useState("");
  const [escalationTarget, setEscalationTarget] =
    useState<KnowledgeEscalationTarget>("none");
  const [importText, setImportText] = useState("");
  const [question, setQuestion] = useState("Where do I check in?");
  const [status, setStatus] = useState(
    liveMode
      ? "Connected to Discord and database."
      : "Preview mode: connect Discord and DATABASE_URL for live training.",
  );

  useEffect(() => {
    setSelectedGuildId(guilds[0]?.id ?? previewGuild.id);
  }, [session?.user.id]);

  useEffect(() => {
    if (!liveMode) {
      setEntries(
        previewEntries.map((entry) => ({
          ...entry,
          guildId: selectedGuild.id,
        })),
      );
      setSettings({ ...defaultKnowledgeSettings });
      return;
    }

    let canceled = false;
    async function loadTraining() {
      setStatus("Loading server training...");
      const query = `guildId=${encodeURIComponent(selectedGuild.id)}`;
      const [entriesResponse, settingsResponse] = await Promise.all([
        fetch(`/api/training/entries?${query}`),
        fetch(`/api/training/settings?${query}`),
      ]);
      if (canceled) return;
      if (!entriesResponse.ok || !settingsResponse.ok) {
        setStatus("Could not load live training for this server.");
        return;
      }
      const entriesJson = (await entriesResponse.json()) as {
        entries: HackathonKnowledgeEntry[];
      };
      const settingsJson = (await settingsResponse.json()) as {
        settings: KnowledgeAssistantSettings;
      };
      setEntries(entriesJson.entries);
      setSettings(settingsJson.settings);
      setStatus(`Live training loaded for ${selectedGuild.name}.`);
    }

    void loadTraining();
    return () => {
      canceled = true;
    };
  }, [liveMode, selectedGuild.id, selectedGuild.name]);

  const previewAnswer = useMemo(
    () => answerHackathonQuestion(question, entries, settings),
    [entries, question, settings],
  );

  async function addEntry() {
    if (!title.trim() || !answer.trim()) {
      setStatus("Add a title and answer first.");
      return;
    }

    if (liveMode) {
      const guildQuery = encodeURIComponent(selectedGuild.id);
      const response = await fetch(
        `/api/training/entries?guildId=${guildQuery}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, answer, tags, escalationTarget }),
        },
      );
      if (!response.ok) {
        setStatus("Live training save failed.");
        return;
      }
      const json = (await response.json()) as {
        entry: HackathonKnowledgeEntry;
      };
      setEntries((current) => [json.entry, ...current]);
      setStatus(`Saved live training entry: ${json.entry.title}.`);
    } else {
      const entry = createKnowledgeEntry({
        guildId: selectedGuild.id,
        title,
        answer,
        tags: tags.split(","),
        escalationTarget,
        createdBy: session?.user.id ?? "preview",
      });
      setEntries((current) => [entry, ...current]);
      setStatus(`Preview entry added: ${entry.title}.`);
    }

    setTitle("");
    setAnswer("");
    setTags("");
    setEscalationTarget("none");
  }

  async function importEntries() {
    if (!importText.trim()) {
      setStatus("Paste training lines first.");
      return;
    }

    if (liveMode) {
      const guildQuery = encodeURIComponent(selectedGuild.id);
      const response = await fetch(
        `/api/training/entries?guildId=${guildQuery}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ importText, escalationTarget }),
        },
      );
      if (!response.ok) {
        setStatus("Live import failed.");
        return;
      }
      const json = (await response.json()) as {
        entries: HackathonKnowledgeEntry[];
      };
      setEntries((current) => [...json.entries, ...current]);
      setStatus(`Imported ${json.entries.length} live training entries.`);
    } else {
      const imported = parseKnowledgeImportText(
        importText,
        escalationTarget,
      ).map((entry) =>
        createKnowledgeEntry({
          guildId: selectedGuild.id,
          title: entry.title,
          answer: entry.answer,
          tags: entry.tags,
          escalationTarget: entry.escalationTarget,
          createdBy: session?.user.id ?? "preview",
        }),
      );
      setEntries((current) => [...imported, ...current]);
      setStatus(`Preview imported ${imported.length} entries.`);
    }
    setImportText("");
  }

  async function saveSettings() {
    if (liveMode) {
      const guildQuery = encodeURIComponent(selectedGuild.id);
      const response = await fetch(
        `/api/training/settings?guildId=${guildQuery}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(settings),
        },
      );
      if (!response.ok) {
        setStatus("Live settings save failed.");
        return;
      }
      setStatus("Live escalation settings saved.");
      return;
    }
    setStatus("Preview settings updated.");
  }

  async function removeEntry(entryId: string) {
    if (liveMode) {
      const guildQuery = encodeURIComponent(selectedGuild.id);
      const entryQuery = encodeURIComponent(entryId);
      const response = await fetch(
        `/api/training/entries?guildId=${guildQuery}&entryId=${entryQuery}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        setStatus("Could not delete live training entry.");
        return;
      }
    }
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    setStatus("Training entry removed.");
  }

  function updateOptionalSetting(
    key: "staffRoleId" | "mentorRoleId" | "helpChannelId",
    value: string,
  ) {
    setSettings((current) => {
      const next = { ...current };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
  }

  return (
    <div className="training-grid">
      <section className="card training-panel">
        <h2>Linked Discord Account</h2>
        {session ? (
          <div className="account-row">
            {session.user.avatarUrl ? (
              <img src={session.user.avatarUrl} alt="" className="avatar" />
            ) : (
              <span className="avatar fallback">
                {session.user.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <strong>
                {session.user.globalName ?? session.user.username}
              </strong>
              <div className="small">Discord ID {session.user.id}</div>
            </div>
            <a className="button" href="/api/auth/logout">
              Sign out
            </a>
          </div>
        ) : (
          <div className="steps">
            <div className="step">
              <span className="step-icon">1</span>
              <div>
                <strong>Connect Discord</strong>
                <div className="small">
                  The dashboard will show servers where your account has Manage
                  Server.
                </div>
              </div>
              <a className="button primary" href="/api/auth/discord/start">
                Connect
              </a>
            </div>
          </div>
        )}

        <label className="field">
          <span>Server deployment</span>
          <select
            value={selectedGuild.id}
            onChange={(event) => setSelectedGuildId(event.target.value)}
          >
            {guilds.map((guild) => (
              <option key={guild.id} value={guild.id}>
                {guild.name}
              </option>
            ))}
          </select>
        </label>
        <div className="status-strip">
          <span className={`badge ${liveMode ? "green" : "amber"}`}>
            {liveMode ? "Live" : "Preview"}
          </span>
          <span>{status}</span>
        </div>
        <a className="button primary full" href={installUrl}>
          Add PipHackLup to this Discord server
        </a>
      </section>

      <section className="card training-panel">
        <h2>Train Event Details</h2>
        <label className="field">
          <span>Question or topic</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Opening ceremony time"
          />
        </label>
        <label className="field">
          <span>Answer participants should get</span>
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={5}
            placeholder="Opening ceremony starts at 9:30 AM in the main auditorium."
          />
        </label>
        <div className="form-grid">
          <label className="field">
            <span>Keywords</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="opening, schedule, auditorium"
            />
          </label>
          <label className="field">
            <span>Human follow-up</span>
            <select
              value={escalationTarget}
              onChange={(event) =>
                setEscalationTarget(
                  event.target.value as KnowledgeEscalationTarget,
                )
              }
            >
              <option value="none">No automatic ping</option>
              <option value="mentor">Ping mentors</option>
              <option value="staff">Ping staff</option>
            </select>
          </label>
        </div>
        <button className="button primary" type="button" onClick={addEntry}>
          Save training entry
        </button>
      </section>

      <section className="card training-panel">
        <h2>Bulk Import</h2>
        <label className="field">
          <span>One line per detail</span>
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            rows={6}
            placeholder="Judging time | Judging starts at 1 PM in #demo-rooms | judging,demo | staff"
          />
        </label>
        <button className="button" type="button" onClick={importEntries}>
          Import details
        </button>
      </section>

      <section className="card training-panel">
        <h2>Escalation Settings</h2>
        <div className="form-grid">
          <label className="field">
            <span>Staff role ID</span>
            <input
              value={settings.staffRoleId ?? ""}
              onChange={(event) =>
                updateOptionalSetting("staffRoleId", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Mentor role ID</span>
            <input
              value={settings.mentorRoleId ?? ""}
              onChange={(event) =>
                updateOptionalSetting("mentorRoleId", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Help channel ID</span>
            <input
              value={settings.helpChannelId ?? ""}
              onChange={(event) =>
                updateOptionalSetting("helpChannelId", event.target.value)
              }
            />
          </label>
          <label className="field">
            <span>Minimum confidence</span>
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
            />
          </label>
        </div>
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
          />
          <span>Answer publicly by default</span>
        </label>
        <button className="button" type="button" onClick={saveSettings}>
          Save settings
        </button>
      </section>

      <section className="card training-panel wide">
        <h2>Ask Preview</h2>
        <label className="field">
          <span>Participant question</span>
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
                ? "Answer + human follow-up"
                : "Answer from training"}
            </strong>
            <p>{previewAnswer.answer}</p>
            <div className="small">{previewAnswer.escalationReason}</div>
          </div>
        </div>
      </section>

      <section className="card training-panel wide">
        <h2>Training Library</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Topic</th>
              <th>Keywords</th>
              <th>Follow-up</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <strong>{entry.title}</strong>
                  <div className="small">{entry.answer}</div>
                </td>
                <td>{entry.tags.join(", ") || "none"}</td>
                <td>
                  <span
                    className={
                      entry.escalationTarget === "none"
                        ? "badge green"
                        : "badge amber"
                    }
                  >
                    {entry.escalationTarget}
                  </span>
                </td>
                <td>
                  <button
                    className="button"
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
