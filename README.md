# rn-ocr-pro

On-device OCR for **React Native / Expo** with first-class support for **Persian (`fas`)** and **Pashto (`pus`)**, plus English (`eng`) and any other Tesseract language you bundle.

- Fully **offline** — no API keys, no network calls
- **Tesseract** LSTM engine on Android and iOS
- Typed `recognizeAsync` API with blocks, lines, bounding boxes, and confidence
- Optional Perso-Arabic normalization (ی/ي, ک/ك, digits, whitespace)

> Requires a **development build** / `expo prebuild` (custom native code). Not available in Expo Go or on web.

---

## Install

```bash
npx expo install rn-ocr-pro
# or
pnpm add rn-ocr-pro
```

Add the config plugin (ensures JitPack is available for Android Tesseract):

```json
{
  "expo": {
    "plugins": ["rn-ocr-pro"]
  }
}
```

This module includes native code. After installing:

```bash
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

The default language pack (`fas`, `pus`, `eng`) is bundled — no extra model download required for primary languages.

### Android repository (JitPack)

The `rn-ocr-pro` config plugin adds JitPack automatically. If you skip the plugin and Gradle cannot resolve `cz.adaptech.tesseract4android`, add this via [`expo-build-properties`](https://docs.expo.dev/versions/latest/sdk/build-properties/):

```json
[
  "expo-build-properties",
  { "android": { "extraMavenRepos": ["https://jitpack.io"] } }
]
```

---

## Quick start

```ts
import { recognizeAsync } from 'rn-ocr-pro';

const result = await recognizeAsync(imageUri, {
  languages: ['fas', 'pus', 'eng'], // default if omitted
  normalizePersoArabic: true,       // default
});

console.log(result.fullText);
console.log(result.meanConfidence);
console.log(result.blocks);
```

`imageUri` must be a local URI your app can read:

- Android: `file://…` or `content://…` (e.g. from `expo-image-picker`)
- iOS: `file://…`

---

## API reference

### `recognizeAsync(imageUri, options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `languages` | `string[]` | `['fas','pus','eng']` | Tesseract language codes. Multiple codes are combined with `+`. |
| `psm` | `number` | `3` | Page segmentation mode (auto). See [Tesseract PSM docs](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html#page-segmentation-method). |
| `oem` | `number` | `1` | OCR engine mode. Use `1` (LSTM only) with the bundled `tessdata_fast` models. |
| `minConfidence` | `number` | `0` | Drop lines below this confidence (0–100). |
| `normalizePersoArabic` | `boolean` | `true` | Apply Perso-Arabic cleanup in JS after recognition. |

### `OcrResult`

```ts
type OcrResult = {
  fullText: string;
  blocks: OcrBlock[];
  meanConfidence: number;      // 0–100
  engine: 'tesseract';
  languagesUsed: string[];
  durationMs: number;
};

type OcrBlock = {
  text: string;
  confidence: number;
  bbox: { left: number; top: number; right: number; bottom: number };
  lines: OcrLine[];
};
```

### `normalizePersoArabicText(text, options?)`

Exported helper used internally when `normalizePersoArabic` is enabled:

- `ي` → `ی`, `ك` → `ک`
- strips tatweel (`ـ`)
- Persian/Arabic-Indic digits → ASCII (`۰۱۲` / `٠١٢` → `012`) unless `normalizeDigits: false`
- whitespace cleanup + NFC

### `DEFAULT_OCR_LANGUAGES`

Constant: `['fas', 'pus', 'eng']`.

---

## Languages

Bundled by default: **Persian (`fas`)**, **Pashto (`pus`)**, **English (`eng`)** (`tessdata_fast`).

`languages` in `recognizeAsync` selects which Tesseract models to load — it does not auto-detect language.

**Adding another language** (download model → rebuild → pass the code): see **[docs/ADDING_LANGUAGES.md](docs/ADDING_LANGUAGES.md)**.

```ts
// after installing tur.traineddata (see docs)
await recognizeAsync(uri, { languages: ['fas', 'eng', 'tur'] });
```

---

## Accuracy tips (Persian / Pashto)

- Prefer **sharp, well-lit** photos; avoid blur and heavy shadows.
- **Crop** to the text region when possible (less layout noise).
- Aim for roughly **300 DPI** equivalent; very small text hurts LSTM accuracy.
- Keep lines **horizontal**; deskew rotated pages before OCR.
- For single-line fields (IDs, names), try `psm: 7` (single text line) or `psm: 6` (uniform block).
- Mixed Persian + English: keep both `fas` and `eng` in `languages`.
- Pashto-specific letters (ښ، ږ، ڼ، …) need `pus` in the language list — do not rely on `fas` alone.

---

## Example app

```bash
cd example
pnpm install
pnpm android   # or pnpm ios
```

Use **Gallery** or **Camera** to choose an image, then tap **Recognize**. The demo uses `fas+pus+eng` with Perso-Arabic normalization.

---

## Platform notes

| Platform | Engine | Notes |
|----------|--------|--------|
| Android | [Tesseract4Android](https://github.com/adaptech-cz/Tesseract4Android) | Bundled `assets/tessdata` copied to app files on first use |
| iOS | [kta-tesseract-swift](https://github.com/kurzdigital/kta-tesseract-swift) (libtesseract) | Resource bundle `RnOcrProTessdata` + optional main-bundle `tessdata/` |
| Web | — | Throws: not supported |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Missing Tesseract language data for: …` | `.traineddata` not bundled/copied | Run `scripts/download-tessdata.sh`, rebuild native app |
| `Could not decode/load image` | Bad URI or unreadable content URI | Use `file://` / `content://` from a picker; grant permissions in the host app |
| Low confidence / garbage text | Soft focus, tiny text, wrong language | Crop, improve lighting, set explicit `languages`, try `psm: 6` or `7` |
| Module not found / null native module | Running in Expo Go | Use `expo prebuild` + `expo run:*` (dev client) |
| Gradle cannot resolve `tesseract4android` | JitPack missing from repos | Add `"plugins": ["rn-ocr-pro"]` (or `expo-build-properties` extraMavenRepos) and re-prebuild |
| iOS pod install issues with Tesseract | Static frameworks / pods | Clean `ios/Pods`, re-run `npx expo prebuild --clean` |
| Web crash / reject | Web stub | OCR is native-only by design |

---

## Development

```bash
pnpm install
pnpm run build
pnpm test
./scripts/download-tessdata.sh   # refresh language packs
```

---

## License

MIT. Tesseract and language models have their own licenses — see [Tesseract](https://github.com/tesseract-ocr/tesseract) and [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast).
