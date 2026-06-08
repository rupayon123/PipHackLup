"use client";

import { Moon, Sun } from "lucide-react";

type DashboardTheme = "light" | "dark";

export function ThemeToggle({
  onToggle,
  theme,
}: Readonly<{
  onToggle: () => void;
  theme: DashboardTheme;
}>) {
  const dark = theme === "dark";
  const Icon = dark ? Sun : Moon;

  return (
    <button
      aria-label={
        dark
          ? "Switch dashboard to light mode"
          : "Switch dashboard to dark mode"
      }
      className="theme-toggle"
      onClick={onToggle}
      type="button"
    >
      <Icon aria-hidden size={17} />
      <span>{dark ? "Light" : "Dark"}</span>
    </button>
  );
}
