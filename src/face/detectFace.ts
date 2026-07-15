/**
 * Face detection from a snapshot URI using Google ML Kit (on-device).
 *
 * NOTE: @react-native-ml-kit/face-detection is a native module — it requires a
 * dev-client / prebuild build (it does NOT work in plain Expo Go). When the
 * native module is unavailable we degrade gracefully: callers receive `null`
 * and treat the visitor as "Unknown" (or, for enrollment, fall back to using
 * the full image).
 */
import FaceDetection, { Face } from '@react-native-ml-kit/face-detection';

export interface FaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Detect the most prominent (largest) face in the image.
 * @returns bounding box, or null if no face found / detector unavailable.
 */
export async function detectFace(imageUri: string): Promise<FaceBox | null> {
  let faces: Face[];
  try {
    faces = await FaceDetection.detect(imageUri, {
      performanceMode: 'accurate',
      minFaceSize: 0.1,
    });
  } catch (e) {
    // Native module missing (Expo Go) or detection failure.
    console.warn('[face] detection unavailable:', e);
    return null;
  }
  if (!faces || faces.length === 0) return null;
  const largest = faces.reduce((a, b) =>
    a.frame.width * a.frame.height >= b.frame.width * b.frame.height ? a : b
  );
  const { left, top, width, height } = largest.frame;
  return { left, top, width, height };
}
