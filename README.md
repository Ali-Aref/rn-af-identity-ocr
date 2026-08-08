# rn-af-identity-ocr

On-device OCR for **Afghan identity documents** in React Native / Expo:

- e-Tazkira front / back
- Paper Tazkira
- Afghan passport

Uses **Tesseract** (`fas` / `pus` / `eng`) with **native black-and-white preprocessing** (grayscale + threshold) before recognition. Fully offline — no API calls.

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
```

Each scanner:

1. Downscales large images (max side 2000px)
2. Converts to **black text on white** on native
3. Runs Tesseract OCR
4. Applies Perso-Arabic text normalization

---

## API

| Function | `documentType` |
|----------|----------------|
| `scanETazkiraFront(uri)` | `e_tazkira_front` |
| `scanETazkiraBack(uri)` | `e_tazkira_back` |
| `scanPaperTazkira(uri)` | `paper_tazkira` |
| `scanPassport(uri)` | `passport` |

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
};
```

Also exported: `normalizePersoArabicText`, `DEFAULT_OCR_LANGUAGES`, types.

`imageUri` must be a local `file://` or `content://` URI.

---

## Languages

Default models: Persian (`fas`), Pashto (`pus`), English (`eng`).

Passport scans prefer `eng+fas+pus`. Other document types use `fas+pus+eng`.

**Adding more languages:** see **[docs/ADDING_LANGUAGES.md](docs/ADDING_LANGUAGES.md)**.

---

## Accuracy tips

- Sharp, well-lit photos; crop to the document when possible
- Keep the card/passport roughly upright
- Native B&W helps printed black text; very low-contrast stamps may still be weak

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

| Platform | Engine | Preprocess |
|----------|--------|------------|
| Android | Tesseract4Android | Luminance + threshold |
| iOS | kta-tesseract-swift | Grayscale + threshold |
| Web | — | Unsupported |

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
