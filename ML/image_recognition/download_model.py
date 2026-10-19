#!/usr/bin/env python3
"""
AGRI-SWAP ResNet50 Model Downloader & Checksum Verifier

Downloads the trained ResNet50 fruit & vegetable classifier weights from GitHub Releases
if missing or corrupt, and verifies integrity using SHA-256 checksum.
"""

import os
import sys
import time
import hashlib
import urllib.request
import urllib.error

MODEL_URL = os.environ.get(
    "RESNET50_DOWNLOAD_URL",
    "https://github.com/Ameer-47/Agri-Swap/releases/download/v1.0.0/resnet50_fruit_vegetable_best.keras"
)

EXPECTED_SHA256 = os.environ.get(
    "RESNET50_EXPECTED_SHA256",
    "ffa05c5f6c95225f745dea85d429b4eb3ad07456edfcb9f1e69f8f4ac8dc29f6"
).lower().strip()

CHUNK_SIZE = 1024 * 1024  # 1 MB chunk streaming for memory efficiency
MAX_RETRIES = 3


def get_default_model_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.environ.get(
        "RESNET50_MODEL_PATH",
        os.path.join(base_dir, "resnet50_fruit_vegetable_best.keras")
    )


def compute_file_sha256(file_path):
    """Computes SHA-256 hash of a file using chunked streaming."""
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest().lower()


def verify_model(file_path):
    """
    Checks if model exists and matches expected SHA-256 checksum.
    Returns: (is_valid: bool, actual_sha256: str)
    """
    if not os.path.exists(file_path):
        return False, None

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        return False, None

    actual_hash = compute_file_sha256(file_path)
    is_valid = (actual_hash == EXPECTED_SHA256)
    return is_valid, actual_hash


def download_model(target_path=None, force=False):
    """
    Downloads and verifies the ResNet50 model weights.
    If the file exists and is valid, skips download unless force=True.
    """
    if target_path is None:
        target_path = get_default_model_path()

    target_path = os.path.abspath(target_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    # 1. Check if model already exists and is intact
    if not force and os.path.exists(target_path):
        is_valid, current_hash = verify_model(target_path)
        if is_valid:
            print(f"[MODEL DOWNLOADER] Model already exists and SHA-256 verified:")
            print(f"  Path:   {target_path}")
            print(f"  SHA256: {current_hash}")
            return target_path
        else:
            print(f"⚠️ [WARN] Existing model failed SHA-256 check (expected: {EXPECTED_SHA256}, got: {current_hash}). Re-downloading...")

    # 2. Download to a temporary file
    temp_path = f"{target_path}.download.tmp"
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except OSError:
            pass

    print(f"\n========================================================")
    print(f"🌱 [MODEL DOWNLOADER] Downloading ResNet50 Model Weights")
    print(f"   URL:        {MODEL_URL}")
    print(f"   Target:     {target_path}")
    print(f"   SHA-256:    {EXPECTED_SHA256}")
    print(f"========================================================")

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"[MODEL DOWNLOADER] Attempt {attempt} of {MAX_RETRIES}...")
            req = urllib.request.Request(
                MODEL_URL,
                headers={
                    "User-Agent": "Agri-Swap-Model-Downloader/1.0 (urllib; Render/Cloud Deployment)"
                }
            )

            hasher = hashlib.sha256()
            downloaded_bytes = 0
            start_time = time.time()
            last_log_time = start_time

            with urllib.request.urlopen(req, timeout=60) as response, open(temp_path, "wb") as out_file:
                total_bytes_header = response.headers.get("Content-Length")
                total_bytes = int(total_bytes_header) if total_bytes_header and total_bytes_header.isdigit() else None

                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    hasher.update(chunk)
                    downloaded_bytes += len(chunk)

                    now = time.time()
                    if now - last_log_time >= 3.0:
                        mb_done = downloaded_bytes / (1024 * 1024)
                        if total_bytes:
                            mb_total = total_bytes / (1024 * 1024)
                            pct = (downloaded_bytes / total_bytes) * 100
                            print(f"   Progress: {mb_done:.1f} / {mb_total:.1f} MB ({pct:.1f}%)")
                        else:
                            print(f"   Progress: {mb_done:.1f} MB downloaded...")
                        last_log_time = now

            actual_sha256 = hasher.hexdigest().lower()
            elapsed = time.time() - start_time
            mb_final = downloaded_bytes / (1024 * 1024)
            speed = mb_final / elapsed if elapsed > 0 else 0

            print(f"[MODEL DOWNLOADER] Download complete: {mb_final:.2f} MB in {elapsed:.1f}s ({speed:.2f} MB/s)")
            print(f"[MODEL DOWNLOADER] Verifying SHA-256 checksum...")

            if actual_sha256 != EXPECTED_SHA256:
                raise ValueError(
                    f"Checksum mismatch! Expected: {EXPECTED_SHA256}, Actual: {actual_sha256}"
                )

            # Atomically move temp file to target
            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except OSError:
                    pass

            os.replace(temp_path, target_path)
            print(f"✅ [SUCCESS] ResNet50 model verified and installed at:")
            print(f"   {target_path}")
            return target_path

        except Exception as e:
            last_error = e
            print(f"⚠️ [WARN] Attempt {attempt} failed: {e}")
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            if attempt < MAX_RETRIES:
                sleep_sec = 2 ** attempt
                print(f"   Retrying in {sleep_sec} seconds...")
                time.sleep(sleep_sec)

    raise RuntimeError(f"Failed to download ResNet50 model after {MAX_RETRIES} attempts. Last error: {last_error}")


def ensure_model_downloaded(target_path=None):
    """Helper for Python workers to ensure model file exists and is intact before loading."""
    if target_path is None:
        target_path = get_default_model_path()
    if not os.path.exists(target_path):
        return download_model(target_path)
    return target_path


if __name__ == "__main__":
    force_download = "--force" in sys.argv
    try:
        download_model(force=force_download)
        sys.exit(0)
    except Exception as err:
        print(f"\n❌ [FATAL ERROR] Model downloader failed: {err}", file=sys.stderr)
        sys.exit(1)
