import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { setupSteps } from "@/lib/demo-data";

export default function SetupPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Server setup"
        title="Make a hackathon server understandable"
        subtitle="The v1 setup flow tracks the app, intents, invite permissions, test server, onboarding mode, queue templates, and dashboard deployment."
        actions={
          <a className="button primary" href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden size={16} />
            Developer Portal
          </a>
        }
      />

      <section className="card">
        <h2>Launch checklist</h2>
        <div className="steps">
          {setupSteps.map((step) => {
            const done = step.status === "done";
            const Icon = done ? CheckCircle2 : Circle;
            return (
              <div className="step" key={step.label}>
                <span className="step-icon">
                  <Icon aria-hidden size={16} />
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <div className="small">{step.detail}</div>
                </div>
                <span className={`badge ${done ? "green" : "amber"}`}>{done ? "Done" : "Todo"}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Invite permissions</h2>
        <p className="small">
          Use scopes <strong>bot</strong> and <strong>applications.commands</strong>. Grant View Channels, Send Messages, Embed Links,
          Attach Files, Read Message History, Manage Roles, Manage Nicknames, Manage Channels, Manage Threads, Moderate Members,
          Manage Guild, and optional Kick/Ban.
        </p>
      </section>
    </AppShell>
  );
}
