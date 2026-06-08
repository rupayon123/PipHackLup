"use client";

import {
  BarChart3,
  ClipboardList,
  Download,
  FileText,
  MessageCircleQuestion,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

type DashboardTheme = "light" | "dark";

const themeStorageKey = "piphacklup-dashboard-theme";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: BarChart3 },
  { href: "/setup", label: "Setup", icon: Wrench },
  { href: "/training", label: "Q&A Training", icon: MessageCircleQuestion },
  { href: "/queues", label: "Queues", icon: ClipboardList },
  { href: "/teams", label: "Teams", icon: Users },
  { href: "/moderation", label: "Moderation", icon: Shield },
  { href: "/privacy", label: "Privacy", icon: FileText },
];

export function AppShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<DashboardTheme>("light");

  useEffect(() => {
    const saved = window.localStorage.getItem(themeStorageKey);
    const initial =
      saved === "dark" || saved === "light"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    window.localStorage.setItem(themeStorageKey, next);
  }

  return (
    <div className="shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="sidebar-head">
          <Link className="brand" href="/dashboard">
            <span className="brand-mark">P</span>
            <span>PipHackLup</span>
          </Link>
          <ThemeToggle onToggle={toggleTheme} theme={theme} />
        </div>
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
