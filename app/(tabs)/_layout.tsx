/**
 * Bottom tabs: Home · Stream · Notifications · Settings.
 * Also renders the in-app ring alert banner (respects the alert filter —
 * see useDoorbellPoller) above whichever tab is active.
 */
import { Ionicons } from '@expo/vector-icons';
import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDoorbell } from '../../src/context/DoorbellContext';

function RingAlertBanner() {
  const { alert, dismissAlert } = useDoorbell();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!alert) return null;
  return (
    <Pressable
      style={[styles.banner, { top: insets.top + 6 }]}
      onPress={() => {
        dismissAlert();
        router.push('/stream');
      }}
    >
      <Ionicons name="notifications" size={20} color="#fff" />
      <View style={styles.bannerTextWrap}>
        <Text style={styles.bannerTitle}>Doorbell ringing</Text>
        <Text style={styles.bannerBody}>
          {alert.trusted ? `${alert.visitor} is at the door` : 'Unknown visitor at the door'}
          {' — tap to view'}
        </Text>
      </View>
      <Pressable hitSlop={10} onPress={dismissAlert}>
        <Ionicons name="close" size={18} color="#fff" />
      </Pressable>
    </Pressable>
  );
}

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1565c0',
          headerTitleAlign: 'center',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="stream"
          options={{
            title: 'Stream',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="videocam" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: 'Notifications',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="notifications" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="settings" size={size} color={color} />
            ),
          }}
        />
      </Tabs>
      <RingAlertBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: '#1565c0',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bannerBody: { color: '#e3f2fd', fontSize: 12, marginTop: 1 },
});
