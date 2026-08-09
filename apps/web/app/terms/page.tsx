import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";

export default function TermsPage() {
  return (
    <AppShell authRequired={false}>
      <PageHeader
        eyebrow="Legal"
        title="Terms of Service"
        subtitle="These terms describe how PipHackLup may be used by hackathon organizers, mentors, judges, and participants."
      />

      <section className="card">
        <h2>Use of PipHackLup</h2>
        <p className="small">
          PipHackLup is provided to help Discord communities run hackathons with
          onboarding, role setup, queues, team formation, moderation cases, and
          organizer dashboards. You are responsible for using the bot in a way
          that follows Discord's Terms of Service, Discord's Developer Policy,
          and the rules of your event.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Organizer Responsibilities</h2>
        <p className="small">
          Server owners and organizers control how PipHackLup is installed,
          configured, and used in their Discord servers. Organizers are
          responsible for notifying participants about event rules, moderation
          expectations, and any exports or records they choose to keep.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Availability</h2>
        <p className="small">
          PipHackLup is an open-source service provided as-is. We work to keep
          it reliable, but do not guarantee uninterrupted operation during
          maintenance, provider outages, or active development.
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Contact</h2>
        <p className="small">
          For bugs and feature requests that contain no private data, use the
          public GitHub repository at{" "}
          <a href="https://github.com/rupayon123/PipHackLup">
            github.com/rupayon123/PipHackLup
          </a>
          . For data deletion or privacy concerns, use the repository&apos;s{" "}
          <a href="https://github.com/rupayon123/PipHackLup/security/advisories/new">
            private reporting page
          </a>
          . Never put Discord IDs, moderation-case details, or personal data in
          a public issue.
        </p>
      </section>
    </AppShell>
  );
}
