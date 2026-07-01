"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Props = {
  /** Extra classes for the button (e.g. to style over the dark sidebar). */
  className?: string;
  /** Render just the icon (for compact bars). */
  iconOnly?: boolean;
};

export function ThemeToggle({ className, iconOnly = false }: Props) {
  // Start as null until mounted so we never render an icon that disagrees
  // with the class the anti-flash script already set on <html>.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.theme = next ? "dark" : "light";
    } catch {
      // ignore storage errors (private mode, etc.)
    }
    setIsDark(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
      className={
        className ??
        (iconOnly
          ? "flex h-9 w-9 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          : "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/5 hover:text-white")
      }
    >
      <span className="h-4 w-4 shrink-0">
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </span>
      {!iconOnly && (isDark ? "Modo claro" : "Modo oscuro")}
    </button>
  );
}
