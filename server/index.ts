import { createApplication } from "./app.js";
import { loadConfig } from "./config.js";

try {
  const config = loadConfig(process.env);
  const app = await createApplication(config);
  app.server.listen(config.port, config.host, () => {
    console.log(`Pulsometro listo en http://${config.host}:${config.port}`);
  });
  app.server.on("error", (error) => { console.error(error.message); process.exit(1); });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const force = setTimeout(() => process.exit(1), 10000);
    force.unref();
    await app.close();
    clearTimeout(force);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
} catch (error) {
  console.error(error instanceof Error ? error.message : "No se pudo iniciar el servidor.");
  process.exit(1);
}
