import { resolve } from "node:path";
import { z } from "zod";

const environmentSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PUBLIC_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
  DATA_DIR: z.string().default("./data"),
  PULSE_STALE_MS: z.coerce.number().int().min(1000).max(60000).default(10000),
  ADMIN_TOKEN: z.string().min(32),
  INGEST_TOKEN: z.string().min(32),
  OVERLAY_TOKEN: z.string().min(32),
});

export function loadConfig(environment: NodeJS.ProcessEnv) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Configuracion invalida: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}. Revisa .env.example.`);
  }
  const env = result.data;
  if (new Set([env.ADMIN_TOKEN, env.INGEST_TOKEN, env.OVERLAY_TOKEN]).size !== 3) {
    throw new Error("ADMIN_TOKEN, INGEST_TOKEN y OVERLAY_TOKEN deben ser diferentes.");
  }
  const publicUrl = new URL(env.PUBLIC_ORIGIN);
  if (!["http:", "https:"].includes(publicUrl.protocol) || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
    throw new Error("PUBLIC_ORIGIN debe contener solo protocolo y dominio, sin rutas ni credenciales.");
  }
  if (env.NODE_ENV === "production" && publicUrl.protocol !== "https:") {
    throw new Error("PUBLIC_ORIGIN debe usar HTTPS en produccion.");
  }
  return {
    host: env.HOST, port: env.PORT, production: env.NODE_ENV === "production",
    publicOrigin: publicUrl.origin, dataDir: resolve(env.DATA_DIR),
    staticDir: resolve("dist"), staleAfterMs: env.PULSE_STALE_MS,
    adminToken: env.ADMIN_TOKEN, ingestToken: env.INGEST_TOKEN, overlayToken: env.OVERLAY_TOKEN,
  };
}
export type AppConfig = ReturnType<typeof loadConfig>;
