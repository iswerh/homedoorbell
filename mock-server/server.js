/**
 * Mock ESP32-CAM doorbell server.
 *
 * Implements the integration contract the mobile app is built against:
 *   GET  /status    -> { ringing: bool, streamUrl: string, since: ISO8601 }
 *   GET  /stream    -> MJPEG multipart stream (multipart/x-mixed-replace)
 *   GET  /capture   -> single JPEG snapshot
 *   GET  /settings  -> { brightness, contrast, saturation, streamDurationSec }
 *   POST /settings  -> update the above
 *   POST /unlock    -> "pulses the relay"; ends the stream session
 *
 * Dev-only helper:
 *   POST /simulate-ring -> triggers a simulated doorbell press
 */

const express = require('express');
const Jimp = require('jimp');

const PORT = process.env.PORT || 4000;
const FRAME_COUNT = 12;
const FRAME_W = 320;
const FRAME_H = 240;
const FPS = 5;

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const state = {
  ringing: false,
  since: null, // ISO8601 of last ring
  settings: {
    brightness: 0, // -2..2 (ESP32-CAM sensor range convention)
    contrast: 0, // -2..2
    saturation: 0, // -2..2
    streamDurationSec: 60,
  },
};

let ringTimeout = null;

function startRing() {
  state.ringing = true;
  state.since = new Date().toISOString();
  if (ringTimeout) clearTimeout(ringTimeout);
  // The real firmware ends the stream session after streamDurationSec.
  ringTimeout = setTimeout(() => {
    state.ringing = false;
    console.log('[mock] ring session timed out (streamDurationSec elapsed)');
  }, state.settings.streamDurationSec * 1000);
  console.log(`[mock] DING DONG at ${state.since}`);
}

function endRing(reason) {
  state.ringing = false;
  if (ringTimeout) {
    clearTimeout(ringTimeout);
    ringTimeout = null;
  }
  console.log(`[mock] ring session ended (${reason})`);
}

// ---------------------------------------------------------------------------
// Test frames: generated once at startup with jimp (animated "camera feed").
// ---------------------------------------------------------------------------
/** @type {Buffer[]} */
let frames = [];
let frameIndex = 0;

async function generateFrames() {
  const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  const small = await Jimp.loadFont(Jimp.FONT_SANS_8_WHITE);
  const out = [];
  for (let i = 0; i < FRAME_COUNT; i++) {
    const img = new Jimp(FRAME_W, FRAME_H, 0xff101018); // ABGR hex via number: dark bg
    // Moving "visitor" blob so the stream visibly animates.
    const cx = Math.floor(
      FRAME_W / 2 + Math.sin((i / FRAME_COUNT) * 2 * Math.PI) * 80
    );
    const cy = Math.floor(
      FRAME_H / 2 + Math.cos((i / FRAME_COUNT) * 2 * Math.PI) * 40
    );
    for (let dx = -30; dx <= 30; dx++) {
      for (let dy = -40; dy <= 40; dy++) {
        if ((dx * dx) / (30 * 30) + (dy * dy) / (40 * 40) <= 1) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && x < FRAME_W && y >= 0 && y < FRAME_H) {
            img.setPixelColor(Jimp.rgbaToInt(200, 170, 140, 255), x, y);
          }
        }
      }
    }
    img.print(font, 8, 8, 'MOCK DOORBELL CAM');
    img.print(small, 8, FRAME_H - 16, `frame ${i + 1}/${FRAME_COUNT}`);
    out.push(await img.getBufferAsync(Jimp.MIME_JPEG));
  }
  frames = out;
  console.log(`[mock] generated ${frames.length} test JPEG frames`);
}

setInterval(() => {
  frameIndex = (frameIndex + 1) % FRAME_COUNT;
}, 1000 / FPS);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.get('/status', (req, res) => {
  res.json({
    ringing: state.ringing,
    streamUrl: `http://${req.headers.host}/stream`,
    since: state.since,
  });
});

app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Connection: 'close',
  });
  console.log('[mock] stream client connected');
  const timer = setInterval(() => {
    if (frames.length === 0) return;
    const jpeg = frames[frameIndex];
    res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
    res.write(jpeg);
    res.write('\r\n');
  }, 1000 / FPS);
  req.on('close', () => {
    clearInterval(timer);
    console.log('[mock] stream client disconnected');
  });
});

app.get('/capture', (req, res) => {
  if (frames.length === 0) return res.status(503).send('frames not ready');
  res.set('Content-Type', 'image/jpeg');
  res.send(frames[frameIndex]);
});

app.get('/settings', (req, res) => {
  res.json(state.settings);
});

app.post('/settings', (req, res) => {
  const body = req.body || {};
  for (const key of ['brightness', 'contrast', 'saturation', 'streamDurationSec']) {
    if (typeof body[key] === 'number' && Number.isFinite(body[key])) {
      state.settings[key] = body[key];
    }
  }
  console.log('[mock] settings updated:', state.settings);
  res.json(state.settings);
});

app.post('/unlock', (req, res) => {
  console.log('[mock] UNLOCK: relay pulsed');
  endRing('unlock');
  res.json({ ok: true });
});

// Dev-only: simulate a doorbell press.
app.post('/simulate-ring', (req, res) => {
  startRing();
  res.json({ ringing: state.ringing, since: state.since });
});

generateFrames()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[mock] doorbell mock server listening on http://0.0.0.0:${PORT}`);
      console.log('[mock] trigger a ring with: curl -X POST http://localhost:' + PORT + '/simulate-ring');
    });
  })
  .catch((err) => {
    console.error('[mock] failed to generate frames:', err);
    process.exit(1);
  });
