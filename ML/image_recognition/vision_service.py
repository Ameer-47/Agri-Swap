#!/usr/bin/env python3
"""
AGRI-SWAP Dedicated Vision Inference Service

Runs as a standalone microservice to decouple heavy TensorFlow & ResNet50
memory consumption (>300 MB) from the 512 MB Render backend web instance.

Provides:
  - GET  /health -> Service readiness probe
  - POST /predict -> Predicts produce category from image upload
Compatible with built-in Python ThreadingHTTPServer (zero extra framework dependencies)
and WSGI/Gunicorn for production container deployments.
"""

import os
import sys
import json
import time
import tempfile
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# Reconfigure standard streams to UTF-8 to prevent charmap encoding errors on Windows
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# Thread and memory optimizations for cloud containers & Render free tier
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["TF_NUM_INTRAOP_THREADS"] = "1"
os.environ["TF_NUM_INTEROP_THREADS"] = "1"

# Ensure repository root is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "../.."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

MODEL_PATH = os.environ.get(
    "RESNET50_TFLITE_PATH",
    os.environ.get(
        "RESNET50_MODEL_PATH",
        os.path.join(CURRENT_DIR, "resnet50.tflite")
    )
)
CLASS_NAMES_PATH = os.environ.get(
    "RESNET50_CLASSES_PATH",
    os.path.join(CURRENT_DIR, "resnet50_class_names.json")
)

# Auto-download or verify model weights if missing
if not os.path.exists(MODEL_PATH) or os.path.getsize(MODEL_PATH) < 10000000:
    try:
        from ML.image_recognition.download_model import ensure_model_downloaded
        print(f"[VISION SERVICE] Model weights missing at {MODEL_PATH}. Ensuring model is available...")
        ensure_model_downloaded(MODEL_PATH)
    except Exception as dl_err:
        print(f"[VISION SERVICE] Failed to verify or download model: {dl_err}", file=sys.stderr)

# Global model state
PRODUCE_MODEL = None
CLASS_NAMES = []
IS_READY = False
INIT_ERROR = None
MODEL_ENGINE = "uninitialized"

def initialize_models():
    global PRODUCE_MODEL, CLASS_NAMES, IS_READY, INIT_ERROR, MODEL_ENGINE
    if IS_READY:
        return True

    try:
        import gc
        import numpy as np

        print(f"[VISION SERVICE] Loading class names from: {CLASS_NAMES_PATH}...", flush=True)
        with open(CLASS_NAMES_PATH, "r", encoding="utf-8") as f:
            raw_classes = json.load(f)
        CLASS_NAMES = raw_classes if isinstance(raw_classes, list) else list(raw_classes.values())

        print(f"[VISION SERVICE] Initializing ResNet50 model from: {MODEL_PATH}...", flush=True)

        if MODEL_PATH.endswith(".tflite"):
            # Load with TFLite runtime (ultra-low memory <140 MB total)
            Interpreter = None
            try:
                from tflite_runtime.interpreter import Interpreter
                MODEL_ENGINE = "tflite-runtime (Linux optimized)"
            except ImportError:
                try:
                    from ai_edge_litert.interpreter import Interpreter
                    MODEL_ENGINE = "ai-edge-litert"
                except ImportError:
                    try:
                        from tensorflow.lite.python.interpreter import Interpreter
                        MODEL_ENGINE = "tensorflow.lite"
                    except ImportError:
                        try:
                            import tensorflow as tf
                            Interpreter = tf.lite.Interpreter
                            MODEL_ENGINE = "tensorflow.lite.Interpreter"
                        except ImportError:
                            raise ImportError(
                                "No TFLite interpreter runtime found. Please install tflite-runtime or tensorflow."
                            )

            print(f"[VISION SERVICE] Using {MODEL_ENGINE} for ResNet50 TFLite inference...", flush=True)
            PRODUCE_MODEL = Interpreter(model_path=MODEL_PATH)
            PRODUCE_MODEL.allocate_tensors()
        else:
            # Fallback for full Keras model if explicitly configured
            MODEL_ENGINE = "tensorflow.keras"
            print("[VISION SERVICE] WARNING: Loading full Keras model. This uses >450 MB RAM.", flush=True)
            import tensorflow as tf
            from tensorflow.keras.models import load_model
            PRODUCE_MODEL = load_model(MODEL_PATH, compile=False)

        gc.collect()
        IS_READY = True
        print(f"[SUCCESS] ResNet50 vision model loaded successfully ({len(CLASS_NAMES)} produce categories ready).", flush=True)
        return True
    except Exception as e:
        INIT_ERROR = str(e)
        print(f"[ERROR] Failed to initialize models: {e}", file=sys.stderr, flush=True)
        return False


def run_prediction_on_bytes(image_bytes, original_filename="uploaded.jpg"):
    """Runs food validation & ResNet50 classification on image bytes."""
    if not IS_READY:
        if not initialize_models():
            return {
                "success": False,
                "status": "service_unavailable",
                "message": f"Vision models are not ready: {INIT_ERROR}",
                "error": INIT_ERROR
            }

    from ML.image_recognition.food_validator import validate_and_classify_food, resnet50_preprocess

    # Save to temp file for robust PIL/Exif handling
    suffix = os.path.splitext(original_filename)[1] or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(image_bytes)
        tmp_path = tmp.name

    try:
        t0 = time.time()
        result = validate_and_classify_food(
            image_path=tmp_path,
            produce_model=PRODUCE_MODEL,
            produce_classes=CLASS_NAMES,
            imagenet_model=None,
            preprocess_produce_fn=resnet50_preprocess
        )
        elapsed_ms = round((time.time() - t0) * 1000, 2)
        result["inferenceTimeMs"] = elapsed_ms
        return result
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


