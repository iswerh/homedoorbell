/**
 * Trusted individuals CRUD: name + face embedding vector.
 * Embeddings are tagged with the method that produced them ('tflite' | 'stub')
 * so vectors from different embedders are never compared against each other.
 */
import { getDb } from './schema';

export type EmbeddingMethod = 'tflite' | 'stub';

export interface TrustedFaceRow {
  id: number;
  name: string;
  embedding: string; // JSON array
  method: EmbeddingMethod;
  created_at: number;
}

export interface TrustedFace {
  id: number;
  name: string;
  embedding: number[];
  method: EmbeddingMethod;
  createdAt: number;
}

export function listTrustedFaces(): TrustedFace[] {
  const rows = getDb().getAllSync<TrustedFaceRow>(
    'SELECT * FROM trusted_faces ORDER BY name COLLATE NOCASE'
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    embedding: JSON.parse(r.embedding) as number[],
    method: r.method,
    createdAt: r.created_at,
  }));
}

export function addTrustedFace(
  name: string,
  embedding: number[],
  method: EmbeddingMethod
): number {
  const res = getDb().runSync(
    'INSERT INTO trusted_faces (name, embedding, method, created_at) VALUES (?, ?, ?, ?)',
    [name.trim(), JSON.stringify(embedding), method, Date.now()]
  );
  return res.lastInsertRowId;
}

export function deleteTrustedFace(id: number): void {
  getDb().runSync('DELETE FROM trusted_faces WHERE id = ?', [id]);
}
