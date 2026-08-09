import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function PrivacyPage() {
  return (
    <AppShell authRequired={false}>
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle="PipHackLup keeps data collection narrow and focused on hackathon operations."
      />

      <section className="card">
        <h2>Data We Process</h2>
        <p className="small">
          PipHackLup may process Discord server IDs, user IDs, display names,
          roles, team profiles, queue tickets, moderation case details, audit
          events, and organizer settings needed to run hackathon workflows.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>How Data Is Used</h2>
        <p className="small">
          Data is used to provide onboarding, team formation, help queues,
          moderation workflows, dashboards, exports, and bot diagnostics.
          PipHackLup does not sell personal data.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Message Content</h2>
        <p className="small">
          PipHackLup is designed to work without Discord's Message Content
          intent for the first public release. Reports and moderation cases may
          include details submitted by users or staff, such as message links or
          written reasons. A question that needs human follow-up may be shared
          with authorized event staff in a staff-only channel. Choosing a
          private reply keeps the response out of the participant channel; it
          does not hide an escalated question from the staff handling it.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Retention and Removal</h2>
        <p className="small">
          Removing PipHackLup from a Discord server does not delete that
          server&apos;s saved event data; the data is retained so an organizer
          can reinstall the bot later. To request deletion or report a privacy
          concern, use the repository&apos;s{" "}
          <a href="https://github.com/rupayon123/PipHackLup/security/advisories/new">
            private reporting page
          </a>
          . Do not post Discord user or server IDs, moderation-case details, or
          other personal data in a public GitHub issue.
        </p>
      </section>
    </AppShell>
  );
}
