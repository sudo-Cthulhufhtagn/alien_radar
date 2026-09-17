import './style.css';
import { RadarSensor } from './ble.js';
import { TargetTracker } from './tracking.js';
import { AudioEngine } from './audio.js';
import { RadarRenderer } from './radar-renderer.js';
import { getTheme, applyThemeToDocument } from './themes.js';
import {
  loadSettings,
  saveSettings,
  resetSettings,
  hasSeenOnboarding,
  markOnboardingSeen,
} from './settings.js';

const canvas = document.getElementById('radarCanvas');
const renderer = new RadarRenderer(canvas);
const tracker = new TargetTracker();
const audioEngine = new AudioEngine();

let settings = loadSettings();
let latestTargets = [];
let lastPacketAt = 0;

const els = {
  latencyReadout: document.getElementById('latencyReadout'),
  linkButton: document.getElementById('linkButton'),
  errorToast: document.getElementById('errorToast'),
  onboardingOverlay: document.getElementById('onboardingOverlay'),
  acknowledgeButton: document.getElementById('acknowledgeButton'),
  settingsOverlay: document.getElementById('settingsOverlay'),
  settingsCloseButton: document.getElementById('settingsCloseButton'),
  themeSelect: document.getElementById('themeSelect'),
  rangeSelect: document.getElementById('rangeSelect'),
  refreshRateSlider: document.getElementById('refreshRateSlider'),
  refreshRateValue: document.getElementById('refreshRateValue'),
  showLatencyCheckbox: document.getElementById('showLatencyCheckbox'),
  advancedTrackingCheckbox: document.getElementById('advancedTrackingCheckbox'),
  speedSourceSelect: document.getElementById('speedSourceSelect'),
  audioCheckbox: document.getElementById('audioCheckbox'),
  connectionPill: document.getElementById('connectionPill'),
  disconnectButton: document.getElementById('disconnectButton'),
  resetSettingsButton: document.getElementById('resetSettingsButton'),
};

const sensor = new RadarSensor({
  onTargets: handleTargets,
  onConnected: handleConnected,
  onDisconnected: handleDisconnected,
});

function handleTargets(targets, receivedAtMs) {
  latestTargets = tracker.update(targets, receivedAtMs);
  lastPacketAt = receivedAtMs;
}

function handleConnected() {
  els.linkButton.hidden = true;
  els.connectionPill.textContent = 'Linked';
  els.connectionPill.classList.replace('pill-off', 'pill-on');
  els.disconnectButton.disabled = false;
}

function handleDisconnected() {
  latestTargets = [];
  tracker.reset();
  els.linkButton.hidden = false;
  els.connectionPill.textContent = 'Disconnected';
  els.connectionPill.classList.replace('pill-on', 'pill-off');
  els.disconnectButton.disabled = true;
}

let errorTimeoutId = null;
function showError(message) {
  els.errorToast.textContent = message;
  els.errorToast.hidden = false;
  window.clearTimeout(errorTimeoutId);
  errorTimeoutId = window.setTimeout(() => {
    els.errorToast.hidden = true;
  }, 4000);
}

els.linkButton.addEventListener('click', async () => {
  try {
    await sensor.connect();
  } catch (err) {
    if (err?.name !== 'NotFoundError') {
      showError(err?.message || 'Could not connect to sensor.');
    }
  }
});

els.disconnectButton.addEventListener('click', () => sensor.disconnect());

// --- Audio unlock: must happen on a real user gesture (autoplay policy). The
// onboarding "Acknowledge" tap covers first-time users; this covers everyone
// else's first tap on the app (LINK SENSOR, the hidden gesture, etc).
function unlockAudioOnce() {
  audioEngine.init();
  audioEngine.setEnabled(settings.audioEnabled);
  window.removeEventListener('pointerdown', unlockAudioOnce);
}
window.addEventListener('pointerdown', unlockAudioOnce, { once: true });

// --- Onboarding ---
function openOnboarding() {
  els.onboardingOverlay.classList.add('open');
  els.onboardingOverlay.setAttribute('aria-hidden', 'false');
}
function closeOnboarding() {
  els.onboardingOverlay.classList.remove('open');
  els.onboardingOverlay.setAttribute('aria-hidden', 'true');
}

els.acknowledgeButton.addEventListener('click', () => {
  markOnboardingSeen();
  closeOnboarding();
});

if (hasSeenOnboarding()) {
  closeOnboarding();
} else {
  openOnboarding();
}

