#!/bin/bash
set -e

echo "=== Alpha Lens Startup ==="

# Install Python dependencies
echo "[1/4] Installing Python dependencies..."
pip install -r requirements.txt -q

# Build frontend if node_modules present
echo "[2/4] Checking frontend..."
if [ -d "frontend/node_modules" ]; then
  echo "  Building Next.js..."
  cd frontend && npm run build 2>&1 | tail -5 && cd ..
else
  echo "  No node_modules found — run: cd frontend && npm install"
fi

# Run DB migrations if needed
echo "[3/4] Checking database..."
python scripts/init_db.py 2>&1 || echo "  DB init skipped (check SUPABASE_URL)"

echo "[4/4] Starting Alpha Lens API on port 8000..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
