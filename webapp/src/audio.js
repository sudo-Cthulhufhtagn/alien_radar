// Proximity ping engine. Must stay muted until the user's first interaction
// creates the AudioContext (the onboarding acknowledgement tap) — browsers
// block autoplay otherwise.

const MIN_INTERVAL_MS = 180;
const MAX_INTERVAL_MS = 1080;

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this._nextBeepAt = 0;
  }

  // Call from a user-gesture handler (e.g. the onboarding "acknowledge" tap).
  init() {
    if (this.ctx) {
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    this.ctx = new AudioContextClass();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled && this.ctx?.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  ping(frequencyHz = 880) {
    if (!this.ctx) {
      return;
    }
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequencyHz, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Tempo is driven only by the single closest target's forward (Y) distance
  // — the nearer it gets, the faster the beeps.
  update(targets, rangeMm, nowMs) {
    if (!this.enabled || !this.ctx || targets.length === 0) {
      return;
    }

    let closest = null;
    for (const target of targets) {
      if (!closest || target.y < closest.y) {
        closest = target;
      }
    }
    if (!closest) {
      return;
    }

    const proximity = Math.min(1, Math.max(0, closest.y / rangeMm));
    const intervalMs = MIN_INTERVAL_MS + proximity * (MAX_INTERVAL_MS - MIN_INTERVAL_MS);

    if (nowMs >= this._nextBeepAt) {
      this.ping();
      this._nextBeepAt = nowMs + intervalMs;
    }
  }
}