// --- Settings modal ---
function openSettings() {
  els.settingsOverlay.classList.add('open');
  els.settingsOverlay.setAttribute('aria-hidden', 'false');
}
function closeSettings() {
  els.settingsOverlay.classList.remove('open');
  els.settingsOverlay.setAttribute('aria-hidden', 'true');
}

els.settingsCloseButton.addEventListener('click', closeSettings);

function applySettingsToForm() {
  els.themeSelect.value = settings.theme;
  els.rangeSelect.value = String(settings.rangeM);
  els.refreshRateSlider.value = String(settings.refreshRateHz);
  els.refreshRateValue.textContent = String(settings.refreshRateHz);
  els.showLatencyCheckbox.checked = settings.showLatency;
  els.advancedTrackingCheckbox.checked = settings.advancedTracking;
  els.speedSourceSelect.value = settings.speedSource;
  els.speedSourceSelect.disabled = !settings.advancedTracking;
  els.audioCheckbox.checked = settings.audioEnabled;
  els.latencyReadout.hidden = !settings.showLatency;
  audioEngine.setEnabled(settings.audioEnabled);
  applyThemeToDocument(getTheme(settings.theme));
}

function persist() {
  saveSettings(settings);
}

els.themeSelect.addEventListener('change', () => {
  settings.theme = els.themeSelect.value;
  applyThemeToDocument(getTheme(settings.theme));
  persist();
});
els.rangeSelect.addEventListener('change', () => {
  settings.rangeM = Number(els.rangeSelect.value);
  persist();
});
els.refreshRateSlider.addEventListener('input', () => {
  settings.refreshRateHz = Number(els.refreshRateSlider.value);
  els.refreshRateValue.textContent = String(settings.refreshRateHz);
  persist();
});
els.showLatencyCheckbox.addEventListener('change', () => {
  settings.showLatency = els.showLatencyCheckbox.checked;
  els.latencyReadout.hidden = !settings.showLatency;
  persist();
});
els.advancedTrackingCheckbox.addEventListener('change', () => {
  settings.advancedTracking = els.advancedTrackingCheckbox.checked;
  els.speedSourceSelect.disabled = !settings.advancedTracking;
  persist();
});
els.speedSourceSelect.addEventListener('change', () => {
  settings.speedSource = els.speedSourceSelect.value;
  persist();
});
els.audioCheckbox.addEventListener('change', () => {
  settings.audioEnabled = els.audioCheckbox.checked;
  audioEngine.setEnabled(settings.audioEnabled);
  persist();
});
els.resetSettingsButton.addEventListener('click', () => {
  settings = resetSettings();
  applySettingsToForm();
});

applySettingsToForm();

// --- Hidden gesture: double-tap or swipe-down anywhere on the canvas opens Settings ---
const DOUBLE_TAP_MAX_INTERVAL_MS = 350;
const SWIPE_MIN_DY = 70;
const SWIPE_MAX_DX = 60;
const SWIPE_MAX_DURATION_MS = 600;

let lastTapAt = 0;
let pointerStart = null;

canvas.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, t: performance.now() };
});

canvas.addEventListener('pointerup', (event) => {
  const now = performance.now();
  const start = pointerStart;
  pointerStart = null;

  if (start) {
    const dy = event.clientY - start.y;
    const dx = Math.abs(event.clientX - start.x);
    const duration = now - start.t;
    if (dy > SWIPE_MIN_DY && dx < SWIPE_MAX_DX && duration < SWIPE_MAX_DURATION_MS) {
      openSettings();
      lastTapAt = 0;
      return;
    }
  }

  if (now - lastTapAt < DOUBLE_TAP_MAX_INTERVAL_MS) {
    openSettings();
    lastTapAt = 0;
  } else {
    lastTapAt = now;
  }
});

// --- Render loop ---
let lastRenderAt = 0;

function frame(nowMs) {
  window.requestAnimationFrame(frame);

  audioEngine.update(latestTargets, settings.rangeM * 1000, nowMs);

  if (settings.showLatency) {
    const latencyMs = lastPacketAt ? Math.round(performance.now() - lastPacketAt) : null;
    els.latencyReadout.textContent = latencyMs === null ? '-- ms' : `${latencyMs} ms`;
  }

  const minIntervalMs = 1000 / settings.refreshRateHz;
  if (nowMs - lastRenderAt < minIntervalMs) {
    return;
  }
  lastRenderAt = nowMs;

  renderer.render({
    targets: latestTargets,
    theme: getTheme(settings.theme),
    settings,
    nowMs,
  });
}

function handleResize() {
  renderer.resize();
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);
handleResize();
window.requestAnimationFrame(frame);

// --- Service worker (offline app shell) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
