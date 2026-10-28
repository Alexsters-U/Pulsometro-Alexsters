import {
  ArrowUpRight,
  Download,
  FolderHeart,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type { OverlayDesign } from "../../shared/domain";
import { templates } from "../designs/library";
import { themes } from "../../shared/themes";

export function StudioLibrary({
  items,
  disabled,
  onApply,
  onDelete,
  onSaveCurrent,
  onImport,
  onExport,
}: {
  items: OverlayDesign[];
  disabled: boolean;
  onApply: (design: OverlayDesign) => void;
  onDelete: (id: string) => void;
  onSaveCurrent: () => void;
  onImport: () => void;
  onExport: (design: OverlayDesign) => void;
}) {
  function tile(design: OverlayDesign, custom: boolean) {
    return (
      <article className={`libraryItem ${design.theme}`} key={design.id}>
        <div className="libraryArtwork">
          <img src={themes[design.theme].asset} alt="" draggable={false} />
          <span>{themes[design.theme].label}</span>
        </div>
        <div className="libraryItemBody">
          <h3>{design.name}</h3>
          <div className="librarySwatches">
            {design.ranges.map((range) => (
              <i key={range.id} style={{ background: range.color }} />
            ))}
            <span>{design.ranges.length} rangos</span>
          </div>
          <div className="libraryItemActions">
            <button
              className="textButton"
              type="button"
              disabled={disabled}
              onClick={() => onApply(design)}
            >
              Usar en el estudio
              <ArrowUpRight size={15} />
            </button>
            <button
              className="iconButton small"
              type="button"
              title={`Exportar ${design.name}`}
              aria-label={`Exportar ${design.name}`}
              onClick={() => onExport(design)}
            >
              <Download size={15} />
            </button>
            {custom && (
              <button
                className="iconButton small"
                type="button"
                title={`Eliminar ${design.name}`}
                aria-label={`Eliminar ${design.name}`}
                onClick={() => onDelete(design.id)}
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <div className="libraryView">
      <section className="librarySection">
        <div className="sectionHeading">
          <div>
            <h2>La coleccion</h2>
            <p className="sectionMeta">4 plantillas</p>
          </div>
          <button type="button" className="secondaryButton" onClick={onImport}>
            <Upload size={16} />
            Importar JSON
          </button>
        </div>
        <div className="libraryGrid">
          {templates.map((design) => tile(design, false))}
        </div>
      </section>
      <section className="librarySection">
        <div className="sectionHeading">
          <div>
            <h2>Mis overlays</h2>
            <p className="sectionMeta">
              {items.length} guardados en este navegador
            </p>
          </div>
          <button
            type="button"
            className="secondaryButton"
            disabled={disabled || items.length >= 24}
            onClick={onSaveCurrent}
          >
            <Plus size={16} />
            Guardar actual
          </button>
        </div>
        {items.length ? (
          <div className="libraryGrid">
            {items.map((design) => tile(design, true))}
          </div>
        ) : (
          <div className="emptyLibrary">
            <FolderHeart size={28} />
            <h3>Tu biblioteca esta vacia</h3>
            <button
              type="button"
              className="textButton"
              disabled={disabled}
              onClick={onSaveCurrent}
            >
              Guardar overlay actual
              <ArrowUpRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
