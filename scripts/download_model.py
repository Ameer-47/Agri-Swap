#!/usr/bin/env python3
"""
AGRI-SWAP Root Model Download Script
Prepares the lightweight ResNet50 TFLite model (~89.9 MB) during build.
"""

import os
import sys

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ML.image_recognition.download_model import ensure_model_downloaded

if __name__ == "__main__":
    try:
        model_path = ensure_model_downloaded()
        print(f"[BUILD] Model ready at: {model_path}", flush=True)
        sys.exit(0)
    except Exception as err:
        print(f"[FATAL ERROR] Model downloader failed: {err}", file=sys.stderr, flush=True)
        sys.exit(1)
