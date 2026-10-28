import { defaultDesign, type OverlayDesign, type PulseRange } from "../../shared/domain";
import { PulseIcon } from "./PulseIcon";

type OverlayProps = {
  bpm: number | null;
  design: OverlayDesign;
  sourceStatus: string;
  soundOnTrigger?: boolean;
  previewNonce?: number;
};

export function Overlay({ bpm, design, sourceStatus, soundOnTrigger = false, previewNonce = 0 }: OverlayProps) {
  const range = findRange(design.ranges, bpm ?? 0);
  const style = {
    "--pulse-color": range.color,
    "--pulse-glow": range.glow,
    "--shake": `${Math.min(range.shake * 0.2, 1.5)}px`,
    "--heart-peak": String(Math.max(1.12, Math.min(1.18, range.scale + 0.1))),
    "--beat-duration": `${bpm ? 60000 / bpm : 1000}ms`,
  } as React.CSSProperties;

  return (
    <div className={`overlayRoot ${design.theme} ${design.background}`} style={style} data-status={sourceStatus}>
      {design.showHeart && <PulseIcon bpm={bpm} design={design} soundOnTrigger={soundOnTrigger} previewNonce={previewNonce} />}
      <div className="bpmGroup">
        <span className="bpmNumber">{bpm ?? "--"}</span>
        <span className="bpmUnit">BPM</span>
        {design.showLabel && <span className="bpmLabel">{bpm === null ? "Sin senal" : range.label}</span>}
      </div>
    </div>
  );
}

function findRange(ranges: PulseRange[], bpm: number) {
  return ranges.find((range) => bpm >= range.min && bpm <= range.max) ?? ranges.at(-1) ?? defaultDesign.ranges[0];
}

