import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Appearance = "dark" | "light";
const KEY = "pulsometro:appearance:v1";

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored === "dark" || stored === "light") return stored;
    } catch {
      /* Storage may be disabled by the browser. */
    }
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, appearance);
    } catch {
      /* Keep the preference for this session. */
    }
  }, [appearance]);
  return [appearance, setAppearance] as const;
}

export function AppearanceSwitch({
  value,
  onChange,
}: {
  value: Appearance;
  onChange: (value: Appearance) => void;
}) {
  return (
    <div
      className="appearanceSwitch"
      role="group"
      aria-label="Apariencia de la web"
    >
      <button
        type="button"
        className="iconButton"
        aria-label="Tema claro"
        title="Tema claro"
        aria-pressed={value === "light"}
        onClick={() => onChange("light")}
      >
        <Sun size={17} />
      </button>
      <button
        type="button"
        className="iconButton"
        aria-label="Tema oscuro"
        title="Tema oscuro"
        aria-pressed={value === "dark"}
        onClick={() => onChange("dark")}
      >
        <Moon size={17} />
      </button>
    </div>
  );
}
