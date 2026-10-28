import { designSchema, type OverlayDesign } from "../../shared/domain";

export async function saveDesign(design: OverlayDesign) {
  const response = await fetch("/api/design", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(design),
  });
  if (!response.ok) {
    const body = await response.json();
    throw new Error(body.error ?? "No se pudo guardar el diseno.");
  }
}

export function loadLegacyDesign(): OverlayDesign | null {
  try {
    const raw = localStorage.getItem("pulsometro:design:v1");
    if (!raw) return null;
    const design = JSON.parse(raw);
    if (Array.isArray(design.ranges) && design.ranges.at(-1)?.max === 220) design.ranges.at(-1).max = 260;
    const result = designSchema.safeParse(design);
    return result.success ? result.data : null;
  } catch { return null; }
}
