import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import WebView, { WebViewMessageEvent } from 'react-native-webview';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { WEBAPP_HTML } from './webapp.generated';

// Everything the app does - reading the PDF, extracting totals, generating
// the verified report - runs inside this local WebView bundle (pdf-lib +
// pdf.js, the same libraries the desktop app uses). This shell only bridges
// two things the WebView can't do on its own on a phone: opening the native
// file picker, and saving/sharing the generated PDF. Neither touches the
// network, so the app works fully offline.
type FromWebViewMessage =
  | { type: 'ready' }
  | { type: 'pickFile' }
  | { type: 'savePdf'; base64: string; filename: string };

export default function App() {
  const webviewRef = useRef<WebView>(null);
  const [busy, setBusy] = useState(false);

  const postToWebView = useCallback((payload: unknown) => {
    webviewRef.current?.postMessage(JSON.stringify(payload));
  }, []);

  const handlePickFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setBusy(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      postToWebView({ type: 'fileSelected', base64, name: asset.name });
    } catch (error) {
      postToWebView({
        type: 'fileError',
        message: error instanceof Error ? error.message : 'Could not read the selected file.',
      });
    } finally {
      setBusy(false);
    }
  }, [postToWebView]);

  const handleSavePdf = useCallback(async (base64: string, filename: string) => {
    try {
      setBusy(true);
      const destUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(destUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save or share verified report',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Verified report saved to:\n${destUri}`);
      }
    } catch (error) {
      Alert.alert('Could not save PDF', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let msg: FromWebViewMessage;
      try {
        msg = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (msg.type === 'pickFile') {
        handlePickFile();
      } else if (msg.type === 'savePdf') {
        handleSavePdf(msg.base64, msg.filename);
      }
    },
    [handlePickFile, handleSavePdf]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <WebView
        ref={webviewRef}
        style={styles.webview}
        source={{ html: WEBAPP_HTML, baseUrl: 'https://rdreportsummary.local/' }}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        // Everything is local and self-contained; no network requests
        // should ever leave the device.
        mixedContentMode="never"
      />
      {busy && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#3498db" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
});
