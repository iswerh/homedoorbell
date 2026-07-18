# Doorbell firmware

Two boards, wired together:

- **`esp32cam/`** — AI-Thinker ESP32-CAM. Runs the camera + WiFi + HTTP server
  implementing the app's contract (`/status`, `/stream`, `/capture`,
  `/settings`, `/unlock`).
- **`esp32s3_doorbell/`** — ESP32-S3 Dev Module. Reads the physical doorbell
  button and drives the door-lock servo directly (no relay module). No WiFi
  role of its own — it talks to the ESP32-CAM over two direct GPIO wires.

The app never talks to the ESP32-S3 directly; it only talks to the
ESP32-CAM's IP address. The ESP32-S3 is a dumb I/O bridge plus servo driver.

## Wiring

| Signal              | ESP32-S3 pin | ESP32-CAM pin | Direction         |
|---------------------|-------------|----------------|--------------------|
| Ring signal          | 6 (`SIGNAL_PIN`) | 13 (`RING_IN_PIN`) | ESP32-S3 → ESP32-CAM |
| Unlock signal        | 7 (`UNLOCK_IN_PIN`) | 12 (`UNLOCK_OUT_PIN`) | ESP32-CAM → ESP32-S3 |
| Common ground        | GND | GND | — (required — connect grounds together) |

Also on the ESP32-S3: button on pin 4 (wired to GND when pressed, using the
chip's internal pull-up — no external resistor needed), status LED on pin 5
(a discrete LED + resistor; `LED_BUILTIN` is unreliable on S3 boards), lock
servo signal wire on pin 15.

GPIO 12 and 13 were picked on the ESP32-CAM because they're the SD-card pins
(CMD/D1), which are free as plain GPIO since this firmware doesn't use the SD
card. Almost every other pin on that module is already claimed by the camera
or PSRAM — don't repurpose pins outside 2/4/12/13/14/15 without checking
`camera_pins.h` first.

**Voltage note**: both boards are ESP32-family and run 3.3V logic, so the
ring-signal and unlock-signal wires can go directly GPIO-to-GPIO — no level
shifter needed (unlike the earlier Arduino Uno version, which was 5V logic).

**Servo wiring**: a standard 3-wire hobby servo — signal to ESP32-S3 pin 15,
ground common with the rest of the circuit, and **power (V+) from the
external wall adapter, not from the ESP32-S3 or a USB port** — servos draw
more current on movement than USB can reliably supply. See "Power" below.

## Power

- **ESP32-S3**: powered over USB from your laptop (also serves as the
  programming/Serial Monitor connection).
- **ESP32-CAM and servo**: powered from a separate external wall adapter
  (match the servo's rated voltage, commonly 5-6V; the ESP32-CAM needs a
  clean 5V supply into its `5V`/`VCC` pin).
- **Grounds**: all three — laptop/ESP32-S3, wall adapter, and both devices it
  powers — must share a common ground. Without a shared ground reference, the
  ring/unlock signal wires between the two boards won't read reliably even
  though each board works fine on its own.

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

**ESP32-S3** (`esp32s3_doorbell/esp32s3_doorbell.ino`):
1. Same `esp32` board package as above. Board: "ESP32S3 Dev Module".
2. Install the `ESP32Servo` library (Kevin Harrington / John Bennett) via
   Library Manager — the stock `Servo.h` doesn't support the ESP32 core.
3. Has onboard USB, so just select the right port and upload — no manual
   boot-mode jumpering needed. If the Serial Monitor shows nothing, try
   toggling the board's "USB CDC On Boot" setting in Tools (some S3 boards
   need it enabled for Serial-over-native-USB to work).
4. Serial Monitor at 9600 baud shows button/servo events.

## Verifying without the app

```sh
curl http://<esp32-ip>/status      # {"ringing":false,...} until the button is pressed
curl -X POST http://<esp32-ip>/unlock
```
Or just open `http://<esp32-ip>/status` in a browser. The stream itself
(`http://<esp32-ip>/stream`) only serves frames while `ringing` is true — it
intentionally refuses to stream when idle, matching the app's "no stream
detected" idle state.

## Testing before the button/servo circuit exists

Neither sketch requires the physical button or servo to be wired up to test
its logic — each has a software-only way to simulate a press:

- **ESP32-S3**: open the Serial Monitor (9600 baud) and type `r` + Enter. This
  calls the exact same `buttonPressedActions()`/`buttonReleasedActions()` a
  real press would, including the `SIGNAL_PIN` pulse to the ESP32-CAM.
- **ESP32-CAM**: open `http://<esp32-ip>/debug/ring` in any browser (or
  `curl -X POST http://<esp32-ip>/debug/ring` — it accepts both GET and POST)
  to start a ring session exactly like a real `RING_IN_PIN` edge would. This
  exercises the real camera, `/status`, `/stream`, and the app's face-match
  pipeline without the ESP32-S3 connected at all.

Both are debug-only additions (clearly marked in the code, not part of the
app's contract) — safe to leave in, since there's no auth on this LAN-only
device anyway.

## Known simplifications

- Single ring session at a time; a second button press while one is already
  active is ignored until the current session ends (timeout or unlock).
- Unlock moves the servo 90° clockwise from its locked position and holds it
  there for `SERVO_UNLOCK_HOLD_MS` (1s default) before returning — it doesn't
  track real lock/unlock state, just sweeps and back.
- `/status.since` is only a real timestamp if NTP sync succeeded at boot
  (needs internet access on that LAN); otherwise it's `null`, which the app
  already handles.
- No auth on the ESP32-CAM's HTTP endpoints — anyone on the LAN can hit
  `/unlock`. Fine for a home WiFi network behind your router; don't expose
  this device's port to the internet.
