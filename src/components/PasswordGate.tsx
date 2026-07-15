/**
 * PIN-prompt modal wrapper for gated actions (Unlock button, Trusted
 * Individuals settings). If no PIN exists yet, walks through first-time
 * setup (enter + confirm) before granting access.
 */
import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { hasPin, setPin, verifyPin } from '../hooks/usePasscode';

interface Props {
  visible: boolean;
  title?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type Mode = 'loading' | 'verify' | 'create' | 'confirm';

export default function PasswordGate({
  visible,
  title = 'Enter PIN',
  onSuccess,
  onCancel,
}: Props) {
  const [mode, setMode] = useState<Mode>('loading');
  const [pin, setPinValue] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPinValue('');
    setFirstPin('');
    setError(null);
    setMode('loading');
    hasPin()
      .then((exists) => setMode(exists ? 'verify' : 'create'))
      .catch(() => setMode('create'));
  }, [visible]);

  const submit = async () => {
    setError(null);
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits');
      return;
    }
    try {
      if (mode === 'verify') {
        if (await verifyPin(pin)) {
          onSuccess();
        } else {
          setError('Incorrect PIN');
          setPinValue('');
        }
      } else if (mode === 'create') {
        setFirstPin(pin);
        setPinValue('');
        setMode('confirm');
      } else if (mode === 'confirm') {
        if (pin === firstPin) {
          await setPin(pin);
          onSuccess();
        } else {
          setError('PINs did not match — start over');
          setPinValue('');
          setFirstPin('');
          setMode('create');
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const heading =
    mode === 'create'
      ? 'Create a PIN'
      : mode === 'confirm'
        ? 'Confirm your PIN'
        : title;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{heading}</Text>
          {mode === 'create' && (
            <Text style={styles.subtitle}>
              This PIN protects door unlock and trusted-face management.
            </Text>
          )}
          {mode !== 'loading' && (
            <TextInput
              style={styles.input}
              value={pin}
              onChangeText={(t) => setPinValue(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={8}
              autoFocus
              placeholder="••••"
              placeholderTextColor="#aaa"
              onSubmitEditing={submit}
            />
          )}
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.cancel]} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.ok]}
              onPress={submit}
              disabled={mode === 'loading'}
            >
              <Text style={styles.okText}>
                {mode === 'verify' ? 'Unlock' : 'Continue'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '80%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#222' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 6 },
  input: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: '#222',
  },
  error: { color: '#c62828', marginTop: 8, fontSize: 13 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    gap: 10,
  },
  button: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  cancel: { backgroundColor: '#eee' },
  cancelText: { color: '#444', fontWeight: '600' },
  ok: { backgroundColor: '#1565c0' },
  okText: { color: '#fff', fontWeight: '600' },
});
