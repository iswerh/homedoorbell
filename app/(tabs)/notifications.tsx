/**
 * Notifications tab: collapsible Today / Past Week / Past Month sections
 * queried from SQLite by date range. Rows show visitor label, timestamp and
 * the captured snapshot thumbnail. Retention pruning runs on app start
 * (see SettingsProvider); this screen just displays what's stored.
 */
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import CollapsibleSection from '../../src/components/CollapsibleSection';
import NotificationItem from '../../src/components/NotificationItem';
import { useDoorbell } from '../../src/context/DoorbellContext';
import {
  getNotificationSections,
  type NotificationRow,
  type NotificationSections,
} from '../../src/db/notifications';
import { useSettings } from '../../src/hooks/useSettings';

const EMPTY: NotificationSections = { today: [], pastWeek: [], pastMonth: [] };

function SectionBody({ rows }: { rows: NotificationRow[] }) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>Nothing here</Text>;
  }
  return (
    <>
      {rows.map((n) => (
        <NotificationItem key={n.id} notification={n} />
      ))}
    </>
  );
}

export default function NotificationsScreen() {
  const { notificationsVersion } = useDoorbell();
  const { retentionDays } = useSettings();
  const [sections, setSections] = useState<NotificationSections>(EMPTY);

  const refresh = useCallback(() => {
    try {
      setSections(getNotificationSections());
    } catch (e) {
      console.warn('[notifications] query failed:', e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );
  useEffect(refresh, [notificationsVersion, refresh]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <CollapsibleSection
        title="Today"
        subtitle={`${sections.today.length} ring${sections.today.length === 1 ? '' : 's'}`}
        initiallyExpanded
      >
        <SectionBody rows={sections.today} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Past Week"
        subtitle={`${sections.pastWeek.length} ring${sections.pastWeek.length === 1 ? '' : 's'}`}
      >
        <SectionBody rows={sections.pastWeek} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Past Month"
        subtitle={`${sections.pastMonth.length} ring${sections.pastMonth.length === 1 ? '' : 's'}`}
      >
        <SectionBody rows={sections.pastMonth} />
      </CollapsibleSection>

      <Text style={styles.retentionNote}>
        {retentionDays > 0
          ? `History older than ${retentionDays} days is deleted automatically.`
          : 'History is kept forever (retention set to never).'}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  content: { padding: 16 },
  empty: { color: '#888', fontSize: 13, paddingVertical: 10, textAlign: 'center' },
  retentionNote: {
    color: '#999',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
});
