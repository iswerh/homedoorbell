/**
 * Settings tab.
 *
 * Doorbell Connection (host + Test Connection) sits above three collapsible
 * sections:
 *   1. Video Settings      — brightness/contrast/saturation + stream duration,
 *                            synced with GET/POST /settings on the device.
 *   2. Notification Settings — alert filter (all rings are still logged) and
 *                            retention days for the pruning routine.
 *   3. Trusted Individuals — PIN-gated (same PIN as Unlock): list/add/delete
 *                            trusted faces (capture from doorbell or photo
 *                            library -> detect -> embed -> save with a name).
 */
import Slider from '@react-native-community/slider';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  captureUrl,
  getSettings,
  postSettings,
  testConnection,
  type VideoSettings,
} from '../../src/api/doorbellClient';
import CollapsibleSection from '../../src/components/CollapsibleSection';
import PasswordGate from '../../src/components/PasswordGate';
import {
  addTrustedFace,
  deleteTrustedFace,
  listTrustedFaces,
  type TrustedFace,
} from '../../src/db/trustedFaces';
import { detectFace } from '../../src/face/detectFace';
import { embedFace, type FaceEmbedding } from '../../src/face/embedFace';
import {
  RETENTION_CHOICES,
  useSettings,
  type AlertFilter,
} from '../../src/hooks/useSettings';

