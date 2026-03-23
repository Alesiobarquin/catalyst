"""Pytest configuration and shared fixtures."""

import sys
from pathlib import Path

# Add project root so gatekeeper, ai_layer, hunters are importable
root = Path(__file__).resolve().parent.parent
if str(root) not in sys.path:
    sys.path.insert(0, str(root))
