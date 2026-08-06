import { useState } from 'react';
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { recognizeAsync, type OcrResult } from 'rn-ocr-pro';

export default function App() {
  const [imageUri, setImageUri] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OcrResult | null>(null);

  const onRecognize = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const next = await recognizeAsync(imageUri.trim(), {
        languages: ['fas', 'pus', 'eng'],
        normalizePersoArabic: true,
      });
      setResult(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.header}>rn-ocr-pro</Text>
        <Text style={styles.sub}>
          On-device OCR (Persian / Pashto / English). Paste a file:// or content://
          image URI, then run recognition.
        </Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="file:///path/to/image.jpg"
          value={imageUri}
          onChangeText={setImageUri}
        />

        <Button
          title={loading ? 'Recognizing…' : 'Recognize'}
          onPress={onRecognize}
          disabled={loading || !imageUri.trim()}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eee' },
  content: { padding: 20, gap: 12 },
  header: { fontSize: 28, fontWeight: '700' },
  sub: { color: '#444', marginBottom: 8 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ccc',
  },
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
});
