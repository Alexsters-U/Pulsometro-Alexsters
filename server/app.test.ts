import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { defaultDesign } from "../shared/domain.js";
import { createApplication } from "./app.js";
import { loadConfig, type AppConfig } from "./config.js";

const secrets = { adminToken: "a".repeat(40), ingestToken: "i".repeat(40), overlayToken: "o".repeat(40) };
async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), "pulse-test-"));
  const config: AppConfig = { ...secrets, host: "127.0.0.1", port: 3000, production: false,
    publicOrigin: "http://localhost:3000", dataDir, staticDir: resolve("dist"), staleAfterMs: 1000 };
  const app = await createApplication(config);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function login() {
    const response = await fetch(`${base}/api/session`, { method: "POST", headers: { Authorization: `Bearer ${secrets.adminToken}` } });
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    assert.deepEqual(await response.json(), { overlayToken: secrets.overlayToken });
    return cookie;
  }
  return { ...app, base, config, login, async dispose() { await app.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

test("separates read, administration and ingestion credentials", async () => {
  const app = await fixture();
  try {
    assert.equal((await fetch(`${app.base}/api/design`)).status, 401);
    assert.equal((await fetch(`${app.base}/api/pulse`, { method: "POST" })).status, 401);
    const readUrl = `${app.base}/api/design?token=${secrets.overlayToken}`;
    assert.equal((await fetch(readUrl)).status, 200);
    assert.equal((await fetch(readUrl, { method: "PUT" })).status, 401);
    assert.equal((await fetch(`${app.base}/api/pulse?token=${secrets.overlayToken}`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${app.base}/api/design?token=${secrets.ingestToken}`)).status, 401);
    const cookie = await app.login();
    assert.equal((await fetch(`${app.base}/api/design`, { headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${app.base}/api/design`, { method: "PUT", headers: { Cookie: cookie, Origin: "https://another.example" } })).status, 403);
    assert.equal((await fetch(`${app.base}/api/session`, { method: "DELETE", headers: { Cookie: cookie } })).status, 200);
    assert.equal((await fetch(`${app.base}/api/session`, { headers: { Cookie: cookie } })).status, 401);
  } finally { await app.dispose(); }
});

test("invalid, oversized and expired payloads do not stop the server", async () => {
  const app = await fixture();
  const headers = { Authorization: `Bearer ${secrets.ingestToken}`, "Content-Type": "application/json" };
  try {
    for (const body of ["{invalid", "null", JSON.stringify({ bpm: 500, device: "KYOTO" })]) {
      assert.equal((await fetch(`${app.base}/api/pulse`, { method: "POST", headers, body })).status, 400);
    }
    assert.equal((await fetch(`${app.base}/api/pulse`, { method: "POST", headers, body: JSON.stringify({ device: "KYOTO", bpm: 97, measuredAt: "2020-01-01T00:00:00Z" }) })).status, 422);
    assert.equal((await fetch(`${app.base}/api/pulse`, { method: "POST", headers, body: JSON.stringify({ value: "x".repeat(17000) }) })).status, 413);
    assert.equal((await fetch(`${app.base}/api/health`)).status, 200);
  } finally { await app.dispose(); }
});

test("streams live BPM, expiration and persisted design changes to an independent reader", async () => {
  const app = await fixture();
  const controller = new AbortController();
  try {
    const cookie = await app.login();
    const response = await fetch(`${app.base}/api/events?token=${secrets.overlayToken}`, { signal: controller.signal });
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const reader = response.body!.getReader();
    let buffer = "";
    async function nextEvent(predicate: (value: string) => boolean) {
      const timeout = setTimeout(() => controller.abort(), 4000);
      try {
        while (true) {
          const { value, done } = await reader.read();
          assert.equal(done, false);
          buffer += new TextDecoder().decode(value);
          if (predicate(buffer)) { const result = buffer; buffer = ""; return result; }
        }
      } finally { clearTimeout(timeout); }
    }
    await nextEvent((value) => value.includes('"status":"idle"'));
    assert.equal((await fetch(`${app.base}/api/pulse`, { method: "POST", headers: { Authorization: `Bearer ${secrets.ingestToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ bpm: 123, device: "KYOTO" }) })).status, 200);
    await nextEvent((value) => value.includes('"bpm":123'));
    const stale = await nextEvent((value) => value.includes('"status":"stale"'));
    assert.ok(stale.includes('"bpm":null'));
    const changed = { ...defaultDesign, name: "Persisted neon", theme: "neon" };
    assert.equal((await fetch(`${app.base}/api/design`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(changed) })).status, 200);
    await nextEvent((value) => value.includes('"name":"Persisted neon"'));
    assert.equal(JSON.parse(await readFile(join(app.config.dataDir, "design.json"), "utf8")).theme, "neon");
    const invalid = { ...changed, ranges: [] };
    assert.equal((await fetch(`${app.base}/api/design`, { method: "PUT", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(invalid) })).status, 400);
    controller.abort();
    await app.close();
    const restarted = await createApplication(app.config);
    restarted.server.listen(0, "127.0.0.1");
    await once(restarted.server, "listening");
    const address = restarted.server.address();
    assert.ok(address && typeof address !== "string");
    const saved = await fetch(`http://127.0.0.1:${address.port}/api/design?token=${secrets.overlayToken}`);
    assert.equal((await saved.json()).theme, "neon");
    await restarted.close();
  } finally { controller.abort(); await app.dispose(); }
});

test("serves only the SPA and its assets; removes the old sender", async () => {
  const app = await fixture();
  try {
    for (const path of ["/", "/overlay"]) {
      const response = await fetch(`${app.base}${path}`);
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('<div id="root">'));
    }
    for (const path of ["/sender", "/.env", "/data/design.json", "/assets/%2e%2e%2fpackage.json"]) {
      assert.equal((await fetch(`${app.base}${path}`)).status, 404);
    }
    const html = await (await fetch(app.base)).text();
    const asset = html.match(/src="([^"]+\.js)"/)![1];
    assert.equal((await fetch(app.base + asset)).status, 200);
  } finally { await app.dispose(); }
});

test("production refuses missing, reused or insecure configuration", () => {
  assert.throws(() => loadConfig({}), /Configuracion invalida/);
  const env = { ADMIN_TOKEN: secrets.adminToken, INGEST_TOKEN: secrets.ingestToken, OVERLAY_TOKEN: secrets.overlayToken, NODE_ENV: "production" };
  assert.throws(() => loadConfig(env), /HTTPS/);
  assert.throws(() => loadConfig({ ...env, PUBLIC_ORIGIN: "https://pulse.example.com", INGEST_TOKEN: secrets.adminToken }), /diferentes/);
  assert.equal(loadConfig({ ...env, PUBLIC_ORIGIN: "https://pulse.example.com" }).production, true);
});
