#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
ICON_BUILD="$(mktemp -d "${TMPDIR:-/tmp}/staff-icon.XXXXXX")"
trap 'rm -rf "$ICON_BUILD"' EXIT
mkdir -p "$ICON_BUILD/AppIcon.iconset"
swiftc -module-cache-path "$ICON_BUILD/module-cache" macos/DrawIcon.swift -o "$ICON_BUILD/draw-icon"
"$ICON_BUILD/draw-icon" "$ICON_BUILD/icon.png"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$ICON_BUILD/icon.png" --out "$ICON_BUILD/AppIcon.iconset/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$ICON_BUILD/icon.png" --out "$ICON_BUILD/AppIcon.iconset/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
cp "$ICON_BUILD/icon.png" assets/icon.png
iconutil -c icns "$ICON_BUILD/AppIcon.iconset" -o assets/AppIcon.icns
printf '图标已生成。\n'
