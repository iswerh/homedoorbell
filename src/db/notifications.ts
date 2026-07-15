/**
 * Notification log queries: insert, prune, date-range sections.
 * ALL rings are logged here regardless of the alert filter setting.
 */
import * as FileSystem from 'expo-file-system/legacy';

import { getDb } from './schema';

export interface NotificationRow {
  id: number;
  timestamp: number; // unix ms
  visitor: string;
  trusted: number; // 0 | 1
  snapshot_uri: string | null;
  unlocked: number; // 0 | 1
}

export function insertNotification(entry: {
  timestamp: number;
  visitor: string;
  trusted: boolean;
  snapshotUri: string | null;
}): number {
  const res = getDb().runSync(
    'INSERT INTO notifications (timestamp, visitor, trusted, snapshot_uri) VALUES (?, ?, ?, ?)',
    [entry.timestamp, entry.visitor, entry.trusted ? 1 : 0, entry.snapshotUri]
  );
  return res.lastInsertRowId;
}

export function markUnlocked(id: number): void {
  getDb().runSync('UPDATE notifications SET unlocked = 1 WHERE id = ?', [id]);
}

/** Rows with start <= timestamp < end, newest first. */
export function getNotificationsBetween(
  start: number,
  end: number
): NotificationRow[] {
  return getDb().getAllSync<NotificationRow>(
    'SELECT * FROM notifications WHERE timestamp >= ? AND timestamp < ? ORDER BY timestamp DESC',
    [start, end]
  );
}

/** Notifications from the last hour (Home screen "recent" section). */
export function getLastHourNotifications(): NotificationRow[] {
  const now = Date.now();
  return getNotificationsBetween(now - 60 * 60 * 1000, now + 1);
}

export interface NotificationSections {
  today: NotificationRow[];
  pastWeek: NotificationRow[];
  pastMonth: NotificationRow[];
}

/** Today / Past Week / Past Month sections for the Notifications screen. */
export function getNotificationSections(): NotificationSections {
  const now = Date.now();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  return {
    today: getNotificationsBetween(startOfToday, now + 1),
    pastWeek: getNotificationsBetween(weekAgo, startOfToday),
    pastMonth: getNotificationsBetween(monthAgo, Math.min(weekAgo, startOfToday)),
  };
}

/**
 * Retention pruning, run on app start. Deletes notification rows older than
 * `retentionDays` and their snapshot files. `retentionDays <= 0` means "never".
 */
export async function pruneOldNotifications(retentionDays: number): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const stale = getDb().getAllSync<{ id: number; snapshot_uri: string | null }>(
    'SELECT id, snapshot_uri FROM notifications WHERE timestamp < ?',
    [cutoff]
  );
  for (const row of stale) {
    if (row.snapshot_uri) {
      try {
        await FileSystem.deleteAsync(row.snapshot_uri, { idempotent: true });
      } catch {
        // best-effort file cleanup; the row is removed either way
      }
    }
  }
  const res = getDb().runSync('DELETE FROM notifications WHERE timestamp < ?', [
    cutoff,
  ]);
  return res.changes;
}
