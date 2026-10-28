import {
  ChevronDown,
  Check,
  Plus,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  designSchema,
  type OverlayDesign,
  type PulseRange,
} from "../../shared/domain";
import { themes, themeIds } from "../../shared/themes";

export function StudioInspector({
  design,
  disabled,
  onChange,
  onPreview,
}: {
  design: OverlayDesign;
  disabled: boolean;
  onChange: (change: Partial<OverlayDesign>) => void;
  onPreview: () => void;
}) {
  const [tab, setTab] = useState("appearance");
  const [expanded, setExpanded] = useState(design.ranges[0]?.id);
  const supportsTotem = themes[design.theme].totem;
  const validation = designSchema.safeParse(design);
  useEffect(() => {
    if (!supportsTotem && tab === "totem") setTab("appearance");
  }, [supportsTotem, tab]);

  function updateRange(id: string, change: Partial<PulseRange>) {
    onChange({
      ranges: design.ranges.map((range) =>
        range.id === id ? { ...range, ...change } : range,
      ),
    });
  }
  function splitRange() {
    if (design.ranges.length >= 12) return;
    const widest = design.ranges.reduce((best, item) =>
      item.max - item.min > best.max - best.min ? item : best,
    );
    if (widest.max - widest.min < 1) return;
    const middle = Math.floor((widest.min + widest.max) / 2);
    const added = {
      ...widest,
      id: crypto.randomUUID(),
      label: `Rango ${design.ranges.length + 1}`,
      min: middle + 1,
    };
    onChange({
      ranges: design.ranges.flatMap((range) =>
        range.id === widest.id ? [{ ...range, max: middle }, added] : [range],
      ),
    });
    setExpanded(added.id);
  }
  function removeRange(index: number) {
    if (design.ranges.length <= 1) return;
    const items = design.ranges.map((range) => ({ ...range }));
    if (index > 0) items[index - 1].max = items[index].max;
    else items[1].min = items[0].min;
    items.splice(index, 1);
    onChange({ ranges: items });
  }

  return (
    <aside className="studioInspector" aria-label="Propiedades del overlay">
      <div className="inspectorTabs" role="tablist" aria-label="Propiedades">
        {[
          ["appearance", "Aspecto"],
          ["ranges", "Rangos"],
          ...(supportsTotem ? [["totem", "Natanael"]] : []),
        ].map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            id={`tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`inspector-${value}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <fieldset
        disabled={disabled}
        className="inspectorBody"
        role="tabpanel"
        id={`inspector-${tab}`}
        aria-labelledby={`tab-${tab}`}
      >
        {tab === "appearance" && (
          <>
            <div className="inspectorSection">
              <label className="inputLabel">
                Nombre del overlay
                <input
                  value={design.name}
                  maxLength={80}
                  onChange={(event) => onChange({ name: event.target.value })}
                />
              </label>
            </div>
            <div className="inspectorSection">
              <div className="sectionHeading">
                <h2>Tema</h2>
                <span className="muted">04</span>
              </div>
              <div className="themeGallery" role="radiogroup" aria-label="Tema">
                {themeIds.map((id) => (
                  <label
                    key={id}
                    className={`themeChoice ${id}${design.theme === id ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="overlay-theme"
                      value={id}
                      checked={design.theme === id}
                      aria-label={themes[id].label}
                      onChange={() => onChange({ theme: id })}
                    />
                    <img src={themes[id].asset} alt="" draggable={false} />
                    <span>{themes[id].label}</span>
                    {design.theme === id && (
                      <Check size={13} className="themeCheck" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="inspectorSection">
              <h2>Elementos</h2>
              <label className="settingLine">
                <span>Corazon</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={design.showHeart}
                  onChange={(event) =>
                    onChange({ showHeart: event.target.checked })
                  }
                />
              </label>
              <label className="settingLine">
                <span>Nombre del rango</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={design.showLabel}
                  onChange={(event) =>
                    onChange({ showLabel: event.target.checked })
                  }
                />
              </label>
              <label className="settingLine">
                <span>Panel de fondo</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={design.background === "panel"}
                  onChange={(event) =>
                    onChange({
                      background: event.target.checked
                        ? "panel"
                        : "transparent",
                    })
                  }
                />
              </label>
            </div>
            {supportsTotem && (
              <button
                className="natanaelShortcut"
                type="button"
                onClick={() => setTab("totem")}
              >
                <img
                  src="/assets/hearts/phases/natanael-totem-idle-v1.png"
                  alt=""
                />
                <span>
                  <b>Natanael</b>
                  <small>
                    {design.totem.enabled
                      ? "Activo desde 140 BPM"
                      : "Desactivado"}
                  </small>
                </span>
                <ChevronDown size={16} />
              </button>
            )}
          </>
        )}
        {tab === "ranges" && (
          <>
            <div className="sectionHeading">
              <h2>Rangos de pulso</h2>
              <button
                type="button"
                className="iconButton small"
                title="Agregar rango"
                aria-label="Agregar rango"
                disabled={design.ranges.length >= 12}
                onClick={splitRange}
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="rangeScale" aria-hidden="true">
              {design.ranges.map((range) => (
                <span
                  key={range.id}
                  style={{
                    flex: Math.max(1, range.max - range.min + 1),
                    background: range.color,
                  }}
                />
              ))}
            </div>
            <div className="rangeList">
              {design.ranges.map((range, index) => (
                <div className="rangeItem" key={range.id}>
                  <div className="rangeItemHeading">
                    <button
                      className="rangeToggle"
                      type="button"
                      aria-expanded={expanded === range.id}
                      onClick={() =>
                        setExpanded(expanded === range.id ? "" : range.id)
                      }
                    >
                      <i style={{ background: range.color }} />
                      <span>
                        {range.label}
                        <small>
                          {range.min} - {range.max} BPM
                        </small>
                      </span>
                      <ChevronDown size={15} />
                    </button>
                    <button
                      type="button"
                      className="iconButton small"
                      aria-label={`Eliminar ${range.label}`}
                      title={`Eliminar ${range.label}`}
                      disabled={design.ranges.length <= 1}
                      onClick={() => removeRange(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {expanded === range.id && (
                    <div className="rangeFields">
                      <label className="inputLabel rangeName">
                        Nombre
                        <input
                          value={range.label}
                          maxLength={40}
                          onChange={(event) =>
                            updateRange(range.id, { label: event.target.value })
                          }
                        />
                      </label>
                      <label className="inputLabel">
                        Desde
                        <input
                          type="number"
                          min={0}
                          max={260}
                          value={range.min}
                          aria-label={`${range.label} minimo`}
                          onChange={(event) =>
                            updateRange(range.id, {
                              min: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="inputLabel">
                        Hasta
                        <input
                          type="number"
                          min={0}
                          max={260}
                          value={range.max}
                          aria-label={`${range.label} maximo`}
                          onChange={(event) =>
                            updateRange(range.id, {
                              max: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="inputLabel">
                        Color
                        <input
                          type="color"
                          value={range.color}
                          aria-label={`${range.label} color`}
                          onChange={(event) =>
                            updateRange(range.id, { color: event.target.value })
                          }
                        />
                      </label>
                      <label className="inputLabel">
                        Brillo
                        <input
                          type="color"
                          value={range.glow}
                          aria-label={`${range.label} brillo`}
                          onChange={(event) =>
                            updateRange(range.id, { glow: event.target.value })
                          }
                        />
                      </label>
                      <label className="inputLabel rangeName">
                        Vibrar numeros <output>{range.shake}</output>
                        <input
                          type="range"
                          min={0}
                          max={8}
                          value={range.shake}
                          onChange={(event) =>
                            updateRange(range.id, {
                              shake: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!validation.success && (
              <p className="inlineError">
                {validation.error.issues[0].message}
              </p>
            )}
          </>
        )}
        {tab === "totem" && (
          <>
            <div className="natanaelPortrait">
              <img
                src="/assets/hearts/phases/natanael-totem-idle-v1.png"
                alt="Amuleto de Natanael"
              />
              <h2>Natanael</h2>
              <span className="smallBadge">140 BPM</span>
            </div>
            <label className="settingLine">
              <span>Activar amuleto</span>
              <input
                type="checkbox"
                role="switch"
                checked={design.totem.enabled}
                onChange={(event) =>
                  onChange({
                    totem: { ...design.totem, enabled: event.target.checked },
                  })
                }
              />
            </label>
            <label className="settingLine">
              <span>Sonido del totem</span>
              <input
                type="checkbox"
                role="switch"
                checked={design.totem.sound}
                disabled={!design.totem.enabled}
                onChange={(event) =>
                  onChange({
                    totem: { ...design.totem, sound: event.target.checked },
                  })
                }
              />
            </label>
            <label className="inputLabel volumeControl">
              <span>
                <Volume2 size={15} />
                Volumen{" "}
                <output>{Math.round(design.totem.volume * 100)}%</output>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={design.totem.volume}
                disabled={!design.totem.enabled || !design.totem.sound}
                onChange={(event) =>
                  onChange({
                    totem: {
                      ...design.totem,
                      volume: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
            <button
              type="button"
              className="primaryButton fullWidth"
              disabled={!design.showHeart || !design.totem.enabled}
              onClick={onPreview}
            >
              <Sparkles size={16} />
              Probar Natanael
            </button>
            <dl className="effectFacts">
              <div>
                <dt>Activacion</dt>
                <dd>140 BPM</dd>
              </div>
              <div>
                <dt>Rearme</dt>
                <dd>135 BPM</dd>
              </div>
              <div>
                <dt>Entre efectos</dt>
                <dd>10 s</dd>
              </div>
            </dl>
          </>
        )}
      </fieldset>
    </aside>
  );
}
