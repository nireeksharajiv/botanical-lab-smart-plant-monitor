/*
  Botanical Lab - SIMPLE firmware + Wi-Fi telemetry
  Board: ESP32 DevKit | Libraries: "DHT sensor library" + "Adafruit Unified Sensor"
  Also needs a file named secrets.h in the SAME folder (see secrets.example.h).
  Never upload secrets.h to GitHub.

  STATUS: IMPLEMENTED, NOT YET TESTED ON HARDWARE.

  What it does:
   1. AUTO: pump turns ON when soil is dry, OFF when soil is moist enough.
   2. LOW DEMAND: when it is DARK and COOL, it waters less
      (starts later, stops earlier, shorter runs).
   3. MANUAL: type 'w' in Serial Monitor (or press an optional button) to water.
   4. Safety: hard max run time + rest period between runs.
   5. WI-FI: sends a reading to the website every 10 s from a separate task.
      Watering NEVER waits for Wi-Fi: if Wi-Fi or the server is down,
      the pump keeps following its local rules.

  Not done yet: "Water now" from the website, and logging pump runs to the website.
  Not used: HC-SR04, rain sensor, flow sensor, LCD, buzzer.
*/

#include <Arduino.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include "secrets.h"   // must define WIFI_SSID, WIFI_PASSWORD, DEVICE_KEY (and optionally SERVER_URL)

// Server address. Override by defining SERVER_URL in secrets.h.
// Your laptop's Wi-Fi IP can change: re-check it if uploads suddenly fail.
#ifndef SERVER_URL
#define SERVER_URL "http://192.168.1.52:3000"
#endif

// ======================= PIN MAP (unchanged) =======================
const uint8_t PIN_SOIL      = 34;  // FC-28 AO
const uint8_t PIN_DHT       = 33;  // DHT11 data
const uint8_t PIN_LDR       = 35;  // LDR DO: LOW = bright, HIGH = dark
const uint8_t PIN_RELAY     = 27;  // Relay IN1
const uint8_t PIN_LED_GREEN = 2;   // system OK
const uint8_t PIN_LED_BLUE  = 4;   // pump ON
const uint8_t PIN_LED_RED   = 16;  // sensor problem

// OPTIONAL physical manual-water button.
// -1 = no button (use 'w' in Serial Monitor). If you add a push button, wire it
// between a free GPIO and GND (e.g. GPIO 25) and set that number here.
constexpr int MANUAL_BUTTON_PIN = -1;

// ======================= SETTINGS =======================
constexpr bool RELAY_ACTIVE_LOW = true;   // VERIFY with pump disconnected first

// Soil calibration: measure with 'c' command. Both 0 = not calibrated (auto stays OFF).
// Works whichever direction your sensor changes.
constexpr int SOIL_DRY_RAW = 0;
constexpr int SOIL_WET_RAW = 0;

// Watering profiles (placeholders, relative %): start below, stop at or above, max run
struct Profile {
  float startPct;
  float stopPct;
  unsigned long maxRunMs;
};
const Profile NORMAL_PROFILE = {30.0f, 45.0f, 10000UL};  // normal conditions
const Profile LOW_PROFILE    = {20.0f, 35.0f,  5000UL};  // dark AND cool: water less

constexpr float LOW_TEMP_C = 22.0f;   // below this (AND dark) = low-demand mode

constexpr unsigned long REST_MS          = 300000UL;  // wait after a run (water soaks to probe)
constexpr unsigned long MANUAL_RUN_MS    = 8000UL;    // one manual watering
constexpr unsigned long HARD_MAX_RUN_MS  = 15000UL;   // no run can ever exceed this

constexpr int SOIL_SAMPLES   = 10;
constexpr int SOIL_BAD_LOW   = 5;      // reading <= this = sensor problem
constexpr int SOIL_BAD_HIGH  = 4090;   // reading >= this = sensor problem (not trusted)

#define DHTTYPE DHT11
DHT dht(PIN_DHT, DHTTYPE);

// ======================= STATE =======================
int   soilRaw = 0;
float soilPct = 0;
bool  soilOk = false;

float tempC = 0, humPct = 0;
bool  dhtGood = false;
uint8_t dhtFails = 0;
bool  lightDark = false;

bool  pumpOn = false;
bool  manualRun = false;
bool  haveEnded = false;
unsigned long pumpStartMs = 0, runLimitMs = 0, lastEndMs = 0;
float activeStopPct = 0;

bool  calMode = false;
int   calMin = 4095, calMax = 0;

unsigned long lastSoilMs = 0, lastDhtMs = 0, lastPrintMs = 0, lastCalMs = 0;
unsigned long lastPublishMs = 0;

