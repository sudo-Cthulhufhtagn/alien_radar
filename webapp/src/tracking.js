// Per-target history buffers, used for two things when "Advanced Tracking" is
// on: (1) a locally-calculated speed (delta-distance / delta-time) as an
// alternative to the LD2450's own reported speed, and (2) a heading direction
// for the vector-prediction line — the sensor gives a speed magnitude but no
// direction, so heading always comes from recent motion regardless of which
// speed source is selected.

const HISTORY_LENGTH = 20;
const HEADING_LOOKBACK = 6;

export class TargetTracker {
  constructor() {
    this.history = new Map();
  }

  reset() {
    this.history.clear();
  }

  // Returns `targets` enriched with calculatedSpeedMps/headingX/headingY.
  update(targets, timestampMs) {
    const seen = new Set();

    const enriched = targets.map((target) => {
      seen.add(target.id);
      const hist = this.history.get(target.id) ?? [];
      hist.push({ x: target.x, y: target.y, t: timestampMs });
      while (hist.length > HISTORY_LENGTH) {
        hist.shift();
      }
      this.history.set(target.id, hist);

      const { speedMps, headingX, headingY } = estimateMotion(hist);
      return { ...target, calculatedSpeedMps: speedMps, headingX, headingY };
    });

    for (const id of this.history.keys()) {
      if (!seen.has(id)) {
        this.history.delete(id);
      }
    }

    return enriched;
  }
}

function estimateMotion(history) {
  if (history.length < 2) {
    return { speedMps: 0, headingX: 0, headingY: 0 };
  }

  const newest = history[history.length - 1];
  const oldest = history[Math.max(0, history.length - HEADING_LOOKBACK)];
  const dtMs = newest.t - oldest.t;
  if (dtMs <= 0) {
    return { speedMps: 0, headingX: 0, headingY: 0 };
  }

  const dx = newest.x - oldest.x;
  const dy = newest.y - oldest.y;
  const distanceMm = Math.hypot(dx, dy);
  // mm/ms is numerically identical to m/s, so no unit conversion is needed.
  const speedMps = distanceMm / dtMs;
  const headingLength = distanceMm || 1;

  return { speedMps, headingX: dx / headingLength, headingY: dy / headingLength };
}
