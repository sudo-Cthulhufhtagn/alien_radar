// Settings > Demo mode: simulates a target random-walking inside the sensor's
// cone, so the UI can be exercised (and screenshotted) without real hardware.
// Output shape matches ble.js's parseTelemetry() so it can feed the same
// handleTargets() pipeline as a real BLE notification.

const ACCEL_MM_S2 = 900;
const MAX_SPEED_MMS = 1800;
const HALF_FOV_RAD = Math.PI / 6; // 30°, matches the sensor's 60° cone
const EDGE_MARGIN = 0.95;

export class DemoSimulator {
  constructor(targetCount = 1) {
    this.targets = Array.from({ length: targetCount }, (_, i) => this._spawn(i + 1));
  }

  _spawn(index) {
    return { id: `T${index}`, x: (Math.random() - 0.5) * 1000, y: 1000 + Math.random() * 1500, vx: 0, vy: 0 };
  }

  // Advances the simulation by dtMs and returns targets in the same shape as
  // parseTelemetry(): { id, x, y, speed } with x/y in mm and speed in m/s.
  tick(dtMs, rangeMm) {
    const dtS = Math.min(0.25, dtMs / 1000);

    for (const target of this.targets) {
      target.vx += (Math.random() - 0.5) * ACCEL_MM_S2 * dtS;
      target.vy += (Math.random() - 0.5) * ACCEL_MM_S2 * dtS;

      const speedMms = Math.hypot(target.vx, target.vy);
      if (speedMms > MAX_SPEED_MMS) {
        target.vx = (target.vx / speedMms) * MAX_SPEED_MMS;
        target.vy = (target.vy / speedMms) * MAX_SPEED_MMS;
      }

      target.x += target.vx * dtS;
      target.y += target.vy * dtS;

      // Bounce off the cone's near/far range and its slanted side edges so
      // the target stays inside the field of view indefinitely.
      const maxY = rangeMm * EDGE_MARGIN;
      if (target.y < 150) {
        target.y = 150;
        target.vy = Math.abs(target.vy);
      } else if (target.y > maxY) {
        target.y = maxY;
        target.vy = -Math.abs(target.vy);
      }

      const maxX = target.y * Math.tan(HALF_FOV_RAD) * EDGE_MARGIN;
      if (target.x < -maxX) {
        target.x = -maxX;
        target.vx = Math.abs(target.vx);
      } else if (target.x > maxX) {
        target.x = maxX;
        target.vx = -Math.abs(target.vx);
      }
    }

    return this.targets.map((target) => ({
      id: target.id,
      x: Math.round(target.x),
      y: Math.round(target.y),
      speed: Number((Math.hypot(target.vx, target.vy) / 1000).toFixed(2)),
    }));
  }
}
