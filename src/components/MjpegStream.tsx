/**
 * MJPEG stream viewer.
 *
 * React Native's <Image> can't render multipart/x-mixed-replace, so the
 * stream is displayed inside a WebView containing a single <img> tag whose
 * src is the MJPEG URL (browsers/WebViews handle MJPEG natively).
 *
 * Idle state (no active stream): black box + "No stream detected".
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';

interface Props {
  streamUrl: string | null;
  active: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}

function buildHtml(url: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
  html, body { margin: 0; padding: 0; background: #000; height: 100%; overflow: hidden; }
  img { width: 100%; height: 100%; object-fit: contain; display: block; }
</style>
</head>
<body><img src="${url}" alt=""></body>
</html>`;
}

export default function MjpegStream({ streamUrl, active, style, onPress }: Props) {
  const isLive = active && !!streamUrl;

  const content = isLive ? (
    <WebView
      key={streamUrl}
      source={{ html: buildHtml(streamUrl!) }}
      originWhitelist={['*']}
      style={styles.webview}
      containerStyle={styles.webviewContainer}
      scrollEnabled={false}
      javaScriptEnabled={false}
      androidLayerType="hardware"
      // The stream is on the LAN over plain http.
      mixedContentMode="always"
      pointerEvents={onPress ? 'none' : 'auto'}
    />
  ) : (
    <View style={styles.idle}>
      <Text style={styles.idleText}>No stream detected</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        style={[styles.container, style]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }
  return <View style={[styles.container, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 8,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  webviewContainer: {
    backgroundColor: '#000',
  },
  idle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  idleText: {
    color: '#888',
    fontSize: 14,
  },
});