class VisionHTTPRequestHandler(BaseHTTPRequestHandler):
    server_version = "AgriSwapVision/1.0"

    def address_string(self):
        # Override standard library's reverse DNS lookup to prevent stalls
        return str(self.client_address[0])

    def _send_json(self, status_code, data):
        try:
            response_bytes = json.dumps(data).encode("utf-8")
            self.send_response(status_code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(response_bytes)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
            self.end_headers()
            self.wfile.write(response_bytes)
            self.wfile.flush()
        except Exception as e:
            sys.stderr.write(f"[VISION ERROR] Error sending JSON: {e}\n")
            sys.stderr.flush()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        try:
            parsed = urllib.parse.urlparse(self.path)
            clean_path = parsed.path.rstrip("/")

            if clean_path in ("", "/health", "/status", "/api/health"):
                self._send_json(200, {
                    "status": "ready" if IS_READY else ("starting" if INIT_ERROR is None else "error"),
                    "ready": IS_READY,
                    "service": "AGRI-SWAP Vision Inference Microservice",
                    "model": "ResNet50",
                    "runtime": MODEL_ENGINE,
                    "classesCount": len(CLASS_NAMES) if IS_READY else 0,
                    "error": INIT_ERROR
                })
            else:
                self._send_json(404, {"success": False, "message": f"Route not found: {self.path}"})
        except Exception as e:
            import traceback
            traceback.print_exc(file=sys.stderr)
            sys.stderr.flush()
            self._send_json(500, {"success": False, "error": str(e)})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        clean_path = parsed.path.rstrip("/")

        if clean_path not in ("/predict", "/api/predict", "/classify", "/api/images"):
            return self._send_json(404, {"success": False, "message": f"Route not found: {self.path}"})

        content_length_header = self.headers.get("Content-Length")
        if not content_length_header:
            return self._send_json(400, {"success": False, "message": "Content-Length header required"})

        try:
            content_length = int(content_length_header)
        except ValueError:
            return self._send_json(400, {"success": False, "message": "Invalid Content-Length"})

        content_type = self.headers.get("Content-Type", "")
        body_bytes = self.rfile.read(content_length)

        image_bytes = None
        filename = "upload.jpg"

        # 1. Handle multipart/form-data
        if "multipart/form-data" in content_type:
            boundary_marker = None
            for part in content_type.split(";"):
                part = part.strip()
                if part.startswith("boundary="):
                    boundary_marker = part[len("boundary="):].strip('"\'')
                    break

            if boundary_marker:
                boundary_bytes = f"--{boundary_marker}".encode("latin1")
                parts = body_bytes.split(boundary_bytes)
                for p in parts:
                    if b"Content-Disposition:" in p and (b'name="image"' in p or b'name="file"' in p):
                        header_end = p.find(b"\r\n\r\n")
                        if header_end != -1:
                            header_text = p[:header_end].decode("latin1", errors="replace")
                            for h_line in header_text.split("\r\n"):
                                if "filename=" in h_line:
                                    fn_part = h_line.split("filename=")[1].strip()
                                    filename = fn_part.strip('"\'')
                            data_part = p[header_end + 4:]
                            if data_part.endswith(b"\r\n"):
                                data_part = data_part[:-2]
                            image_bytes = data_part
                            break

        # 2. Handle raw binary image payload
        elif content_type.startswith("image/") or content_type == "application/octet-stream":
            image_bytes = body_bytes
            ext = content_type.split("/")[-1] if "/" in content_type else "jpg"
            filename = f"upload.{ext}"

        # 3. Handle JSON with base64 image data
        elif "application/json" in content_type:
            try:
                payload = json.loads(body_bytes.decode("utf-8"))
                import base64
                raw_b64 = payload.get("image") or payload.get("data")
                if raw_b64:
                    if "," in raw_b64:
                        raw_b64 = raw_b64.split(",")[1]
                    image_bytes = base64.b64decode(raw_b64)
                    filename = payload.get("filename", "upload.jpg")
            except Exception as e:
                return self._send_json(400, {"success": False, "message": f"Malformed JSON: {e}"})

        if not image_bytes or len(image_bytes) < 100:
            return self._send_json(400, {
                "success": False,
                "message": "No valid image data found in request. Please upload an image using field 'image'."
            })

        try:
            prediction = run_prediction_on_bytes(image_bytes, original_filename=filename)
            self._send_json(200, prediction)
        except Exception as e:
            self._send_json(500, {
                "success": False,
                "status": "error",
                "message": f"Inference execution failed: {str(e)}",
                "error": str(e)
            })

    def log_message(self, format, *args):
        # Format clean access logs with timestamp
        sys.stderr.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [VISION] {self.address_string()} - {format % args}\n")
        sys.stderr.flush()


class AgriSwapVisionServer(ThreadingHTTPServer):
    allow_reuse_address = True


def start_server(port=None):
    if port is None:
        port = int(os.environ.get("VISION_PORT") or os.environ.get("PORT") or 5001)

    print("====================================================", flush=True)
    print("AGRI-SWAP Vision Inference Microservice Starting", flush=True)
    print(f"   Listening on: http://0.0.0.0:{port}", flush=True)
    print("====================================================", flush=True)

    # Initialize models
    initialize_models()

    server_address = ("0.0.0.0", port)
    httpd = AgriSwapVisionServer(server_address, VisionHTTPRequestHandler)
    print(f"[READY] Vision inference server ready on port {port}. Awaiting predictions...\n", flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[VISION SERVICE] Shutting down cleanly...")
        httpd.server_close()


if __name__ == "__main__":
    port_arg = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else None
    start_server(port_arg)
