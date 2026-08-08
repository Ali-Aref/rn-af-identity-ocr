# Adding OCR languages

`rn-ocr-pro` uses **Tesseract** language packs (`.traineddata` files).  
`languages` in `recognizeAsync` chooses which packs to **load** — it does not download or detect languages.

Bundled by default: **`fas`** (Persian), **`pus`** (Pashto), **`eng`** (English).

---

## Quick start (one extra language)

Example: add Turkish (`tur`).

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

Assets are packaged at build time:

```bash
cd example   # or your host app
npx expo prebuild
npx expo run:android
# or: npx expo run:ios
```

### 3. Pass the code at runtime

```ts
import { recognizeAsync } from 'rn-ocr-pro';

await recognizeAsync(imageUri, {
  languages: ['fas', 'pus', 'eng', 'tur'],
});
```

Only Turkish:

```ts
await recognizeAsync(imageUri, { languages: ['tur'] });
```

---

## How `languages` works

| You pass | Behavior |
|----------|----------|
| omit / `[]` | Defaults to `['fas', 'pus', 'eng']` |
| `['eng']` | English model only — Perso-Arabic text will be poor |
| `['fas', 'eng']` | Persian + English |
| `['tur']` | Works **only if** `tur.traineddata` is on device |

Multiple codes are joined as `fas+pus+eng` for Tesseract multi-language OCR.

If a file is missing, recognition throws:

> Missing Tesseract language data for: tur

---

## Option A — ship inside this module (or a fork)

Best when the language should be available to every consumer of the package.

```bash
# one or more ISO/Tesseract codes
./scripts/download-tessdata.sh ara fra tur
```

Then commit the new `.traineddata` files (or document that consumers must run the script) and publish/rebuild.

**Size:** each `tessdata_fast` model is often ~1–5 MB and is included in the app binary. Prefer bundling only languages you need.

---

## Option B — add in the host app only

Best when one app needs an extra language but you don’t want to grow the shared package.

### Android

Copy `xx.traineddata` into the app’s private tessdata directory before OCR:

```
{filesDir}/tesseract/tessdata/xx.traineddata
```

The module also auto-copies anything already under its bundled `assets/tessdata/` on first use.

### iOS

Either:

- Add a **`tessdata`** folder (blue folder reference) to the app bundle containing `xx.traineddata`, or
- Copy the file into  
  `Application Support/tesseract/tessdata/`  
  before calling `recognizeAsync`.

Then:

```ts
await recognizeAsync(uri, { languages: ['fas', 'xx', 'eng'] });
```

---

## Finding language codes

Use the filename stem from:

- Recommended (smaller): [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast)
- Higher accuracy (larger): [tessdata_best](https://github.com/tesseract-ocr/tessdata_best)

Common codes:

| Language | Code |
|----------|------|
| English | `eng` |
| Persian | `fas` |
| Pashto | `pus` |
| Arabic | `ara` |
| Turkish | `tur` |
| Urdu | `urd` |
| French | `fra` |
| German | `deu` |
| Spanish | `spa` |

The download script always pulls from **tessdata_fast**.

---

## Checklist

1. Know the Tesseract code (e.g. `tur`).
2. Install `xx.traineddata` (script **or** host-app copy).
3. Rebuild native app if you added bundled assets.
4. Pass `languages: [..., 'xx']` to `recognizeAsync`.
5. Confirm no “Missing Tesseract language data” error.

---

## See also

- [README.md](../README.md) — install, API, troubleshooting
- [tessdata/README.md](../tessdata/README.md) — bundled packs note
- [scripts/download-tessdata.sh](../scripts/download-tessdata.sh) — download helper
