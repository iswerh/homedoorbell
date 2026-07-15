/**
 * Foreground poller for the doorbell.
 *
 * While the app is foregrounded it polls GET /status every POLL_INTERVAL_MS.
 * On a new ring (ringing false -> true):
 *   1. downloads a JPEG snapshot from GET /capture,
 *   2. runs the on-device face pipeline (detect -> embed -> match),
 *   3. inserts a notification row (ALL rings are logged),
 *   4. raises an in-app alert if the ring passes the alert filter.
 *
 * This is a local-network MVP: nothing fires while the app is closed or
 * backgrounded (deliberate, documented limitation — no push infrastructure).
 */
import * as FileSystem from 'expo-file-system/legacy';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  captureUrl,
  defaultStreamUrl,
  getStatus,
  unlock as apiUnlock,
} from '../api/doorbellClient';
import { insertNotification, markUnlocked } from '../db/notifications';
import { detectFace } from '../face/detectFace';
import { embedFace } from '../face/embedFace';
import { matchFace, UNKNOWN_VISITOR, type MatchResult } from '../face/matchFace';
import type { AlertFilter } from '../context/SettingsContext';

const POLL_INTERVAL_MS = 2500;
const ALERT_AUTO_DISMISS_MS = 10000;

export type ConnectionState = 'unconfigured' | 'connecting' | 'ok' | 'error';

export interface RingAlert {
  notificationId: number;
  visitor: string;
  trusted: boolean;
}

export interface DoorbellState {
  connection: ConnectionState;
  ringing: boolean;
  streamUrl: string | null;
  since: string | null;
  /** Face-match guess for the current ring (null when idle). */
  currentMatch: MatchResult | null;
  /** In-app alert (respects the alert filter); null when dismissed. */
  alert: RingAlert | null;
  /** Bumped whenever the notification log changes, so screens can re-query. */
  notificationsVersion: number;
  dismissAlert: () => void;
  /** POST /unlock; marks the active ring's notification as unlocked. */
  unlockDoor: () => Promise<void>;
}

function passesFilter(filter: AlertFilter, trusted: boolean): boolean {
  if (filter === 'all') return true;
  return filter === 'trusted' ? trusted : !trusted;
}

async function downloadSnapshot(host: string): Promise<string | null> {
  try {
    const dir = `${FileSystem.documentDirectory}snapshots`;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
      () => {}
    );
    const dest = `${dir}/ring_${Date.now()}.jpg`;
    const res = await FileSystem.downloadAsync(captureUrl(host), dest);
    return res.status === 200 ? res.uri : null;
  } catch (e) {
    console.warn('[poller] snapshot download failed:', e);
    return null;
  }
}

export function useDoorbellPoller(
  host: string,
  alertFilter: AlertFilter
): DoorbellState {
  const [connection, setConnection] = useState<ConnectionState>(
    host ? 'connecting' : 'unconfigured'
  );
  const [ringing, setRinging] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [since, setSince] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState<MatchResult | null>(null);
  const [alert, setAlert] = useState<RingAlert | null>(null);
  const [notificationsVersion, setNotificationsVersion] = useState(0);

  const wasRinging = useRef(false);
  const activeRingId = useRef<number | null>(null);
  const handlingRing = useRef(false);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertFilterRef = useRef(alertFilter);
  alertFilterRef.current = alertFilter;

  const dismissAlert = useCallback(() => {
    if (alertTimer.current) clearTimeout(alertTimer.current);
    setAlert(null);
  }, []);

  const handleNewRing = useCallback(async (baseUrl: string) => {
    if (handlingRing.current) return;
    handlingRing.current = true;
    try {
      const snapshotUri = await downloadSnapshot(baseUrl);
      let match: MatchResult = {
        name: UNKNOWN_VISITOR,
        trusted: false,
        score: 0,
      };
      if (snapshotUri) {
        try {
          const box = await detectFace(snapshotUri);
          if (box) {
            const embedding = await embedFace(snapshotUri, box);
            match = matchFace(embedding);
          }
        } catch (e) {
          console.warn('[poller] face pipeline failed, logging as Unknown:', e);
        }
      }
      const id = insertNotification({
        timestamp: Date.now(),
        visitor: match.name,
        trusted: match.trusted,
        snapshotUri,
      });
      activeRingId.current = id;
      setCurrentMatch(match);
      setNotificationsVersion((v) => v + 1);
      if (passesFilter(alertFilterRef.current, match.trusted)) {
        if (alertTimer.current) clearTimeout(alertTimer.current);
        setAlert({ notificationId: id, visitor: match.name, trusted: match.trusted });
        alertTimer.current = setTimeout(() => setAlert(null), ALERT_AUTO_DISMISS_MS);
      }
    } finally {
      handlingRing.current = false;
    }
  }, []);

  useEffect(() => {
    if (!host) {
      setConnection('unconfigured');
      setRinging(false);
      setStreamUrl(null);
      setCurrentMatch(null);
      wasRinging.current = false;
      return;
    }
    setConnection('connecting');
    let cancelled = false;

    const poll = async () => {
      if (AppState.currentState !== 'active') return;
      try {
        const status = await getStatus(host);
        if (cancelled) return;
        setConnection('ok');
        setRinging(status.ringing);
        setSince(status.since ?? null);
        setStreamUrl(
          status.ringing ? status.streamUrl || defaultStreamUrl(host) : null
        );
        if (status.ringing && !wasRinging.current) {
          void handleNewRing(host);
        }
        if (!status.ringing && wasRinging.current) {
          // Ring session ended (timeout or unlock).
          setCurrentMatch(null);
          activeRingId.current = null;
        }
        wasRinging.current = status.ringing;
      } catch {
        if (cancelled) return;
        setConnection('error');
        setRinging(false);
        setStreamUrl(null);
        setCurrentMatch(null);
        wasRinging.current = false;
      }
    };

    void poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [host, handleNewRing]);

  const unlockDoor = useCallback(async () => {
    if (!host) throw new Error('Doorbell not configured');
    await apiUnlock(host);
    if (activeRingId.current !== null) {
      markUnlocked(activeRingId.current);
      activeRingId.current = null;
    }
    // The unlock ends the stream session on the device side; reflect locally.
    setRinging(false);
    setStreamUrl(null);
    setCurrentMatch(null);
    wasRinging.current = false;
    setNotificationsVersion((v) => v + 1);
  }, [host]);

  return {
    connection,
    ringing,
    streamUrl,
    since,
    currentMatch,
    alert,
    notificationsVersion,
    dismissAlert,
    unlockDoor,
  };
}
