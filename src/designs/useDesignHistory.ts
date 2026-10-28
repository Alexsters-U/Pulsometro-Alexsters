import { useCallback, useState } from "react";
import { defaultDesign, type OverlayDesign } from "../../shared/domain";

export function sameDesign(a: OverlayDesign, b: OverlayDesign) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function useDesignHistory() {
  const [history, setHistory] = useState<{
    past: OverlayDesign[];
    present: OverlayDesign;
    future: OverlayDesign[];
  }>({ past: [], present: defaultDesign, future: [] });
  const edit = useCallback(
    (change: OverlayDesign | ((current: OverlayDesign) => OverlayDesign)) => {
      setHistory((current) => {
        const next =
          typeof change === "function" ? change(current.present) : change;
        return sameDesign(next, current.present)
          ? current
          : {
              past: [...current.past.slice(-39), current.present],
              present: next,
              future: [],
            };
      });
    },
    [],
  );
  const reset = useCallback(
    (design: OverlayDesign) =>
      setHistory({ past: [], present: design, future: [] }),
    [],
  );
  const undo = useCallback(
    () =>
      setHistory((current) =>
        current.past.length
          ? {
              past: current.past.slice(0, -1),
              present: current.past.at(-1)!,
              future: [current.present, ...current.future],
            }
          : current,
      ),
    [],
  );
  const redo = useCallback(
    () =>
      setHistory((current) =>
        current.future.length
          ? {
              past: [...current.past, current.present],
              present: current.future[0],
              future: current.future.slice(1),
            }
          : current,
      ),
    [],
  );
  return {
    draft: history.present,
    edit,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
