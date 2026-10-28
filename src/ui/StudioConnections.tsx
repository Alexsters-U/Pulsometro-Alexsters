import {
  Check,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  MonitorPlay,
  RadioTower,
  RefreshCw,
  Server,
  Smartphone,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PulseSnapshot } from "../../shared/domain";

export function StudioConnections({
  overlayUrl,
  pulse,
  connection,
  copy,
  openOverlay,
  overlayBackground,
}: {
  overlayUrl: string;
  pulse: PulseSnapshot | null;
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
          <span>
            <Smartphone size={22} />
            <small>Emisor</small>
          </span>
          <i />
          <span className={connection === "ready" ? "active" : ""}>
            <Server size={22} />
            <small>Servidor</small>
          </span>
          <i />
          <span>
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
            <dt>Autenticacion</dt>
            <dd>Clave de envio</dd>
          </div>
        </dl>
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
