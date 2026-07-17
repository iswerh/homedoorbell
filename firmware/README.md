# Doorbell firmware

Two boards, wired together:

- **`esp32cam/`** — AI-Thinker ESP32-CAM. Runs the camera + WiFi + HTTP server
  implementing the app's contract (`/status`, `/stream`, `/capture`,
  `/settings`, `/unlock`).
- **`arduino_doorbell/`** — a plain Arduino (Uno/Nano). Reads the physical
  doorbell button and drives the door-lock relay. No WiFi of its own — it
  talks to the ESP32-CAM over two direct GPIO wires.

The app never talks to the Arduino directly; it only talks to the ESP32-CAM's
IP address. The Arduino is a dumb I/O bridge.

## Wiring

| Signal              | Arduino pin | ESP32-CAM pin | Direction         |
|---------------------|-------------|----------------|--------------------|
| Ring signal          | 3 (`SIGNAL_PIN`) | 13 (`RING_IN_PIN`) | Arduino → ESP32-CAM |
| Unlock signal        | 4 (`UNLOCK_IN_PIN`) | 12 (`UNLOCK_OUT_PIN`) | ESP32-CAM → Arduino |
| Common ground        | GND | GND | — (required — connect grounds together) |

Also on the Arduino: button on pin 2, status LED on pin 13, relay module on
pin 5 (see `RELAY_ACTIVE_HIGH` in the sketch — most cheap relay boards trigger
on LOW; flip that constant if your relay clicks on the wrong edge).

GPIO 12 and 13 were picked on the ESP32-CAM because they're the SD-card pins
(CMD/D1), which are free as plain GPIO since this firmware doesn't use the SD
card. Almost every other pin on that module is already claimed by the camera
or PSRAM — don't repurpose pins outside 2/4/12/13/14/15 without checking
`camera_pins.h` first.

**Voltage note**: the ESP32-CAM's GPIOs are 3.3V. Most Arduino Uno/Nano boards
are 5V logic. Feeding a 5V HIGH into an ESP32 GPIO can damage it — use a
voltage divider or logic-level shifter on both cross-board wires (ring signal
and unlock signal), not a direct wire, unless your Arduino is also a 3.3V board.

## Flashing

**ESP32-CAM** (`esp32cam/esp32cam.ino`):
1. Arduino IDE → install the `esp32` board package (Espressif) via Boards Manager.
2. Install the `ArduinoJson` library (Benoit Blanchon) via Library Manager.
3. Board: "AI Thinker ESP32-CAM". You'll need an FTDI/USB-serial adapter — the
   board has no onboard USB. Connect GPIO0 to GND to enter flash mode, reset,
   upload, then disconnect GPIO0 from GND and reset again to run normally.
4. Edit `WIFI_SSID` / `WIFI_PASSWORD` at the top of the file first.
5. Open the Serial Monitor at 115200 baud — it prints the camera's IP once
   connected. That's what goes into the app's Settings → Doorbell Connection.

**Arduino** (`arduino_doorbell/arduino_doorbell.ino`): flash normally for your
board (Uno/Nano/etc.) — Serial Monitor at 9600 baud shows button/relay events.

## Verifying without the app

```sh
curl http://<esp32-ip>/status      # {"ringing":false,...} until the button is pressed
curl -X POST http://<esp32-ip>/unlock
```
Or just open `http://<esp32-ip>/status` in a browser. The stream itself
(`http://<esp32-ip>/stream`) only serves frames while `ringing` is true — it
intentionally refuses to stream when idle, matching the app's "no stream
detected" idle state.

## Testing before the button/relay circuit exists

Neither sketch requires the physical button or relay to be wired up to test
its logic — each has a software-only way to simulate a press:

- **Arduino**: open the Serial Monitor (9600 baud) and type `r` + Enter. This
  calls the exact same `buttonPressedActions()`/`buttonReleasedActions()` a
  real press would, including the `SIGNAL_PIN` pulse to the ESP32-CAM.
- **ESP32-CAM**: open `http://<esp32-ip>/debug/ring` in any browser (or
  `curl -X POST http://<esp32-ip>/debug/ring` — it accepts both GET and POST)
  to start a ring session exactly like a real `RING_IN_PIN` edge would. This
  exercises the real camera, `/status`, `/stream`, and the app's face-match
  pipeline without the Arduino connected at all.

Both are debug-only additions (clearly marked in the code, not part of the
app's contract) — safe to leave in, since there's no auth on this LAN-only
device anyway.

## Known simplifications

- Single ring session at a time; a second button press while one is already
  active is ignored until the current session ends (timeout or unlock).
- `/status.since` is only a real timestamp if NTP sync succeeded at boot
  (needs internet access on that LAN); otherwise it's `null`, which the app
  already handles.
- No auth on the ESP32-CAM's HTTP endpoints — anyone on the LAN can hit
  `/unlock`. Fine for a home WiFi network behind your router; don't expose
  this device's port to the internet.
