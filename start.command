#!/bin/bash
# 旧入口兼容：今后请直接双击同目录的 Staff Analyzer.app，不会出现终端。
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$PROJECT_DIR/Staff Analyzer.app" ]; then
  open "$PROJECT_DIR/Staff Analyzer.app"
else
  osascript -e 'display alert "请先生成 Staff Analyzer 应用" message "在项目目录运行 bash scripts/build-macos.sh，然后双击 Staff Analyzer.app。以后无需使用 start.command。"'
fi