// ======================= HELPERS =======================
bool calibrated() { return SOIL_DRY_RAW != SOIL_WET_RAW; }
bool dhtOk() { return dhtGood && dhtFails < 3; }
bool lowDemand() { return dhtOk() && lightDark && (tempC < LOW_TEMP_C); }
bool blinkPhase(unsigned long periodMs) { return ((millis() / periodMs) % 2) == 0; }

void relayWrite(bool on) {
  digitalWrite(PIN_RELAY, (on != RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

// ======================= SENSORS =======================
void readSoil() {
  int s[SOIL_SAMPLES];
  for (int i = 0; i < SOIL_SAMPLES; i++) {
    s[i] = analogRead(PIN_SOIL);
    delayMicroseconds(300);
  }
  for (int i = 1; i < SOIL_SAMPLES; i++) {   // sort, then take the median
    int k = s[i], j = i - 1;
    while (j >= 0 && s[j] > k) { s[j + 1] = s[j]; j--; }
    s[j + 1] = k;
  }
  soilRaw = (s[SOIL_SAMPLES / 2 - 1] + s[SOIL_SAMPLES / 2]) / 2;
  soilOk = (soilRaw > SOIL_BAD_LOW) && (soilRaw < SOIL_BAD_HIGH);

  if (soilRaw < calMin) calMin = soilRaw;
  if (soilRaw > calMax) calMax = soilRaw;

  if (calibrated()) {
    float p = 100.0f * (float)(soilRaw - SOIL_DRY_RAW) / (float)(SOIL_WET_RAW - SOIL_DRY_RAW);
    if (p < 0) p = 0;
    if (p > 100) p = 100;
    soilPct = p;
  }
}

void readDht() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h) || isnan(t)) {
    if (dhtFails < 255) dhtFails++;
  } else {
    humPct = h; tempC = t; dhtGood = true; dhtFails = 0;
  }
}

// ======================= PUMP =======================
void startPump(bool manual, const Profile& p) {
  unsigned long lim = manual ? MANUAL_RUN_MS : p.maxRunMs;
  runLimitMs = (lim < HARD_MAX_RUN_MS) ? lim : HARD_MAX_RUN_MS;
  activeStopPct = p.stopPct;       // profile is locked in for this run
  manualRun = manual;
  pumpStartMs = millis();
  pumpOn = true;
  relayWrite(true);
  Serial.print(manual ? F("[PUMP ON] manual, up to ") : F("[PUMP ON] auto, up to "));
  Serial.print(runLimitMs / 1000);
  Serial.println(F(" s"));
}

void stopPump(const char* why) {
  relayWrite(false);
  if (pumpOn) {
    pumpOn = false;
    lastEndMs = millis();
    haveEnded = true;
    Serial.print(F("[PUMP OFF] "));
    Serial.println(why);
  }
}

void pumpLogic() {
  unsigned long now = millis();

  if (pumpOn) {
    if (now - pumpStartMs >= runLimitMs) {
      stopPump(manualRun ? "manual run finished" : "max run time reached");
    } else if (!manualRun && !soilOk) {
      stopPump("soil sensor problem");
    } else if (!manualRun && calibrated() && soilPct >= activeStopPct) {
      stopPump("soil moist enough");
    }
    return;
  }

  // Pump is OFF: decide whether to start automatically
  if (!calibrated() || !soilOk) return;
  if (haveEnded && (now - lastEndMs < REST_MS)) return;

  const Profile& p = lowDemand() ? LOW_PROFILE : NORMAL_PROFILE;
  if (soilPct < p.startPct) startPump(false, p);
}

void manualWater() {
  if (pumpOn) Serial.println(F("[manual] pump already running"));
  else startPump(true, NORMAL_PROFILE);
}

bool buttonPressed() {
  if (MANUAL_BUTTON_PIN < 0) return false;
  static bool last = HIGH;
  static unsigned long t = 0;
  bool cur = digitalRead(MANUAL_BUTTON_PIN);
  if (cur != last && millis() - t > 50) {
    t = millis();
    last = cur;
    return cur == LOW;
  }
  return false;
}

// ======================= LEDS =======================
void updateLeds() {
  bool problem = !soilOk || (dhtFails >= 3);

  // GREEN: OK solid; slow blink = setup mode (not calibrated); off = problem
  bool green;
  if (problem) green = false;
  else if (!calibrated()) green = blinkPhase(1000);
  else green = true;
  digitalWrite(PIN_LED_GREEN, green);

  // BLUE: pump running
  digitalWrite(PIN_LED_BLUE, pumpOn);

  // RED: blink when a sensor has a problem
  digitalWrite(PIN_LED_RED, problem ? blinkPhase(300) : false);
}

