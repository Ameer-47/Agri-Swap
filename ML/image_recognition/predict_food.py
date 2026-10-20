import sys
import json
import os

# Suppress verbose TF and oneDNN logs & restrict thread pool for Render
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["TF_NUM_INTRAOP_THREADS"] = "1"
os.environ["TF_NUM_INTEROP_THREADS"] = "1"

base_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(base_dir, "../.."))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

tflite_path = os.environ.get("RESNET50_TFLITE_PATH", os.path.join(base_dir, "resnet50.tflite"))
keras_path = os.environ.get("RESNET50_MODEL_PATH", os.path.join(base_dir, "resnet50_fruit_vegetable_best.keras"))
class_names_path = os.environ.get("RESNET50_CLASSES_PATH", os.path.join(base_dir, "resnet50_class_names.json"))

model_path = tflite_path if os.path.exists(tflite_path) else keras_path

if not os.path.exists(model_path):
    try:
        from ML.image_recognition.download_model import ensure_model_downloaded
        model_path = ensure_model_downloaded(model_path)
    except Exception as dl_err:
        print(json.dumps({
            "error": f"ResNet50 model weights file not found and auto-download failed: {dl_err}",
            "instruction": "Set RESNET50_TFLITE_PATH or run 'python scripts/download_model.py'."
        }))
        sys.exit(1)

import numpy as np
from PIL import Image, ImageOps
from ML.image_recognition.food_validator import validate_and_classify_food, resnet50_preprocess

with open(class_names_path, "r", encoding="utf-8") as file:
    class_data = json.load(file)

if isinstance(class_data, list):
    class_names = class_data
else:
    class_names = list(class_data.values())

if model_path.endswith(".tflite"):
    try:
        from tflite_runtime.interpreter import Interpreter
    except ImportError:
        try:
            from ai_edge_litert.interpreter import Interpreter
        except ImportError:
            try:
                from tensorflow.lite.python.interpreter import Interpreter
            except ImportError:
                import tensorflow as tf
                Interpreter = tf.lite.Interpreter
    model = Interpreter(model_path=model_path)
    model.allocate_tensors()
else:
    from tensorflow.keras.models import load_model
    model = load_model(model_path, compile=False)

if len(sys.argv) < 2:
    print(json.dumps({"error": "Usage: python predict_food.py <image_path>"}))
    sys.exit(1)

image_path = sys.argv[1]

result = validate_and_classify_food(
    image_path=image_path,
    produce_model=model,
    produce_classes=class_names,
    imagenet_model=None,
    preprocess_produce_fn=resnet50_preprocess
)

print(json.dumps(result))
