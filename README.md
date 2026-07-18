# homedoorbell

Companion app for a homemade smart doorbell (ESP32-CAM camera + ESP32-S3
controller driving a servo door lock). React Native + Expo (TypeScript),
Expo Router with a bottom-tab layout.

**Local-network MVP**: the app talks directly to the doorbell's IP over WiFi —
no cloud, no push notifications. Alerts only fire while the app is open and
polling; that's a documented limitation, not a bug. Firmware for both boards
lives in `firmware/` (see its README for wiring/flashing); the app is built
against the REST contract below, and a mock server stands in for the hardware
during development.

## Prerequisites

- **Node.js 20+** ([nodejs.org](https://nodejs.org)) and npm.
- **Expo Go** app on your phone (iOS App Store / Android Play Store) — the
  fastest way to preview the app. Expo Go always tracks one specific SDK
  version; if you ever see "Project is incompatible with this version of Expo
  Go", it means this project's `expo` package (see `package.json`) is ahead of
  what Expo Go currently supports on the App/Play Store. Downgrade with:
  ```sh
  npm install expo@<latest supported major> --legacy-peer-deps
  npx expo install --fix
  ```
- Phone and dev machine must be on the **same WiFi network**.

## Quick start

```sh
npm install --legacy-peer-deps   # --legacy-peer-deps is also pinned in .npmrc

# Terminal 1: mock doorbell server
npm run mock                     # http://<your-LAN-IP>:4000

# Terminal 2: the app
npx expo start
```

Scan the QR code with your phone's camera (iOS) or the Expo Go app (Android).

Then in the app: **Settings → Doorbell Connection** → `http://<your-LAN-IP>:4000`
→ **Test Connection**. Find your LAN IP with `ipconfig` (Windows) / `ifconfig`
(macOS/Linux) — use the WiFi adapter's address, not a VPN/virtual adapter.

Trigger a simulated doorbell press:
```sh
curl -X POST http://localhost:4000/simulate-ring
```

## Native modules caveat (Expo Go vs. dev client)

On-device face detection (`@react-native-ml-kit/face-detection`) and face
embedding (`react-native-fast-tflite`) are native modules — they do **not**
run in plain Expo Go. `embedFace.ts` lazily imports `react-native-fast-tflite`
and catches the failure, so the app degrades gracefully rather than crashing:
in Expo Go every visitor is logged as "Unknown". Everything else — stream
viewing, notification history, settings sync, PIN gate, unlock — works
normally in Expo Go.

To exercise real face matching, build a dev client:
```sh
npx expo prebuild
npx expo run:android   # or run:ios (macOS/Xcode required), or an EAS build
```
No MobileFaceNet model is bundled (licensing) — see `assets/models/README.md`
to drop one in; without it, embeddings fall back to a clearly-marked
placeholder (crude image similarity, not real face recognition).

## Project layout

- `app/` — Expo Router screens (Home · Stream · Notifications · Settings)
- `src/` — REST client, SQLite storage, on-device face pipeline, hooks, UI components
- `mock-server/` — mock ESP32-CAM implementing the REST contract below (see its own README)
- `assets/models/` — how to enable real MobileFaceNet embeddings (none bundled)

## Doorbell REST contract (for firmware to implement)

```
GET  /status     -> { ringing: bool, streamUrl: string, since: ISO8601 }
GET  /stream     -> MJPEG multipart stream (multipart/x-mixed-replace)
GET  /capture    -> single JPEG snapshot
GET  /settings   -> { brightness, contrast, saturation, streamDurationSec }
POST /settings   -> update the above
POST /unlock     -> actuates the door lock; ends the stream session
```

The only place this contract is consumed is `src/api/doorbellClient.ts` — point
it at real firmware by matching these routes/shapes, or adjust the client to
match whatever routes existing firmware already exposes.

## Testing on iOS without a Mac / TestFlight

- Local preview: Expo Go, as above — works on Windows/Linux, no Mac needed.
- A full native build (dev client, or a TestFlight/App Store submission)
  requires **EAS Build** (`npm install -g eas-cli`, builds in Expo's cloud —
  no local Xcode needed) and an **Apple Developer Program** membership
  ($99/yr, required by Apple for any signed build on a real device).
