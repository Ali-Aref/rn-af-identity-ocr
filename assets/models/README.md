# PP-OCR models

Dev source copies for Arabic-script OCR (Dari / Pashto / Persian) in `rn-af-identity-ocr`.

- `PP-OCRv5_mobile_det.onnx` — detection
- `arabic_PP-OCRv5_mobile_rec.onnx` — recognition
- `ppocrv5_arabic_dict.txt` — charset for CTC decode

Runtime copies (what the npm tarball ships):

- `android/src/main/assets/models/`
- `ios/models/`

This folder is **not** included in the published package — keep android/ios in sync after changing models.

See [docs/ENGINES.md](../docs/ENGINES.md).
