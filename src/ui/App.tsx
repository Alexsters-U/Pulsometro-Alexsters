import {
  Activity,
  ArrowRight,
  BookmarkPlus,
  Check,
  Copy,
  Download,
  Eye,
  EyeOff,
  FolderHeart,
  HeartPulse,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  MonitorPlay,
  RadioTower,
  Redo2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  defaultDesign,
  designSchema,
  type OverlayDesign,
  type PulseSource,
} from "../../shared/domain";
import { loadLegacyDesign, saveDesign } from "../designs/storage";
import { exportDesign, loadLibrary, persistLibrary } from "../designs/library";
import { sameDesign, useDesignHistory } from "../designs/useDesignHistory";
import { useLiveFeed } from "../pulse/useLiveFeed";
import { useSimulator } from "../pulse/useSimulator";
import { AppearanceSwitch, useAppearance, type Appearance } from "./appearance";
import { Overlay } from "./Overlay";
import { StudioPreview } from "./StudioPreview";
import { StudioInspector } from "./StudioInspector";
import { StudioLibrary } from "./StudioLibrary";
import { StudioConnections } from "./StudioConnections";

export function App() {
  return window.location.pathname === "/overlay" ? (
    <OverlayPage />
  ) : (
    <EditorSession />
  );
}

function OverlayPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const feed = useLiveFeed(token);
  return (
    <main className="overlayViewport">
      <Overlay
        bpm={feed.pulse?.bpm ?? null}
        design={feed.design ?? defaultDesign}
        soundOnTrigger
        sourceStatus={
          feed.connection === "error" ? "error" : (feed.pulse?.status ?? "idle")
        }
      />
    </main>
  );
}

