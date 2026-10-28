import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { TOTEM_THRESHOLD, TotemTrigger } from "../pulse/totem-trigger";
import type { OverlayDesign } from "../../shared/domain";
import { themes } from "../../shared/themes";
import { useHeartbeat } from "../pulse/useHeartbeat";

const TOTEM_IDLE = "/assets/hearts/phases/natanael-totem-idle-v1.png";
const TOTEM_OPEN = "/assets/hearts/phases/natanael-totem-open-v1.png";

export function PulseIcon({ bpm, design, soundOnTrigger, previewNonce }: {
  bpm: number | null; design: OverlayDesign; soundOnTrigger: boolean; previewNonce: number;
}) {
  const gate = useRef(new TotemTrigger());
  const audio = useRef<HTMLAudioElement>(null);
  const lastPreview = useRef(previewNonce);
  const [sequence, setSequence] = useState(0);
  const [popping, setPopping] = useState(false);
  const [audioStatus, setAudioStatus] = useState("ready");
  const theme = themes[design.theme];
  const enabled = theme.totem && design.showHeart && design.totem.enabled;
  const totem = enabled && (popping || (bpm !== null && bpm >= TOTEM_THRESHOLD));
  const heartbeat = useHeartbeat(bpm, bpm !== null && !popping);

  useEffect(() => {
    if (!enabled) return;
    for (const source of [TOTEM_IDLE, TOTEM_OPEN]) {
      const image = new Image();
      image.src = source;
    }
  }, [enabled]);

  const pop = useCallback((withSound: boolean) => {
    setSequence((current) => current + 1);
    setPopping(true);
    if (withSound && design.totem.sound && design.totem.volume > 0 && audio.current) {
      audio.current.volume = design.totem.volume;
      audio.current.currentTime = 0;
      void audio.current.play().catch((error: unknown) => {
        setAudioStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error");
      });
    }
  }, [design.totem.sound, design.totem.volume]);

  useEffect(() => {
    if (gate.current.update(enabled ? bpm : null, performance.now())) pop(soundOnTrigger);
    if (!enabled || bpm === null) setPopping(false);
  }, [bpm, enabled, pop, soundOnTrigger]);

  useEffect(() => {
    if (previewNonce !== lastPreview.current) {
      lastPreview.current = previewNonce;
      if (enabled) pop(true);
    }
  }, [previewNonce, enabled, pop]);

  useEffect(() => {
    if (!sequence) return;
    const timer = window.setTimeout(() => setPopping(false), 1400);
    return () => window.clearTimeout(timer);
  }, [sequence]);

  useEffect(() => {
    if (!enabled || !design.totem.sound) audio.current?.pause();
    if (audio.current) audio.current.volume = design.totem.volume;
  }, [enabled, design.totem.sound, design.totem.volume]);

  useEffect(() => {
    if (audioStatus !== "blocked") return;
    const unlock = () => {
      const player = audio.current;
      if (!player) return;
      player.muted = true;
      void player.play().then(() => {
        player.pause(); player.currentTime = 0; player.muted = false; setAudioStatus("ready");
      }).catch(() => { player.muted = false; });
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [audioStatus]);

  const phase = bpm !== null && bpm >= 140 ? "very-fast" : bpm !== null && bpm >= 110 ? "accelerated" : bpm !== null && bpm >= 90 ? "elevated" : "base";
  const asset = design.theme === "minecraft" ? `/assets/hearts/phases/${phase}-v1.png` : theme.asset;
  return <div className={`pulseIcon${theme.pixelated ? " pixelated" : ""}`} data-totem-pops={sequence} data-audio-status={audioStatus} data-totem-active={popping} data-popcat-frame={totem ? popping ? "open" : "idle" : undefined} aria-hidden="true">
    {popping && <div className="totemBurst" key={`burst-${sequence}`}>
      <span className="totemRing" />
      {Array.from({ length: 14 }, (_, index) => <i key={index} style={{
        "--dx": `${Math.cos(index * Math.PI * 2 / 14) * (36 + index % 3 * 8)}px`,
        "--dy": `${Math.sin(index * Math.PI * 2 / 14) * (36 + index % 3 * 8)}px`,
        "--delay": `${index % 4 * 25}ms`,
      } as CSSProperties} />)}
    </div>}
    <div className="heartBeat" ref={heartbeat} data-beating={bpm !== null && !popping}>
      {totem ? <img key={`totem-${sequence}`} className={`phaseSprite totemSprite popcatTotem${popping ? " totemPopping" : ""}`} src={popping ? TOTEM_OPEN : TOTEM_IDLE} alt="" draggable={false} /> :
        <img className="phaseSprite heartSprite" src={asset} alt="" draggable={false} />}
    </div>
    {enabled && <audio ref={audio} src="/assets/audio/totem-use.ogg" preload="auto"
      onPlay={() => setAudioStatus("playing")} onEnded={() => setAudioStatus("ready")} onError={() => setAudioStatus("error")} />}
  </div>;
}
