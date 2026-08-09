#!/bin/bash
# ============================================
#  Bangumi Staff Analyzer 一键启动
#  双击本文件：自动启动本地服务并打开浏览器
#  关闭服务：关闭弹出的黑色窗口（或按 Ctrl+C）
#  注意：请固定用本方式打开（端口固定 8000），
#  与「双击 index.html」是两套数据，不会互通。
# ============================================
cd "$(dirname "$0")"
PORT=8000

if lsof -i :"$PORT" >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用（可能服务已经在运行）。"
  echo "直接为你打开：http://localhost:$PORT"
  open "http://localhost:$PORT"
  exit 0
fi

echo "正在启动 Bangumi Staff Analyzer ..."
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1
open "http://localhost:$PORT"
echo ""
echo "服务已启动：http://localhost:$PORT"
echo "------------------------------------------"
echo "使用完毕后：关闭本窗口，或按 Ctrl+C 关闭服务。"
echo "------------------------------------------"
wait "$SERVER_PID"
