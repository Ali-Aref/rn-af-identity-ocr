# rn-af-identity-ocr

On-device OCR for **Afghan identity documents** in React Native / Expo:

- e-Tazkira front / back
- Paper Tazkira
- Afghan passport

Uses the same dual-engine approach as `af-identity-scanner`:

| Script | Engine | Used for |
|--------|--------|----------|
| **Persian** | PP-OCRv5 arabic-family ONNX (includes Persian / Pashto) | e-Tazkira front, paper Tazkira |
| **Latin** | ML Kit (Android) / Vision (iOS) | e-Tazkira back, passport / MRZ |

Optional **native black-and-white preprocess** (`manipulateColors`, default `false`) can run before either engine. Fully offline — no API calls.

> Requires a **development build** / `expo prebuild`. Not available in Expo Go or on web.

---

## Install

```bash
npx expo install rn-af-identity-ocr
# or
pnpm add rn-af-identity-ocr
```

```json
{
  "expo": {
    "plugins": ["rn-af-identity-ocr"]
  }
}
```

```bash
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

Bundled assets: PP-OCR det + arabic rec ONNX models (~12 MB) and charset dict. Latin models come from ML Kit / system Vision.

---

## Quick start

```ts
import {
  scanETazkiraFront,
  scanETazkiraBack,
  scanPaperTazkira,
  scanPassport,
} from 'rn-af-identity-ocr';

const front = await scanETazkiraFront(imageUri);
console.log(front.documentType); // 'e_tazkira_front'
console.log(front.scriptUsed);   // 'persian'
console.log(front.engine);       // 'ppocr'
console.log(front.fullText);
console.log(front.processedImageUri); // file://… after downscale / optional B&W

await scanPassport(imageUri, { manipulateColors: true });
```

Each scanner:

1. Routes to Latin (passport / e-Tazkira back) or Persian PP-OCR (fronts)
2. Latin (default): full-resolution image with EXIF — same path as `af-identity-scanner` (no downscale)
3. Optionally converts to **black text on white** when `manipulateColors: true` (then may downscale)
4. Writes / returns `processedImageUri` (original URI for default Latin; cache PNG when preprocessed)
5. Runs the script-specific OCR engine
6. Applies Perso-Arabic text normalization only for Persian-script results (Latin/MRZ left raw)

---

## API

| Function | `documentType` | Script |
|----------|----------------|--------|
| `scanETazkiraFront(uri, options?)` | `e_tazkira_front` | `persian` (PP-OCR arabic-family) |
| `scanETazkiraBack(uri, options?)` | `e_tazkira_back` | `latin` (ML Kit / Vision) |
| `scanPaperTazkira(uri, options?)` | `paper_tazkira` | `persian` (PP-OCR arabic-family) |
| `scanPassport(uri, options?)` | `passport` | `latin` (ML Kit / Vision) |

### `ScanOptions`

| Option | Default | Meaning |
|--------|---------|---------|
| `manipulateColors` | `false` | Native B&W (grayscale + threshold) before OCR. Pass `true` to enable. |

```ts
await scanETazkiraFront(uri, { manipulateColors: true });
await scanPassport(uri, { manipulateColors: true });
```

### `ScanResult`

```ts
type ScanResult = {
  documentType: AfDocumentType;
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number; // 0–100
  engine: 'mlkit' | 'vision' | 'ppocr';
  scriptUsed: 'latin' | 'arabic' | 'persian';
  durationMs: number;
  processedImageUri: string | null;
};

type ScanOptions = {
  manipulateColors?: boolean; // default false
};
```

Also exported: `normalizePersoArabicText`, types.

`imageUri` must be a local `file://` or `content://` URI.

This package returns **raw OCR text** (lines/blocks). Structured field extraction / MRZ parsing lives in `af-identity-scanner`.

---

## Engines and models

See **[docs/ENGINES.md](docs/ENGINES.md)** for Latin vs Arabic details and bundled ONNX files.

---

## Accuracy tips

- Sharp, well-lit photos; crop to the document when possible
- Keep the card/passport roughly upright
- Passport / e-Tazkira back: leave `manipulateColors` off (default) so Latin OCR matches `af-identity-scanner`
- For Persian fronts, try `{ manipulateColors: true }` only if color OCR is weak; compare `processedImageUri`

---

## Example app

```bash
cd example
pnpm install
pnpm android   # or pnpm ios
```

After changing native engines, run a clean native rebuild (`expo prebuild` / `expo run:*`).

Pick a document type, then Gallery or Camera, then **Scan**. The result shows the processed image OCR received.

---

## Platform notes

| Platform | Latin | Arabic | Preprocess |
|----------|-------|--------|------------|
| Android | ML Kit Text Recognition (bundled) | PP-OCRv5 via ONNX Runtime | Optional B&W |
| iOS | Apple Vision (`.accurate`) | PP-OCRv5 via onnxruntime-objc | Optional B&W |
| Web | — | — | Unsupported |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Module not found | Use `expo prebuild` + `expo run:*` (not Expo Go) |
| Missing PP-OCR models | Ensure `android/.../assets/models/` and `ios/models/` are present; rebuild native |
| Poor OCR with B&W | Leave default (`manipulateColors` off) or pass `{ manipulateColors: false }` |
| Could not load/decode image | Use `file://` / `content://` from a picker |
| `property is not writable` | Clear Metro cache; example metro pins a single Expo singleton |

---

## Development

```bash
pnpm install
pnpm run build
pnpm test
```

---

## License

MIT. ML Kit, Apple Vision, ONNX Runtime, and PP-OCR models have their own licenses — see Google ML Kit, Apple, [ONNX Runtime](https://onnxruntime.ai/), and [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR).
