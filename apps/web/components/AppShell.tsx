import { BarChart3, ClipboardList, Download, FileText, Shield, Users, Wrench } from "lucide-react";
import Link from "next/link";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/setup", label: "Setup", icon: Wrench },
  { href: "/queues", label: "Queues", icon: ClipboardList },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/moderation", label: "Moderation", icon: Shield },
  { href: "/privacy", label: "Privacy", icon: FileText }
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link className="brand" href="/dashboard">
          <span className="brand-mark">P</span>
          <span>PipHackLup</span>
        </Link>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Icon aria-hidden size={18} />
                {item.label}
              </Link>
            );
          })}
          <a href="/api/export" title="Download CSV export">
            <Download aria-hidden size={18} />
            Export
          </a>
        </nav>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
