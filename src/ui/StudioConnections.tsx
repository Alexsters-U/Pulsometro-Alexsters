import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  MonitorPlay,
  QrCode,
  RadioTower,
  RefreshCw,
  Server,
  Smartphone,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  pairingSchema,
  type Pairing,
  type PairingEvent,
  type PulseSnapshot,
  type Viewers,
} from "../../shared/domain";

export function StudioConnections({
  overlayUrl,
  pulse,
  viewers,
  pairing,
  notify,
  connection,
  copy,
  openOverlay,
  overlayBackground,
}: {
  overlayUrl: string;
  pulse: PulseSnapshot | null;
  viewers: Viewers | null;
  pairing: (PairingEvent & { at: number }) | null;
  notify: (text: string, error?: boolean) => void;
  connection: string;
  copy: (value: string) => void;
  openOverlay: string;
  overlayBackground: "transparent" | "panel";
}) {
  const [reveal, setReveal] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<boolean | null>(null);
  async function check() {
    setChecking(true);
    const start = performance.now();
    try {
      const response = await fetch("/api/health", {
        signal: AbortSignal.timeout(5000),
      });
      setHealth(response.ok);
      setLatency(response.ok ? Math.round(performance.now() - start) : null);
    } catch {
      setHealth(false);
      setLatency(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    void check();
  }, []);
  const receiving = pulse?.status === "connected";
  return (
    <div className="connectionsView">
      <section className="connectionOverview">
        <div>
          <span className="fieldCaption">CANAL DE PULSO</span>
          <h2>{receiving ? "Recibiendo lecturas" : "Esperando al emisor"}</h2>
          <span
            className={`connectionBadge ${receiving ? "online" : "waiting"}`}
          >
            <span className="signalDot" />
            {receiving
              ? pulse.device
              : pulse?.status === "stale"
                ? "Sin senal"
                : "Sin dispositivo"}
          </span>
        </div>
        <div className="connectionFlow">
          <span className={receiving ? "active" : ""}>
            <Smartphone size={22} />
            <small>Emisor</small>
          </span>
          <i />
          <span className={connection === "ready" ? "active" : ""}>
            <Server size={22} />
            <small>Servidor</small>
          </span>
          <i />
          <span className={viewers && viewers.obs > 0 ? "active" : ""}>
            <MonitorPlay size={22} />
            <small>OBS</small>
          </span>
        </div>
      </section>
      <section className="connectionSection">
        <div className="sectionHeading">
          <h2>
            <MonitorPlay size={18} />
            Fuente de navegador
          </h2>
          <a
            className="textButton"
            href={openOverlay}
            target="_blank"
            rel="noreferrer"
          >
            Abrir overlay
            <ExternalLink size={14} />
          </a>
        </div>
        <label className="inputLabel">
          URL para OBS
          <div className="secretField">
            <input
              type={reveal ? "text" : "password"}
              readOnly
              value={overlayUrl}
            />
            <button
              type="button"
              className="iconButton"
              title={reveal ? "Ocultar enlace" : "Mostrar enlace"}
              aria-label={reveal ? "Ocultar enlace" : "Mostrar enlace"}
              onClick={() => setReveal(!reveal)}
            >
              {reveal ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button
              type="button"
              className="iconButton"
              title="Copiar URL OBS"
              aria-label="Copiar URL OBS"
              onClick={() => copy(overlayUrl)}
            >
              <Copy size={16} />
            </button>
          </div>
        </label>
        <dl className="connectionFacts">
          <div>
            <dt>Acceso</dt>
            <dd>Solo lectura</dd>
          </div>
          <div>
            <dt>Fondo</dt>
            <dd>{overlayBackground === "panel" ? "Panel" : "Transparente"}</dd>
          </div>
          <div>
            <dt>Estado del canal</dt>
            <dd>{connection === "ready" ? "Conectado" : "Reconectando"}</dd>
          </div>
          <div>
            <dt>Overlays abiertos</dt>
            <dd data-testid="overlay-count">
              {viewers
                ? `${viewers.overlays} (${viewers.obs} en OBS)`
                : "--"}
            </dd>
          </div>
          <div>
            <dt>En programa</dt>
            <dd data-testid="overlay-live">{describeLive(viewers)}</dd>
          </div>
          <div>
            <dt>Transmision OBS</dt>
            <dd>
              {viewers?.streaming === true
                ? "En directo"
                : viewers?.streaming === false
                  ? "Sin transmitir"
                  : "Sin dato"}
            </dd>
          </div>
        </dl>
      </section>
      <section className="connectionSection">
        <div className="sectionHeading">
          <h2>
            <RadioTower size={18} />
            Emisor movil
          </h2>
          <span className="smallBadge">
            {window.location.protocol === "https:" ? "HTTPS" : "LOCAL"}
          </span>
        </div>
        <label className="inputLabel">
          Destino de la app
          <div className="secretField">
            <input readOnly value={`${window.location.origin}/api/pulse`} />
            <button
              className="iconButton"
              type="button"
              title="Copiar destino"
              aria-label="Copiar destino"
              onClick={() => copy(`${window.location.origin}/api/pulse`)}
            >
              <Copy size={16} />
            </button>
          </div>
        </label>
        <dl className="connectionFacts">
          <div>
            <dt>Dispositivo</dt>
            <dd>{pulse?.device ?? "--"}</dd>
          </div>
          <div>
            <dt>Ultima lectura</dt>
            <dd>
              {pulse?.receivedAt
                ? new Date(pulse.receivedAt).toLocaleTimeString("es-CO")
                : "--"}
            </dd>
          </div>
          <div>
            <dt>Bateria de la banda</dt>
            <dd data-testid="band-battery">
              {typeof pulse?.battery === "number"
                ? `${pulse.battery} %`
                : "No informada"}
            </dd>
          </div>
        </dl>
        <PairingPanel pairing={pairing} notify={notify} />
      </section>
      <section className="serverCheck">
        <div>
          <span className={`signalDot ${health ? "online" : "waiting"}`} />
          <span>
            {health === null
              ? "Comprobando servidor"
              : health
                ? "Servidor disponible"
                : "Servidor no disponible"}
          </span>
          {latency !== null && <b>{latency} ms</b>}
        </div>
        <button
          type="button"
          className="secondaryButton"
          disabled={checking}
          onClick={check}
        >
          {checking ? (
            <RefreshCw size={15} className="spinning" />
          ) : (
            <Check size={15} />
          )}
          Comprobar
        </button>
      </section>
    </div>
  );
}

function describeLive(viewers: Viewers | null) {
  if (!viewers || viewers.obs === 0) return "--";
  if (viewers.live > 0) return viewers.live === 1 ? "Si" : `Si (${viewers.live})`;
  return "Sin confirmar";
}

// Muestra un QR de un solo uso para que la app reciba la clave de envio.
function PairingPanel({
  pairing,
  notify,
}: {
  pairing: (PairingEvent & { at: number }) | null;
  notify: (text: string, error?: boolean) => void;
}) {
  const [active, setActive] = useState<(Pairing & { qr: string; createdAt: number }) | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((Date.parse(active.expiresAt) - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        setActive(null);
        notify("El codigo de vinculacion caduco. Genera otro si lo necesitas.");
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active, notify]);

  useEffect(() => {
    if (!pairing || !activeRef.current || pairing.at < activeRef.current.createdAt) return;
    setActive(null);
    if (pairing.status === "completed")
      notify(`App vinculada${pairing.device ? `: ${pairing.device}` : ""}.`);
  }, [pairing, notify]);

  // Al salir de Conexiones se invalida el codigo pendiente.
  useEffect(() => () => {
    if (activeRef.current)
      void fetch("/api/pairing", { method: "DELETE", keepalive: true }).catch(() => undefined);
  }, []);

  async function start() {
    setBusy(true);
    try {
      const response = await fetch("/api/pairing", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "No se pudo crear el codigo.");
      const created = pairingSchema.parse(body);
      const { toString } = await import("qrcode");
      const svg = await toString(created.link, {
        type: "svg",
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      setActive({
        ...created,
        qr: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
        createdAt: Date.now(),
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "No se pudo crear el codigo.", true);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setActive(null);
    try {
      await fetch("/api/pairing", { method: "DELETE" });
    } catch {
      notify("No se pudo cancelar el codigo; caducara en menos de 2 minutos.", true);
    }
  }

  return (
    <div className="pairingPanel">
      <div className="pairingIntro">
        <div>
          <span className="fieldCaption">VINCULAR LA APP</span>
          <p>
            Escanea el codigo desde Ajustes en Alexsters Pulse. La app recibe
            la clave de envio sin que tengas que copiarla.
          </p>
        </div>
        {active ? (
          <button type="button" className="secondaryButton" onClick={cancel}>
            <X size={15} />
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            className="secondaryButton"
            disabled={busy}
            onClick={start}
          >
            {busy ? <RefreshCw size={15} className="spinning" /> : <QrCode size={15} />}
            Mostrar codigo QR
          </button>
        )}
      </div>
      {active && (
        <div className="pairingCode">
          <img src={active.qr} alt="Codigo QR de vinculacion" width={196} height={196} />
          <div>
            <b role="timer" aria-live="off">
              Caduca en {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
            </b>
            <p>Sirve una sola vez. No lo muestres en directo: quien lo escanee recibe la clave de envio.</p>
            <p className="muted">Tambien puedes escanearlo con la camara del telefono y abrir el enlace en la app.</p>
          </div>
        </div>
      )}
    </div>
  );
}
