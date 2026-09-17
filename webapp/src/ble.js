// Web Bluetooth transport for the ESP32-C3's Nordic UART Service. The
// firmware notifies plain-text frames on the "TX" characteristic:
// "T[ID]:[X],[Y],[Speed]|T[ID]:[X],[Y],[Speed]|...", coordinates in mm.

const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TELEMETRY_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

const textDecoder = new TextDecoder('utf-8');

export function parseTelemetry(payload) {
  if (!payload) {
    return [];
  }

  return payload
    .split('|')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const separator = chunk.indexOf(':');
      if (separator <= 0) {
        return null;
      }
      const id = chunk.slice(0, separator);
      const [xStr, yStr, speedStr] = chunk.slice(separator + 1).split(',');
      const x = Number(xStr);
      const y = Number(yStr);
      const speed = Number(speedStr);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(speed)) {
        return null;
      }
      return { id, x, y, speed };
    })
    .filter(Boolean);
}

export class RadarSensor {
  constructor({ onTargets, onConnected, onDisconnected } = {}) {
    this.onTargets = onTargets;
    this.onConnected = onConnected;
    this.onDisconnected = onDisconnected;
    this.device = null;
    this.characteristic = null;
    this._handleDisconnectedEvent = () => this._handleDisconnected();
    this._handleValueEvent = (event) => this._handleValue(event.target.value);
  }

  get isConnected() {
    return Boolean(this.device?.gatt?.connected);
  }

  static get isSupported() {
    return Boolean(navigator.bluetooth);
  }

  async connect() {
    if (!navigator.bluetooth) {
      throw new Error('Web Bluetooth is not available in this browser.');
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [SERVICE_UUID] }],
    });
    device.addEventListener('gattserverdisconnected', this._handleDisconnectedEvent);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(TELEMETRY_CHARACTERISTIC_UUID);

    characteristic.addEventListener('characteristicvaluechanged', this._handleValueEvent);
    await characteristic.startNotifications();

    this.device = device;
    this.characteristic = characteristic;
    this.onConnected?.();
  }

  disconnect() {
    if (this.device?.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  _handleValue(dataView) {
    const payload = textDecoder.decode(dataView);
    this.onTargets?.(parseTelemetry(payload), performance.now());
  }

  _handleDisconnected() {
    this.characteristic = null;
    this.onDisconnected?.();
  }
}
