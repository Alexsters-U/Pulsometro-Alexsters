import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";

const { values: options } = parseArgs({
  options: {
    production: { type: "boolean", default: false },
    origin: { type: "string" },
  },
});
if (options.origin && !options.production)
  throw new Error("--origin solo se usa con --production.");
const production = options.production;
const origin = new URL(
  options.origin ??
    (production
      ? "https://pulsestudio.alexsters.works"
      : "http://127.0.0.1:3000"),
);
if (
  (production && origin.protocol !== "https:") ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
) {
  throw new Error(
    "El dominio de produccion debe ser HTTPS, sin ruta, parametros ni credenciales.",
  );
}
const destination = production ? ".env.production" : ".env";
const values = {
  HOST: "127.0.0.1",
  PORT: production ? "3010" : "3000",
  NODE_ENV: production ? "production" : "development",
  ...(production ? { APP_PORT: "3010" } : {}),
  PUBLIC_ORIGIN: origin.origin,
  DATA_DIR: "./data",
  PULSE_STALE_MS: "10000",
  ADMIN_TOKEN: randomBytes(32).toString("hex"),
  INGEST_TOKEN: randomBytes(32).toString("hex"),
  OVERLAY_TOKEN: randomBytes(32).toString("hex"),
};
try {
  await writeFile(
    destination,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    `${destination} creado. Las claves no se muestran ni se suben a Git.`,
  );
} catch (error) {
  if (error.code === "EEXIST")
    console.log(`${destination} ya existe; se conservo sin cambios.`);
  else throw error;
}
