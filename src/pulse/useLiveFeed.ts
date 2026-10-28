import { useEffect, useState } from "react";
import { designSchema, pulseSnapshotSchema, type OverlayDesign, type PulseSnapshot } from "../../shared/domain";

export function useLiveFeed(token = "") {
  const [design, setDesign] = useState<OverlayDesign | null>(null);
  const [pulse, setPulse] = useState<PulseSnapshot | null>(null);
  const [connection, setConnection] = useState<"connecting" | "ready" | "error">("connecting");

  useEffect(() => {
    const query = token ? `?${new URLSearchParams({ token })}` : "";
    const events = new EventSource(`/api/events${query}`);
    let lastReceivedAt = 0;
    let staleAfterMs = 10000;
    events.onopen = () => setConnection("ready");
    events.onerror = () => { setConnection("error"); setPulse(null); };
    events.addEventListener("design", (event) => {
      try {
        const result = designSchema.safeParse(JSON.parse(event.data));
        if (!result.success) throw new Error();
        setDesign(result.data);
      } catch { setConnection("error"); }
    });
    events.addEventListener("pulse", (event) => {
      try {
        const result = pulseSnapshotSchema.safeParse(JSON.parse(event.data));
        if (!result.success) throw new Error();
        lastReceivedAt = performance.now();
        staleAfterMs = result.data.staleAfterMs;
        setPulse(result.data);
      } catch { setPulse(null); setConnection("error"); }
    });
    const expiry = window.setInterval(() => {
      if (performance.now() - lastReceivedAt >= staleAfterMs) {
        setPulse((current) => current?.status === "connected" ? { ...current, status: "stale", bpm: null } : current);
      }
    }, 500);
    return () => { events.close(); window.clearInterval(expiry); };
  }, [token]);
  return { design, pulse, connection };
}
