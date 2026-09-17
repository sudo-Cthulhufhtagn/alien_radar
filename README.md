# Tactical Radar PWA (ESP32-C3 + HLK-LD2450)

A Progressive Web App that turns a phone into a tactical radar display for a custom hardware prop. An ESP32-C3
reads 24GHz mmWave telemetry from an HLK-LD2450 sensor and streams it over Bluetooth LE; the PWA connects via Web
Bluetooth, parses the target coordinates, and renders an animated, thematic radar sweep on an HTML5 canvas.

There is no server-side bridge — the browser talks directly to the ESP32-C3 over Web Bluetooth. The whole system is
just firmware + a static web app. See [requirements.md](requirements.md) for the original design brief.

## What It Does

- Tracks up to 3 targets from the HLK-LD2450 (mmWave radar, up to 6m range, 60° field of view) and streams them
  over BLE at ~10Hz.
- Renders a full-screen canvas radar: origin anchored at bottom-center, cone projecting upward, phosphor-style
  fading trails, a rotating/scanning sweep, and pulsing (or geometric) target markers — all driven by a JS theme
  engine (`webapp/src/themes.js`), never CSS.
- Two built-in themes: **Alien Tracker** (green phosphor, circular pulses, polar sweep) and **Warhammer 40k**
  (blue/gold holo, geometric grid, linear scan).
- Advanced Tracking mode: draws a 1-second motion-prediction vector per target, with a choice of speed source —
  the sensor's own reported speed, or one calculated locally from a position history buffer.
- Proximity audio: a synthetic radar ping whose tempo accelerates as the single closest target's forward distance
  decreases. Muted until the user's first tap (browser autoplay policy).
- A hidden gesture (double-tap or swipe-down) reveals Settings — the live radar screen otherwise stays completely
  clean. All settings persist in `localStorage`, with a "Reset to Defaults" button.
- A CSS-only portrait-mode warning (the app is designed for landscape; screen orientation is never force-locked).
- Installable PWA: manifest + a minimal offline-caching service worker.

## Monorepo Layout

```text
.
├── platformio.ini     # PlatformIO project config (src/include/lib dirs point into hardware/)
├── requirements.md     # Original design brief
├── hardware/           # ESP32-C3 firmware (src/, include/, lib/, test/)
├── webapp/             # Browser UI (Vite, vanilla JS, PWA)
└── README.md
```

`platformio.ini` lives at the repo root so a plain `pio run` works from there; it points `src_dir`/`include_dir`/
`lib_dir`/`test_dir` at the corresponding folders under `hardware/`.

## Hardware

- Controller board: Adafruit QT Py ESP32-C3.
- Sensor: HLK-LD2450 24GHz mmWave radar, connected over UART1 — sensor TX → GPIO20, sensor RX → GPIO21
  (`hardware/src/main.cpp`), at the sensor's default 256000 baud.
- Power the LD2450 per its datasheet (5V) and share ground with the controller board.

## Software

### Firmware (`hardware/src/main.cpp`)

- Reads and header-syncs the LD2450's 30-byte binary frames off UART1, decodes up to 3 targets (X/Y in mm, speed
  in the sensor's own sign-bit-encoded 16-bit fields), and formats them as `T[ID]:[X],[Y],[Speed]|...`.
- Advertises a Nordic UART Service (NUS) over BLE and notifies that string on the standard NUS TX characteristic
  (`6e400003-...`) whenever a new frame decodes, at whatever rate the sensor produces them (~10Hz).
- Restarts BLE advertising on client disconnect (`BLEServerCallbacks::onDisconnect`) — without this the board
  becomes unreachable after any disconnect (including a browser tab reload) until power-cycled.

### Web App (`webapp/`)

- Vanilla JS + Vite, no framework.
- `src/ble.js` — Web Bluetooth transport, connects to the NUS service and parses the telemetry string.
- `src/tracking.js` — per-target position history, used for the locally-calculated speed option and for the
  vector-prediction heading (the sensor gives a speed magnitude but no direction).
- `src/radar-renderer.js` — the canvas theme engine: projection, fading sweep, grid, target markers, prediction
  vectors.
- `src/themes.js` — theme config objects (`alien`, `wh40k`) consumed by the renderer and, via CSS custom
  properties, by the surrounding chrome.
- `src/audio.js` — Web Audio proximity ping, muted until unlocked by a user gesture.
- `src/settings.js` — `localStorage`-backed settings with defaults and reset.
- `src/main.js` — wires all of the above together: onboarding, the hidden gesture, the connect flow, and the
  throttled `requestAnimationFrame` render loop.

## BLE Protocol

- **Service UUID:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART Service)
- **Telemetry characteristic (notify):** `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- **Payload:** `T[ID]:[X],[Y],[Speed]|T[ID]:[X],[Y],[Speed]|...` — X/Y in millimeters relative to the sensor
  (origin), speed in m/s. Only active target slots are included.

## Development

Web app:

```powershell
cd webapp
npm install
npm run dev
```

Open the local Vite URL on a Chromium-based browser that supports Web Bluetooth (desktop Chrome/Edge, or Android
Chrome — not supported on iOS Safari) and use the served-over-HTTPS/localhost origin to connect.

Firmware, from the repo root:

```bash
platformio run --target upload
platformio device monitor
```

## Docker Deploy

```bash
cd webapp
docker build -t alien-radar-webapp:latest .
docker run --rm -p 8080:80 alien-radar-webapp:latest
```

Coolify deploy helper:

```powershell
.\webapp\deploy-coolify.ps1 -CoolifyDomain "YOUR_COOLIFY_DOMAIN" -AppUuid "YOUR_APP_UUID" -Token "YOUR_COOLIFY_TOKEN"
```

GitHub Pages deploys automatically on push to `master` via `.github/workflows/pages.yml` (builds `webapp/`,
publishes `webapp/dist`).

## Status / Known Gaps

- Built from `requirements.md` and not yet driven end-to-end against real hardware — the BLE protocol, radar
  math, and UI flow all follow the spec but haven't been verified against a live LD2450 + ESP32-C3 + browser
  chain yet.
- iOS is not a target (no Web Bluetooth support in Safari).
