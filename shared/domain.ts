import { z } from "zod";
import { themeIds } from "./themes.js";

const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const rangeSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(40),
  min: z.number().int().min(0).max(260),
  max: z.number().int().min(0).max(260),
  color,
  glow: color,
  shake: z.number().min(0).max(8),
  scale: z.number().min(0.5).max(2),
});

export const designSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  theme: z.preprocess((value) => value === "clean" ? "minecraft" : value, z.enum(themeIds)),
  showHeart: z.boolean(),
  showLabel: z.boolean(),
  background: z.enum(["transparent", "panel"]),
  heartColor: color,
  totem: z.object({
    enabled: z.boolean(), sound: z.boolean(), volume: z.number().min(0).max(1),
  }).default({ enabled: true, sound: true, volume: 0.6 }),
  ranges: z.array(rangeSchema).min(1).max(12),
}).refine(({ ranges }) =>
  ranges.length > 0 && ranges[0].min === 0 && ranges.at(-1)!.max === 260 &&
  new Set(ranges.map((range) => range.id)).size === ranges.length &&
  ranges.every((range, i) => range.min <= range.max &&
    (i === 0 || range.min === ranges[i - 1].max + 1)),
  "Los rangos deben cubrir 0 a 260 BPM en orden, sin huecos ni solapamientos.",
);

export type OverlayDesign = z.infer<typeof designSchema>;
export type PulseRange = OverlayDesign["ranges"][number];
export type OverlayTheme = OverlayDesign["theme"];
export type PulseSource = "simulator" | "live";

export const defaultDesign: OverlayDesign = {
  id: "default", name: "Minecraft Pulse", theme: "minecraft",
  showHeart: true, showLabel: false, background: "transparent", heartColor: "#ef1d25",
  totem: { enabled: true, sound: true, volume: 0.6 },
  ranges: [
    { id: "rest", label: "Calma", min: 0, max: 89, color: "#f8d447", glow: "#8fd6ff", shake: 0, scale: 1 },
    { id: "active", label: "Activo", min: 90, max: 129, color: "#ffb02e", glow: "#ffcc65", shake: 1, scale: 1.05 },
    { id: "intense", label: "Intenso", min: 130, max: 260, color: "#ff4646", glow: "#ff5a5a", shake: 4, scale: 1.12 },
  ],
};

export const pulseInputSchema = z.object({
  bpm: z.number().int().min(25).max(260),
  device: z.string().min(1).max(80),
  measuredAt: z.string().datetime({ offset: true }).optional(),
});

export const pulseSnapshotSchema = z.object({
  bpm: z.number().int().min(25).max(260).nullable(),
  device: z.string().nullable(),
  receivedAt: z.string().nullable(),
  status: z.enum(["idle", "connected", "stale"]),
  staleAfterMs: z.number().positive(),
});
export type PulseSnapshot = z.infer<typeof pulseSnapshotSchema>;
