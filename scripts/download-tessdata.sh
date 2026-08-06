#!/usr/bin/env bash
# Downloads tessdata_fast models and syncs into Android assets + iOS resources.
# Usage:
#   ./scripts/download-tessdata.sh           # eng fas pus
#   ./scripts/download-tessdata.sh ara fra   # extra languages
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tessdata"
BASE_URL="https://github.com/tesseract-ocr/tessdata_fast/raw/main"

if [[ $# -gt 0 ]]; then
  LANGS=("$@")
else
  LANGS=(eng fas pus)
fi

mkdir -p "$OUT" \
  "$ROOT/android/src/main/assets/tessdata" \
  "$ROOT/ios/Resources/tessdata"

for lang in "${LANGS[@]}"; do
  echo "Downloading ${lang}.traineddata ..."
  curl -fsSL -o "$OUT/${lang}.traineddata" "$BASE_URL/${lang}.traineddata"
  cp "$OUT/${lang}.traineddata" "$ROOT/android/src/main/assets/tessdata/"
  cp "$OUT/${lang}.traineddata" "$ROOT/ios/Resources/tessdata/"
  ls -lh "$OUT/${lang}.traineddata"
done

echo "Done. Models synced to tessdata/, android assets, and ios Resources."