// ======================= SERIAL =======================
void printHelp() {
  Serial.println(F("Commands: w = water now | s = stop pump | c = calibration print on/off | h = help"));
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r' || c == ' ') continue;
    if (c == 'w') manualWater();
    else if (c == 's') {
      relayWrite(false);
      if (pumpOn) stopPump("stopped by user");
      else Serial.println(F("[s] pump is OFF"));
    }
    else if (c == 'c') {
      calMode = !calMode;
      calMin = 4095; calMax = 0;
      Serial.println(calMode ? F("[c] calibration print ON") : F("[c] calibration print OFF"));
    }
    else printHelp();
  }
}

void printStatus() {
  char soilStr[16], tStr[12], hStr[12];
  if (calibrated()) snprintf(soilStr, sizeof(soilStr), "%.0f%%", soilPct);
  else strcpy(soilStr, "UNCALIBRATED");
  if (dhtOk()) {
    snprintf(tStr, sizeof(tStr), "%.1fC", tempC);
    snprintf(hStr, sizeof(hStr), "%.0f%%", humPct);
  } else { strcpy(tStr, "n/a"); strcpy(hStr, "n/a"); }

  Serial.printf("soil_raw=%d%s | soil=%s | temp=%s | hum=%s | light=%s | mode=%s | pump=%s | auto=%s\n",
                soilRaw, soilOk ? "" : "(BAD)", soilStr, tStr, hStr,
                lightDark ? "DARK" : "BRIGHT",
                lowDemand() ? "LOW-WATER" : "NORMAL",
                pumpOn ? "ON" : "OFF",
                calibrated() ? "ready" : "OFF (calibrate first)");
}

// ======================= WI-FI (non-blocking) =======================
unsigned long lastWiFiCheckMs = 0;
unsigned long lastWiFiAttemptMs = 0;
bool wifiWasConnected = false;

constexpr unsigned long WIFI_CHECK_INTERVAL_MS = 1000UL;
constexpr unsigned long WIFI_RETRY_INTERVAL_MS = 10000UL;

void startWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);

  // Start connection without waiting for it to finish.
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiAttemptMs = millis();
  Serial.println(F("[WiFi] Connection started."));
}

void maintainWiFi() {
  const unsigned long now = millis();
  if (now - lastWiFiCheckMs < WIFI_CHECK_INTERVAL_MS) return;
  lastWiFiCheckMs = now;

  bool connected = (WiFi.status() == WL_CONNECTED);

  // Log only when the state changes (keeps Serial readable)
  if (connected && !wifiWasConnected) {
    Serial.print(F("[WiFi] Connected. ESP32 IP: "));
    Serial.println(WiFi.localIP());
  } else if (!connected && wifiWasConnected) {
    Serial.println(F("[WiFi] Lost connection; local control continues."));
  }
  wifiWasConnected = connected;

  if (!connected && (now - lastWiFiAttemptMs >= WIFI_RETRY_INTERVAL_MS)) {
    lastWiFiAttemptMs = now;
    Serial.println(F("[WiFi] Retrying connection..."));
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ======================= API SENDER (separate task) =======================
// The main loop copies the latest values into a 1-slot queue.
// A separate task reads that copy and does the slow HTTP request,
// so the pump logic never waits for the network.
const char* API_URL = SERVER_URL "/api/ingest";
constexpr unsigned long SEND_INTERVAL_MS = 10000UL;   // 10 s for testing; use 30000 later

struct TelemetrySnapshot {
  int   soilRaw;
  float soilPct;
  bool  soilOk;
  bool  isCalibrated;
  float tempC;
  float humPct;
  bool  dhtValid;
  bool  lightDark;
  bool  pumpOn;
  bool  lowWaterMode;
};

QueueHandle_t telemetryQueue = nullptr;

void publishTelemetrySnapshot() {
  if (telemetryQueue == nullptr) return;

  TelemetrySnapshot s;
  s.soilRaw = soilRaw;
  s.soilPct = soilPct;
  s.soilOk = soilOk;
  s.isCalibrated = calibrated();
  s.tempC = tempC;
  s.humPct = humPct;
  s.dhtValid = dhtOk();
  s.lightDark = lightDark;
  s.pumpOn = pumpOn;
  s.lowWaterMode = lowDemand();

  xQueueOverwrite(telemetryQueue, &s);   // always keeps only the newest copy
}

void sendReadingsTask(void* parameter) {
  (void)parameter;
  TelemetrySnapshot s;

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(SEND_INTERVAL_MS));

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[API] Wi-Fi unavailable; skipping upload."));
      continue;
    }

    if (xQueuePeek(telemetryQueue, &s, 0) != pdTRUE) {
      continue;   // no snapshot yet
    }

    HTTPClient http;
    http.setConnectTimeout(1500);
    http.setTimeout(2000);

    if (!http.begin(API_URL)) {
      Serial.println(F("[API] Could not start request."));
      continue;
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("x-device-key", DEVICE_KEY);

    // Build JSON. Field names must match the website exactly.
    String payload;
    payload.reserve(320);

    payload += "{\"soil_raw\":";
    payload += String(s.soilRaw);

    payload += ",\"soil_pct\":";
    payload += (s.soilOk && s.isCalibrated) ? String(s.soilPct, 1) : "null";

    payload += ",\"temperature_c\":";
    payload += s.dhtValid ? String(s.tempC, 1) : "null";

    payload += ",\"humidity_pct\":";
    payload += s.dhtValid ? String(s.humPct, 1) : "null";

    payload += ",\"light_state\":\"";
    payload += s.lightDark ? "DARK" : "BRIGHT";

    payload += "\",\"pump_on\":";
    payload += s.pumpOn ? "true" : "false";

    payload += ",\"mode\":\"";
    payload += s.lowWaterMode ? "LOW_WATER" : "NORMAL";

    payload += "\",\"problems\":[";
    bool comma = false;
    if (!s.soilOk) {
      payload += "\"Soil sensor problem\"";
      comma = true;
    }
    if (!s.dhtValid) {
      if (comma) payload += ",";
      payload += "\"Temperature sensor problem\"";
    }
    payload += "]}";

    int status = http.POST(payload);

    if (status >= 200 && status < 300) {
      Serial.printf("[API] Reading sent (HTTP %d)\n", status);
    } else if (status > 0) {
      Serial.printf("[API] Server rejected reading (HTTP %d): %s\n",
                    status, http.getString().c_str());
    } else {
      Serial.printf("[API] Send failed: %s\n", HTTPClient::errorToString(status).c_str());
    }

    http.end();
  }
}

