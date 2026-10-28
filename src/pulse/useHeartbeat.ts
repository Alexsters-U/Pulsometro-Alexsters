import { useEffect, useRef } from "react";

export function useHeartbeat(bpm: number | null, active: boolean) {
  const element = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const rate = useRef(1);
  rate.current = (bpm ?? 60) / 60;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function synchronize() {
      animation.current?.cancel();
      animation.current = null;
      if (!active || reducedMotion.matches || !element.current) return;
      animation.current = element.current.animate([
        { transform: "scale(.96)", offset: 0, easing: "cubic-bezier(.2,.7,.3,1)" },
        { transform: "scale(var(--heart-peak))", offset: 0.16, easing: "ease-in-out" },
        { transform: "scale(.98)", offset: 0.32, easing: "ease-in-out" },
        { transform: "scale(1.035)", offset: 0.45, easing: "ease-in-out" },
        { transform: "scale(.96)", offset: 0.68 },
        { transform: "scale(.96)", offset: 1 },
      ], { duration: 1000, iterations: Infinity, easing: "linear" });
      animation.current.id = "heart-beat";
      animation.current.updatePlaybackRate(rate.current);
    }
    synchronize();
    reducedMotion.addEventListener("change", synchronize);
    return () => { animation.current?.cancel(); reducedMotion.removeEventListener("change", synchronize); };
  }, [active]);

  useEffect(() => { animation.current?.updatePlaybackRate(rate.current); }, [bpm]);
  return element;
}
