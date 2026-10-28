import { createHmac, randomBytes } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import { designSchema, pulseInputSchema, type PulseSnapshot } from "../shared/domain.js";
import type { AppConfig } from "./config.js";
import { createDesignStore } from "./design-store.js";
import { HttpError, json, readJson, sameSecret } from "./http.js";

const SESSION_MS = 8 * 60 * 60 * 1000;
const mime: Record<string, string> = { ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".ttf": "font/ttf", ".ico": "image/x-icon", ".ogg": "audio/ogg" };

export async function createApplication(config: AppConfig) {
  const designs = await createDesignStore(config.dataDir);
  const clients = new Set<ServerResponse>();
  let latest: { bpm: number; device: string; receivedAt: string; expiresAt: number } | null = null;
  const sessions = new Map<string, number>();
  let loginFailures = 0;
  let loginWindow = Date.now();

  function snapshot(): PulseSnapshot {
    const status = !latest ? "idle" : Date.now() >= latest.expiresAt ? "stale" : "connected";
    return { status, bpm: status === "connected" ? latest!.bpm : null, device: latest?.device ?? null,
      receivedAt: latest?.receivedAt ?? null, staleAfterMs: config.staleAfterMs };
  }

  function broadcast(event: string, data: unknown) {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      if (!client.write(message)) { client.destroy(); clients.delete(client); }
    }
  }

  function authenticated(request: IncomingMessage) {
    const cookie = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith("pulse_session="))?.slice("pulse_session=".length);
    return Boolean(cookie && (sessions.get(cookie) ?? 0) > Date.now());
  }

  function requireAdmin(request: IncomingMessage) {
    if (!authenticated(request)) throw new HttpError(401, "Inicia sesion en el editor.");
  }

  function requireReader(request: IncomingMessage, url: URL) {
    if (!authenticated(request) && !sameSecret(url.searchParams.get("token") ?? "", config.overlayToken)) {
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
        const cookie = request.headers.cookie!.split(";").map((item) => item.trim()).find((item) => item.startsWith("pulse_session="))!;
        sessions.delete(cookie.slice("pulse_session=".length));
        response.setHeader("Set-Cookie", sessionCookie("", 0));
        json(response, 200, { ok: true }); return;
      } else if (request.method === "GET") {
        requireAdmin(request);
      } else throw new HttpError(405, "Metodo no permitido.");
      json(response, 200, { overlayToken: config.overlayToken }); return;
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
        expiresAt: Math.min(now, measuredAt) + config.staleAfterMs };
      lastStatus = "connected";
      broadcast("pulse", snapshot());
      json(response, 200, { ok: true }); return;
    }
    if (request.method === "GET" && url.pathname === "/api/pulse") {
      requireReader(request, url); json(response, 200, snapshot()); return;
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
      response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" });
      response.write(`retry: 3000\nevent: design\ndata: ${JSON.stringify(designs.get())}\n\nevent: pulse\ndata: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(response);
      response.on("close", () => clients.delete(response));
      return;
    }
    if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Ruta no encontrada.");
    if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Metodo no permitido.");
    const isPage = url.pathname === "/" || url.pathname === "/overlay";
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
  let lastStatus = snapshot().status;
  const expiry = setInterval(() => {
    const pulse = snapshot();
    if (pulse.status !== lastStatus) { lastStatus = pulse.status; broadcast("pulse", pulse); }
    for (const [session, expiresAt] of sessions) if (expiresAt <= Date.now()) sessions.delete(session);
  }, 500);
  const heartbeat = setInterval(() => {
    for (const client of clients) if (!client.write(": heartbeat\n\n")) client.destroy();
  }, 15000);
  expiry.unref(); heartbeat.unref();

  return {
    server,
    async close() {
      clearInterval(expiry); clearInterval(heartbeat);
      for (const client of clients) client.end();
      await designs.flush();
      if (server.listening) await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
    },
  };
}
