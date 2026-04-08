#!/usr/bin/env bash
set -e

# Start bgutil PO token HTTP server in background
python -m bgutil_ytdlp_pot_provider.server &

# Wait for it to be ready
sleep 3

exec gunicorn app:app -w 1 --timeout 300 --bind 0.0.0.0:5000
