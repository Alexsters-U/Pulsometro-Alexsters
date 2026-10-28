export const themeIds = ["minecraft", "hardcore", "neon", "crystal"] as const;
export type ThemeId = typeof themeIds[number];

export const themes: Record<ThemeId, { label: string; asset: string; pixelated: boolean; totem: boolean }> = {
  minecraft: { label: "Minecraft", asset: "/assets/hearts/minecraft-classic-v1.png", pixelated: true, totem: true },
  hardcore: { label: "Hardcore", asset: "/assets/hearts/minecraft-hardcore-v1.png", pixelated: true, totem: true },
  neon: { label: "Neon", asset: "/assets/hearts/neon-circuit-v1.png", pixelated: false, totem: false },
  crystal: { label: "Cristal", asset: "/assets/hearts/ruby-crystal-v1.png", pixelated: false, totem: false },
};
