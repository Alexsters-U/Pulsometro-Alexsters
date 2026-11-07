import { useEffect, useState } from "react";
import {
  designSchema, pairingEventSchema, pulseSnapshotSchema, viewersSchema,
  type OverlayDesign, type PairingEvent, type PulseSnapshot, type Viewers,
} from "../../shared/domain";

export function useLiveFeed(token = "", client?: "obs") {
  const [design, setDesign] = useState<OverlayDesign | null>(null);
  const [pulse, setPulse] = useState<PulseSnapshot | null>(null);
  const [connection, setConnection] = useState<"connecting" | "ready" | "error">("connecting");
  const [clientId, setClientId] = useState<string | null>(null);
  const [viewers, setViewers] = useState<Viewers | null>(null);
  const [pairing, setPairing] = useState<(PairingEvent & { at: number }) | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (client) params.set("client", client);
    const query = params.toString() ? `?${params}` : "";
    const events = new EventSource(`/api/events${query}`);
    let lastReceivedAt = 0;
    let staleAfterMs = 10000;
    events.onopen = () => setConnection("ready");
    events.onerror = () => { setConnection("error"); setPulse(null); setClientId(null); };
    events.addEventListener("hello", (event) => {
      try {
        const id = JSON.parse(event.data).id;
        if (typeof id === "string") setClientId(id);
      } catch { setClientId(null); }
    });
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
    // Solo el editor recibe quien esta mirando y el resultado de las vinculaciones.
    events.addEventListener("viewers", (event) => {
      const result = viewersSchema.safeParse(JSON.parse(event.data));
      if (result.success) setViewers(result.data);
    });
    events.addEventListener("pairing", (event) => {
      const result = pairingEventSchema.safeParse(JSON.parse(event.data));
      if (result.success) setPairing({ ...result.data, at: Date.now() });
    });
    const expiry = window.setInterval(() => {
      if (performance.now() - lastReceivedAt >= staleAfterMs) {
        setPulse((current) => current?.status === "connected" ? { ...current, status: "stale", bpm: null } : current);
      }
    }, 500);
    return () => { events.close(); window.clearInterval(expiry); };
  }, [token, client]);
  return { design, pulse, connection, clientId, viewers, pairing };
}
