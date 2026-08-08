# Engines and models

`rn-af-identity-ocr` does **not** use Tesseract. It routes by document type to one of two on-device engines (same approach as `af-identity-scanner`).

## Script routing

| API | Script | Engine |
|-----|--------|--------|
| `scanETazkiraFront` | `persian` | PP-OCRv5 (`arabic_PP-OCRv5_mobile_rec` — includes Persian/Pashto) |
| `scanPaperTazkira` | `persian` | PP-OCRv5 (`arabic_PP-OCRv5_mobile_rec` — includes Persian/Pashto) |
| `scanETazkiraBack` | `latin` | ML Kit (Android) / Vision (iOS) |
| `scanPassport` | `latin` | ML Kit (Android) / Vision (iOS) |

`ScanOptions.manipulateColors` only toggles native B&W preprocess. It does **not** change which engine runs.

## Latin

- **Android:** `com.google.mlkit:text-recognition` via `InputImage.fromFilePath` (EXIF applied; **no downscale** when `manipulateColors` is off — same as `af-identity-scanner`)
- **iOS:** `VNRecognizeTextRequest` at `.accurate`, `usesLanguageCorrection = false`, full-resolution `UIImage(contentsOfFile:)` + EXIF orientation

Passport / e-Tazkira back use this path. Opting into `{ manipulateColors: true }` still runs B&W (+ optional downscale) before Latin OCR.

## Persian / Pashto (PP-OCR arabic-family)

Paddle does **not** ship a separate `persian_*.onnx`. Persian and Pashto are covered by the official **`arabic_PP-OCRv5_mobile_rec`** model (Arabic-script family: Arabic, Persian, Urdu, Pashto, …).

Front and paper scanners request script `persian`; native still loads that same ONNX + `ppocrv5_arabic_dict.txt` (charset includes `پ چ گ ی` and Pashto letters like `ټ ږ ګ ڼ`).

| File | Role | Approx size |
|------|------|-------------|
| `PP-OCRv5_mobile_det.onnx` | Text detection | ~4.7 MB |
| `arabic_PP-OCRv5_mobile_rec.onnx` | Line recognition (Arabic-script family + English) | ~7.7 MB |
| `ppocrv5_arabic_dict.txt` | CTC charset | small |

Locations in this repo:

- Source / shared: [`assets/models/`](../assets/models/)
- Android assets: `android/src/main/assets/models/`
- iOS pod resources: `ios/models/`

Detection uses a probability heatmap (axis-aligned boxes). Recognition crops each box to height 48 and CTC-decodes. RTL lines are whole-string reversed after decode.

## Preprocess (this package only)

Before either engine:

1. Downscale longest side ≤ 2000px
2. Optional grayscale + fixed threshold → black text on white (`manipulateColors`, default `false`)
3. Save PNG → `processedImageUri`

PP-OCR expects ImageNet-normalized RGB. Default leaves color as-is; pass `{ manipulateColors: true }` to force B&W.

## Passport MRZ

`scanPassport` runs Latin OCR then the same TS flow as `af-identity-scanner`:

1. `locateMrz` — bottom chevron lines (TD3 = 2×44), with merges/splits repaired
2. `parseMrz` — `mrz` package + check-digit autocorrect → structured fields

See `src/mrz/locate.ts` and `src/mrz/parse.ts`.


There is no tessdata download flow. Latin coverage is fixed by ML Kit / Vision. Arabic coverage is fixed by the bundled PP-OCR arabic rec model and dict. Extending scripts means swapping or fine-tuning those models in a fork — not adding `.traineddata` packs.

## See also

- [README.md](../README.md) — install, scan APIs, troubleshooting
- [assets/models/README.md](../assets/models/README.md)
