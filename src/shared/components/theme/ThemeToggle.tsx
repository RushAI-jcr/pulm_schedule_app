"use client";

import { useEffect, useState } from "react";
import { applyTheme, resolveInitialTheme, type ThemeMode } from "@/config/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    applyTheme(initialTheme);
    setTheme(initialTheme);
    setReady(true);
  }, []);

  const nextTheme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition-colors hover:bg-gray-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      onClick={() => {
        const updatedTheme = theme === "light" ? "dark" : "light";
        applyTheme(updatedTheme);
        setTheme(updatedTheme);
      }}
      aria-label={ready ? `Switch to ${nextTheme} mode` : "Toggle theme"}
    >
      {ready ? `${nextTheme === "dark" ? "Dark" : "Light"} mode` : "Theme"}
    </button>
  );
}
