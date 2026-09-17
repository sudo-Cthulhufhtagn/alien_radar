Here is the comprehensive technical handover document. Copy and paste this directly to your coding agent when you are ready to begin development.

---

# SYSTEM HANDOVER: Tactical Radar PWA (ESP32-C3 + HLK-LD2450)

## 1. Project Overview

Build a Progressive Web App (PWA) that acts as a tactical radar display for a custom hardware prop. The hardware consists of an ESP32-C3 microcontroller reading 24GHz mmWave radar telemetry (HLK-LD2450) and broadcasting it via BLE. The PWA connects via Web Bluetooth, parses the coordinate data, and renders a highly thematic, animated radar UI using HTML5 Canvas 2D.

## 2. Tech Stack & Architecture

* **Platform:** Mobile-first PWA (HTML/CSS/Vanilla JS).
* **Rendering:** HTML5 `<canvas>` (2D API).
* **Comms:** Web Bluetooth API.
* **Storage:** `localStorage` for settings persistence.

## 3. Hardware & Communications Protocol

The app must connect to the ESP32-C3 using the **Nordic UART Service (NUS)**.

* **Service UUID:** `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
* **RX Characteristic (Data from ESP32):** `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
* **Payload Format:** The ESP32 will continuously stream string data at ~10Hz. Parse the incoming string format: `T[ID]:[X],[Y],[Speed]|...` (e.g., `T1:-1050,2200,1.5|T2:400,1800,0`). Coordinates are in millimeters. Origin (0,0) is the sensor.
* **Data Pipeline:** The PWA receives data as fast as the ESP32 sends it, but visual rendering is throttled by a user-configurable "Refresh Rate" setting tied to `requestAnimationFrame` pacing.

## 4. UI & Layout Specifications

* **Prop Mode:** The physical sensor is attached to the user's phone.
* **Coordinate Mapping:** The radar origin is anchored at the **bottom-center** of the screen. The radar projects a 60° cone forward (upwards on the Y-axis).
* **Orientation Handling:** The UI is designed for Landscape. Do not force screen lock via API. Instead, use CSS media queries to detect Portrait mode and apply a soft, themed blur overlay to the screen edges with a text warning: "Rotate Device for Tactical View."
* **Hidden Interactions:** The main radar screen must remain 100% clean and immersive. Implement a hidden gesture (double-tap or swipe-down) to reveal the Settings modal.

## 5. Rendering & Theming Engine

Do not use CSS for radar aesthetics. Implement a **JavaScript Theme Engine**.

* **Fading Sweep:** Use `ctx.fillStyle = 'rgba(bg_color, alpha)'` over the entire canvas on each frame to create classic phosphor fading trails.
* **Theme Config Objects:** Create a `themes.js` file with configuration objects. The render loop must read from the active theme object.
* *Example properties:* `dotColor`, `gridColor`, `backgroundColor`, `fontFamily`, `fadeAlpha`, `radarSweepStyle` (polar vs linear).
* *Required Themes:* "Alien Tracker" (green phosphor, circular pulses) and "Warhammer 40k" (blue/gold holo, geometric grids).



## 6. Advanced Tracking Math

When "Advanced Tracking" is enabled in settings:

* **Vector Prediction:** Draw a vector line projecting from the target's current position indicating direction of travel.
* **Vector Length:** The length of the line must represent exactly **1 second of extrapolated movement**. (e.g., If speed is 1.2 m/s, the line drawn is scaled to 1.2 meters on the canvas).
* **Speed Calculation Source:** Provide a setting to toggle the math source:
1. *Native:* Use the speed value passed directly from the LD2450 payload.
2. *Calculated:* Maintain a Javascript history buffer (last 10-20 coordinates per target ID) to calculate delta-distance over delta-time locally.



## 7. Audio Engine

* **Initialization:** Modern browsers block autoplay. The app must start completely muted. Ensure the Web Audio API context is initialized upon the user's first interaction (the onboarding screen).
* **Proximity Ping:** A synthetic radar "beep".
* **Tempo Logic:** The interval between beeps is calculated dynamically based **only on the single closest target** to the origin (0,0). As the closest target's Y-distance decreases, the tempo accelerates.

## 8. Settings & State Management

Persist all settings in `localStorage`. Load them on boot. Include a "Reset to Defaults" button.

* **Required Settings:**
* Theme Selection (Alien / WH40k).
* Radar Range Zoom (2m, 4m, 6m scale toggle).
* Visual Refresh Rate (throttle slider).
* Show Real Latency (boolean, displays ms delay).
* Advanced Tracking (boolean, toggles vectors/speed labels).
* Speed Source (Native / Calculated).
* Audio (boolean).



## 9. UX Flow & Initialization

1. **Boot:** User opens PWA.
2. **Onboarding (First-time only):** Show a brief, thematic overlay explaining the radar cone, the 6m max range, and the hidden gesture (swipe/double-tap) to access settings. User taps to acknowledge (this tap unlocks the AudioContext).
3. **Connection:** User taps a thematic "LINK SENSOR" button to trigger the Web Bluetooth pairing prompt.
4. **Live State:** Once paired, hide all menus. Canvas takes over drawing the parsed telemetry based on the injected `theme` object.