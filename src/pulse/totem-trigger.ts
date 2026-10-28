export const TOTEM_THRESHOLD = 140;
export const TOTEM_REARM = 135;
export const TOTEM_COOLDOWN_MS = 10000;

export class TotemTrigger {
  private previous: number | null = null;
  private armed = false;
  private lastPop = -Infinity;

  update(bpm: number | null, now: number) {
    if (bpm === null) { this.previous = null; this.armed = false; return false; }
    if (this.previous === null) {
      this.previous = bpm;
      this.armed = bpm < TOTEM_THRESHOLD;
      return false;
    }
    if (bpm <= TOTEM_REARM) this.armed = true;
    const crossed = this.previous < TOTEM_THRESHOLD && bpm >= TOTEM_THRESHOLD;
    this.previous = bpm;
    if (!crossed || !this.armed) return false;
    this.armed = false;
    if (now - this.lastPop < TOTEM_COOLDOWN_MS) return false;
    this.lastPop = now;
    return true;
  }
}
