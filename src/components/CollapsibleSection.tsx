/** Simple collapsible section with a chevroned header row. */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  title: string;
  subtitle?: string;
  initiallyExpanded?: boolean;
  children: React.ReactNode;
  /** Optional hook to intercept expansion (e.g. PIN gating). Return false to block. */
  onBeforeExpand?: () => boolean;
}

export default function CollapsibleSection({
  title,
  subtitle,
  initiallyExpanded = false,
  children,
  onBeforeExpand,
}: Props) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  const toggle = () => {
    if (!expanded && onBeforeExpand && !onBeforeExpand()) return;
    setExpanded((e) => !e);
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.header} onPress={toggle} accessibilityRole="button">
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && <View style={styles.body}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  headerText: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600', color: '#222' },
  subtitle: { fontSize: 12, color: '#777', marginTop: 2 },
  chevron: { fontSize: 16, color: '#666', marginLeft: 8 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
});
