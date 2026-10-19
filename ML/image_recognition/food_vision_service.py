import os
import sys
import json
import time

# Suppress verbose TF and oneDNN logging to keep stdio clean
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# Thread and memory optimizations for cloud containers & Render free tier (512 MB)
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["TF_NUM_INTRAOP_THREADS"] = "1"
os.environ["TF_NUM_INTEROP_THREADS"] = "1"

# Configure standard streams for UTF-8 line buffering on Windows/POSIX
try:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
except Exception:
    pass

base_dir = os.path.dirname(os.path.abspath(__file__))
model_path = os.environ.get("RESNET50_MODEL_PATH", os.path.join(base_dir, "resnet50_fruit_vegetable_best.keras"))
class_names_path = os.environ.get("RESNET50_CLASSES_PATH", os.path.join(base_dir, "resnet50_class_names.json"))

def send_msg(data):
    try:
        sys.stdout.write(json.dumps(data) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stderr.write(f"Failed to write message: {e}\n")

# Verify model file; auto-download if missing
if not os.path.exists(model_path):
    try:
        from ML.image_recognition.download_model import ensure_model_downloaded
        ensure_model_downloaded(model_path)
    except Exception as dl_err:
        send_msg({
            "status": "error",
            "error": f"ResNet50 model weights file was not found at '{model_path}' and automatic download failed: {dl_err}"
        })
        sys.exit(1)

try:
    import gc
    import numpy as np
    from PIL import Image, ImageOps
    import tensorflow as tf

    # Constrain TensorFlow CPU thread memory pool
    try:
        tf.config.threading.set_inter_op_parallelism_threads(1)
        tf.config.threading.set_intra_op_parallelism_threads(1)
    except Exception:
        pass

    from tensorflow.keras.models import load_model
    from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess_input
    from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input as mobilenet_preprocess_input
    from ML.image_recognition.food_validator import validate_and_classify_food

    with open(class_names_path, "r", encoding="utf-8") as file:
        class_data = json.load(file)

    if isinstance(class_data, list):
        class_names = class_data
    else:
        class_names = list(class_data.values())

    model = load_model(model_path)
    imagenet_model = MobileNetV2(weights="imagenet")

    # Optional warm-up only if explicitly requested; skipped by default to conserve Render RAM
    if os.environ.get("WARMUP_VISION") == "true":
        dummy_input = resnet_preprocess_input(np.zeros((1, 224, 224, 3), dtype=np.float32))
        model.predict(dummy_input, verbose=0)

    # Force free import-time compilation garbage to keep memory footprint under limit
    gc.collect()

    send_msg({
        "status": "ready",
        "classesCount": len(class_names)
    })

except Exception as e:
    send_msg({
        "status": "error",
        "error": f"Failed to initialize Food Vision models: {str(e)}"
    })
    sys.exit(1)

# Persistent inference loop
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        req_id = req.get("id")
        cmd = req.get("cmd")

        if cmd == "ping":
            send_msg({"id": req_id, "status": "pong"})
            continue

        image_path = req.get("imagePath")
        if not image_path or not os.path.exists(image_path):
            send_msg({
                "id": req_id,
                "success": False,
                "error": f"Image file not found: {image_path}"
            })
            continue

        t0 = time.time()

        # Multi-stage non-food rejection and produce identification
        result = validate_and_classify_food(
            image_path=image_path,
            produce_model=model,
            produce_classes=class_names,
            imagenet_model=imagenet_model,
            preprocess_produce_fn=resnet_preprocess_input,
            preprocess_imagenet_fn=mobilenet_preprocess_input
        )

        inference_time_ms = round((time.time() - t0) * 1000, 2)
        result["id"] = req_id
        result["inferenceTimeMs"] = inference_time_ms

        send_msg(result)

    except Exception as err:
        send_msg({
            "id": req.get("id") if "req" in locals() and isinstance(req, dict) else None,
            "success": False,
            "error": str(err)
        })


