# rn-af-identity-ocr

On-device OCR for **Afghan identity documents** in React Native / Expo:

- e-Tazkira front / back
- Paper Tazkira
- Afghan passport
- **Live photo face validation** (signup / liveness-style checks)

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

Bundled assets: PP-OCR det + arabic rec ONNX models (~12 MB) and charset dict. Latin models come from ML Kit / system Vision. Face detection uses ML Kit Face Detection on Android (~6 MB bundled model) and Apple Vision on iOS.

---

## Quick start

```ts
import {
  scanETazkiraFront,
  scanETazkiraBack,
  scanPaperTazkira,
  scanPassport,
  validateLivePhotoFace,
} from 'rn-af-identity-ocr';

const front = await scanETazkiraFront(imageUri);
console.log(front.documentType); // 'e_tazkira_front'
console.log(front.scriptUsed);   // 'persian'
console.log(front.engine);       // 'ppocr'
console.log(front.fullText);
console.log(front.processedImageUri); // file://… after downscale / optional B&W

const livePhoto = await validateLivePhotoFace(selfieUri);
console.log(livePhoto.status);    // 'face' | 'no_face'
console.log(livePhoto.faceCount); // 1 when a face is detected

const passport = await scanPassport(imageUri);
console.log(passport.mrz?.fields.surname?.normalizedValue);
console.log(passport.mrz?.fields.documentNumber?.normalizedValue);
console.log(passport.mrz?.valid);
```

Each scanner:

1. Routes to Latin (passport / e-Tazkira back) or Persian PP-OCR (fronts)
2. Latin (default): full-resolution image with EXIF — same path as `af-identity-scanner` (no downscale)
3. Optionally converts to **black text on white** when `manipulateColors: true` (then may downscale)
4. Writes / returns `processedImageUri` (original URI for default Latin; cache PNG when preprocessed)
5. Runs the script-specific OCR engine
6. Applies Perso-Arabic text normalization only for Persian-script results (Latin/MRZ left raw)
7. **Passport / e-Tazkira back:** locates and parses the MRZ (ICAO TD3 / TD1) into structured fields

---

## API

| Function | `documentType` | Script |
|----------|----------------|--------|
| `scanETazkiraFront(uri, options?)` | `e_tazkira_front` | `persian` (PP-OCR arabic-family) |
| `scanETazkiraBack(uri, options?)` | `e_tazkira_back` | `latin` (ML Kit / Vision) |
| `scanPaperTazkira(uri, options?)` | `paper_tazkira` | `persian` (PP-OCR arabic-family) |
| `scanPassport(uri, options?)` | `passport` | `latin` (ML Kit / Vision) |
| `validateLivePhotoFace(uri, options?)` | — | face detection (ML Kit / Vision) |

### `ScanOptions`

| Option | Default | Meaning |
|--------|---------|---------|
| `manipulateColors` | `false` | Native B&W (grayscale + threshold) before OCR. Pass `true` to enable. |

```ts
await scanETazkiraFront(uri, { manipulateColors: true });
await scanPassport(uri, { manipulateColors: true });
```

### `FaceValidationOptions`

| Option | Default | Meaning |
|--------|---------|---------|
| `minConfidence` | `0.5` | Minimum primary-face confidence (0–1). Used on iOS; Android treats any detected face as valid. |

```ts
const result = await validateLivePhotoFace(uri, { minConfidence: 0.6 });
if (result.status === 'face') {
  // keep image for upload
}
```

### `FaceValidationResult`

```ts
type FaceValidationResult = {
  status: 'face' | 'no_face';
  faceCount: number;
  confidence?: number; // primary face, 0–1 when available
  box?: { x: number; y: number; width: number; height: number }; // normalized 0–1
  durationMs: number;
};
```

Use after capturing a portrait / live photo (typically front camera). This is **face detection**, not liveness or anti-spoofing.

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
  /** Passport (TD3) / e-Tazkira back (TD1); null if not located. Narrow on `format`. */
  mrz?: DocumentMrz | null;
};

// Discriminated on format:
type Td1Mrz = { format: 'TD1'; lines: [string, string, string]; fields: MrzIdentityFields & { personalNumber?: MrzField }; ... };
type Td3Mrz = { format: 'TD3'; lines: [string, string]; fields: MrzIdentityFields & { personalNumber?: MrzField }; ... };
type DocumentMrz = Td1Mrz | Td3Mrz;
// PassportMrz is a deprecated alias of DocumentMrz.
```

Also exported: `validateLivePhotoFace`, `normalizePersoArabicText`, `locateMrz`, `parseMrz`, types.

`imageUri` must be a local `file://` or `content://` URI.

Passport and e-Tazkira back return raw OCR **plus** on-device MRZ parse (same `locateMrz` → `parseMrz` flow as `af-identity-scanner`, using the `mrz` package with check-digit autocorrect). Locate also resegments merged/split OCR lines, which is common on device.

Shared MRZ fields: `documentNumber`, `surname`, `givenNames`, `nationality`, `dateOfBirth`, `sex`, `dateOfExpiry`.  
`personalNumber` is optional on both: on TD1 it is the e-Tazkira ID suffix (`optional1`); on TD3 it is the personal-number zone (often empty on AF passports).

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

| Platform | Latin | Arabic | Face | Preprocess |
|----------|-------|--------|------|------------|
| Android | ML Kit Text Recognition (bundled) | PP-OCRv5 via ONNX Runtime | ML Kit Face Detection (bundled) | Optional B&W |
| iOS | Apple Vision (`.accurate`) | PP-OCRv5 via onnxruntime-objc | `VNDetectFaceRectanglesRequest` | Optional B&W |
| Web | — | — | — | Unsupported |

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Module not found | Use `expo prebuild` + `expo run:*` (not Expo Go) |
| Missing PP-OCR models | Ensure `android/.../assets/models/` and `ios/models/` are present; rebuild native |
| Poor OCR with B&W | Leave default (`manipulateColors` off) or pass `{ manipulateColors: false }` |
| Could not load/decode image | Use `file://` / `content://` from a picker |
| No face detected on a clear selfie | Use front camera, good lighting; lower `minConfidence` on iOS if needed |
| `property is not writable` | Clear Metro cache; example metro pins a single Expo singleton |

---

## Development

```bash
pnpm install
pnpm run build
pnpm test
```

Repo: [Ali-Aref/rn-af-identity-ocr](https://github.com/Ali-Aref/rn-af-identity-ocr).

### Publish (npm)

```bash
npm login
pnpm pack --dry-run   # verify allowlist (build + android/src + ios; no src/)
pnpm publish
```

---

## License

MIT. ML Kit, Apple Vision, ONNX Runtime, and PP-OCR models have their own licenses — see Google ML Kit, Apple, [ONNX Runtime](https://onnxruntime.ai/), and [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR).
