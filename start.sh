#!/bin/bash
# Verify OpenBabel is available (needed for pdbqt→pdb fallback + docking)
python -c "from openbabel import openbabel; print('OpenBabel OK')" || {
    echo "OpenBabel not found — installing openbabel-wheel..."
    pip install openbabel-wheel --quiet
}

# Verify Python vina package is available (used instead of the bundled binary)
python -c "from vina import Vina; print('Vina OK')" || {
    echo "vina not found — installing..."
    pip install vina --quiet
}

# Start Flask backend in background
python server.py &
BACKEND_PID=$!

# Wait a moment for backend to initialize
sleep 2

# Start Vite frontend (foreground)
cd frontend && npm run dev

# Cleanup on exit
kill $BACKEND_PID 2>/dev/null
