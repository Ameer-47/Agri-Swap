#!/usr/bin/env python3
"""
AGRI-SWAP ResNet50 Model Downloader & TFLite Converter

Ensures the lightweight ResNet50 TFLite model (~89.9 MB) is prepared for
low-memory inference (<130 MB RAM) on Render free tier instances.
"""

import os
import sys
import time
import hashlib
import urllib.request
import urllib.error

KERAS_MODEL_URL = os.environ.get(
    "RESNET50_DOWNLOAD_URL",
    "https://github.com/Ameer-47/Agri-Swap/releases/download/v1.0.0/resnet50_fruit_vegetable_best.keras"
)

KERAS_EXPECTED_SHA256 = os.environ.get(
    "RESNET50_EXPECTED_SHA256",
    "ffa05c5f6c95225f745dea85d429b4eb3ad07456edfcb9f1e69f8f4ac8dc29f6"
).lower().strip()

TFLITE_MODEL_URL = os.environ.get(
    "RESNET50_TFLITE_URL",
    "https://github.com/Ameer-47/Agri-Swap/releases/download/v1.0.0/resnet50.tflite"
)

TFLITE_EXPECTED_SHA256 = os.environ.get(
    "RESNET50_TFLITE_EXPECTED_SHA256",
    "8aa337e9914af3937881900dfe83694b3a2a1a49dea9b081671fb5dca46e2a94"
).lower().strip()

CHUNK_SIZE = 1024 * 1024  # 1 MB chunk streaming
MAX_RETRIES = 3


def get_default_tflite_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.environ.get(
        "RESNET50_TFLITE_PATH",
        os.path.join(base_dir, "resnet50.tflite")
    )


def get_default_keras_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    return os.environ.get(
        "RESNET50_MODEL_PATH",
        os.path.join(base_dir, "resnet50_fruit_vegetable_best.keras")
    )


