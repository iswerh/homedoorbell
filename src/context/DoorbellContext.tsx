/**
 * Doorbell connection context: exposes live connection state, ringing,
 * streamUrl, the current face-match guess, and actions (unlock, test).
 * The foreground polling loop lives in useDoorbellPoller.
 */
import React, { createContext, useContext } from 'react';

import { useSettings } from '../hooks/useSettings';
import {
  useDoorbellPoller,
  type DoorbellState,
} from '../hooks/useDoorbellPoller';

const DoorbellContext = createContext<DoorbellState | null>(null);

export function DoorbellProvider({ children }: { children: React.ReactNode }) {
  const { host, alertFilter } = useSettings();
  const state = useDoorbellPoller(host, alertFilter);
  return (
    <DoorbellContext.Provider value={state}>
      {children}
    </DoorbellContext.Provider>
  );
}

export function useDoorbell(): DoorbellState {
  const ctx = useContext(DoorbellContext);
  if (!ctx) throw new Error('useDoorbell must be used inside DoorbellProvider');
  return ctx;
}
