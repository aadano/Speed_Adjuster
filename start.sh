#!/usr/bin/env bash
set -e

# Start bgutil PO token server in background
npx --yes @bunburya/bgutil-ytdlp-pot-provider serve &

# Wait for it to be ready
sleep 3

# Start gunicorn
exec gunicorn app:app -w 1 --timeout 300 --bind 0.0.0.0:5000