void startApiSender() {
  telemetryQueue = xQueueCreate(1, sizeof(TelemetrySnapshot));

  if (telemetryQueue == nullptr) {
    Serial.println(F("[API] ERROR: Queue creation failed."));
    return;
  }

  BaseType_t result = xTaskCreatePinnedToCore(
    sendReadingsTask,
    "ApiSender",
    8192,
    nullptr,
    1,
    nullptr,
    0            // core 0; the Arduino loop() runs on core 1
  );

  if (result != pdPASS) {
    vQueueDelete(telemetryQueue);
    telemetryQueue = nullptr;
    Serial.println(F("[API] ERROR: Task creation failed."));
  } else {
    Serial.println(F("[API] Sender started; interval 10 seconds."));
  }
}

// ======================= SETUP / LOOP =======================
void setup() {
  // Relay OFF before anything else
  digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  pinMode(PIN_RELAY, OUTPUT);
  relayWrite(false);

  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_BLUE, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LDR, INPUT);
  pinMode(PIN_SOIL, INPUT);
  if (MANUAL_BUTTON_PIN >= 0) pinMode(MANUAL_BUTTON_PIN, INPUT_PULLUP);

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_SOIL, ADC_11db);

  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println(F("=== Botanical Lab firmware + Wi-Fi (untested) ==="));

  dht.begin();
  startWiFi();
  startApiSender();

  // Boot self-test: green, blue, red
  digitalWrite(PIN_LED_GREEN, HIGH); delay(300); digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_BLUE, HIGH);  delay(300); digitalWrite(PIN_LED_BLUE, LOW);
  digitalWrite(PIN_LED_RED, HIGH);   delay(300); digitalWrite(PIN_LED_RED, LOW);

  lightDark = (digitalRead(PIN_LDR) == HIGH);
  readSoil();
  readDht();
  printHelp();
}

void loop() {
  unsigned long now = millis();

  handleSerial();
  maintainWiFi();
  if (buttonPressed()) manualWater();

  lightDark = (digitalRead(PIN_LDR) == HIGH);
  if (now - lastSoilMs >= 1000UL) { lastSoilMs = now; readSoil(); }
  if (now - lastDhtMs  >= 2000UL) { lastDhtMs  = now; readDht(); }

  pumpLogic();
  updateLeds();

  // Hand the newest values to the sender task once per second
  if (now - lastPublishMs >= 1000UL) {
    lastPublishMs = now;
    publishTelemetrySnapshot();
  }

  if (calMode) {
    if (now - lastCalMs >= 500UL) {
      lastCalMs = now;
      Serial.printf("CAL raw_median=%d | min=%d | max=%d\n", soilRaw, calMin, calMax);
    }
  } else if (now - lastPrintMs >= 2000UL) {
    lastPrintMs = now;
    printStatus();
  }
}
