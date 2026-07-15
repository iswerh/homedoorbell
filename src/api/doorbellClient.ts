/**
 * Thin REST client for the doorbell integration contract:
 *
 *   GET  /status     -> { ringing: bool, streamUrl: string, since: ISO8601 }
 *   GET  /stream     -> MJPEG multipart stream
 *   GET  /capture    -> single JPEG snapshot
 *   GET  /settings   -> { brightness, contrast, saturation, streamDurationSec }
 *   POST /settings   -> update the above
 *   POST /unlock     -> pulses the relay; ends the stream session
 */

export interface DoorbellStatus {
  ringing: boolean;
  streamUrl: string;
  since: string | null;
}

export interface VideoSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  streamDurationSec: number;
}

const REQUEST_TIMEOUT_MS = 6000;

/** Normalize a user-entered host into a base URL (adds http://, strips trailing /). */
export function normalizeHost(host: string): string {
  let h = host.trim();
  if (!h) return '';
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  return h.replace(/\/+$/, '');
}

async function request<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Doorbell responded ${res.status} for ${path}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function getStatus(baseUrl: string): Promise<DoorbellStatus> {
  return request<DoorbellStatus>(baseUrl, '/status');
}

export function getSettings(baseUrl: string): Promise<VideoSettings> {
  return request<VideoSettings>(baseUrl, '/settings');
}

export function postSettings(
  baseUrl: string,
  settings: Partial<VideoSettings>
): Promise<VideoSettings> {
  return request<VideoSettings>(baseUrl, '/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export function unlock(baseUrl: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(baseUrl, '/unlock', { method: 'POST' });
}

/** URL of a single JPEG snapshot (used for face-match + notification thumbnails). */
export function captureUrl(baseUrl: string): string {
  return `${baseUrl}/capture`;
}

/** Fallback stream URL if /status did not supply one. */
export function defaultStreamUrl(baseUrl: string): string {
  return `${baseUrl}/stream`;
}

/** Quick reachability probe for the "Test Connection" button. */
export async function testConnection(
  baseUrl: string
): Promise<{ ok: true; status: DoorbellStatus } | { ok: false; error: string }> {
  try {
    const status = await getStatus(baseUrl);
    return { ok: true, status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
