/**
 * App-local settings, persisted in the SQLite `config` table:
 *   - doorbell host (IP/hostname of the ESP32-CAM or mock server)
 *   - alert filter: which rings trigger an in-app alert (all are always logged)
 *   - retention: days to keep notification history (0 = never delete)
 *
 * Runs the retention pruning routine once on app start, after settings load.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { normalizeHost } from '../api/doorbellClient';
import { pruneOldNotifications } from '../db/notifications';
import { getConfig, setConfig } from '../db/schema';

export type AlertFilter = 'all' | 'unknown' | 'trusted';

/** 0 means "never delete". */
export const RETENTION_CHOICES = [7, 30, 90, 0] as const;
export const DEFAULT_RETENTION_DAYS = 30;

interface SettingsContextValue {
  loaded: boolean;
  host: string; // normalized base URL, '' if unconfigured
  alertFilter: AlertFilter;
  retentionDays: number;
  setHost: (host: string) => void;
  setAlertFilter: (filter: AlertFilter) => void;
  setRetentionDays: (days: number) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const [host, setHostState] = useState('');
  const [alertFilter, setAlertFilterState] = useState<AlertFilter>('all');
  const [retentionDays, setRetentionDaysState] = useState(
    DEFAULT_RETENTION_DAYS
  );

  useEffect(() => {
    try {
      const storedHost = getConfig('host') ?? '';
      const storedFilter = (getConfig('alertFilter') as AlertFilter) ?? 'all';
      const storedRetention = getConfig('retentionDays');
      const retention =
        storedRetention !== null
          ? Number(storedRetention)
          : DEFAULT_RETENTION_DAYS;
      setHostState(storedHost);
      setAlertFilterState(
        ['all', 'unknown', 'trusted'].includes(storedFilter)
          ? storedFilter
          : 'all'
      );
      setRetentionDaysState(Number.isFinite(retention) ? retention : DEFAULT_RETENTION_DAYS);
      // Retention pruning routine — runs on app start.
      pruneOldNotifications(
        Number.isFinite(retention) ? retention : DEFAULT_RETENTION_DAYS
      ).catch((e) => console.warn('[settings] prune failed:', e));
    } catch (e) {
      console.warn('[settings] failed to load config:', e);
    } finally {
      setLoaded(true);
    }
  }, []);

  const setHost = useCallback((raw: string) => {
    const normalized = normalizeHost(raw);
    setHostState(normalized);
    setConfig('host', normalized);
  }, []);

  const setAlertFilter = useCallback((filter: AlertFilter) => {
    setAlertFilterState(filter);
    setConfig('alertFilter', filter);
  }, []);

  const setRetentionDays = useCallback((days: number) => {
    setRetentionDaysState(days);
    setConfig('retentionDays', String(days));
  }, []);

  const value = useMemo(
    () => ({
      loaded,
      host,
      alertFilter,
      retentionDays,
      setHost,
      setAlertFilter,
      setRetentionDays,
    }),
    [loaded, host, alertFilter, retentionDays, setHost, setAlertFilter, setRetentionDays]
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettingsContext must be used inside SettingsProvider');
  }
  return ctx;
}
