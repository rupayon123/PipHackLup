import { AlertTriangle, ServerOff } from "lucide-react";

export function WorkspaceState({
  kind,
  serverName,
}: Readonly<{
  kind: "no-server" | "server-unavailable" | "data-unavailable";
  serverName?: string;
}>) {
  const unavailable = kind === "data-unavailable";
  const serverUnavailable = kind === "server-unavailable";
  const Icon = unavailable || serverUnavailable ? AlertTriangle : ServerOff;
  return (
    <section
      className="workspace-state"
      role={unavailable || serverUnavailable ? "alert" : "status"}
    >
      <Icon aria-hidden size={26} />
      <div>
        <h2>
          {unavailable
            ? `We could not load ${serverName ?? "this server"}`
            : serverUnavailable
              ? "That server is no longer available"
              : "No manageable server is available"}
        </h2>
        <p>
          {unavailable
            ? "Your saved data was not changed. Refresh the page, and try again in a moment."
            : serverUnavailable
              ? "Discord no longer lists it as a server you can manage. Nothing from another server was loaded; choose a different workspace or reconnect Discord."
              : "Create a Discord server or ask its owner for Manage Server permission, then reconnect your account."}
        </p>
      </div>
      <a
        className="button"
        href={
          unavailable
            ? ""
            : serverUnavailable
              ? "/dashboard"
              : "/api/auth/discord/start"
        }
      >
        {unavailable
          ? "Try again"
          : serverUnavailable
            ? "Choose another server"
            : "Reconnect Discord"}
      </a>
    </section>
  );
}