function EditorSession() {
  const [appearance, setAppearance] = useAppearance();
  const [session, setSession] = useState<
    { overlayToken: string } | null | undefined
  >();
  const [secret, setSecret] = useState("");
  const [reveal, setReveal] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/session", { signal: controller.signal })
      .then(async (response) => {
        if (response.ok) setSession(await response.json());
        else {
          setSession(null);
          if (response.status !== 401)
            setMessage("No se pudo consultar la sesion.");
        }
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setMessage("Servidor no disponible.");
          setSession(null);
        }
      });
    return () => controller.abort();
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}` },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setSecret("");
      setSession(body);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "No se pudo iniciar sesion.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("No se pudo cerrar la sesion.");
      setSession(null);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Servidor no disponible.",
      );
    }
  }
  if (session)
    return (
      <Workspace
        overlayToken={session.overlayToken}
        logout={logout}
        sessionMessage={message}
        dismissSessionMessage={() => setMessage("")}
        appearance={appearance}
        setAppearance={setAppearance}
      />
    );
  return (
    <main className="studioShell loginShell" data-appearance={appearance}>
      <header className="loginTopbar">
        <a href="/" className="studioBrand">
          <span className="brandMark">
            <HeartPulse size={23} />
          </span>
          <span>
            Alexsters <b>Pulse</b>
          </span>
        </a>
        <AppearanceSwitch value={appearance} onChange={setAppearance} />
      </header>
      <form className="loginForm" onSubmit={login}>
        <img
          className="loginAmulet"
          src="/assets/hearts/phases/natanael-totem-idle-v1.png"
          alt="Natanael"
        />
        <span className="sectionEyebrow">PULSE STUDIO</span>
        <h1>Acceso al estudio</h1>
        {session === undefined ? (
          <div className="loginLoading">
            <LoaderCircle size={20} className="spinning" />
            Conectando...
          </div>
        ) : (
          <>
            <label className="inputLabel">
              Clave de administracion
              <div className="secretField">
                <input
                  type={reveal ? "text" : "password"}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  className="iconButton"
                  type="button"
                  title={reveal ? "Ocultar clave" : "Mostrar clave"}
                  aria-label={reveal ? "Ocultar clave" : "Mostrar clave"}
                  onClick={() => setReveal(!reveal)}
                >
                  {reveal ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            <button
              className="primaryButton fullWidth"
              type="submit"
              disabled={busy}
            >
              {busy ? <LoaderCircle size={17} className="spinning" /> : null}
              {busy ? "Entrando..." : "Entrar"}
              <ArrowRight size={17} />
            </button>
          </>
        )}
        <p className="loginMessage" role="status">
          {message}
        </p>
        <span className="loginFootnote">
          <ShieldCheck size={14} />
          Alexsters / espacio personal
        </span>
      </form>
      <footer className="loginFooter">Pulsometro Alexsters</footer>
    </main>
  );
}

type View = "studio" | "library" | "connections";
function Workspace({
  overlayToken,
  logout,
  sessionMessage,
  dismissSessionMessage,
  appearance,
  setAppearance,
}: {
  overlayToken: string;
  logout: () => void;
  sessionMessage: string;
  dismissSessionMessage: () => void;
  appearance: Appearance;
  setAppearance: (value: Appearance) => void;
}) {
  const feed = useLiveFeed();
  const history = useDesignHistory();
  const { draft, edit, reset } = history;
  const [saved, setSaved] = useState<OverlayDesign | null>(null);
  const [view, setView] = useState<View>("studio");
  const [source, setSource] = useState<PulseSource>("simulator");
  const [automatic, setAutomatic] = useState(true);
  const [manualBpm, setManualBpm] = useState(97);
  const [saving, setSaving] = useState(false);
  const [totemPreview, setTotemPreview] = useState(0);
  const [library, setLibrary] = useState(loadLibrary);
  const [legacy] = useState(loadLegacyDesign);
  const [notice, setNotice] = useState({ text: "", error: false });
  const upload = useRef<HTMLInputElement>(null);
  const dirty = saved !== null && !sameDesign(draft, saved);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);
  const disabled = !saved || saving;
  const valid = designSchema.safeParse(draft).success;
  const simulated = useSimulator(
    source === "simulator" && automatic && view === "studio",
  );
  const bpm =
    source === "simulator"
      ? automatic
        ? simulated
        : manualBpm
      : (feed.pulse?.bpm ?? null);
  const overlayUrl = `${window.location.origin}/overlay?${new URLSearchParams({ token: overlayToken })}`;
  const status =
    source === "simulator" ? "simulating" : (feed.pulse?.status ?? "idle");
  const notify = useCallback(
    (text: string, error = false) => setNotice({ text, error }),
    [],
  );

  useEffect(() => {
    if (!notice.text || notice.error) return;
    const timeout = window.setTimeout(
      () => setNotice({ text: "", error: false }),
      5000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!feed.design) return;
    setSaved(feed.design);
    if (!dirtyRef.current) reset(feed.design);
  }, [feed.design, reset]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        !(event.ctrlKey || event.metaKey) ||
        saving ||
        target.matches(
          "input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]",
        )
      )
        return;
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (key === "y") {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [history.undo, history.redo, saving]);

  function update(change: Partial<OverlayDesign>) {
    edit((current) => ({ ...current, ...change }));
    setNotice({ text: "", error: false });
  }
  async function save() {
    const parsed = designSchema.safeParse(draft);
    if (!parsed.success) {
      notify(parsed.error.issues[0].message, true);
      return;
    }
    setSaving(true);
    try {
      await saveDesign(parsed.data);
      setSaved(parsed.data);
      notify("Diseno guardado.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "No se pudo guardar.",
        true,
      );
    } finally {
      setSaving(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify("URL copiada.");
    } catch {
      notify("No se pudo copiar la URL.", true);
    }
  }
  function download(design: OverlayDesign) {
    const parsed = designSchema.safeParse(design);
    if (!parsed.success) {
      notify(parsed.error.issues[0].message, true);
      return;
    }
    exportDesign(parsed.data);
    notify("Archivo JSON exportado.");
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("El archivo excede 64 KB.");
      const input: unknown = JSON.parse(await file.text());
      const parsed = designSchema.safeParse(
        input && typeof input === "object" && "design" in input
          ? input.design
          : input,
      );
      if (!parsed.success)
        throw new Error("El archivo no contiene un overlay valido.");
      edit(parsed.data);
      setView("studio");
      notify("Overlay importado. Pendiente de guardar.");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Archivo invalido.",
        true,
      );
    }
  }
  function saveToLibrary() {
    const parsed = designSchema.safeParse(draft);
    if (!parsed.success) {
      notify(parsed.error.issues[0].message, true);
      return;
    }
    const existing = library.find(
      (item) =>
        item.id === draft.id ||
        sameDesign({ ...item, id: draft.id }, parsed.data),
    );
    if (!existing && library.length >= 24) {
      notify("La biblioteca admite 24 overlays.", true);
      return;
    }
    const entry = {
      ...structuredClone(parsed.data),
      id: existing?.id ?? crypto.randomUUID(),
    };
    const next = existing
      ? library.map((item) => (item.id === entry.id ? entry : item))
      : [entry, ...library];
    try {
      persistLibrary(next);
      setLibrary(next);
      notify("Overlay guardado en la biblioteca.");
    } catch {
      notify("El navegador no pudo guardar la biblioteca.", true);
    }
  }
  function deleteFromLibrary(id: string) {
    const next = library.filter((item) => item.id !== id);
    try {
      persistLibrary(next);
      setLibrary(next);
      notify("Overlay eliminado de la biblioteca.");
    } catch {
      notify("No se pudo actualizar la biblioteca.", true);
    }
  }
  function setAuto(value: boolean) {
    if (!value && automatic) setManualBpm(bpm ?? 97);
    setAutomatic(value);
  }

  return (
    <main className="studioShell" data-appearance={appearance}>
      <aside className="studioSidebar">
        <a href="/" className="studioBrand" aria-label="Alexsters Pulse Studio">
          <span className="brandMark">
            <HeartPulse size={23} />
          </span>
          <span>
            Alexsters<b>Pulse Studio</b>
          </span>
        </a>
        <div className="sidebarSectionLabel">WORKSPACE</div>
        <nav className="studioNav" aria-label="Navegacion principal">
          <button
            type="button"
            aria-label="Estudio"
            title="Estudio"
            aria-current={view === "studio" ? "page" : undefined}
            onClick={() => setView("studio")}
          >
            <LayoutDashboard size={18} />
            <span>Estudio</span>
          </button>
          <button
            type="button"
            aria-label="Biblioteca"
            title="Biblioteca"
            aria-current={view === "library" ? "page" : undefined}
            onClick={() => setView("library")}
          >
            <FolderHeart size={18} />
            <span>Biblioteca</span>
            <small>{library.length || "04"}</small>
          </button>
          <button
            type="button"
            aria-label="Conexiones"
            title="Conexiones"
            aria-current={view === "connections" ? "page" : undefined}
            onClick={() => setView("connections")}
          >
            <RadioTower size={18} />
            <span>Conexiones</span>
          </button>
        </nav>
        <div className="sidebarBottom">
          <div className="appearanceRow">
            <span>Apariencia</span>
            <AppearanceSwitch value={appearance} onChange={setAppearance} />
          </div>
          <div className="sidebarIdentity">
            <img
              src="/assets/hearts/phases/natanael-totem-idle-v1.png"
              alt=""
            />
            <span>
              <b>Natanael</b>
              <small>Alexsters Pulse</small>
            </span>
            <span className="signalDot online" />
          </div>
        </div>
      </aside>
      <div className="studioMain">
        <header className="studioHeader">
          <div>
            <span className="sectionEyebrow">PULSOMETRO / ALEXSTERS</span>
            <h1>
              {view === "studio"
                ? "Estudio de pulso"
                : view === "library"
                  ? "Biblioteca"
                  : "Conexiones"}
            </h1>
          </div>
          <div className="headerActions">
            <span
              className={`connectionBadge ${feed.connection === "ready" ? "online" : "waiting"}`}
            >
              <span className="signalDot" />
              <span>
                {feed.connection === "ready"
                  ? "Servidor conectado"
                  : "Reconectando"}
              </span>
            </span>
            <button
              type="button"
              className="iconButton"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Hay cambios sin guardar. Cerrar sesion?")
                )
                  logout();
              }}
              title="Cerrar sesion"
              aria-label="Cerrar sesion"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <div className="studioContent">
          <div className="documentBar">
            <div className="documentName">
              <span className={`documentDot${dirty ? " unsaved" : ""}`} />
              <span>{draft.name || "Sin nombre"}</span>
              <small>{dirty ? "Sin guardar" : "Guardado"}</small>
            </div>
            <div className="documentActions">
              <div className="historyActions">
                <button
                  type="button"
                  className="iconButton small"
                  title="Deshacer"
                  aria-label="Deshacer"
                  disabled={!history.canUndo || saving}
                  onClick={history.undo}
                >
                  <Undo2 size={17} />
                </button>
                <button
                  type="button"
                  className="iconButton small"
                  title="Rehacer"
                  aria-label="Rehacer"
                  disabled={!history.canRedo || saving}
                  onClick={history.redo}
                >
                  <Redo2 size={17} />
                </button>
              </div>
              <button
                type="button"
                className="iconButton small desktopAction"
                title="Importar JSON"
                aria-label="Importar JSON"
                disabled={saving}
                onClick={() => upload.current?.click()}
              >
                <Upload size={17} />
              </button>
              <button
                type="button"
                className="iconButton small"
                title="Exportar JSON"
                aria-label="Exportar JSON"
                disabled={!valid}
                onClick={() => download(draft)}
              >
                <Download size={17} />
              </button>
              <button
                type="button"
                className="primaryButton"
                disabled={!dirty || saving || !saved || !valid}
                onClick={save}
              >
                {saving ? (
                  <LoaderCircle size={16} className="spinning" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Guardando..." : "Guardar diseno"}
              </button>
            </div>
          </div>
          {view === "studio" ? (
            <div className="editorWorkspace">
              <div className="studioCanvasColumn">
                <StudioPreview
                  design={draft}
                  bpm={bpm}
                  source={source}
                  status={status}
                  connection={feed.connection}
                  pulse={feed.pulse}
                  automatic={automatic}
                  previewNonce={totemPreview}
                  onSource={setSource}
                  onAutomatic={setAuto}
                  onBpm={setManualBpm}
                />
                <div className="canvasFooter">
                  <button
                    type="button"
                    className="textButton"
                    disabled={disabled || !valid}
                    onClick={saveToLibrary}
                  >
                    <BookmarkPlus size={16} />
                    Guardar en biblioteca
                  </button>
                  <div>
                    <button
                      type="button"
                      className="textButton"
                      onClick={() => copy(overlayUrl)}
                    >
                      <Copy size={15} />
                      Copiar URL OBS
                    </button>
                    <a
                      className="iconButton"
                      href={overlayUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir overlay"
                      aria-label="Abrir overlay"
                    >
                      <MonitorPlay size={18} />
                    </a>
                  </div>
                </div>
              </div>
              <StudioInspector
                design={draft}
                disabled={disabled}
                onChange={update}
                onPreview={() => setTotemPreview((current) => current + 1)}
              />
            </div>
          ) : view === "library" ? (
            <StudioLibrary
              items={library}
              disabled={disabled}
              onApply={(design) => {
                edit(structuredClone(design));
                setView("studio");
                notify("Plantilla cargada en el estudio.");
              }}
              onDelete={deleteFromLibrary}
              onSaveCurrent={saveToLibrary}
              onImport={() => upload.current?.click()}
              onExport={download}
            />
          ) : (
            <StudioConnections
              overlayBackground={saved?.background ?? "transparent"}
              overlayUrl={overlayUrl}
              pulse={feed.pulse}
              connection={feed.connection}
              copy={copy}
              openOverlay={overlayUrl}
            />
          )}
          <footer className="workspaceFooter">
            <span>
              <ShieldCheck size={13} />
              {window.location.host}
            </span>
            <div>
              {legacy && (
                <button
                  className="textButton"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    edit(legacy);
                    setView("studio");
                    notify("Diseno local importado. Pendiente de guardar.");
                  }}
                >
                  Importar diseno anterior
                </button>
              )}
              {dirty ? (
                <button
                  className="textButton"
                  type="button"
                  disabled={saving}
                  onClick={() => {
                    if (saved) reset(saved);
                    setNotice({ text: "", error: false });
                  }}
                >
                  <RotateCcw size={13} />
                  Descartar cambios
                </button>
              ) : (
                <span>
                  <Check size={13} />
                  Todo guardado
                </span>
              )}
            </div>
          </footer>
        </div>
      </div>
      <input
        className="srOnly"
        type="file"
        accept="application/json,.json"
        ref={upload}
        onChange={importFile}
        aria-label="Archivo de overlay"
      />
      <div
        className={`studioToast${notice.error ? " error" : ""}`}
        data-visible={Boolean(notice.text || sessionMessage)}
        role="status"
        aria-label="Avisos"
      >
        {notice.error ? <Activity size={17} /> : <Check size={17} />}
        <span>{notice.text || sessionMessage}</span>
        <button
          type="button"
          className="iconButton small"
          aria-label="Cerrar aviso"
          onClick={() => {
            setNotice({ text: "", error: false });
            dismissSessionMessage();
          }}
        >
          <X size={15} />
        </button>
      </div>
    </main>
  );
}