// ---------------------------------------------------------------------------
// Doorbell Connection
// ---------------------------------------------------------------------------
function ConnectionSection() {
  const { host, setHost } = useSettings();
  const [draft, setDraft] = useState(host);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => setDraft(host), [host]);

  const onTest = async () => {
    setTesting(true);
    setResult(null);
    setHost(draft); // persist what the user typed (normalized)
    const normalized = draft.trim();
    if (!normalized) {
      setResult('Enter the doorbell IP or hostname first.');
      setTesting(false);
      return;
    }
    const res = await testConnection(
      /^https?:\/\//i.test(normalized) ? normalized.replace(/\/+$/, '') : `http://${normalized.replace(/\/+$/, '')}`
    );
    setResult(
      res.ok
        ? `Connected — doorbell is ${res.status.ringing ? 'RINGING' : 'idle'}.`
        : `Failed: ${res.error}`
    );
    setTesting(false);
  };

  return (
    <View style={styles.connectionCard}>
      <Text style={styles.connectionLabel}>Doorbell Connection</Text>
      <View style={styles.connectionRow}>
        <TextInput
          style={styles.hostInput}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. 192.168.1.42:4000"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          autoCorrect={false}
          onEndEditing={() => setHost(draft)}
        />
        <Pressable style={styles.testButton} onPress={onTest} disabled={testing}>
          {testing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.testButtonText}>Test</Text>
          )}
        </Pressable>
      </View>
      {result && (
        <Text
          style={[
            styles.testResult,
            result.startsWith('Connected') ? styles.testOk : styles.testFail,
          ]}
        >
          {result}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// 1. Video Settings (synced with the device via GET/POST /settings)
// ---------------------------------------------------------------------------
function VideoSettingsSection() {
  const { host } = useSettings();
  const [video, setVideo] = useState<VideoSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationDraft, setDurationDraft] = useState('');

  const load = useCallback(async () => {
    if (!host) {
      setError('Configure the doorbell connection first.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const s = await getSettings(host);
      setVideo(s);
      setDurationDraft(String(s.streamDurationSec));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, [host]);

  useEffect(() => {
    void load();
  }, [load]);

  const push = async (patch: Partial<VideoSettings>) => {
    if (!host || !video) return;
    const next = { ...video, ...patch };
    setVideo(next);
    try {
      const confirmed = await postSettings(host, patch);
      setVideo(confirmed);
      setDurationDraft(String(confirmed.streamDurationSec));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  if (loading) return <ActivityIndicator style={styles.sectionSpinner} />;
  if (error) {
    return (
      <View>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={load}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!video) return <Text style={styles.mutedText}>No settings loaded.</Text>;

  const sliderRow = (label: string, key: 'brightness' | 'contrast' | 'saturation') => (
    <View style={styles.sliderRow} key={key}>
      <Text style={styles.sliderLabel}>
        {label}: {video[key]}
      </Text>
      <Slider
        minimumValue={-2}
        maximumValue={2}
        step={1}
        value={video[key]}
        onSlidingComplete={(v: number) => void push({ [key]: v })}
        minimumTrackTintColor="#1565c0"
        style={styles.slider}
      />
    </View>
  );

  return (
    <View>
      {sliderRow('Brightness', 'brightness')}
      {sliderRow('Contrast', 'contrast')}
      {sliderRow('Saturation', 'saturation')}
      <View style={styles.durationRow}>
        <Text style={styles.sliderLabel}>Stream duration (seconds)</Text>
        <TextInput
          style={styles.durationInput}
          value={durationDraft}
          onChangeText={setDurationDraft}
          keyboardType="number-pad"
          onEndEditing={() => {
            const v = parseInt(durationDraft, 10);
            if (Number.isFinite(v) && v > 0) void push({ streamDurationSec: v });
            else setDurationDraft(String(video.streamDurationSec));
          }}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 2. Notification Settings
// ---------------------------------------------------------------------------
const FILTER_OPTIONS: { value: AlertFilter; label: string; hint: string }[] = [
  { value: 'all', label: 'All rings', hint: 'Alert on every doorbell press' },
  { value: 'unknown', label: 'Unknown visitors only', hint: 'Alert only when the face is not recognized' },
  { value: 'trusted', label: 'Trusted visitors only', hint: 'Alert only when a trusted face is recognized' },
];

function NotificationSettingsSection() {
  const { alertFilter, setAlertFilter, retentionDays, setRetentionDays } =
    useSettings();

  return (
    <View>
      <Text style={styles.subheading}>Alert me about</Text>
      {FILTER_OPTIONS.map((opt) => (
        <Pressable
          key={opt.value}
          style={styles.radioRow}
          onPress={() => setAlertFilter(opt.value)}
          accessibilityRole="radio"
          accessibilityState={{ selected: alertFilter === opt.value }}
        >
          <View style={[styles.radioOuter, alertFilter === opt.value && styles.radioOuterActive]}>
            {alertFilter === opt.value && <View style={styles.radioInner} />}
          </View>
          <View style={styles.radioTextWrap}>
            <Text style={styles.radioLabel}>{opt.label}</Text>
            <Text style={styles.radioHint}>{opt.hint}</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.filterNote}>
        Every ring is always saved to history — this only controls in-app alerts.
      </Text>

      <Text style={[styles.subheading, { marginTop: 16 }]}>Keep history for</Text>
      <View style={styles.segmentRow}>
        {RETENTION_CHOICES.map((days) => (
          <Pressable
            key={days}
            style={[styles.segment, retentionDays === days && styles.segmentActive]}
            onPress={() => setRetentionDays(days)}
          >
            <Text
              style={[
                styles.segmentText,
                retentionDays === days && styles.segmentTextActive,
              ]}
            >
              {days === 0 ? 'Never delete' : `${days} days`}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3. Trusted Individuals (PIN-gated)
// ---------------------------------------------------------------------------
type EnrollState =
  | { step: 'idle' }
  | { step: 'processing' }
  | { step: 'naming'; embedding: FaceEmbedding; previewUri: string };

function TrustedFacesSection() {
  const { host } = useSettings();
  const [faces, setFaces] = useState<TrustedFace[]>([]);
  const [enroll, setEnroll] = useState<EnrollState>({ step: 'idle' });
  const [name, setName] = useState('');

  const refresh = useCallback(() => {
    try {
      setFaces(listTrustedFaces());
    } catch (e) {
      console.warn('[trusted] list failed:', e);
    }
  }, []);

  useEffect(refresh, [refresh]);

  const processImage = async (uri: string) => {
    setEnroll({ step: 'processing' });
    try {
      const box = await detectFace(uri);
      if (!box) {
        setEnroll({ step: 'idle' });
        Alert.alert(
          'No face detected',
          'No face was found in that image (or the face detector is unavailable — it requires a dev-client build, not Expo Go). Enroll using the whole image instead?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use whole image',
              onPress: async () => {
                setEnroll({ step: 'processing' });
                try {
                  const embedding = await embedFace(uri, null);
                  setEnroll({ step: 'naming', embedding, previewUri: uri });
                } catch (e) {
                  setEnroll({ step: 'idle' });
                  Alert.alert('Failed', e instanceof Error ? e.message : String(e));
                }
              },
            },
          ]
        );
        return;
      }
      const embedding = await embedFace(uri, box);
      setEnroll({ step: 'naming', embedding, previewUri: uri });
    } catch (e) {
      setEnroll({ step: 'idle' });
      Alert.alert('Failed to process image', e instanceof Error ? e.message : String(e));
    }
  };

  const addFromDoorbell = async () => {
    if (!host) {
      Alert.alert('Not connected', 'Configure the doorbell connection first.');
      return;
    }
    setEnroll({ step: 'processing' });
    try {
      const dest = `${FileSystem.cacheDirectory}enroll_${Date.now()}.jpg`;
      const res = await FileSystem.downloadAsync(captureUrl(host), dest);
      if (res.status !== 200) throw new Error(`Capture failed (HTTP ${res.status})`);
      await processImage(res.uri);
    } catch (e) {
      setEnroll({ step: 'idle' });
      Alert.alert('Capture failed', e instanceof Error ? e.message : String(e));
    }
  };

  const addFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Photo library access is required.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    await processImage(picked.assets[0].uri);
  };

  const saveEnrollment = () => {
    if (enroll.step !== 'naming') return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Give this person a name.');
      return;
    }
    try {
      addTrustedFace(trimmed, enroll.embedding.vector, enroll.embedding.method);
      setName('');
      setEnroll({ step: 'idle' });
      refresh();
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    }
  };

  const confirmDelete = (face: TrustedFace) => {
    Alert.alert('Remove trusted face', `Remove ${face.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteTrustedFace(face.id);
          refresh();
        },
      },
    ]);
  };

  return (
    <View>
      {faces.length === 0 ? (
        <Text style={styles.mutedText}>No trusted individuals yet.</Text>
      ) : (
        faces.map((face) => (
          <View key={face.id} style={styles.faceRow}>
            <View style={styles.faceInfo}>
              <Text style={styles.faceName}>{face.name}</Text>
              <Text style={styles.faceMeta}>
                {face.method === 'tflite' ? 'MobileFaceNet embedding' : 'Placeholder embedding'}
                {' · '}
                {new Date(face.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable onPress={() => confirmDelete(face)} hitSlop={8}>
              <Text style={styles.deleteText}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}

      {enroll.step === 'processing' && (
        <View style={styles.enrollBusy}>
          <ActivityIndicator />
          <Text style={styles.mutedText}>Detecting face…</Text>
        </View>
      )}

      {enroll.step === 'naming' && (
        <View style={styles.namingCard}>
          <Image source={{ uri: enroll.previewUri }} style={styles.namingPreview} />
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder="Person's name"
            placeholderTextColor="#aaa"
            autoFocus
          />
          <View style={styles.namingActions}>
            <Pressable
              style={[styles.smallButton, styles.smallButtonGrey]}
              onPress={() => {
                setEnroll({ step: 'idle' });
                setName('');
              }}
            >
              <Text style={styles.smallButtonGreyText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.smallButton} onPress={saveEnrollment}>
              <Text style={styles.smallButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      )}

      {enroll.step === 'idle' && (
        <View style={styles.addRow}>
          <Pressable style={styles.smallButton} onPress={addFromDoorbell}>
            <Text style={styles.smallButtonText}>Capture from doorbell</Text>
          </Pressable>
          <Pressable style={styles.smallButton} onPress={addFromLibrary}>
            <Text style={styles.smallButtonText}>Pick from library</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SettingsScreen() {
  const [trustedUnlocked, setTrustedUnlocked] = useState(false);
  const [gateVisible, setGateVisible] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ConnectionSection />

      <CollapsibleSection title="Video Settings" subtitle="Camera image + stream duration">
        <VideoSettingsSection />
      </CollapsibleSection>

      <CollapsibleSection
        title="Notification Settings"
        subtitle="Alerts + history retention"
      >
        <NotificationSettingsSection />
      </CollapsibleSection>

      <CollapsibleSection
        title="Trusted Individuals"
        subtitle="Faces that unlock a friendly greeting (PIN required)"
        onBeforeExpand={() => {
          if (trustedUnlocked) return true;
          setGateVisible(true);
          return false;
        }}
      >
        <TrustedFacesSection />
      </CollapsibleSection>

      <PasswordGate
        visible={gateVisible}
        title="Enter PIN to manage trusted faces"
        onSuccess={() => {
          setGateVisible(false);
          setTrustedUnlocked(true);
        }}
        onCancel={() => setGateVisible(false)}
      />
      {trustedUnlocked && !gateVisible && (
        <Text style={styles.gateNote}>
          Trusted Individuals is unlocked for this session — expand the section above.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f5f7' },
  content: { padding: 16, paddingBottom: 40 },

  connectionCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  connectionLabel: { fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 8 },
  connectionRow: { flexDirection: 'row', gap: 8 },
  hostInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#222',
  },
  testButton: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  testButtonText: { color: '#fff', fontWeight: '600' },
  testResult: { marginTop: 8, fontSize: 13 },
  testOk: { color: '#2e7d32' },
  testFail: { color: '#c62828' },

  sectionSpinner: { marginVertical: 12 },
  errorText: { color: '#c62828', fontSize: 13, marginTop: 8 },
  retryButton: { alignSelf: 'flex-start', marginTop: 8 },
  retryText: { color: '#1565c0', fontWeight: '600' },
  mutedText: { color: '#888', fontSize: 13, marginTop: 8 },

  sliderRow: { marginTop: 10 },
  sliderLabel: { fontSize: 14, color: '#444' },
  slider: { width: '100%', height: 36 },
  durationRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  durationInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 80,
    textAlign: 'center',
    fontSize: 14,
    color: '#222',
  },

  subheading: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 10 },
  radioRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#999',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: { borderColor: '#1565c0' },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1565c0',
  },
  radioTextWrap: { marginLeft: 10, flex: 1 },
  radioLabel: { fontSize: 14, color: '#222', fontWeight: '600' },
  radioHint: { fontSize: 12, color: '#888' },
  filterNote: { fontSize: 12, color: '#999', marginTop: 10, fontStyle: 'italic' },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  segment: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  segmentActive: { backgroundColor: '#1565c0', borderColor: '#1565c0' },
  segmentText: { fontSize: 13, color: '#555' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },

  faceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  faceInfo: { flex: 1 },
  faceName: { fontSize: 15, fontWeight: '600', color: '#222' },
  faceMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  deleteText: { color: '#c62828', fontWeight: '600', fontSize: 13 },

  enrollBusy: { alignItems: 'center', paddingVertical: 12, gap: 6 },
  namingCard: { marginTop: 12, alignItems: 'center' },
  namingPreview: {
    width: 120,
    height: 120,
    borderRadius: 10,
    backgroundColor: '#222',
  },
  nameInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    width: '100%',
    color: '#222',
  },
  namingActions: { flexDirection: 'row', gap: 10, marginTop: 10 },

  addRow: { flexDirection: 'row', gap: 10, marginTop: 14, flexWrap: 'wrap' },
  smallButton: {
    backgroundColor: '#1565c0',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  smallButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  smallButtonGrey: { backgroundColor: '#eee' },
  smallButtonGreyText: { color: '#444', fontWeight: '600', fontSize: 13 },

  gateNote: { fontSize: 12, color: '#999', textAlign: 'center', marginTop: 4 },
});
