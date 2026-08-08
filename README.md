# rn-af-identity-ocr

On-device OCR for **Afghan identity documents** in React Native / Expo:

- e-Tazkira front / back
- Paper Tazkira
- Afghan passport

Uses **Tesseract** (`fas` / `pus` / `eng`) with optional **native black-and-white preprocessing** (grayscale + threshold; on by default via `manipulateColors`). Fully offline — no API calls.

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

The config plugin adds JitPack for Android Tesseract. Default language packs (`fas`, `pus`, `eng`) are bundled.

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
console.log(front.fullText);
console.log(front.meanConfidence);
console.log(front.processedImageUri); // file://… PNG after downscale / B&W

// Skip native B&W when color cues matter:
await scanPassport(imageUri, { manipulateColors: false });
```

Each scanner:

1. Downscales large images (max side 2000px)
2. Optionally converts to **black text on white** on native (`manipulateColors`, default `true`)
3. Writes that preprocessed image to cache and returns its URI as `processedImageUri`
4. Runs Tesseract OCR with the document’s language set
5. Applies Perso-Arabic text normalization

Compare your original photo to `result.processedImageUri` to see what OCR actually received.

---

## API

| Function | `documentType` | Languages |
|----------|----------------|-----------|
| `scanETazkiraFront(uri, options?)` | `e_tazkira_front` | `fas+pus+eng` |
| `scanETazkiraBack(uri, options?)` | `e_tazkira_back` | `fas+pus+eng` |
| `scanPaperTazkira(uri, options?)` | `paper_tazkira` | `fas+pus+eng` |
| `scanPassport(uri, options?)` | `passport` | `eng+fas+pus` |

### `ScanOptions`

| Option | Default | Meaning |
|--------|---------|---------|
| `manipulateColors` | `true` | Native B&W (grayscale + threshold) before OCR. Pass `false` to leave the image colors as-is. |

```ts
await scanETazkiraFront(uri, { manipulateColors: false });
await scanETazkiraBack(uri, { manipulateColors: false });
await scanPaperTazkira(uri, { manipulateColors: false });
await scanPassport(uri, { manipulateColors: false });
```

### `ScanResult`

```ts
type ScanResult = {
  documentType: AfDocumentType;
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number; // 0–100
  engine: 'tesseract';
  languagesUsed: string[];
  durationMs: number;
  /** Image actually sent to Tesseract (downscale + optional B&W). Inspect to debug preprocess. */
  processedImageUri: string | null;
};

type ScanOptions = {
  manipulateColors?: boolean; // default true
};
```

Also exported: `normalizePersoArabicText`, `DEFAULT_OCR_LANGUAGES`, types (`AfDocumentType`, `ScanResult`, `ScanOptions`, …).

`imageUri` must be a local `file://` or `content://` URI.

---

## Languages

Bundled models: Persian (`fas`), Pashto (`pus`), English (`eng`).

| Scanners | Tesseract lang string |
|----------|------------------------|
| e-Tazkira front/back, paper Tazkira | `fas+pus+eng` |
| Passport | `eng+fas+pus` (same packs; English first) |

Language sets are fixed per scanner in V1 (not configurable via `ScanOptions`).

**Adding more languages:** see **[docs/ADDING_LANGUAGES.md](docs/ADDING_LANGUAGES.md)**.

---

## Accuracy tips

- Sharp, well-lit photos; crop to the document when possible
- Keep the card/passport roughly upright
- Default B&W (`manipulateColors: true`) helps printed black text; try `false` if color/contrast stamps matter more
- Very low-contrast stamps may still be weak either way

---

## Example app

```bash
cd example
pnpm install
pnpm android   # or pnpm ios
```

Pick a document type, then Gallery or Camera, then **Scan**.

---

## Platform notes

| Platform | Engine | Preprocess (`manipulateColors: true`) |
|----------|--------|----------------------------------------|
| Android | Tesseract4Android | Luminance + threshold |
| iOS | kta-tesseract-swift | Grayscale + threshold |
| Web | — | Unsupported |

When `manipulateColors: false`, the (possibly downscaled) decoded image is passed to Tesseract without B&W conversion.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Missing language data | See [ADDING_LANGUAGES.md](docs/ADDING_LANGUAGES.md); rebuild native |
| Could not load/decode image | Use `file://` / `content://` from a picker |
| Module not found | Use `expo prebuild` + `expo run:*` (not Expo Go) |
| Gradle / tesseract4android | Ensure plugin `rn-af-identity-ocr` (JitPack) and re-prebuild |
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

MIT. Tesseract and language models have their own licenses — see [Tesseract](https://github.com/tesseract-ocr/tesseract) and [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).
