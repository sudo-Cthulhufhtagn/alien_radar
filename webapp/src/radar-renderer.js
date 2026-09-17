// JS theme engine driving the canvas: every color/behavior comes from the
// active theme object (themes.js), never from CSS. Origin is anchored at
// bottom-center; the sensor's 60° field of view projects upward (+Y forward).

const HALF_FOV_RAD = Math.PI / 6; // 30°, i.e. a 60° cone
const UP_ANGLE_RAD = -Math.PI / 2;
const CONE_START_RAD = UP_ANGLE_RAD - HALF_FOV_RAD;
const CONE_END_RAD = UP_ANGLE_RAD + HALF_FOV_RAD;
const SWEEP_PERIOD_MS = 3000;

export class RadarRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this._primed = false;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._primed = false;
  }

  _project(xMm, yMm, rangeMm) {
    const originX = this.width / 2;
    const originY = this.height * 0.96;
    const scaleX = (this.width * 0.98) / rangeMm;
    const scaleY = (this.height * 0.92) / (rangeMm * Math.cos(HALF_FOV_RAD));
    const scale = Math.min(scaleX, scaleY);
    return { x: originX + xMm * scale, y: originY - yMm * scale, originX, originY, scale };
  }

  // frame = { targets, theme, settings, nowMs, latencyMs }
  render(frame) {
    const { theme, settings, nowMs } = frame;
    const { ctx, width, height } = this;
    const rangeMm = settings.rangeM * 1000;
    const { originX, originY, scale } = this._project(0, 0, rangeMm);

    if (!this._primed) {
      ctx.fillStyle = theme.backgroundColor;
      ctx.fillRect(0, 0, width, height);
      this._primed = true;
    } else {
      ctx.fillStyle = hexOrRgbaWithAlpha(theme.backgroundColor, theme.fadeAlpha);
      ctx.fillRect(0, 0, width, height);
    }

    this._drawGrid(theme, settings, originX, originY, scale, rangeMm);
    this._drawSweep(theme, nowMs, originX, originY, scale, rangeMm);

    for (const target of frame.targets) {
      this._drawTarget(target, theme, settings, originX, originY, scale, rangeMm, nowMs);
    }

    this._drawOrigin(theme, originX, originY);
  }

  _drawGrid(theme, settings, originX, originY, scale, rangeMm) {
    const { ctx } = this;
    ctx.save();
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;
    ctx.font = `12px ${theme.fontFamily}`;
    ctx.fillStyle = theme.gridColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const ringCount = settings.rangeM;
    for (let i = 1; i <= ringCount; i += 1) {
      const radius = (i * 1000) * scale;
      ctx.beginPath();
      ctx.arc(originX, originY, radius, CONE_START_RAD, CONE_END_RAD);
      ctx.stroke();

      const labelX = originX + radius * Math.cos(CONE_END_RAD);
      const labelY = originY + radius * Math.sin(CONE_END_RAD);
      ctx.fillText(`${i}m`, labelX + 4, labelY);
    }

    ctx.strokeStyle = theme.gridColorBright;
    ctx.beginPath();
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + rangeMm * scale * Math.cos(CONE_START_RAD), originY + rangeMm * scale * Math.sin(CONE_START_RAD));
    ctx.moveTo(originX, originY);
    ctx.lineTo(originX + rangeMm * scale * Math.cos(CONE_END_RAD), originY + rangeMm * scale * Math.sin(CONE_END_RAD));
    ctx.stroke();

    if (theme.radarSweepStyle === 'linear') {
      // Geometric cross-hatch inside the cone, on top of the range rings.
      ctx.strokeStyle = theme.gridColor;
      const step = rangeMm / (settings.rangeM * 2);
      for (let d = step; d < rangeMm; d += step) {
        const leftX = originX + d * scale * Math.cos(CONE_START_RAD);
        const leftY = originY + d * scale * Math.sin(CONE_START_RAD);
        const rightX = originX + d * scale * Math.cos(CONE_END_RAD);
        const rightY = originY + d * scale * Math.sin(CONE_END_RAD);
        ctx.beginPath();
        ctx.moveTo(leftX, leftY);
        ctx.lineTo(rightX, rightY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  _drawSweep(theme, nowMs, originX, originY, scale, rangeMm) {
    const { ctx } = this;
    const phase = (nowMs % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS;
    ctx.save();

    if (theme.radarSweepStyle === 'polar') {
      // Sweep angle oscillates back and forth across the cone (a full 360°
      // rotation would leave the cone most of the time, so it pendulums).
      const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const sweepAngle = CONE_START_RAD + triangle * (CONE_END_RAD - CONE_START_RAD);
      const radius = rangeMm * scale;
      const gradient = ctx.createRadialGradient(originX, originY, 0, originX, originY, radius);
      gradient.addColorStop(0, theme.sweepColor);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.arc(originX, originY, radius, sweepAngle - 0.18, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    } else {
      // Linear scan line sweeping from the origin up to max range and back.
      const triangle = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      const distanceMm = triangle * rangeMm;
      const leftX = originX + distanceMm * scale * Math.cos(CONE_START_RAD);
      const leftY = originY + distanceMm * scale * Math.sin(CONE_START_RAD);
      const rightX = originX + distanceMm * scale * Math.cos(CONE_END_RAD);
      const rightY = originY + distanceMm * scale * Math.sin(CONE_END_RAD);

      ctx.strokeStyle = theme.sweepColor;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.stroke();
    }

    ctx.restore();
  }

  _drawTarget(target, theme, settings, originX, originY, scale, rangeMm, nowMs) {
    const { ctx } = this;
    const px = originX + target.x * scale;
    const py = originY - target.y * scale;
    const dotRadius = 6;

    ctx.save();

    if (theme.pulseTargets) {
      const pulsePhase = (nowMs % 1500) / 1500;
      const pulseRadius = dotRadius + pulsePhase * 22;
      ctx.globalAlpha = 1 - pulsePhase;
      ctx.strokeStyle = theme.dotGlowColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, pulseRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    const glow = ctx.createRadialGradient(px, py, 0, px, py, dotRadius * 3);
    glow.addColorStop(0, theme.dotGlowColor);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, dotRadius * 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.dotColor;
    if (theme.markerShape === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(px, py - dotRadius);
      ctx.lineTo(px + dotRadius, py);
      ctx.lineTo(px, py + dotRadius);
      ctx.lineTo(px - dotRadius, py);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(px, py, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (settings.advancedTracking) {
      const speedMps = settings.speedSource === 'calculated' ? target.calculatedSpeedMps ?? 0 : target.speed;
      const vectorLengthMm = speedMps * 1000; // 1 second of extrapolated movement
      const vx = px + (target.headingX ?? 0) * vectorLengthMm * scale;
      const vy = py - (target.headingY ?? 0) * vectorLengthMm * scale;

      ctx.strokeStyle = theme.vectorColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(vx, vy);
      ctx.stroke();

      ctx.fillStyle = theme.textColor;
      ctx.font = `11px ${theme.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${speedMps.toFixed(1)} m/s`, px + dotRadius + 4, py - dotRadius);
    }

    ctx.restore();
  }

  _drawOrigin(theme, originX, originY) {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = theme.accentColor;
    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function hexOrRgbaWithAlpha(color, alpha) {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const bigint = parseInt(hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return color;
}
