/*
 * ESP32-CAM firmware implementing the homedoorbell app's REST contract:
 *
 *   GET  /status     -> { ringing, streamUrl, since }
 *   GET  /stream     -> MJPEG multipart stream
 *   GET  /capture    -> single JPEG snapshot
 *   GET  /settings   -> { brightness, contrast, saturation, streamDurationSec }
 *   POST /settings   -> update the above (JSON body)
 *   POST /unlock     -> pulses UNLOCK_OUT_PIN, ends the ring/stream session
 *
 * Hardware: AI-Thinker ESP32-CAM. RING_IN_PIN is wired to the doorbell
 * ESP32-S3 controller's SIGNAL_PIN (goes HIGH while the button is held).
 * UNLOCK_OUT_PIN is wired to that same board's UNLOCK_IN_PIN, which drives
 * the door-lock servo directly (no relay). See ../README.md for the wiring
 * diagram and why GPIO 12/13 were chosen (they're the SD-card pins, free
 * here since we don't use SD storage).
 *
 * Libraries needed (Arduino Library Manager): ArduinoJson (Benoit Blanchon).
 * Board package: "esp32" by Espressif — select board "AI Thinker ESP32-CAM".
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <time.h>
#include "esp_camera.h"
#include "camera_pins.h"

// ---- Fill these in for your network ----
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
// ---- Pins bridging to the doorbell ESP32-S3 controller ----
const int RING_IN_PIN = 13;      // HIGH while the doorbell button is pressed
const int UNLOCK_OUT_PIN = 12;   // pulsed HIGH to tell the ESP32-S3 to turn the lock servo
const unsigned long UNLOCK_PULSE_MS = 800;

// ---- Defaults (overridden by whatever was last saved via /settings) ----
const int DEFAULT_STREAM_DURATION_SEC = 30;

WebServer server(80);
Preferences prefs;

bool ringActive = false;
unsigned long ringStartMs = 0;
String ringSinceIso = "";

bool unlockPulseActive = false;
unsigned long unlockPulseStartMs = 0;

int streamDurationSec = DEFAULT_STREAM_DURATION_SEC;

// ---------------------------------------------------------------------------
// Time / settings helpers

String nowIso8601() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 200)) return ""; // NTP not synced (e.g. offline LAN)
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

void applySensorSetting(int brightness, int contrast, int saturation) {
  sensor_t *s = esp_camera_sensor_get();
  if (!s) return;
  s->set_brightness(s, constrain(brightness, -2, 2));
  s->set_contrast(s, constrain(contrast, -2, 2));
  s->set_saturation(s, constrain(saturation, -2, 2));
}

void loadSettings() {
  prefs.begin("doorbell", true);
  int brightness = prefs.getInt("brightness", 0);
  int contrast = prefs.getInt("contrast", 0);
  int saturation = prefs.getInt("saturation", 0);
  streamDurationSec = prefs.getInt("streamSec", DEFAULT_STREAM_DURATION_SEC);
  prefs.end();
  applySensorSetting(brightness, contrast, saturation);
}

void saveSettings(int brightness, int contrast, int saturation, int streamSec) {
  prefs.begin("doorbell", false);
  prefs.putInt("brightness", brightness);
  prefs.putInt("contrast", contrast);
  prefs.putInt("saturation", saturation);
  prefs.putInt("streamSec", streamSec);
  prefs.end();
  streamDurationSec = streamSec;
  applySensorSetting(brightness, contrast, saturation);
}

bool isRinging() {
  if (!ringActive) return false;
  if ((millis() - ringStartMs) > (unsigned long)streamDurationSec * 1000UL) {
    ringActive = false; // session timed out
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// HTTP handlers

void handleStatus() {
  StaticJsonDocument<256> doc;
  bool ringing = isRinging();
  doc["ringing"] = ringing;
  doc["streamUrl"] = ringing
    ? ("http://" + WiFi.localIP().toString() + "/stream")
    : (char *)nullptr;
  doc["since"] = ringing ? ringSinceIso : (char *)nullptr;
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleGetSettings() {
  sensor_t *s = esp_camera_sensor_get();
  StaticJsonDocument<256> doc;
  doc["brightness"] = s ? s->status.brightness : 0;
  doc["contrast"] = s ? s->status.contrast : 0;
  doc["saturation"] = s ? s->status.saturation : 0;
  doc["streamDurationSec"] = streamDurationSec;
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handlePostSettings() {
  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"missing body\"}");
    return;
  }
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, server.arg("plain"))) {
    server.send(400, "application/json", "{\"error\":\"invalid json\"}");
    return;
  }
  sensor_t *s = esp_camera_sensor_get();
  int brightness = doc["brightness"] | (s ? s->status.brightness : 0);
  int contrast = doc["contrast"] | (s ? s->status.contrast : 0);
  int saturation = doc["saturation"] | (s ? s->status.saturation : 0);
  int streamSec = doc["streamDurationSec"] | streamDurationSec;
  saveSettings(brightness, contrast, saturation, streamSec);
  handleGetSettings(); // respond with the settings as actually applied
}

void handleCapture() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    server.send(503, "application/json", "{\"error\":\"camera capture failed\"}");
    return;
  }
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  WiFiClient client = server.client();
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleUnlock() {
  digitalWrite(UNLOCK_OUT_PIN, HIGH);
  unlockPulseActive = true;
  unlockPulseStartMs = millis();
  ringActive = false; // ends the ring/stream session immediately
  server.send(200, "application/json", "{\"ok\":true}");
}

// Testing aid, not part of the app's contract: starts a ring session the
// same way a real RING_IN_PIN edge would, so you can test the camera +
// app pipeline before the ESP32-S3/button are wired up at all.
// Accepts GET too so it can be triggered by just opening the URL in a browser:
//   http://<esp32-ip>/debug/ring
void handleDebugRing() {
  if (!ringActive) {
    ringActive = true;
    ringStartMs = millis();
    ringSinceIso = nowIso8601();
    Serial.println("[TEST] Simulated ring via /debug/ring");
  }
  server.send(200, "application/json", "{\"ok\":true}");
}

// Streams MJPEG until the client disconnects or the ring session ends.
// server.handleClient() is called on every frame so /status and /unlock
// stay responsive to a second connection while this one is held open.
void handleStream() {
  if (!isRinging()) {
    server.send(503, "text/plain", "not ringing");
    return;
  }
  WiFiClient client = server.client();
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: multipart/x-mixed-replace; boundary=frame");
  client.println();

  while (client.connected() && isRinging()) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) {
      client.println("--frame");
      client.println("Content-Type: image/jpeg");
      client.print("Content-Length: ");
      client.println(fb->len);
      client.println();
      client.write(fb->buf, fb->len);
      client.println();
      esp_camera_fb_return(fb);
    }
    server.handleClient();
    delay(30); // ~30 fps cap
  }
}

void handleNotFound() {
  server.send(404, "application/json", "{\"error\":\"not found\"}");
}

// ---------------------------------------------------------------------------

void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_CIF;
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    delay(3000);
    ESP.restart();
  }

  // Some AI-Thinker boards ship an OV3660 instead of the usual OV2640.
  // Without this it comes out flipped with a strong red/pink cast.
  sensor_t *s = esp_camera_sensor_get();
  if (s && s->id.PID == OV3660_PID) {
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, -2);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(RING_IN_PIN, INPUT);
  pinMode(UNLOCK_OUT_PIN, OUTPUT);
  digitalWrite(UNLOCK_OUT_PIN, LOW);

  setupCamera();
  loadSettings();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("Connected. Camera IP: http://");
  Serial.println(WiFi.localIP());

  configTime(0, 0, "pool.ntp.org", "time.nist.gov"); // best-effort; /status.since is null if it never syncs

  server.on("/status", HTTP_GET, handleStatus);
  server.on("/settings", HTTP_GET, handleGetSettings);
  server.on("/settings", HTTP_POST, handlePostSettings);
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/unlock", HTTP_POST, handleUnlock);
  server.on("/stream", HTTP_GET, handleStream);
  server.on("/debug/ring", HTTP_POST, handleDebugRing);
  server.on("/debug/ring", HTTP_GET, handleDebugRing);
  server.onNotFound(handleNotFound);
  server.begin();
}

void loop() {
  server.handleClient();

  // Rising edge on RING_IN_PIN starts a new ring/stream session.
  static bool lastRingIn = LOW;
  bool ringIn = digitalRead(RING_IN_PIN);
  if (ringIn == HIGH && lastRingIn == LOW && !ringActive) {
    ringActive = true;
    ringStartMs = millis();
    ringSinceIso = nowIso8601();
    Serial.println("Doorbell pressed — ring session started");
  }
  lastRingIn = ringIn;

  // Auto-clear the outbound unlock pulse after UNLOCK_PULSE_MS.
  if (unlockPulseActive && (millis() - unlockPulseStartMs) > UNLOCK_PULSE_MS) {
    digitalWrite(UNLOCK_OUT_PIN, LOW);
    unlockPulseActive = false;
  }
}

