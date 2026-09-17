// Theme config objects. The canvas render loop (radar-renderer.js) reads
// colors/behavior from these — no radar aesthetics live in CSS. Chrome UI
// (buttons, modal) still reads the same values via CSS custom properties set
// from applyThemeToDocument(), so the whole app stays in sync off one object.

export const THEMES = {
  alien: {
    id: 'alien',
    label: 'Alien Tracker',
    backgroundColor: '#020a04',
    fadeAlpha: 0.22,
    gridColor: 'rgba(70, 255, 140, 0.35)',
    gridColorBright: 'rgba(140, 255, 190, 0.65)',
    dotColor: '#6dffb0',
    dotGlowColor: 'rgba(109, 255, 176, 0.55)',
    vectorColor: 'rgba(190, 255, 220, 0.85)',
    sweepColor: 'rgba(90, 255, 150, 0.16)',
    textColor: '#a9ffcf',
    accentColor: '#39ff8f',
    warningColor: '#ff5566',
    fontFamily: "'Courier New', ui-monospace, monospace",
    radarSweepStyle: 'polar',
    markerShape: 'circle',
    pulseTargets: true,
  },
  wh40k: {
    id: 'wh40k',
    label: 'Warhammer 40k',
    backgroundColor: '#050810',
    fadeAlpha: 0.16,
    gridColor: 'rgba(120, 170, 255, 0.35)',
    gridColorBright: 'rgba(255, 205, 90, 0.6)',
    dotColor: '#ffd24d',
    dotGlowColor: 'rgba(255, 210, 77, 0.55)',
    vectorColor: 'rgba(255, 225, 160, 0.85)',
    sweepColor: 'rgba(120, 170, 255, 0.14)',
    textColor: '#cfe0ff',
    accentColor: '#7aa2ff',
    warningColor: '#ff4d4d',
    fontFamily: "Georgia, 'Times New Roman', serif",
    radarSweepStyle: 'linear',
    markerShape: 'diamond',
    pulseTargets: false,
  },
};

export const DEFAULT_THEME_ID = 'alien';

export function getTheme(id) {
  return THEMES[id] || THEMES[DEFAULT_THEME_ID];
}

export function applyThemeToDocument(theme) {
  const root = document.documentElement.style;
  root.setProperty('--radar-bg', theme.backgroundColor);
  root.setProperty('--radar-accent', theme.accentColor);
  root.setProperty('--radar-text', theme.textColor);
  root.setProperty('--radar-grid', theme.gridColor);
  root.setProperty('--radar-warning', theme.warningColor);
  root.setProperty('--radar-font', theme.fontFamily);
}
