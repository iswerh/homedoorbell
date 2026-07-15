# Mock doorbell server

A small Node/Express server that pretends to be the ESP32-CAM doorbell so the
mobile app can be developed and tested without hardware. It implements the
full integration contract:

| Route            | Method | Behavior                                                                 |
| ---------------- | ------ | ------------------------------------------------------------------------ |
| `/status`        | GET    | `{ ringing, streamUrl, since }`                                          |
| `/stream`        | GET    | Looping animated MJPEG stream (`multipart/x-mixed-replace`)              |
| `/capture`       | GET    | Single JPEG snapshot (current stream frame)                              |
| `/settings`      | GET    | `{ brightness, contrast, saturation, streamDurationSec }`                |
| `/settings`      | POST   | Update any of the above (JSON body, numbers only)                        |
| `/unlock`        | POST   | Logs a relay pulse and ends the ring session                             |
| `/simulate-ring` | POST   | **Dev-only** — simulates a doorbell press (`ringing: true`, `since: now`) |

A ring session ends automatically after `streamDurationSec` seconds, or
immediately on `POST /unlock` — same as the planned firmware behavior.

## Run it

```sh
cd mock-server
npm install
npm start          # listens on http://0.0.0.0:4000
```

Use a different port with `PORT=5000 npm start` (PowerShell: `$env:PORT=5000; npm start`).

## Point the app at it

1. Find your machine's LAN IP (`ipconfig` on Windows → IPv4 address, e.g. `192.168.1.42`).
2. In the app, open **Settings → Doorbell Connection**, enter
   `http://192.168.1.42:4000`, and tap **Test Connection**.
   (Do **not** use `localhost` — the phone needs your machine's LAN address.
   On an Android emulator you can use `http://10.0.2.2:4000`.)
3. Trigger a ring:

```sh
curl -X POST http://localhost:4000/simulate-ring
```

The app's foreground poller will pick up the ring within its polling interval,
capture a snapshot, run the face-match pipeline, and log a notification.
