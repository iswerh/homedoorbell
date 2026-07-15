/**
 * Face crop -> embedding vector.
 *
 * Real path ('tflite'): runs a MobileFaceNet .tflite model via
 * react-native-fast-tflite. No permissively-licensed MobileFaceNet binary
 * could be bundled with this repo, so the model is loaded AT RUNTIME from
 * `<documentDirectory>/models/mobilefacenet.tflite` — drop a model file there
 * (see assets/models/README.md) and this path activates automatically.
 *
 * Fallback path ('stub'): a CLEARLY-MARKED PLACEHOLDER embedding — an 8x8
 * average-pooled grayscale vector of the face crop (64 dims, L2-normalized).
 * It is deterministic and crudely content-based (good enough to exercise the
 * full enroll -> match -> store pipeline against the mock server), but it is
 * NOT face recognition and must not be trusted for real security decisions.
 *
 * Embeddings are tagged with their method; matching only ever compares
 * same-method vectors (see matchFace.ts / trustedFaces.ts).
 */
import * as FileSystem from 'expo-file-system/legacy';
import {
  ImageManipulator,
  SaveFormat,
} from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import type { TensorflowModel } from 'react-native-fast-tflite';

import type { EmbeddingMethod } from '../db/trustedFaces';
import type { FaceBox } from './detectFace';

const INPUT_SIZE = 112; // MobileFaceNet input: 112x112x3
const MODEL_PATH = () =>
  `${FileSystem.documentDirectory}models/mobilefacenet.tflite`;

export interface FaceEmbedding {
  vector: number[];
  method: EmbeddingMethod;
}

let cachedModel: TensorflowModel | null = null;
let modelLoadAttempted = false;

async function tryLoadModel(): Promise<TensorflowModel | null> {
  if (cachedModel) return cachedModel;
  if (modelLoadAttempted) return null; // don't re-probe every ring
  modelLoadAttempted = true;
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH());
    if (!info.exists) {
      console.log(
        '[face] no mobilefacenet.tflite in documents/models — using STUB embeddings'
      );
      return null;
    }
    // Imported lazily: react-native-fast-tflite (via react-native-nitro-modules)
    // throws at module-evaluation time when Nitro isn't installed (Expo Go). A
    // static top-level import would crash the whole route tree before this
    // function ever runs; a dynamic import defers that throw to here, where
    // it's caught and we fall back to the stub embedding below.
    const { loadTensorflowModel } = await import('react-native-fast-tflite');
    cachedModel = await loadTensorflowModel({ url: MODEL_PATH() }, []);
    console.log('[face] loaded MobileFaceNet TFLite model');
    return cachedModel;
  } catch (e) {
    console.warn('[face] TFLite model load failed — using STUB embeddings:', e);
    return null;
  }
}

/** Crop the face box (with margin) out of the image and resize to 112x112 JPEG. */
async function cropAndResize(
  imageUri: string,
  box: FaceBox | null
): Promise<string> {
  const context = ImageManipulator.manipulate(imageUri);
  if (box) {
    const margin = 0.15;
    const mx = box.width * margin;
    const my = box.height * margin;
    context.crop({
      originX: Math.max(0, Math.round(box.left - mx)),
      originY: Math.max(0, Math.round(box.top - my)),
      width: Math.round(box.width + 2 * mx),
      height: Math.round(box.height + 2 * my),
    });
  }
  context.resize({ width: INPUT_SIZE, height: INPUT_SIZE });
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.95,
  });
  return result.uri;
}

function base64ToBytes(b64: string): Uint8Array {
  // Hermes provides atob(); fall back to a manual decoder just in case.
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 3 < clean.length + 1; i += 4) {
    const n =
      (chars.indexOf(clean[i]) << 18) |
      (chars.indexOf(clean[i + 1]) << 12) |
      ((i + 2 < clean.length ? chars.indexOf(clean[i + 2]) : 0) << 6) |
      (i + 3 < clean.length ? chars.indexOf(clean[i + 3]) : 0);
    out[o++] = (n >> 16) & 0xff;
    if (i + 2 < clean.length) out[o++] = (n >> 8) & 0xff;
    if (i + 3 < clean.length) out[o++] = n & 0xff;
  }
  return out.subarray(0, o);
}

/** Decode a local JPEG file to raw RGBA pixels. */
async function decodeJpegFile(
  uri: string
): Promise<{ width: number; height: number; data: Uint8Array }> {
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  const decoded = jpeg.decode(bytes, { useTArray: true });
  return {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data as Uint8Array,
  };
}

function l2Normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

/** Real embedding: MobileFaceNet via TFLite. Input normalized to (-1, 1). */
function tfliteEmbedding(
  model: TensorflowModel,
  pixels: { width: number; height: number; data: Uint8Array }
): number[] {
  const input = new Float32Array(INPUT_SIZE * INPUT_SIZE * 3);
  for (let i = 0; i < INPUT_SIZE * INPUT_SIZE; i++) {
    input[i * 3] = (pixels.data[i * 4] - 127.5) / 128;
    input[i * 3 + 1] = (pixels.data[i * 4 + 1] - 127.5) / 128;
    input[i * 3 + 2] = (pixels.data[i * 4 + 2] - 127.5) / 128;
  }
  const outputs = model.runSync([input.buffer]);
  const vector = Array.from(new Float32Array(outputs[0]));
  return l2Normalize(vector);
}

/**
 * PLACEHOLDER embedding (see file header): 8x8 average-pooled grayscale of the
 * 112x112 face crop, L2-normalized. Deterministic, NOT real face recognition.
 */
function stubEmbedding(pixels: {
  width: number;
  height: number;
  data: Uint8Array;
}): number[] {
  const GRID = 8;
  const cell = Math.floor(INPUT_SIZE / GRID);
  const vector: number[] = [];
  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0;
      let count = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const idx = (y * pixels.width + x) * 4;
          sum +=
            0.299 * pixels.data[idx] +
            0.587 * pixels.data[idx + 1] +
            0.114 * pixels.data[idx + 2];
          count++;
        }
      }
      vector.push(sum / count / 255);
    }
  }
  // Center before normalizing so cosine similarity is contrast-invariant.
  const mean = vector.reduce((s, x) => s + x, 0) / vector.length;
  return l2Normalize(vector.map((x) => x - mean));
}

/**
 * Produce an embedding for the face in `imageUri`.
 * @param box face bounding box from detectFace(); null = use the whole image.
 */
export async function embedFace(
  imageUri: string,
  box: FaceBox | null
): Promise<FaceEmbedding> {
  const cropUri = await cropAndResize(imageUri, box);
  try {
    const pixels = await decodeJpegFile(cropUri);
    const model = await tryLoadModel();
    if (model) {
      return { vector: tfliteEmbedding(model, pixels), method: 'tflite' };
    }
    return { vector: stubEmbedding(pixels), method: 'stub' };
  } finally {
    FileSystem.deleteAsync(cropUri, { idempotent: true }).catch(() => {});
  }
}
