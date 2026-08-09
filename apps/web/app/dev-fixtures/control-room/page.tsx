import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import {
  ServerManager,
  type ManagedServerView,
} from "@/components/ServerManager";
import type { DiscordSession } from "@/lib/discord-auth";

const session: DiscordSession = {
  user: {
    id: "1512918151313231983",
    username: "eventorganizer",
    globalName: "Event Organizer",
  },
  guilds: [
    {
      id: "1512918151313231984",
      name: "North Star Hackathon",
      isOwner: true,
      permissions: "32",
      canManage: true,
    },
    {
      id: "1512918151313231985",
      name: "Weekend Builders",
      isOwner: false,
      permissions: "32",
      canManage: true,
    },
    {
      id: "1512918151313231986",
      name: "Campus Demo Day",
      isOwner: true,
      permissions: "32",
      canManage: true,
    },
  ],
  issuedAt: Date.now(),
};

const servers: ManagedServerView[] = session.guilds.map((guild, index) => ({
  ...guild,
  installed: index === 0 ? true : index === 1 ? false : null,
  installUrl:
    "https://discord.com/oauth2/authorize?client_id=1512918151313231983&scope=bot+applications.commands",
}));

export default function ControlRoomFixture() {
  assertDevelopmentFixture();
  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="Organizer workspace"
        title="Your Discord servers"
        subtitle="Choose the server you are working on. PipHackLup will show what is installed and what needs your attention."
      />
      <section
        className="workspace-summary"
        aria-label="Discord connection summary"
      >
        <div className="workspace-summary-intro">
          <CheckCircle2 aria-hidden size={20} />
          <div>
            <strong>Connected as Event Organizer</strong>
            <span>
              Only servers you own or can manage are shown. Permissions are
              checked again before every change.
            </span>
          </div>
        </div>
        <dl>
          <div>
            <dt>Servers you manage</dt>
            <dd>3</dd>
          </div>
          <div>
            <dt>PipHackLup installed</dt>
            <dd>1</dd>
          </div>
          <div>
            <dt>Bot management</dt>
            <dd>Available</dd>
          </div>
        </dl>
      </section>
      <section className="server-manager-section" aria-label="Discord servers">
        <ServerManager servers={servers} />
      </section>
    </AppShell>
  );
}

function assertDevelopmentFixture(): void {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.PIPHACKLUP_UI_TEST_MODE !== "1"
  ) {
    notFound();
  }
}
