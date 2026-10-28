import {
  designSchema,
  defaultDesign,
  type OverlayDesign,
} from "../../shared/domain";
import { themeIds, themes } from "../../shared/themes";

const KEY = "pulsometro:library:v1";
export const templates: OverlayDesign[] = themeIds.map((theme) => ({
  ...structuredClone(defaultDesign),
  id: `template-${theme}`,
  name: `${themes[theme].label} Pulse`,
  theme,
  ranges: defaultDesign.ranges.map((range, i) => ({
    ...range,
    color: {
      minecraft: ["#f8d447", "#ffb02e", "#ff4646"],
      hardcore: ["#ffe8bf", "#ffb45e", "#ff565c"],
      neon: ["#a5f3fc", "#f0abfc", "#fb7185"],
      crystal: ["#fecdd3", "#fda4af", "#f43f5e"],
    }[theme][i],
  })),
}));

export function loadLibrary(): OverlayDesign[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(items)) return [];
    return items
      .flatMap((item) => {
        const result = designSchema.safeParse(item);
        return result.success ? [result.data] : [];
      })
      .slice(0, 24);
  } catch {
    return [];
  }
}

export function persistLibrary(items: OverlayDesign[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function exportDesign(design: OverlayDesign) {
  const blob = new Blob([JSON.stringify(design, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${design.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 60) || "overlay"}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
