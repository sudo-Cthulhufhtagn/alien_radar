const STORAGE_KEY = 'alienRadar:settings';
const ONBOARDING_KEY = 'alienRadar:onboardingSeen';

export const DEFAULT_SETTINGS = {
  theme: 'alien',
  rangeM: 4, // 2 | 4 | 6
  refreshRateHz: 30, // throttle slider, 5-60
  showLatency: false,
  advancedTracking: false,
  speedSource: 'native', // 'native' | 'calculated'
  audioEnabled: false,
  demoMode: false, // simulate a random-walking target when no sensor is connected
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable (private browsing, quota) — settings just won't persist.
  }
}

export function resetSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT_SETTINGS };
}

export function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    // ignore
  }
}
