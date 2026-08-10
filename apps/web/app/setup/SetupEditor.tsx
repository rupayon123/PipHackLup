"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  LockKeyhole,
  MapPin,
  RefreshCw,
  Save,
  Users,
} from "lucide-react";
import type { EventConfig } from "@piphacklup/core";
import type { ManagedDiscordGuild } from "@/lib/discord-auth";
import { useRouter } from "next/navigation";

const roleFields = [
  {
    key: "newcomer",
    label: "Newcomer role",
    help: "People who joined but have not finished gated onboarding.",
  },
  {
    key: "participant",
    label: "Participant role",
    help: "People with access to the active hackathon workspace.",
  },
  {
    key: "mentor",
    label: "Mentor role",
    help: "Helpers who can work non-staff support queues.",
  },
  {
    key: "judge",
    label: "Judge role",
    help: "Judges who can work judging requests.",
  },
  {
    key: "organizer",
    label: "Organizer role",
    help: "Event leads with full PipHackLup staff access.",
  },
  {
    key: "moderator",
    label: "Moderator role",
    help: "Safety staff who can use moderation and staff queues.",
  },
] as const;

const channelFields = [
  { key: "welcome", label: "Welcome", help: "First stop for new members." },
  { key: "rules", label: "Rules", help: "Rules and acknowledgement panel." },
  {
    key: "announcements",
    label: "Announcements",
    help: "Official event updates.",
  },
  { key: "helpDesk", label: "Help desk", help: "Participant support." },
  {
    key: "teamCatalog",
    label: "Team catalog",
    help: "Team profiles and matching.",
  },
  {
    key: "moderationLog",
    label: "Moderation log",
    help: "Verified staff-private moderation activity.",
  },
  {
    key: "auditLog",
    label: "Audit log",
    help: "Verified staff-private organizer activity.",
  },
] as const;

type RoleKey = (typeof roleFields)[number]["key"];
type ChannelKey = (typeof channelFields)[number]["key"];
type SelectionState<K extends string> = Record<K, string>;
type DiscordOption = { id: string; name: string };
type DiscordOptions = {
  roles: DiscordOption[];
  channels: DiscordOption[];
};
type OptionsStatus = "loading" | "ready" | "error";
type Notice = { kind: "status" | "warning" | "error"; message: string };

interface SetupEditorProps {
  guild: ManagedDiscordGuild;
  initialConfig: EventConfig;
  protectedResourceCount: number;
}

