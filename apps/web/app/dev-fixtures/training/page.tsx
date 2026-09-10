import { BookOpenCheck } from "lucide-react";
import { notFound } from "next/navigation";
import type {
  HackathonKnowledgeEntry,
  KnowledgeAssistantSettings,
} from "@piphacklup/core";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { TrainingConsole } from "@/app/training/TrainingConsole";
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

const entries: HackathonKnowledgeEntry[] = [
  {
    id: "know_fixture01",
    guildId: guild.id,
    title: "Where is participant check-in?",
    answer: "Participant check-in is beside the main auditorium from 8:00 AM.",
    tags: ["check-in", "registration"],
    escalationTarget: "none",
    createdBy: session.user.id,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
  },
];

const settings: KnowledgeAssistantSettings = {
  minConfidence: 45,
  publicAnswers: true,
};

export default async function TrainingFixture({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ installation?: string }>;
}>) {
  assertDevelopmentFixture();
  const { installation } = await searchParams;
  const botInstallation = installation === "unknown" ? null : false;
  return (
    <AppShell session={session}>
      <PageHeader
        eyebrow="Event answers"
        title="Train North Star Hackathon"
        subtitle="Write the answers participants should receive, choose when a person should step in, and test the result before event day."
      />
      <section className="training-context">
        <BookOpenCheck aria-hidden size={22} />
        <div>
          <strong>1 saved answer</strong>
          <span>
            Changes apply only to North Star Hackathon. PipHackLup filters
            instruction-override attempts before saving them.
          </span>
        </div>
        <span
          className={`badge ${botInstallation === null ? "gray" : "amber"}`}
        >
          {botInstallation === null
            ? "Install status unavailable"
            : "Bot not installed"}
        </span>
      </section>
      <TrainingConsole
        guild={guild}
        initialEntries={entries}
        initialSettings={settings}
        botInstallation={botInstallation}
      />
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