def compute_file_sha256(file_path):
    sha256 = hashlib.sha256()
    with open(file_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest().lower()


def convert_keras_to_tflite(keras_path, tflite_path):
    """Converts Keras ResNet50 model to FlatBuffer TFLite model."""
    print(f"\n[TFLITE CONVERTER] Converting {keras_path} to TFLite...", flush=True)
    try:
        import tensorflow as tf
        from tensorflow.keras.models import load_model

        model = load_model(keras_path, compile=False)
        converter = tf.lite.TFLiteConverter.from_keras_model(model)
        tflite_bytes = converter.convert()

        os.makedirs(os.path.dirname(os.path.abspath(tflite_path)), exist_ok=True)
        with open(tflite_path, "wb") as f:
            f.write(tflite_bytes)

        size_mb = len(tflite_bytes) / (1024 * 1024)
        print(f"[SUCCESS] ResNet50 converted to TFLite: {tflite_path} ({size_mb:.2f} MB)", flush=True)
        return tflite_path
    except Exception as e:
        print(f"[ERROR] TFLite conversion failed: {e}", file=sys.stderr, flush=True)
        raise


def check_url_status(url):
    """
    Probes remote URL with HTTP HEAD/Range to confirm HTTP 200 before streaming.
    Returns (is_ok: bool, status_code: int, message: str).
    """
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Agri-Swap-Model-Downloader/1.0"},
            method="HEAD"
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return (resp.status == 200, resp.status, "OK")
    except urllib.error.HTTPError as e:
        # If server rejects HEAD (e.g. 405 Method Not Allowed), test Range: bytes=0-0 GET
        if e.code == 405:
            try:
                range_req = urllib.request.Request(
                    url,
                    headers={"User-Agent": "Agri-Swap-Model-Downloader/1.0", "Range": "bytes=0-0"}
                )
                with urllib.request.urlopen(range_req, timeout=15) as resp:
                    return (resp.status in (200, 206), resp.status, "OK")
            except urllib.error.HTTPError as re:
                return (False, re.code, str(re.reason))
            except Exception as re:
                return (False, 0, str(re))
        return (False, e.code, str(e.reason))
    except Exception as e:
        return (False, 0, str(e))


def download_tflite_model(target_path=None):
    if target_path is None:
        target_path = get_default_tflite_path()

    target_path = os.path.abspath(target_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    if os.path.exists(target_path) and os.path.getsize(target_path) > 10000000:
        actual_hash = compute_file_sha256(target_path)
        if actual_hash == TFLITE_EXPECTED_SHA256:
            print(f"[MODEL DOWNLOADER] TFLite model exists and SHA-256 verified: {target_path}", flush=True)
            return target_path
        else:
            print(f"[WARN] Existing TFLite file hash mismatch ({actual_hash} != {TFLITE_EXPECTED_SHA256}). Re-downloading...", flush=True)
            try:
                os.remove(target_path)
            except OSError:
                pass

    temp_path = f"{target_path}.download.tmp"
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except OSError:
            pass

    print(f"\n[MODEL DOWNLOADER] Downloading ResNet50 TFLite Model Weights...", flush=True)
    print(f"   URL:    {TFLITE_MODEL_URL}", flush=True)
    print(f"   Target: {target_path}", flush=True)

    # Pre-flight check: confirm URL returns HTTP 200 before attempting download
    is_ok, status_code, msg = check_url_status(TFLITE_MODEL_URL)
    if not is_ok:
        raise RuntimeError(
            f"Model URL returned HTTP {status_code} ({msg}), expected HTTP 200. "
            f"URL: {TFLITE_MODEL_URL}. "
            "Please ensure 'resnet50.tflite' is uploaded to GitHub release tag v1.0.0."
        )

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                TFLITE_MODEL_URL,
                headers={"User-Agent": "Agri-Swap-Model-Downloader/1.0"}
            )
            hasher = hashlib.sha256()
            downloaded = 0
            with urllib.request.urlopen(req, timeout=60) as response, open(temp_path, "wb") as out_file:
                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    hasher.update(chunk)
                    downloaded += len(chunk)

            if hasher.hexdigest().lower() != TFLITE_EXPECTED_SHA256:
                raise ValueError(f"SHA-256 checksum mismatch on downloaded TFLite model ({hasher.hexdigest().lower()} != {TFLITE_EXPECTED_SHA256})")

            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except OSError:
                    pass
            os.replace(temp_path, target_path)
            print(f"[SUCCESS] Downloaded and verified TFLite model ({downloaded/(1024*1024):.1f} MB)", flush=True)
            return target_path
        except Exception as e:
            last_error = e
            print(f"[WARN] TFLite download attempt {attempt} failed: {e}", flush=True)
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Failed to download ResNet50 TFLite model: {last_error}")


def download_keras_model(target_path=None):
    if target_path is None:
        target_path = get_default_keras_path()

    target_path = os.path.abspath(target_path)
    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    if os.path.exists(target_path) and os.path.getsize(target_path) > 1000000:
        actual_hash = compute_file_sha256(target_path)
        if actual_hash == KERAS_EXPECTED_SHA256:
            print(f"[MODEL DOWNLOADER] Keras model exists and SHA-256 verified: {target_path}", flush=True)
            return target_path

    temp_path = f"{target_path}.download.tmp"
    if os.path.exists(temp_path):
        try:
            os.remove(temp_path)
        except OSError:
            pass

    print(f"\n[MODEL DOWNLOADER] Downloading ResNet50 Keras Model Weights...", flush=True)
    print(f"   URL:    {KERAS_MODEL_URL}", flush=True)
    print(f"   Target: {target_path}", flush=True)

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(
                KERAS_MODEL_URL,
                headers={"User-Agent": "Agri-Swap-Model-Downloader/1.0"}
            )
            hasher = hashlib.sha256()
            downloaded = 0
            with urllib.request.urlopen(req, timeout=60) as response, open(temp_path, "wb") as out_file:
                while True:
                    chunk = response.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    hasher.update(chunk)
                    downloaded += len(chunk)

            if hasher.hexdigest().lower() != KERAS_EXPECTED_SHA256:
                raise ValueError("SHA-256 checksum mismatch on downloaded model")

            if os.path.exists(target_path):
                try:
                    os.remove(target_path)
                except OSError:
                    pass
            os.replace(temp_path, target_path)
            print(f"[SUCCESS] Downloaded and verified Keras model ({downloaded/(1024*1024):.1f} MB)", flush=True)
            return target_path
        except Exception as e:
            last_error = e
            print(f"[WARN] Download attempt {attempt} failed: {e}", flush=True)
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Failed to download ResNet50 model: {last_error}")


def ensure_model_downloaded(tflite_path=None):
    """Prepares and verifies the ResNet50 TFLite model file."""
    if tflite_path is None:
        tflite_path = get_default_tflite_path()

    tflite_path = os.path.abspath(tflite_path)

    # 1. Check if TFLite model is already present and valid (verifying SHA-256)
    if os.path.exists(tflite_path) and os.path.getsize(tflite_path) > 10000000:
        actual_hash = compute_file_sha256(tflite_path)
        if actual_hash == TFLITE_EXPECTED_SHA256:
            print(f"[MODEL READY] ResNet50 TFLite model available and verified: {tflite_path} ({os.path.getsize(tflite_path)/(1024*1024):.1f} MB)", flush=True)
            return tflite_path
        else:
            print(f"[WARN] Local TFLite model exists but SHA-256 mismatch!\n   Found:    {actual_hash}\n   Expected: {TFLITE_EXPECTED_SHA256}\nRemoving corrupt file and re-downloading...", flush=True)
            try:
                os.remove(tflite_path)
            except OSError:
                pass

    # 2. Try direct download of pre-converted TFLite model
    try:
        return download_tflite_model(tflite_path)
    except Exception as dl_err:
        print(f"[MODEL DOWNLOADER] Direct TFLite download failed ({dl_err}). Checking Keras fallback...", flush=True)

    # 3. Fallback: check if .keras model is present to convert
    keras_path = get_default_keras_path()
    try:
        import tensorflow as tf
        if not os.path.exists(keras_path) or os.path.getsize(keras_path) < 10000000:
            download_keras_model(keras_path)
        convert_keras_to_tflite(keras_path, tflite_path)
        return tflite_path
    except ImportError:
        raise RuntimeError(
            f"Could not download pre-built TFLite model, and TensorFlow is not installed to convert from Keras. "
            f"Please ensure '{tflite_path}' exists or configure RESNET50_TFLITE_URL."
        )


if __name__ == "__main__":
    ensure_model_downloaded()
