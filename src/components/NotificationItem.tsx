/**
 * One notification row: snapshot thumbnail, visitor label, timestamp,
 * and badges for trusted / unlocked.
 */
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { NotificationRow } from '../db/notifications';

interface Props {
  notification: NotificationRow;
  onPress?: () => void;
}

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay
    ? time
    : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export default function NotificationItem({ notification, onPress }: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {notification.snapshot_uri ? (
        <Image
          source={{ uri: notification.snapshot_uri }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          <Text style={styles.thumbPlaceholderText}>No photo</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.visitor} numberOfLines={1}>
          {notification.visitor}
          {notification.trusted === 1 ? '  ✓' : ''}
        </Text>
        <Text style={styles.time}>{formatTimestamp(notification.timestamp)}</Text>
      </View>
      {notification.unlocked === 1 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Unlocked</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  pressed: { backgroundColor: '#f0f0f0' },
  thumb: {
    width: 56,
    height: 42,
    borderRadius: 6,
    backgroundColor: '#222',
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbPlaceholderText: { color: '#777', fontSize: 9 },
  info: { flex: 1, marginLeft: 12 },
  visitor: { fontSize: 15, fontWeight: '600', color: '#222' },
  time: { fontSize: 12, color: '#777', marginTop: 2 },
  badge: {
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: '#2e7d32', fontSize: 11, fontWeight: '600' },
});
