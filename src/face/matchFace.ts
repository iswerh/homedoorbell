/**
 * Match a face embedding against the locally stored trusted-faces DB using
 * cosine similarity. Only embeddings produced by the same method are compared
 * (a 'stub' vector must never be scored against a real 'tflite' vector).
 */
import {
  listTrustedFaces,
  type EmbeddingMethod,
  type TrustedFace,
} from '../db/trustedFaces';
import type { FaceEmbedding } from './embedFace';

/** Per-method acceptance thresholds for cosine similarity. */
const THRESHOLDS: Record<EmbeddingMethod, number> = {
  tflite: 0.6, // typical MobileFaceNet same-person cosine similarity cutoff
  stub: 0.9, // pooled-pixel placeholder needs near-identical crops
};

export const UNKNOWN_VISITOR = 'Unknown';

export interface MatchResult {
  name: string; // trusted name or 'Unknown'
  trusted: boolean;
  score: number; // best cosine similarity observed (0 if no candidates)
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? -1 : dot / denom;
}

/** Match against an explicit candidate list (unit-testable core). */
export function matchAgainst(
  embedding: FaceEmbedding,
  candidates: TrustedFace[]
): MatchResult {
  let bestName: string | null = null;
  let bestScore = -1;
  for (const face of candidates) {
    if (face.method !== embedding.method) continue;
    const score = cosineSimilarity(embedding.vector, face.embedding);
    if (score > bestScore) {
      bestScore = score;
      bestName = face.name;
    }
  }
  if (bestName !== null && bestScore >= THRESHOLDS[embedding.method]) {
    return { name: bestName, trusted: true, score: bestScore };
  }
  return { name: UNKNOWN_VISITOR, trusted: false, score: Math.max(0, bestScore) };
}

/** Match against the stored trusted-faces DB. */
export function matchFace(embedding: FaceEmbedding): MatchResult {
  return matchAgainst(embedding, listTrustedFaces());
}
