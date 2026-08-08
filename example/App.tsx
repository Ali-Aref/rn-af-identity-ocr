import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { recognizeAsync, type OcrResult } from 'rn-ocr-pro';

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const selectImage = (uri: string) => {
    setImageUri(uri);
    setResult(null);
    setError(null);
  };

  const onPickGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo library permission is required.');
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!picked.canceled && picked.assets[0]?.uri) {
      selectImage(picked.assets[0].uri);
    }
  };

  const onOpenCamera = async () => {
    if (!cameraPermission?.granted) {
      const next = await requestCameraPermission();
      if (!next.granted) {
        setError('Camera permission is required.');
        return;
      }
    }
    setError(null);
    setShowCamera(true);
  };

  const onCapture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({
      quality: 1,
      shutterSound: false,
    });
    if (photo?.uri) {
      selectImage(photo.uri);
      setShowCamera(false);
    }
  };

  const onRecognize = async () => {
    if (!imageUri) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await recognizeAsync(imageUri, {
        languages: ['fas', 'pus', 'eng'],
        normalizePersoArabic: true,
      });
      console.log({ next })
      setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>rn-ocr-pro</Text>
        <Text style={styles.sub}>
          On-device OCR (Persian / Pashto / English). Pick a photo or capture with
          the camera, then run recognition.
        </Text>

        <View style={styles.row}>
          <View style={styles.rowBtn}>
            <Button title="Gallery" onPress={onPickGallery} disabled={loading} />
          </View>
          <View style={styles.rowBtn}>
            <Button title="Camera" onPress={onOpenCamera} disabled={loading} />
          </View>
        </View>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.placeholderText}>No image selected</Text>
          </View>
        )}

        <Button
          title={loading ? 'Recognizing…' : 'Recognize'}
          onPress={onRecognize}
          disabled={loading || !imageUri}
        />

        {loading ? <ActivityIndicator style={styles.spinner} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Result</Text>
            <Text>engine: {result.engine}</Text>
            <Text>languages: {result.languagesUsed.join('+')}</Text>
            <Text>mean confidence: {result.meanConfidence.toFixed(1)}</Text>
            <Text>duration: {Math.round(result.durationMs)} ms</Text>
            <Text style={styles.ocrText}>{result.fullText || '(empty)'}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={showCamera} animationType="slide">
        <View style={styles.cameraScreen}>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={styles.cameraActions}>
            <Button title="Cancel" onPress={() => setShowCamera(false)} />
            <Button title="Capture" onPress={onCapture} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingVertical: 16, backgroundColor: '#eee' },
  content: { padding: 20, gap: 12 },
  header: { fontSize: 28, fontWeight: '700' },
  sub: { color: '#444', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12 },
  rowBtn: { flex: 1 },
  preview: {
    width: '100%',
    height: 220,
    backgroundColor: '#ddd',
    borderRadius: 8,
  },
  previewPlaceholder: {
    width: '100%',
    height: 220,
    backgroundColor: '#ddd',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: { color: '#666' },
  spinner: { marginTop: 12 },
  error: { color: '#b00020', marginTop: 8 },
  card: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    gap: 6,
  },
  cardTitle: { fontSize: 18, fontWeight: '600', marginBottom: 4 },
  ocrText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  cameraScreen: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    backgroundColor: '#111',
  },
});
