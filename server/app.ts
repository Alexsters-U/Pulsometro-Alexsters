import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import {
  designSchema, pairRequestSchema, presenceSchema, pulseInputSchema,
  type PulseSnapshot, type Viewers,
} from "../shared/domain.js";
import type { AppConfig } from "./config.js";
import { createDesignStore } from "./design-store.js";
import { HttpError, json, readJson, sameSecret } from "./http.js";

const SESSION_MS = 8 * 60 * 60 * 1000;
const PAIRING_MS = 2 * 60 * 1000;
const mime: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".ico": "image/x-icon", ".ogg": "audio/ogg" };

type StreamClient = {
  id: string;
  kind: "editor" | "overlay";
  obs: boolean;
  active: boolean | null;
  visible: boolean | null;
  streaming: boolean | null;
};

export async function createApplication(config: AppConfig) {
  const designs = await createDesignStore(config.dataDir);
  const clients = new Map<ServerResponse, StreamClient>();
  let latest: { bpm: number; device: string; battery: number | null; receivedAt: string; expiresAt: number } | null = null;
  const sessions = new Map<string, number>();
  let loginFailures = 0;
  let loginWindow = Date.now();
  // Un unico codigo de vinculacion vigente; se guarda solo su hash.
  let pairing: { hash: Buffer; expiresAt: number } | null = null;
  let pairFailures = 0;
  let pairWindow = Date.now();

  function snapshot(): PulseSnapshot {
    const status = !latest ? "idle" : Date.now() >= latest.expiresAt ? "stale" : "connected";
    return { status, bpm: status === "connected" ? latest!.bpm : null, device: latest?.device ?? null,
      receivedAt: latest?.receivedAt ?? null, staleAfterMs: config.staleAfterMs, battery: latest?.battery ?? null };
  }
  let lastStatus = snapshot().status;

  function viewers(): Viewers {
    let overlays = 0, obs = 0, live = 0, editors = 0;
    let streaming: boolean | null = null;
    for (const client of clients.values()) {
      if (client.kind === "editor") { editors++; continue; }
      overlays++;
      if (!client.obs) continue;
      obs++;
      if (client.active === true) live++;
      if (client.streaming !== null) streaming = Boolean(streaming) || client.streaming;
    }
    return { overlays, obs, live, streaming, editors };
  }

  function send(client: ServerResponse, message: string) {
    if (!client.write(message)) { client.destroy(); clients.delete(client); }
  }

  function broadcast(event: string, data: unknown, kind?: StreamClient["kind"]) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const [client, info] of clients) if (!kind || info.kind === kind) send(client, message);
  }

  let viewersTimer: NodeJS.Timeout | null = null;
  function viewersChanged() {
    // Agrupa conexiones y avisos de OBS cercanos en un solo evento para el editor.
    if (viewersTimer) return;
    viewersTimer = setTimeout(() => { viewersTimer = null; broadcast("viewers", viewers(), "editor"); }, 100);
    viewersTimer.unref();
  }

  function sessionCookieValue(request: IncomingMessage) {
    return request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("pulse_session="))?.slice("pulse_session=".length);
  }

  function authenticated(request: IncomingMessage) {
    const cookie = sessionCookieValue(request);
    return Boolean(cookie && (sessions.get(cookie) ?? 0) > Date.now());
  }

  function requireAdmin(request: IncomingMessage) {
    if (!authenticated(request)) throw new HttpError(401, "Inicia sesion en el editor.");
  }

  function hasReadToken(url: URL) {
    return sameSecret(url.searchParams.get("token") ?? "", config.overlayToken);
  }

  function requireReader(request: IncomingMessage, url: URL) {
    if (!authenticated(request) && !hasReadToken(url)) {
      throw new HttpError(401, "Enlace de overlay invalido.");
    }
  }

  function requireOrigin(request: IncomingMessage) {
    const origin = request.headers.origin;
    const developmentOrigin = `http://${request.headers.host}`;
    if (origin && origin !== config.publicOrigin && (config.production || origin !== developmentOrigin)) {
      throw new HttpError(403, "Origen no permitido.");
    }
  }

  function sessionCookie(value: string, maxAge: number) {
    return `pulse_session=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${config.production ? "; Secure" : ""}`;
  }

  const hashCode = (code: string) => createHash("sha256").update(code).digest();

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const url = new URL(request.url ?? "/", "http://localhost");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
    if (request.method === "GET" && url.pathname === "/api/health") {
      json(response, 200, { ok: true }); return;
    }
    if (url.pathname === "/api/session") {
      if (request.method === "POST") {
        requireOrigin(request);
        if (Date.now() - loginWindow > 60000) { loginFailures = 0; loginWindow = Date.now(); }
        if (loginFailures >= 10) throw new HttpError(429, "Demasiados intentos. Espera un minuto.");
        if (!sameSecret(request.headers.authorization ?? "", `Bearer ${config.adminToken}`)) {
          loginFailures++; throw new HttpError(401, "Clave de administracion incorrecta.");
        }
        loginFailures = 0;
        const session = createHmac("sha256", config.adminToken).update(randomBytes(32)).digest("hex");
        sessions.set(session, Date.now() + SESSION_MS);
        response.setHeader("Set-Cookie", sessionCookie(session, SESSION_MS / 1000));
      } else if (request.method === "DELETE") {
        requireOrigin(request);
        requireAdmin(request);
        sessions.delete(sessionCookieValue(request)!);
        response.setHeader("Set-Cookie", sessionCookie("", 0));
        json(response, 200, { ok: true }); return;
      } else if (request.method === "GET") {
        requireAdmin(request);
      } else throw new HttpError(405, "Metodo no permitido.");
      json(response, 200, { overlayToken: config.overlayToken }); return;
    }
    if (url.pathname === "/api/pairing") {
      // El editor genera un codigo de un solo uso que la app canjea por INGEST_TOKEN.
      requireOrigin(request); requireAdmin(request);
      if (request.method === "POST") {
        const code = randomBytes(24).toString("base64url");
        const expiresAt = Date.now() + PAIRING_MS;
        pairing = { hash: hashCode(code), expiresAt };
        json(response, 200, { code, link: `${config.publicOrigin}/pair#code=${code}`, expiresAt: new Date(expiresAt).toISOString() });
        return;
      }
      if (request.method === "DELETE") {
        if (pairing) broadcast("pairing", { status: "cancelled", device: null }, "editor");
        pairing = null;
        json(response, 200, { ok: true }); return;
      }
      throw new HttpError(405, "Metodo no permitido.");
    }
    if (request.method === "POST" && url.pathname === "/api/pair") {
      if (Date.now() - pairWindow > 60000) { pairFailures = 0; pairWindow = Date.now(); }
      if (pairFailures >= 20) throw new HttpError(429, "Demasiados intentos. Espera un minuto.");
      const parsed = pairRequestSchema.safeParse(await readJson(request));
      const valid = parsed.success && pairing !== null && Date.now() < pairing.expiresAt &&
        sameSecret(hashCode(parsed.data.code).toString("hex"), pairing.hash.toString("hex"));
      if (!valid || !parsed.success) {
        pairFailures++;
        throw new HttpError(401, "Codigo de vinculacion invalido o caducado. Genera uno nuevo en el editor.");
      }
      pairing = null;
      broadcast("pairing", { status: "completed", device: parsed.data.device ?? null }, "editor");
      json(response, 200, { origin: config.publicOrigin, ingestToken: config.ingestToken }); return;
    }
    if (request.method === "POST" && url.pathname === "/api/pulse") {
      if (!sameSecret(request.headers.authorization ?? "", `Bearer ${config.ingestToken}`)) throw new HttpError(401, "Token de envio invalido.");
      const parsed = pulseInputSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new HttpError(400, "BPM o dispositivo invalido.");
      const input = parsed.data;
      const now = Date.now();
      const measuredAt = input.measuredAt ? Date.parse(input.measuredAt) : now;
      if (measuredAt > now + 5000 || now - measuredAt >= config.staleAfterMs) {
        throw new HttpError(422, "La medicion es antigua o tiene una fecha futura.");
      }
      latest = { bpm: input.bpm, device: input.device, receivedAt: new Date(now).toISOString(),
        battery: input.battery ?? (latest?.device === input.device ? latest.battery : null),
        expiresAt: Math.min(now, measuredAt) + config.staleAfterMs };
      lastStatus = "connected";
      broadcast("pulse", snapshot());
      json(response, 200, { ok: true, viewers: viewers() }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/pulse") {
      requireReader(request, url); json(response, 200, snapshot()); return;
    }
    if (request.method === "POST" && url.pathname === "/api/presence") {
      // El overlay informa si corre dentro de OBS y si su escena esta en programa.
      requireOrigin(request); requireReader(request, url);
      const parsed = presenceSchema.safeParse(await readJson(request));
      if (!parsed.success) throw new HttpError(400, "Estado de presencia invalido.");
      const entry = [...clients.values()].find((client) => client.id === parsed.data.id && client.kind === "overlay");
      if (!entry) throw new HttpError(404, "Conexion de overlay no encontrada.");
      entry.obs = true;
      for (const key of ["active", "visible", "streaming"] as const) {
        if (parsed.data[key] !== undefined) entry[key] = parsed.data[key] ?? null;
      }
      viewersChanged();
      json(response, 200, { ok: true }); return;
    }
    if (url.pathname === "/api/design") {
      if (request.method === "GET") {
        requireReader(request, url); json(response, 200, designs.get()); return;
      }
      if (request.method === "PUT") {
        requireOrigin(request); requireAdmin(request);
        const parsed = designSchema.safeParse(await readJson(request));
        if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
        await designs.save(parsed.data);
        broadcast("design", parsed.data);
        json(response, 200, parsed.data); return;
      }
      throw new HttpError(405, "Metodo no permitido.");
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      requireReader(request, url);
      // Con clave de lectura es un overlay; sin ella, el editor autenticado por cookie.
      const info: StreamClient = { id: randomBytes(12).toString("base64url"),
        kind: url.searchParams.has("token") ? "overlay" : "editor",
        obs: url.searchParams.get("client") === "obs", active: null, visible: null, streaming: null };
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" });
      clients.set(response, info);
      response.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ id: info.id })}\n\nevent: design\ndata: ${JSON.stringify(designs.get())}\n\nevent: pulse\ndata: ${JSON.stringify(snapshot())}\n\n`);
      if (info.kind === "editor") response.write(`event: viewers\ndata: ${JSON.stringify(viewers())}\n\n`);
      viewersChanged();
      response.on("close", () => { clients.delete(response); viewersChanged(); });
      return;
    }
    if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Ruta no encontrada.");
    if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Metodo no permitido.");
    const isPage = url.pathname === "/" || url.pathname === "/overlay" || url.pathname === "/pair";
    if (!isPage && !url.pathname.startsWith("/assets/")) throw new HttpError(404, "Ruta no encontrada.");
    const filename = isPage ? resolve(config.staticDir, "index.html") : resolve(config.staticDir, `.${decodeURIComponent(url.pathname)}`);
    const contentType = isPage ? "text/html; charset=utf-8" : mime[extname(filename)];
    if (!filename.startsWith(`${config.staticDir}${sep}`) || !contentType) throw new HttpError(404, "Archivo no encontrado.");
    try {
      const file = await stat(filename);
      if (!file.isFile()) throw new HttpError(404, "Archivo no encontrado.");
      const body = request.method === "HEAD" ? null : await readFile(filename);
      response.writeHead(200, { "Content-Type": contentType, "Content-Length": file.size,
        "Cache-Control": isPage ? "no-cache" : "public, max-age=31536000, immutable" });
      response.end(body);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HttpError(404, "Archivo no encontrado. Ejecuta npm run build.");
      throw error;
    }
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (response.headersSent || response.destroyed) { response.destroy(); return; }
      if (error instanceof HttpError) json(response, error.status, { error: error.message });
      else { console.error("Error procesando solicitud:", error instanceof Error ? error.message : "error interno"); json(response, 500, { error: "Error interno del servidor." }); }
    });
  });
  const expiry = setInterval(() => {
    const pulse = snapshot();
    if (pulse.status !== lastStatus) { lastStatus = pulse.status; broadcast("pulse", pulse); }
    for (const [session, expiresAt] of sessions) if (expiresAt <= Date.now()) sessions.delete(session);
    if (pairing && pairing.expiresAt <= Date.now()) pairing = null;
  }, 500);
  const heartbeat = setInterval(() => {
    for (const client of clients.keys()) send(client, ": heartbeat\n\n");
  }, 15000);
  expiry.unref(); heartbeat.unref();

  return {
    server,
    async close() {
      clearInterval(expiry); clearInterval(heartbeat);
      if (viewersTimer) clearTimeout(viewersTimer);
      for (const client of clients.keys()) client.end();
      await designs.flush();
      if (server.listening) await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}
