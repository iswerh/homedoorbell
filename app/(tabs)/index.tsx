/**
 * Home tab: small live-stream preview (tap -> Stream tab) + notifications
 * from the last hour (tap a row -> Notifications tab).
 */
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import MjpegStream from '../../src/components/MjpegStream';
import NotificationItem from '../../src/components/NotificationItem';
import { useDoorbell } from '../../src/context/DoorbellContext';
import {
  getLastHourNotifications,
  type NotificationRow,
} from '../../src/db/notifications';
import { useSettings } from '../../src/hooks/useSettings';

export default function HomeScreen() {
  const router = useRouter();
  const { host } = useSettings();
  const { connection, ringing, streamUrl, notificationsVersion } = useDoorbell();
  const [recent, setRecent] = useState<NotificationRow[]>([]);

  const refresh = useCallback(() => {
    try {
      setRecent(getLastHourNotifications());
    } catch (e) {
      console.warn('[home] failed to load notifications:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  // Re-query when the poller logs a new ring while we're on this screen.
  React.useEffect(refresh, [notificationsVersion, refresh]);

  const statusLine = !host
    ? 'Doorbell not configured — set it up in Settings'
    : connection === 'error'
      ? 'Doorbell unreachable'
      : ringing
        ? 'Someone is at the door!'
        : 'Idle — no one at the door';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <MjpegStream
        streamUrl={streamUrl}
        active={ringing}
        style={styles.preview}
        onPress={() => router.push('/stream')}
      />
      <Text style={styles.status}>{statusLine}</Text>

      <Text style={styles.sectionTitle}>Recent notifications</Text>
      <View style={styles.list}>
        {recent.length === 0 ? (
          <Text style={styles.empty}>No new notifications</Text>
        ) : (
          recent.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onPress={() => router.push('/notifications')}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  content: { padding: 16 },
  preview: { height: 200 },
  status: { marginTop: 10, fontSize: 14, color: '#555', textAlign: 'center' },
  sectionTitle: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 16,
    fontWeight: '700',
    color: '#222',
  },
  list: { borderRadius: 10, overflow: 'hidden' },
  empty: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 18,
    backgroundColor: '#fff',
    borderRadius: 10,
  },
});
