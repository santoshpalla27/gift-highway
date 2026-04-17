#!/bin/bash

OUTPUT="combined-code.txt"
ROOT="$(cd "$(dirname "$0")" && pwd)"

> "$OUTPUT"

# --- Directory structure ---
echo "================================================================" >> "$OUTPUT"
echo "DIRECTORY STRUCTURE" >> "$OUTPUT"
echo "================================================================" >> "$OUTPUT"

find "$ROOT" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -name ".DS_Store" \
  | sort \
  | sed "s|$ROOT/||; s|$ROOT||" \
  | grep -v '^$' \
  | awk '{
      n = split($0, parts, "/")
      indent = ""
      for (i = 1; i < n; i++) indent = indent "  "
      print indent parts[n]
    }' >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "" >> "$OUTPUT"

# --- File contents ---
echo "================================================================" >> "$OUTPUT"
echo "FILE CONTENTS" >> "$OUTPUT"
echo "================================================================" >> "$OUTPUT"

while IFS= read -r file; do
  rel="${file#$ROOT/}"

  # Skip binary files
  if file "$file" | grep -qiE 'binary|executable|image|font|archive|compressed'; then
    continue
  fi

  echo "" >> "$OUTPUT"
  echo "----------------------------------------------------------------" >> "$OUTPUT"
  echo "FILE: $rel" >> "$OUTPUT"
  echo "----------------------------------------------------------------" >> "$OUTPUT"
  cat "$file" >> "$OUTPUT"
  echo "" >> "$OUTPUT"
done < <(find "$ROOT" -type f \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/dist/*" \
  -not -path "*/build/*" \
  -not -name ".DS_Store" \
  -not -name "*.lock" \
  -not -name "package-lock.json" \
  -not -name "*.png" \
  -not -name "*.jpg" \
  -not -name "*.jpeg" \
  -not -name "*.gif" \
  -not -name "*.svg" \
  -not -name "*.ico" \
  -not -name "*.woff" \
  -not -name "*.woff2" \
  -not -name "*.ttf" \
  -not -name "*.map" \
  -not -name "combined-code.txt" \
  | sort)

echo ""
echo "Done! Output written to: $OUTPUT"
echo "Total size: $(du -sh "$OUTPUT" | cut -f1)"
