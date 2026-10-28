#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"
APP_DIR="$PROJECT_DIR/Staff Analyzer.app"
BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/staff-analyzer-build.XXXXXX")"
trap 'rm -rf "$BUILD_DIR"' EXIT
mkdir -p "$BUILD_DIR/Staff Analyzer.app/Contents/MacOS" "$BUILD_DIR/Staff Analyzer.app/Contents/Resources/web"
CONTENTS="$BUILD_DIR/Staff Analyzer.app/Contents"
cp macos/Info.plist "$CONTENTS/Info.plist"
cp server.py "$CONTENTS/Resources/server.py"
cp index.html "$CONTENTS/Resources/web/"
cp -R css js assets "$CONTENTS/Resources/web/"
swiftc -O -target "$(uname -m)-apple-macos12.0" -module-cache-path "$BUILD_DIR/module-cache" macos/Launcher.swift -o "$CONTENTS/MacOS/StaffAnalyzer"
cp assets/AppIcon.icns "$CONTENTS/Resources/AppIcon.icns"
codesign --force --sign - "$BUILD_DIR/Staff Analyzer.app"
# Stage the complete app before replacing a previous local build.
if [ -d "$APP_DIR" ]; then
  mv "$APP_DIR" "$BUILD_DIR/previous.app"
fi
mv "$BUILD_DIR/Staff Analyzer.app" "$APP_DIR"
touch "$APP_DIR"
printf '已生成：%s\n' "$APP_DIR"