export function SetupEditor({
  guild,
  initialConfig,
  protectedResourceCount,
}: Readonly<SetupEditorProps>) {
  const router = useRouter();
  const eventNameRef = useRef<HTMLInputElement>(null);
  const teamSizeMinRef = useRef<HTMLInputElement>(null);
  const [eventName, setEventName] = useState(initialConfig.eventName);
  const [onboardingMode, setOnboardingMode] = useState<
    EventConfig["onboardingMode"]
  >(initialConfig.onboardingMode);
  const [teamSizeMin, setTeamSizeMin] = useState(
    String(initialConfig.teamSizeMin),
  );
  const [teamSizeMax, setTeamSizeMax] = useState(
    String(initialConfig.teamSizeMax),
  );
  const [roles, setRoles] = useState<SelectionState<RoleKey>>(() =>
    makeSelections(roleFields, initialConfig.roles),
  );
  const [channels, setChannels] = useState<SelectionState<ChannelKey>>(() =>
    makeSelections(channelFields, initialConfig.channels),
  );
  const [discordOptions, setDiscordOptions] = useState<DiscordOptions | null>(
    null,
  );
  const [optionsStatus, setOptionsStatus] = useState<OptionsStatus>("loading");
  const [optionsAttempt, setOptionsAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{
    eventName?: string;
    teamSize?: string;
  }>({});
  const [notice, setNotice] = useState<Notice>({
    kind: "status",
    message: `Ready to configure ${guild.name}.`,
  });

  useEffect(() => {
    const controller = new AbortController();
    setOptionsStatus("loading");
    setDiscordOptions(null);

    async function loadOptions() {
      try {
        const response = await fetch(
          `/api/discord/guilds/${encodeURIComponent(guild.id)}/options`,
          { signal: controller.signal },
        );
        const body = (await response.json().catch(() => null)) as unknown;
        if (!response.ok || !isDiscordOptions(body)) {
          throw new Error("options_unavailable");
        }
        if (!controller.signal.aborted) {
          setDiscordOptions(body);
          setOptionsStatus("ready");
        }
      } catch {
        if (controller.signal.aborted) return;
        console.error("PipHackLup could not load Discord setup choices.");
        setOptionsStatus("error");
        setNotice({
          kind: "warning",
          message:
            "Live Discord roles and channels are unavailable. You can retry, or clear old selections before saving basic event details.",
        });
      }
    }

    void loadOptions();
    return () => controller.abort();
  }, [guild.id, optionsAttempt]);

  const selectedCount =
    Object.values(roles).filter(Boolean).length +
    Object.values(channels).filter(Boolean).length;

  function validateForm(): {
    eventName: string;
    teamSizeMin: number;
    teamSizeMax: number;
  } | null {
    const nextErrors: { eventName?: string; teamSize?: string } = {};
    const trimmedName = eventName.trim();
    const minimum = Number(teamSizeMin);
    const maximum = Number(teamSizeMax);

    if (!trimmedName) nextErrors.eventName = "Enter the event name.";
    else if (trimmedName.length > 80) {
      nextErrors.eventName = "Keep the event name to 80 characters or fewer.";
    }
    if (
      !Number.isInteger(minimum) ||
      !Number.isInteger(maximum) ||
      minimum < 1 ||
      maximum > 20 ||
      minimum > maximum
    ) {
      nextErrors.teamSize =
        "Use whole numbers from 1 to 20, with the minimum no larger than the maximum.";
    }

    setErrors(nextErrors);
    if (nextErrors.eventName) {
      eventNameRef.current?.focus();
      return null;
    }
    if (nextErrors.teamSize) {
      teamSizeMinRef.current?.focus();
      return null;
    }
    return {
      eventName: trimmedName,
      teamSizeMin: minimum,
      teamSizeMax: maximum,
    };
  }

  async function saveConfiguration(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = validateForm();
    if (!valid) {
      setNotice({
        kind: "error",
        message: "Check the highlighted event settings, then save again.",
      });
      return;
    }

    setBusy(true);
    setNotice({ kind: "status", message: `Saving ${guild.name}…` });
    try {
      const response = await fetch(
        `/api/discord/guilds/${encodeURIComponent(guild.id)}/config`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...valid,
            onboardingMode,
            roles: nullEmptySelections(roles),
            channels: nullEmptySelections(channels),
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        warning?: string | null;
      } | null;
      if (!response.ok) throw new Error(setupErrorMessage(body?.error));

      setEventName(valid.eventName);
      setNotice({
        kind: body?.warning ? "warning" : "status",
        message: body?.warning
          ? `Settings were saved for ${guild.name}, but the activity-log entry could not be recorded.`
          : `Settings saved for ${guild.name}. Run /setup in Discord to create or reconcile the workspace.`,
      });
      router.refresh();
    } catch (error) {
      setNotice({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "The server settings could not be saved. Refresh and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="setup-editor" onSubmit={saveConfiguration} noValidate>
      <div className="setup-editor-heading">
        <div>
          <p className="eyebrow">Event operations desk</p>
          <h2>Shape this server's workspace</h2>
          <p>
            Name the event, choose how people enter, and map the Discord places
            PipHackLup should use. Nothing here changes another server.
          </p>
        </div>
        <span className="badge blue">{selectedCount} Discord choices</span>
      </div>

      <p
        className={`setup-notice ${notice.kind}`}
        role={notice.kind === "error" ? "alert" : "status"}
        aria-live={notice.kind === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        {notice.message}
      </p>

      <section className="setup-editor-section" aria-labelledby="event-basics">
        <div className="setup-section-label">
          <CalendarDays aria-hidden size={20} />
          <div>
            <h3 id="event-basics">Event basics</h3>
            <p>The details participants will see throughout the workspace.</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field setup-field-wide">
            <span>Event name</span>
            <input
              ref={eventNameRef}
              value={eventName}
              maxLength={80}
              autoComplete="organization"
              aria-invalid={Boolean(errors.eventName)}
              aria-describedby={
                errors.eventName ? "event-name-error" : undefined
              }
              onChange={(event) => {
                setEventName(event.target.value);
                if (errors.eventName) {
                  setErrors(({ eventName: _eventName, ...current }) => current);
                }
              }}
            />
            {errors.eventName ? (
              <span className="field-error" id="event-name-error">
                {errors.eventName}
              </span>
            ) : null}
          </label>

          <label className="field">
            <span>Onboarding</span>
            <select
              value={onboardingMode}
              onChange={(event) =>
                setOnboardingMode(
                  event.target.value as EventConfig["onboardingMode"],
                )
              }
            >
              <option value="guided">Guided — open access with prompts</option>
              <option value="gated">Gated — acknowledge rules first</option>
            </select>
          </label>

          <fieldset className="setup-team-size">
            <legend>Team size</legend>
            <div>
              <label className="field">
                <span>Minimum</span>
                <input
                  ref={teamSizeMinRef}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={teamSizeMin}
                  aria-invalid={Boolean(errors.teamSize)}
                  aria-describedby={
                    errors.teamSize ? "team-size-error" : "team-size-help"
                  }
                  onChange={(event) => {
                    setTeamSizeMin(event.target.value);
                    if (errors.teamSize) {
                      setErrors(
                        ({ teamSize: _teamSize, ...current }) => current,
                      );
                    }
                  }}
                />
              </label>
              <span aria-hidden>to</span>
              <label className="field">
                <span>Maximum</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={teamSizeMax}
                  aria-invalid={Boolean(errors.teamSize)}
                  aria-describedby={
                    errors.teamSize ? "team-size-error" : "team-size-help"
                  }
                  onChange={(event) => {
                    setTeamSizeMax(event.target.value);
                    if (errors.teamSize) {
                      setErrors(
                        ({ teamSize: _teamSize, ...current }) => current,
                      );
                    }
                  }}
                />
              </label>
            </div>
            <p className="field-help" id="team-size-help">
              PipHackLup uses this range for team matching.
            </p>
            {errors.teamSize ? (
              <p className="field-error" id="team-size-error">
                {errors.teamSize}
              </p>
            ) : null}
          </fieldset>
        </div>
      </section>

      <section
        className="setup-editor-section"
        aria-labelledby="discord-map-heading"
      >
        <div className="setup-section-label">
          <MapPin aria-hidden size={20} />
          <div>
            <h3 id="discord-map-heading">Discord map</h3>
            <p>
              Choose existing roles and channels, or leave a choice blank so
              /setup can create a safe PipHackLup default.
            </p>
          </div>
        </div>

        <div className={`setup-options-state ${optionsStatus}`}>
          {optionsStatus === "loading" ? (
            <>
              <span className="spin" aria-hidden>
                <RefreshCw size={16} />
              </span>
              Checking this server's live Discord choices…
            </>
          ) : optionsStatus === "ready" ? (
            <>
              <span className="status-dot" aria-hidden />
              Live choices loaded from {guild.name}
            </>
          ) : (
            <>
              <span>Live choices could not be loaded.</span>
              <button
                className="button"
                type="button"
                onClick={() => setOptionsAttempt((attempt) => attempt + 1)}
              >
                <RefreshCw aria-hidden size={15} />
                Try again
              </button>
            </>
          )}
        </div>

        <div className="setup-mapping-grid">
          <fieldset className="setup-mapping-column">
            <legend>
              <Users aria-hidden size={17} />
              Roles
            </legend>
            {roleFields.map((field) => (
              <DiscordSelect
                key={field.key}
                id={`setup-role-${field.key}`}
                label={field.label}
                help={field.help}
                value={roles[field.key]}
                options={discordOptions?.roles ?? []}
                loading={optionsStatus === "loading"}
                optionsLoaded={optionsStatus === "ready"}
                onChange={(value) =>
                  setRoles((current) => ({ ...current, [field.key]: value }))
                }
              />
            ))}
          </fieldset>

          <fieldset className="setup-mapping-column">
            <legend>
              <MapPin aria-hidden size={17} />
              Channels
            </legend>
            {channelFields.map((field) => (
              <DiscordSelect
                key={field.key}
                id={`setup-channel-${field.key}`}
                label={field.label}
                help={field.help}
                value={channels[field.key]}
                options={discordOptions?.channels ?? []}
                loading={optionsStatus === "loading"}
                optionsLoaded={optionsStatus === "ready"}
                onChange={(value) =>
                  setChannels((current) => ({
                    ...current,
                    [field.key]: value,
                  }))
                }
              />
            ))}
          </fieldset>
        </div>
      </section>

      <section
        className="setup-protected-resources"
        aria-labelledby="bot-assets"
      >
        <LockKeyhole aria-hidden size={20} />
        <div>
          <h3 id="bot-assets">Bot-created resources stay protected</h3>
          <p>
            {protectedResourceCount
              ? `${protectedResourceCount} internal Discord ${protectedResourceCount === 1 ? "reference is" : "references are"} recorded. PipHackLup manages those IDs itself so a dashboard edit cannot point panels at the wrong server.`
              : "No internal panel or category references are recorded yet. Running /setup will create and record them safely."}
          </p>
        </div>
      </section>

      <div className="setup-editor-actions">
        <p>
          Saving changes configuration only. Run <strong>/setup</strong> in
          Discord afterward to create or reconcile roles, channels, and panels.
        </p>
        <button className="button primary" type="submit" disabled={busy}>
          <Save aria-hidden size={16} />
          {busy ? "Saving…" : "Save event settings"}
        </button>
      </div>
    </form>
  );
}

function DiscordSelect({
  id,
  label,
  help,
  value,
  options,
  loading,
  optionsLoaded,
  onChange,
}: Readonly<{
  id: string;
  label: string;
  help: string;
  value: string;
  options: DiscordOption[];
  loading: boolean;
  optionsLoaded: boolean;
  onChange: (value: string) => void;
}>) {
  const valueIsMissing = Boolean(
    value && !options.some((option) => option.id === value),
  );
  return (
    <label className="field setup-discord-field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        disabled={loading}
        aria-describedby={`${id}-help`}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Create or choose during /setup</option>
        {valueIsMissing ? (
          <option value={value}>
            {optionsLoaded
              ? "Saved choice is no longer available"
              : "Saved choice (not verified)"}
          </option>
        ) : null}
        {options.map((option) => (
          <option value={option.id} key={option.id}>
            {option.name}
          </option>
        ))}
      </select>
      <span className="field-help" id={`${id}-help`}>
        {help}
      </span>
    </label>
  );
}

function makeSelections<K extends string>(
  fields: readonly { key: K }[],
  source: Partial<Record<K, string>>,
): SelectionState<K> {
  return Object.fromEntries(
    fields.map(({ key }) => [key, source[key] ?? ""]),
  ) as SelectionState<K>;
}

function nullEmptySelections<K extends string>(
  selections: SelectionState<K>,
): Record<K, string | null> {
  return Object.fromEntries(
    Object.entries(selections).map(([key, value]) => [key, value || null]),
  ) as Record<K, string | null>;
}

function setupErrorMessage(code: string | undefined): string {
  switch (code) {
    case "missing_manage_server":
      return "Your Discord account no longer has Manage Server permission.";
    case "untrusted_request_origin":
      return "The save request could not be verified. Refresh and try again.";
    case "rate_limited":
      return "Too many saves were attempted. Wait a moment and try again.";
    case "invalid_event_name":
      return "Enter an event name no longer than 80 characters.";
    case "invalid_team_size":
      return "Choose a valid team-size range from 1 to 20.";
    case "discord_option_no_longer_available":
      return "A selected Discord role or channel no longer exists. Reload the live choices and try again.";
    case "discord_options_unavailable":
      return "Discord could not verify the selected roles and channels. Check that the bot is installed, then try again.";
    case "server_config_unavailable":
    case "server_config_save_failed":
      return "The saved server configuration is temporarily unavailable. Nothing was changed.";
    default:
      return "The server settings could not be saved. Refresh and try again.";
  }
}

function isDiscordOptions(value: unknown): value is DiscordOptions {
  if (
    !isRecord(value) ||
    !Array.isArray(value.roles) ||
    !Array.isArray(value.channels)
  ) {
    return false;
  }
  return [...value.roles, ...value.channels].every(
    (option) =>
      isRecord(option) &&
      typeof option.id === "string" &&
      typeof option.name === "string",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
