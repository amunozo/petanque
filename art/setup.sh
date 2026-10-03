#!/usr/bin/env bash
# Creates art/.venv with Blender-as-a-module (bpy 5.0.1, ~400 MB download).
# Needs Python 3.11 (override with PYTHON=/path/to/python3.11).
set -euo pipefail
cd "$(dirname "$0")"

PY="${PYTHON:-}"
if [ -z "$PY" ]; then
  for c in python3.11 python3; do
    if command -v "$c" >/dev/null 2>&1; then PY="$c"; break; fi
  done
fi
[ -n "$PY" ] || { echo "No python found. Install Python 3.11." >&2; exit 1; }

ver="$("$PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])')"
if [ "$ver" != "3.11" ]; then
  echo "bpy 5.0.1 needs Python 3.11 but '$PY' is $ver. Set PYTHON=/path/to/python3.11." >&2
  exit 1
fi

"$PY" -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -c 'import bpy; print("Blender", bpy.app.version_string, "ready")'
