import {
  Activity,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RadioTower,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type {
  OverlayDesign,
  PulseSnapshot,
  PulseSource,
} from "../../shared/domain";
import { Overlay } from "./Overlay";

type Props = {
  design: OverlayDesign;
  bpm: number | null;
  source: PulseSource;
  status: string;
  connection: string;
  pulse: PulseSnapshot | null;
  automatic: boolean;
  previewNonce: number;
  onSource: (source: PulseSource) => void;
  onAutomatic: (value: boolean) => void;
  onBpm: (bpm: number) => void;
};

export function StudioPreview(props: Props) {
  const { design, bpm, source, automatic } = props;
  const [background, setBackground] = useState("checker");
  const [zoom, setZoom] = useState(125);
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(1.25);
  const stage = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [trail, setTrail] = useState<number[]>([]);
  const lastSource = useRef(source);

  useEffect(() => {
    if (!expanded) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [expanded]);

  useLayoutEffect(() => {
    const fit = () => {
      if (!stage.current || !content.current) return;
      setScale(
        Math.min(
          zoom / 100,
          Math.max(
            0.3,
            (stage.current.clientWidth - 40) /
              Math.max(1, content.current.offsetWidth),
          ),
        ),
      );
    };
    const observer = new ResizeObserver(fit);
    if (stage.current) observer.observe(stage.current);
    if (content.current) observer.observe(content.current);
    fit();
    return () => observer.disconnect();
  }, [zoom]);

  useEffect(() => {
    const changed = lastSource.current !== source;
    lastSource.current = source;
    if (bpm === null) {
      if (changed) setTrail([]);
      return;
    }
    setTrail((current) =>
      changed
        ? [bpm]
        : current.at(-1) === bpm
          ? current
          : [...current.slice(-39), bpm],
    );
  }, [bpm, source]);

  const activeRange = design.ranges.find(
    (range) => bpm !== null && bpm >= range.min && bpm <= range.max,
  );
  const connected = props.pulse?.status === "connected";
  const message =
    source === "simulator"
      ? "Sesion de prueba"
      : props.connection === "error"
        ? "Reconectando al servidor"
        : connected
          ? props.pulse?.device
          : props.pulse?.status === "stale"
            ? "Sin senal del emisor"
            : "Esperando al emisor";
  const low = trail.length ? Math.min(...trail) : null;
  const high = trail.length ? Math.max(...trail) : null;
  const average = trail.length
    ? Math.round(trail.reduce((sum, item) => sum + item, 0) / trail.length)
    : null;
  const minY = (low ?? 60) - 8;
  const span = Math.max(20, (high ?? 100) - minY + 8);
  const points = trail
    .map(
      (value, index) =>
        `${10 + (index / Math.max(1, trail.length - 1)) * 580},${76 - ((value - minY) / span) * 62}`,
    )
    .join(" ");

  return (
    <section
      className={`studioPreview${expanded ? " expanded" : ""}`}
      aria-label="Vista previa"
    >
      <div className="sectionHeading canvasHeading">
        <h2>
          Vista previa{" "}
          <span className="smallBadge">
            {source === "simulator" ? "PRUEBA" : "EN VIVO"}
          </span>
        </h2>
        <div className="canvasTools">
          <div
            className="canvasSwatches"
            role="group"
            aria-label="Fondo de la vista previa"
          >
            {(
              [
                ["checker", "Transparente"],
                ["dark", "Oscuro"],
                ["light", "Claro"],
                ["green", "Croma"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`canvasSwatch ${value}`}
                aria-label={`Fondo ${label.toLowerCase()}`}
                title={label}
                aria-pressed={background === value}
                onClick={() => setBackground(value)}
              />
            ))}
          </div>
          <div className="zoomTools">
            <button
              type="button"
              className="iconButton small"
              title="Reducir zoom"
              aria-label="Reducir zoom"
              disabled={zoom <= 50}
              onClick={() => setZoom(Math.max(50, zoom - 25))}
            >
              <Minus size={15} />
            </button>
            <output>{Math.round(scale * 100)}%</output>
            <button
              type="button"
              className="iconButton small"
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
              disabled={zoom >= 175}
              onClick={() => setZoom(Math.min(175, zoom + 25))}
            >
              <Plus size={15} />
            </button>
          </div>
          <button
            type="button"
            className="iconButton small"
            title={expanded ? "Reducir lienzo" : "Ampliar lienzo"}
            aria-label={expanded ? "Reducir lienzo" : "Ampliar lienzo"}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>
      <div className="previewStage" ref={stage} data-background={background}>
        <span className="stageCorner topLeft" />
        <span className="stageCorner bottomRight" />
        <div
          className="previewScale"
          ref={content}
          style={{ transform: `scale(${scale})` }}
        >
          <Overlay
            bpm={bpm}
            design={design}
            sourceStatus={props.status}
            previewNonce={props.previewNonce}
          />
        </div>
        <div className="stageCaption">
          <span>{design.name || "Sin nombre"}</span>
          <span>
            {background === "checker"
              ? "ALFA"
              : background === "green"
                ? "CROMA"
                : background === "dark"
                  ? "OSCURO"
                  : "CLARO"}
          </span>
        </div>
      </div>
      <div className="previewMonitor">
        <div className="monitorReading">
          <span className="fieldCaption">PULSO ACTUAL</span>
          <div className="statusLine">
            <Activity size={20} />
            <strong>{bpm ?? "--"}</strong>
            <span>BPM</span>
          </div>
          <span
            className="phaseBadge"
            style={
              {
                "--range-color": activeRange?.color ?? "#88958e",
              } as CSSProperties
            }
          >
            {bpm === null ? "Sin senal" : (activeRange?.label ?? "Sin rango")}
          </span>
        </div>
        <div className="pulseTrace">
          <div className="traceHeading">
            <span>{message}</span>
            <span>{trail.length} cambios</span>
          </div>
          <svg
            viewBox="0 0 600 90"
            preserveAspectRatio="none"
            role="img"
            aria-label="Evolucion reciente de BPM"
          >
            <path className="traceGrid" d="M0 25H600 M0 55H600 M0 85H600" />
            {trail.length > 0 && (
              <polyline points={points} className="traceLine" />
            )}
          </svg>
          <div className="traceStats">
            <span>
              MIN <b>{low ?? "--"}</b>
            </span>
            <span>
              MEDIA <b>{average ?? "--"}</b>
            </span>
            <span>
              MAX <b>{high ?? "--"}</b>
            </span>
          </div>
        </div>
      </div>
      <div className="simulationBar">
        <div
          className="segmented"
          role="group"
          aria-label="Fuente de previsualizacion"
        >
          <button
            type="button"
            aria-pressed={source === "simulator"}
            onClick={() => props.onSource("simulator")}
          >
            <Activity size={15} />
            Simulador
          </button>
          <button
            type="button"
            aria-pressed={source === "live"}
            onClick={() => props.onSource("live")}
          >
            <RadioTower size={15} />
            En vivo
          </button>
        </div>
        {source === "simulator" ? (
          <>
            <label className="switchLine automaticSwitch">
              <input
                type="checkbox"
                checked={automatic}
                onChange={(event) => props.onAutomatic(event.target.checked)}
              />
              <span>Automatico</span>
            </label>
            <label className="bpmSlider">
              <span className="srOnly">BPM de prueba</span>
              <input
                type="range"
                min={25}
                max={220}
                value={bpm ?? 97}
                disabled={automatic}
                onChange={(event) => props.onBpm(Number(event.target.value))}
              />
            </label>
            <input
              className="bpmInput"
              type="number"
              min={25}
              max={220}
              aria-label="BPM manual"
              value={bpm ?? 97}
              disabled={automatic}
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                if (Number.isFinite(value))
                  props.onBpm(Math.min(220, Math.max(25, value)));
              }}
            />
          </>
        ) : (
          <span className="sourceMessage">
            <span className={`signalDot ${connected ? "online" : "waiting"}`} />
            {message}
          </span>
        )}
      </div>
      {source === "simulator" && (
        <div
          className="phasePresets"
          role="group"
          aria-label="Escenarios de prueba"
        >
          {(
            [
              [70, "Calma"],
              [100, "Elevado"],
              [120, "Acelerado"],
              [145, "Natanael"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={!automatic && bpm === value}
              onClick={() => {
                props.onAutomatic(false);
                props.onBpm(value);
              }}
            >
              <span>{label}</span>
              <b>{value}</b>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
