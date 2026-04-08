#!/usr/bin/env bash
set -e

exec gunicorn app:app -w 1 --timeout 300 --bind 0.0.0.0:5000
