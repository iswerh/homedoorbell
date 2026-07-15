/**
 * PIN management: a single app PIN gates both the Unlock button and the
 * Trusted Individuals settings section.
 *
 * The PIN itself is never stored — only a random salt and SHA-256(salt + pin),
 * kept in the device keychain/keystore via expo-secure-store.
 */
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { useCallback } from 'react';

const SALT_KEY = 'doorbell.pin.salt';
const HASH_KEY = 'doorbell.pin.hash';

async function hashPin(salt: string, pin: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}:${pin}`
  );
}

export async function hasPin(): Promise<boolean> {
  const hash = await SecureStore.getItemAsync(HASH_KEY);
  return hash !== null;
}

export async function setPin(pin: string): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(16);
  const salt = Array.from(saltBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const hash = await hashPin(salt, pin);
  await SecureStore.setItemAsync(SALT_KEY, salt);
  await SecureStore.setItemAsync(HASH_KEY, hash);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(SALT_KEY);
  const stored = await SecureStore.getItemAsync(HASH_KEY);
  if (!salt || !stored) return false;
  const hash = await hashPin(salt, pin);
  return hash === stored;
}

export function usePasscode() {
  return {
    hasPin: useCallback(hasPin, []),
    setPin: useCallback(setPin, []),
    verifyPin: useCallback(verifyPin, []),
  };
}
