import { useEffect, useState } from "react";

export function useSimulator(enabled: boolean) {
  const [bpm, setBpm] = useState(97);
  useEffect(() => {
    if (!enabled) return;
    let phase = 0;
    const timer = window.setInterval(() => {
      phase += 0.42;
      setBpm(Math.round(97 + Math.sin(phase) * 30 + Math.sin(phase / 2.7) * 15));
    }, 900);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return bpm;
}
