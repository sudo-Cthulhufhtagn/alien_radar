#include <Arduino.h>
#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

// HLK-LD2450 UART wiring: sensor TX -> kRadarRxPin, sensor RX -> kRadarTxPin.
// These are the QT Py ESP32-C3's broken-out RX/TX pads (UART1), leaving UART0
// free for the USB-CDC "Serial" debug console.
static constexpr uint8_t kRadarRxPin = 20;
static constexpr uint8_t kRadarTxPin = 21;
static constexpr uint32_t kRadarBaud = 256000;

static constexpr uint8_t kMaxTargets = 3;
static constexpr uint8_t kFrameHeader[4] = {0xAA, 0xFF, 0x03, 0x00};
static constexpr uint8_t kFrameFooter[2] = {0x55, 0xCC};
static constexpr size_t kTargetRecordLen = 8;
static constexpr size_t kFrameBodyLen = kMaxTargets * kTargetRecordLen;
static constexpr size_t kFrameLen = sizeof(kFrameHeader) + kFrameBodyLen + sizeof(kFrameFooter);

static constexpr const char *kBleName = "Tactical-Radar";
// Nordic UART Service. The "TX" characteristic (data streamed out of the
// ESP32) is what the PWA subscribes to for notifications.
static constexpr const char *kServiceUuid = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
static constexpr const char *kTelemetryCharUuid = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

struct Target {
  int16_t x = 0;
  int16_t y = 0;
  float speedMps = 0;
  bool active = false;
};

HardwareSerial RadarSerial(1);
BLECharacteristic *telemetryChar = nullptr;
bool bleConnected = false;
Target targets[kMaxTargets];

// LD2450 coordinate/speed fields are 16-bit: the high bit is a sign flag (1 =
// positive) and the low 15 bits are the magnitude, rather than plain two's
// complement.
int16_t decodeSigned(uint16_t raw) {
  int16_t magnitude = static_cast<int16_t>(raw & 0x7FFF);
  return (raw & 0x8000) ? magnitude : static_cast<int16_t>(-magnitude);
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    bleConnected = true;
    Serial.println("BLE client connected");
  }

  void onDisconnect(BLEServer *server) override {
    // The BLE stack does not resume advertising on its own after a client
    // disconnects (including a browser tab reload dropping the connection
    // without a clean gatt.disconnect()) — without this, the device becomes
    // unreachable until it is power-cycled.
    bleConnected = false;
    Serial.println("BLE client disconnected, restarting advertising");
    server->getAdvertising()->start();
  }
};

void setupBle() {
  BLEDevice::init(kBleName);
  BLEDevice::setMTU(247);

  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ServerCallbacks());
  BLEService *service = server->createService(kServiceUuid);

  telemetryChar = service->createCharacteristic(kTelemetryCharUuid, BLECharacteristic::PROPERTY_NOTIFY);
  telemetryChar->addDescriptor(new BLE2902());

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(kServiceUuid);
  advertising->start();
}

// Feeds bytes from the LD2450 UART into a header-synced ring buffer. Returns
// true once a full, footer-verified frame has been decoded into `targets`.
bool readRadarFrame() {
  static uint8_t buffer[kFrameLen];
  static size_t bufferLen = 0;

  while (RadarSerial.available() > 0) {
    uint8_t incoming = static_cast<uint8_t>(RadarSerial.read());

    if (bufferLen < sizeof(kFrameHeader)) {
      if (incoming == kFrameHeader[bufferLen]) {
        buffer[bufferLen++] = incoming;
      } else {
        bufferLen = (incoming == kFrameHeader[0]) ? 1 : 0;
        if (bufferLen == 1) {
          buffer[0] = incoming;
        }
      }
      continue;
    }

    buffer[bufferLen++] = incoming;

    if (bufferLen == kFrameLen) {
      bool footerOk = buffer[kFrameLen - 2] == kFrameFooter[0] && buffer[kFrameLen - 1] == kFrameFooter[1];
      bufferLen = 0;
      if (!footerOk) {
        return false;
      }

      for (uint8_t i = 0; i < kMaxTargets; ++i) {
        const uint8_t *record = buffer + sizeof(kFrameHeader) + i * kTargetRecordLen;
        uint16_t rawX = record[0] | (record[1] << 8);
        uint16_t rawY = record[2] | (record[3] << 8);
        uint16_t rawSpeed = record[4] | (record[5] << 8);
        // record[6..7] is the sensor's distance-resolution field; unused here.

        int16_t x = decodeSigned(rawX);
        int16_t y = decodeSigned(rawY);
        int16_t speedCmS = decodeSigned(rawSpeed);

        targets[i].x = x;
        targets[i].y = y;
        targets[i].speedMps = speedCmS / 100.0f;
        targets[i].active = (x != 0 || y != 0);
      }

      return true;
    }
  }

  return false;
}

// Builds "T[ID]:[X],[Y],[Speed]|..." for every currently active target slot.
String buildTelemetryPayload() {
  String payload;
  bool first = true;

  for (uint8_t i = 0; i < kMaxTargets; ++i) {
    if (!targets[i].active) {
      continue;
    }
    if (!first) {
      payload += '|';
    }
    first = false;

    payload += 'T';
    payload += String(i + 1);
    payload += ':';
    payload += String(targets[i].x);
    payload += ',';
    payload += String(targets[i].y);
    payload += ',';
    payload += String(targets[i].speedMps, 2);
  }

  return payload;
}

void setup() {
  Serial.begin(115200);
  unsigned long startWait = millis();
  while (!Serial && millis() - startWait < 2000) {
    delay(10);
  }

  RadarSerial.begin(kRadarBaud, SERIAL_8N1, kRadarRxPin, kRadarTxPin);
  setupBle();

  Serial.println("Tactical radar bridge ready");
  Serial.print("LD2450 UART: RX=GPIO");
  Serial.print(kRadarRxPin);
  Serial.print(" TX=GPIO");
  Serial.println(kRadarTxPin);
}

void loop() {
  if (readRadarFrame()) {
    String payload = buildTelemetryPayload();

    if (bleConnected && telemetryChar != nullptr) {
      telemetryChar->setValue(payload.c_str());
      telemetryChar->notify();
    }

    static unsigned long lastLogAt = 0;
    if (millis() - lastLogAt >= 1000) {
      lastLogAt = millis();
      Serial.println(payload.length() ? payload : "(no targets)");
    }
  }
}
