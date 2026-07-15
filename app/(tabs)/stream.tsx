/**
 * Stream tab: large MJPEG viewer, current face-match guess while a stream is
 * active, and the PIN-gated Unlock button (disabled while idle).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import MjpegStream from '../../src/components/MjpegStream';
import UnlockButton from '../../src/components/UnlockButton';
import { useDoorbell } from '../../src/context/DoorbellContext';

export default function StreamScreen() {
  const { ringing, streamUrl, currentMatch, connection } = useDoorbell();
  const live = ringing && !!streamUrl;

  return (
    <View style={styles.screen}>
      <MjpegStream streamUrl={streamUrl} active={ringing} style={styles.stream} />

      <View style={styles.infoRow}>
        {live ? (
          <Text style={styles.matchText}>
            At the door:{' '}
            <Text style={styles.matchName}>
              {currentMatch ? currentMatch.name : 'Analyzing…'}
            </Text>
          </Text>
        ) : (
          <Text style={styles.idleText}>
            {connection === 'error'
              ? 'Doorbell unreachable'
              : 'Stream appears here when someone rings the doorbell'}
          </Text>
        )}
      </View>

      <UnlockButton disabled={!live} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7', padding: 16 },
  stream: { flex: 1 },
  infoRow: { paddingVertical: 14, alignItems: 'center' },
  matchText: { fontSize: 15, color: '#444' },
  matchName: { fontWeight: '700', color: '#1565c0' },
  idleText: { fontSize: 13, color: '#888', textAlign: 'center' },
});
