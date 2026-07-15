/**
 * PIN-gated door unlock button. Disabled/greyed while no stream session is
 * active. On confirmed PIN it POSTs /unlock (which ends the stream session
 * on the device) and marks the active ring's notification as unlocked.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';

import { useDoorbell } from '../context/DoorbellContext';
import PasswordGate from './PasswordGate';

interface Props {
  disabled?: boolean;
}

export default function UnlockButton({ disabled }: Props) {
  const { unlockDoor } = useDoorbell();
  const [gateVisible, setGateVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const isDisabled = !!disabled || busy;

  const onConfirmed = async () => {
    setGateVisible(false);
    setBusy(true);
    try {
      await unlockDoor();
      Alert.alert('Door unlocked', 'The lock relay was pulsed.');
    } catch (e) {
      Alert.alert(
        'Unlock failed',
        e instanceof Error ? e.message : 'Could not reach the doorbell.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable
        style={[styles.button, isDisabled && styles.disabled]}
        disabled={isDisabled}
        onPress={() => setGateVisible(true)}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.label, isDisabled && styles.labelDisabled]}>
            Unlock Door
          </Text>
        )}
      </Pressable>
      <PasswordGate
        visible={gateVisible}
        title="Enter PIN to unlock"
        onSuccess={onConfirmed}
        onCancel={() => setGateVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: { backgroundColor: '#c5c9c6' },
  label: { color: '#fff', fontSize: 16, fontWeight: '700' },
  labelDisabled: { color: '#f2f2f2' },
});
