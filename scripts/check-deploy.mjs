import { readFile } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { loadConfig } from "../dist-server/server/config.js";

try {
  const { values } = parseArgs({
    options: { env: { type: "string", default: ".env.production" } },
  });
  const environment = parseEnv(await readFile(values.env, "utf8"));
  if (environment.NODE_ENV !== "production")
    throw new Error("NODE_ENV debe ser production.");
  const config = loadConfig(environment);
  const port = Number(environment.APP_PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("APP_PORT debe ser un puerto valido.");
  console.log(
    `Configuracion valida para ${config.publicOrigin}; puerto privado ${port}.`,
  );
  console.log(
    "No verifica DNS, TLS ni acceso al VPS. Las variables exportadas de la shell pueden prevalecer en Compose.",
  );
} catch (error) {
  console.error(
    error.code === "ENOENT"
      ? "Falta .env.production. Generala en el VPS antes de desplegar."
      : error.message,
  );
  process.exitCode = 1;
}
