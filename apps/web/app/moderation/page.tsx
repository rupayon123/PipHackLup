import { defaultAutoModTemplates } from "@piphacklup/core";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { demoCases } from "@/lib/demo-data";

export default function ModerationPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="Moderation"
        title="Cases, reports, and AutoMod setup"
        subtitle="Keep event safety work visible without requiring message-content scanning for the first release."
      />

      <div className="grid two">
        <section className="card">
          <h2>Open cases</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Case</th>
                <th>Action</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {demoCases.map((moderationCase) => (
                <tr key={moderationCase.id}>
                  <td>
                    <code>{moderationCase.id}</code>
                  </td>
                  <td>
                    <span className="badge rose">{moderationCase.action}</span>
                  </td>
                  <td>{moderationCase.reason}</td>
                  <td>{moderationCase.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>AutoMod templates</h2>
          <div className="steps">
            {defaultAutoModTemplates().map((rule) => (
              <div className="step" key={rule.name}>
                <span className="step-icon">A</span>
                <div>
                  <strong>{rule.name}</strong>
                  <div className="small">{rule.goal}</div>
                </div>
                <span className="badge amber">{rule.trigger}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
