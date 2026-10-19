#!/usr/bin/env python3
"""
AGRI-SWAP Root Model Download Script
Runs during Render build command or standalone setup.
"""

import os
import sys

# Ensure repository root is on sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from ML.image_recognition.download_model import download_model

if __name__ == "__main__":
    force_download = "--force" in sys.argv
    try:
        download_model(force=force_download)
        sys.exit(0)
    except Exception as err:
        print(f"\n❌ [FATAL ERROR] Model downloader failed: {err}", file=sys.stderr)
        sys.exit(1)
