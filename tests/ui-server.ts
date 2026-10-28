import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createApplication } from "../server/app.js";
import { loadConfig } from "../server/config.js";

const dataDir = await mkdtemp(join(tmpdir(), "pulse-ui-"));
const app = await createApplication(loadConfig({ PORT: "18764", DATA_DIR: dataDir,
  ADMIN_TOKEN: "a".repeat(40), INGEST_TOKEN: "i".repeat(40), OVERLAY_TOKEN: "o".repeat(40) }));
app.server.listen(18764, "127.0.0.1");
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await rm(dataDir, { recursive: true, force: true });
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
