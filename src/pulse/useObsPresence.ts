import { useEffect } from "react";

type ObsStatus = { streaming?: boolean };
type ObsStudio = {
  pluginVersion?: string;
  getStatus?: (callback: (status: ObsStatus) => void) => void;
};

export function obsStudio(): ObsStudio | null {
  return (window as unknown as { obsstudio?: ObsStudio }).obsstudio ?? null;
}

type Presence = { active?: boolean | null; visible?: boolean | null; streaming?: boolean | null };

// Informa al servidor el estado que OBS expone a la fuente de navegador.
// OBS solo avisa cambios: hasta el primer cambio de escena, "activo" queda sin confirmar.
export function useObsPresence(token: string, clientId: string | null) {
  useEffect(() => {
    const obs = obsStudio();
    if (!obs || !clientId) return;
    const state: Presence = {};
    let stopped = false;
    function report(change: Presence) {
      Object.assign(state, change);
      if (stopped) return;
      void fetch(`/api/presence?${new URLSearchParams({ token })}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: clientId, ...state }),
      }).catch(() => undefined);
    }
    const onActive = (event: Event) => report({ active: Boolean((event as CustomEvent).detail?.active) });
    const onVisible = (event: Event) => report({ visible: Boolean((event as CustomEvent).detail?.visible) });
    const onStreamingStarted = () => report({ streaming: true });
    const onStreamingStopped = () => report({ streaming: false });
    window.addEventListener("obsSourceActiveChanged", onActive);
    window.addEventListener("obsSourceVisibleChanged", onVisible);
    window.addEventListener("obsStreamingStarted", onStreamingStarted);
    window.addEventListener("obsStreamingStopped", onStreamingStopped);
    report({});
    // getStatus requiere el permiso "Acceso de lectura al estado de OBS" en la fuente.
    try {
      obs.getStatus?.((status) => {
        if (typeof status?.streaming === "boolean") report({ streaming: status.streaming });
      });
    } catch { /* Permiso insuficiente: el estado de transmision queda sin confirmar. */ }
    return () => {
      stopped = true;
      window.removeEventListener("obsSourceActiveChanged", onActive);
      window.removeEventListener("obsSourceVisibleChanged", onVisible);
      window.removeEventListener("obsStreamingStarted", onStreamingStarted);
      window.removeEventListener("obsStreamingStopped", onStreamingStopped);
    };
  }, [token, clientId]);
}
