/**
 * Root layout: wires up the provider tree (Settings -> Doorbell) and
 * initializes the SQLite database. Retention pruning runs inside
 * SettingsProvider once settings are loaded.
 */
import { Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DoorbellProvider } from '../src/context/DoorbellContext';
import { SettingsProvider } from '../src/context/SettingsContext';
import { getDb } from '../src/db/schema';

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    try {
      getDb(); // opens the database and runs migrations
      setDbReady(true);
    } catch (e) {
      setDbError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Storage error</Text>
        <Text style={styles.errorText}>{dbError}</Text>
      </View>
    );
  }
  if (!dbReady) {
    return <View style={styles.center} />;
  }

  return (
    <SettingsProvider>
      <DoorbellProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
      </DoorbellProvider>
    </SettingsProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#c62828' },
  errorText: { marginTop: 8, color: '#555', textAlign: 'center' },
});
