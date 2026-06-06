import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function PrivacyPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        subtitle="PipHackLup keeps data collection narrow and focused on hackathon operations."
      />

      <section className="card">
        <h2>Data We Process</h2>
        <p className="small">
          PipHackLup may process Discord server IDs, user IDs, display names, roles, team profiles, queue tickets, moderation
          case details, audit events, and organizer settings needed to run hackathon workflows.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>How Data Is Used</h2>
        <p className="small">
          Data is used to provide onboarding, team formation, help queues, moderation workflows, dashboards, exports, and
          bot diagnostics. PipHackLup does not sell personal data.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Message Content</h2>
        <p className="small">
          PipHackLup is designed to work without Discord's Message Content intent for the first public release. Reports and
          moderation cases may include details submitted by users or staff, such as message links or written reasons.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Retention and Removal</h2>
        <p className="small">
          Event data is retained until an organizer exports, deletes, or requests removal. To request data removal or report
          a privacy concern, open an issue at
          {" "}
          <a href="https://github.com/rupayon123/PipHackLup">github.com/rupayon123/PipHackLup</a>.
        </p>
      </section>
    </AppShell>
  );
}
