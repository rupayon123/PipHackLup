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
      <Moon aria-hidden className="theme-icon theme-icon-dark" size={17} />
      <Sun aria-hidden className="theme-icon theme-icon-light" size={17} />
      <span className="theme-label theme-label-dark">Dark</span>
      <span className="theme-label theme-label-light">Light</span>
    </button>
  );
}
