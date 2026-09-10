import { ServerCog } from "lucide-react";
import { notFound } from "next/navigation";
import type { EventConfig } from "@piphacklup/core";
import { SetupEditor } from "@/app/setup/SetupEditor";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import type { DiscordSession, ManagedDiscordGuild } from "@/lib/discord-auth";

const guild: ManagedDiscordGuild = {
  id: "1512918151313231984",
  name: "North Star Hackathon",
  isOwner: true,
  permissions: "32",
  canManage: true,
};

const session: DiscordSession = {
  user: {
    id: "1512918151313231983",
    username: "eventorganizer",
    globalName: "Event Organizer",
  },
  guilds: [guild],
  issuedAt: Date.now(),
};

const config: EventConfig = {
  guildId: guild.id,
  eventName: "North Star Hackathon",
  onboardingMode: "gated",
  teamSizeMin: 2,
  teamSizeMax: 5,
  queueKinds: ["mentor", "tech", "judging", "staff"],
  roles: { participant: "1512918151313231986" },
  channels: { helpDesk: "1512918151313231987" },
  resources: { eventCategoryId: "1512918151313231988" },
};

export default function SetupFixture() {
  assertDevelopmentFixture();
  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="Server setup"
        title="Set up North Star Hackathon"
        subtitle="Build the event workspace organizers and participants will use in Discord."
      />
      <SetupEditor
        guild={guild}
        initialConfig={config}
        protectedResourceCount={1}
      />
      <section className="setup-command-card">
        <ServerCog aria-hidden size={24} />
        <div>
          <p className="eyebrow">Then run this in North Star Hackathon</p>
          <h2>/setup</h2>
          <p>
            PipHackLup will create or reconcile the saved workspace without
            duplicating resources.
          </p>
        </div>
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
