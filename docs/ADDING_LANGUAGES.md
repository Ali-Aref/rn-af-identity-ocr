# Adding OCR languages

`rn-af-identity-ocr` uses **Tesseract** language packs (`.traineddata` files).  
Document scanners load packs automatically (`fas` / `pus` / `eng`). Extra languages are only needed if you extend the engine.

Bundled by default: **`fas`** (Persian), **`pus`** (Pashto), **`eng`** (English).

---

## Quick start (one extra language)

Example: add Turkish (`tur`) for experiments or a fork.

### 1. Download the model into the module

From the repo root:

```bash
./scripts/download-tessdata.sh tur
# or
pnpm run download-tessdata -- tur
```

This writes `tur.traineddata` to:

- `tessdata/`
- `android/src/main/assets/tessdata/`
- `ios/Resources/tessdata/`

### 2. Rebuild the native app

```bash
cd example
npx expo prebuild
npx expo run:android
# or: npx expo run:ios
```

### 3. Use it

The public scan APIs use fixed language sets. To try an extra language you must extend native/JS options in a fork, or copy the model for a custom call path.

For host-app-only models, place `xx.traineddata` where the native layer looks:

- **Android:** `{filesDir}/tesseract/tessdata/`
- **iOS:** app-bundle `tessdata/` folder or `Application Support/tesseract/tessdata/`

---

## Finding language codes

- Recommended (smaller): [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)
- Higher accuracy (larger): [tessdata_best](https://github.com/tesseract-ocr/tessdata_best)

| Language | Code |
|----------|------|
| English | `eng` |
| Persian | `fas` |
| Pashto | `pus` |
| Arabic | `ara` |
| Turkish | `tur` |
| Urdu | `urd` |

The download script pulls from **tessdata_fast**. Each pack increases app size (often ~1–5 MB).

---

## See also

- [README.md](../README.md) — install, scan APIs, troubleshooting
- [tessdata/README.md](../tessdata/README.md)
- [scripts/download-tessdata.sh](../scripts/download-tessdata.sh)
