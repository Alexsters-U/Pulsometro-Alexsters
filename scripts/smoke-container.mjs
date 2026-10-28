import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { defaultDesign } from "../dist-server/shared/domain.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: { image: { type: "string", default: "pulse-studio:local-check" } },
});
const project = `pulse-check-${randomBytes(6).toString("hex")}`;
const environment = {
  ...process.env,
  ADMIN_TOKEN: randomBytes(32).toString("hex"),
  INGEST_TOKEN: randomBytes(32).toString("hex"),
  OVERLAY_TOKEN: randomBytes(32).toString("hex"),
  PUBLIC_ORIGIN: "https://pulse.example.com",
  NODE_ENV: "production",
};
delete environment.COMPOSE_FILE;
delete environment.COMPOSE_PROJECT_NAME;
let composeArgs;
let owned = false;
function docker(args) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(result.stderr || "Docker no completo la comprobacion.");
  return result.stdout;
}
const compose = (...args) => docker([...composeArgs, ...args]);
const pause = (milliseconds) =>
  new Promise((done) => setTimeout(done, milliseconds));
async function freePort() {
  const server = createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const port = server.address().port;
  await new Promise((done) => server.close(done));
  return port;
}
async function healthy(base) {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${base}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch {}
    await pause(500);
  }
  throw new Error("El contenedor no alcanzo un estado saludable.");
}
try {
  assert.equal(
    docker([
      "ps",
      "-aq",
      "--filter",
      `label=com.docker.compose.project=${project}`,
    ]).trim(),
    "",
  );
  await mkdir(join(root, "test-results"), { recursive: true });
  const folder = await mkdtemp(join(root, "test-results", "deploy-smoke-"));
  environment.APP_PORT = String(await freePort());
  const proxyPort = await freePort();
  const envFile = join(folder, ".env.production");
  const proxyFile = join(folder, "nginx.conf");
  await writeFile(
    envFile,
    [
      "NODE_ENV",
      "PUBLIC_ORIGIN",
      "ADMIN_TOKEN",
      "INGEST_TOKEN",
      "OVERLAY_TOKEN",
      "APP_PORT",
    ]
      .map((key) => `${key}=${environment[key]}`)
      .join("\n"),
    { mode: 0o600 },
  );
  await writeFile(
    proxyFile,
    (
      await readFile(join(root, "deploy/nginx-site.conf.example"), "utf8")
    ).replace("http://127.0.0.1:3010", "http://pulsometro:3000"),
  );
  const override = join(folder, "compose.check.yaml");
  await writeFile(
    override,
    `services:\n  pulsometro:\n    image: ${JSON.stringify(values.image)}\n  proxy:\n    image: nginx:stable-alpine\n    depends_on:\n      pulsometro:\n        condition: service_healthy\n    ports:\n      - "127.0.0.1:${proxyPort}:80"\n    volumes:\n      - type: bind\n        source: ${JSON.stringify(proxyFile.replaceAll("\\", "/"))}\n        target: /etc/nginx/conf.d/default.conf\n        read_only: true\n`,
  );
  composeArgs = [
    "compose",
    "-f",
    join(root, "compose.yaml"),
    "-f",
    override,
    "--env-file",
    envFile,
    "-p",
    project,
  ];
  compose("config", "--quiet");
  owned = true;
  compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "90");
  const base = `http://127.0.0.1:${proxyPort}`;
  await healthy(base);
  const manifest = JSON.parse(compose("config", "--format", "json"));
  assert.equal(manifest.services.pulsometro.read_only, true);
  assert.equal(manifest.services.pulsometro.ports[0].host_ip, "127.0.0.1");
  assert.equal(manifest.services.pulsometro.environment.NODE_ENV, "production");
  assert.equal((await fetch(`${base}/api/design`)).status, 401);
  const login = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.ADMIN_TOKEN}`,
      Origin: environment.PUBLIC_ORIGIN,
    },
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
  const headers = {
    Cookie: cookie.split(";")[0],
    Origin: environment.PUBLIC_ORIGIN,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(`${base}/api/design`, {
        method: "PUT",
        headers: { ...headers, Origin: "https://untrusted.example" },
        body: JSON.stringify(defaultDesign),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(`${base}/api/design`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ...defaultDesign,
          name: "VPS persistence check",
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${base}/api/pulse`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${environment.INGEST_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bpm: 97,
          device: "Container check",
          measuredAt: new Date().toISOString(),
        }),
      })
    ).status,
    200,
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `${base}/api/events?token=${environment.OVERLAY_TOKEN}`,
      { signal: controller.signal },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    const reader = response.body.getReader();
    let text = "";
    while (!text.includes('"bpm":97')) {
      const next = await reader.read();
      assert.equal(next.done, false);
      text += new TextDecoder().decode(next.value);
    }
    assert.ok(text.includes("event: design"));
    assert.ok(text.includes("VPS persistence check"));
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
  const isolation = compose(
    "exec",
    "-T",
    "pulsometro",
    "node",
    "--input-type=module",
    "-e",
    `import{existsSync,writeFileSync}from'node:fs';if(process.getuid()===0)throw Error('root');for(const p of ['/app/.env','/app/.env.production','/app/android','/app/.tooling'])if(existsSync(p))throw Error('private files');let blocked=false;try{writeFileSync('/app/not-writable','x')}catch{blocked=true}if(!blocked)throw Error('writable root');console.log('Isolated runtime verified')`,
  );
  assert.ok(isolation.includes("Isolated runtime verified"));
  compose("restart", "pulsometro");
  await healthy(base);
  const persisted = await fetch(
    `${base}/api/design?token=${environment.OVERLAY_TOKEN}`,
  );
  assert.equal((await persisted.json()).name, "VPS persistence check");
  const pulse = await fetch(
    `${base}/api/pulse?token=${environment.OVERLAY_TOKEN}`,
  );
  assert.equal((await pulse.json()).bpm, null);
  console.log(
    "Docker/Nginx verificados: salud, autenticacion, cookie Secure, origen, SSE, usuario no root, aislamiento y persistencia tras reinicio.",
  );
  console.log(
    "Prueba local HTTP detras del proxy. No verifica DNS ni certificados del VPS.",
  );
} catch (error) {
  // Avoid echoing credential-bearing request URLs from failed assertions.
  console.error(
    `Fallo en la prueba del contenedor: ${error.code ?? error.name}. Revisa el stack temporal ${project}.`,
  );
  process.exitCode = 1;
} finally {
  if (owned && /^pulse-check-[a-f0-9]{12}$/.test(project)) {
    compose("down", "--volumes", "--remove-orphans", "--timeout", "10");
  }
}
