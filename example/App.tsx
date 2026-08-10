import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Button,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import {
  scanETazkiraBack,
  scanETazkiraFront,
  scanPaperTazkira,
  scanPassport,
  type AfDocumentType,
  type ScanResult,
} from '@ali-aref/rn-af-identity-ocr';

const DOC_OPTIONS: { type: AfDocumentType; label: string; scan: (uri: string) => Promise<ScanResult> }[] =
  [
    { type: 'e_tazkira_front', label: 'e-Tazkira front', scan: scanETazkiraFront },
    { type: 'e_tazkira_back', label: 'e-Tazkira back', scan: scanETazkiraBack },
    { type: 'paper_tazkira', label: 'Paper Tazkira', scan: scanPaperTazkira },
    { type: 'passport', label: 'Passport', scan: scanPassport },
  ];

export default function App() {
  const cameraRef = useRef<CameraView>(null);
  const [docType, setDocType] = useState<AfDocumentType>('e_tazkira_front');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
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

  const onScan = async () => {
    if (!imageUri) return;
    const entry = DOC_OPTIONS.find((d) => d.type === docType);
    if (!entry) return;

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // const res = await entry.scan(imageUri)
      const res = await scanETazkiraFront(imageUri, { manipulateColors: true })
      setResult(res);
      console.log({ result: res })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>@ali-aref/rn-af-identity-ocr</Text>
        <Text style={styles.sub}>
          Dual-engine OCR (PP-OCR Persian/Pashto / ML Kit·Vision Latin) with optional
          native B&W. Pick a document type, then gallery or camera. Rebuild native after
          engine changes.
        </Text>

        <Text style={styles.sectionLabel}>Document type</Text>
        <View style={styles.docRow}>
          {DOC_OPTIONS.map((d) => (
            <Pressable
              key={d.type}
              onPress={() => setDocType(d.type)}
              style={[styles.docChip, docType === d.type && styles.docChipActive]}
            >
              <Text style={[styles.docChipText, docType === d.type && styles.docChipTextActive]}>
                {d.label}
              </Text>
            </Pressable>
          ))}
        </View>

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
          title={loading ? 'Scanning…' : 'Scan'}
          onPress={onScan}
          disabled={loading || !imageUri}
        />

        {loading ? <ActivityIndicator style={styles.spinner} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Result</Text>
            <Text>document: {result.documentType}</Text>
            <Text>engine: {result.engine}</Text>
            <Text>script: {result.scriptUsed}</Text>
            <Text>mean confidence: {result.meanConfidence.toFixed(1)}</Text>
            <Text>duration: {Math.round(result.durationMs)} ms</Text>
            {result.processedImageUri ? (
              <>
                <Text style={styles.sectionLabel}>Processed (sent to OCR)</Text>
                <Image
                  source={{ uri: result.processedImageUri }}
                  style={styles.preview}
                  resizeMode="contain"
                />
              </>
            ) : null}
            <Text style={styles.ocrText}>{result.fullText || '(empty)'}</Text>
            {result.documentType === 'passport' || result.documentType === 'e_tazkira_back' ? (
              <View style={{ marginTop: 12, gap: 4 }}>
                <View style={styles.divider} />
                <Text style={styles.sectionLabel}>MRZ</Text>
                {result.mrz ? (
                  <>
                    <Text>
                      format: {result.mrz.format} · valid: {String(result.mrz.valid)} · conf:{' '}
                      {result.mrz.confidence.toFixed(2)}
                    </Text>
                    {Object.entries(result.mrz.fields).map(([key, field], idx) =>
                      field ? (
                        <Text key={key}>
                         {idx + 1} --- {key} --- {field.normalizedValue}
                        </Text>
                      ) : null
                    )}
                    {result.mrz.warnings.map((w, i) => (
                      <Text key={i} style={styles.error}>
                        {w.message}
                      </Text>
                    ))}
                  </>
                ) : (
                  <Text>No MRZ located</Text>
                )}
              </View>
            ) : null}
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
  sectionLabel: { fontWeight: '600', color: '#333' },
  docRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  docChipActive: { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' },
  docChipText: { color: '#333', fontSize: 13 },
  docChipTextActive: { color: '#fff' },
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
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    backgroundColor: "#ccc",
    marginVertical: 12,
  }
});
