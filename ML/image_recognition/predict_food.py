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
model_path = os.environ.get("RESNET50_MODEL_PATH", os.path.join(base_dir, "resnet50_fruit_vegetable_best.keras"))
class_names_path = os.environ.get("RESNET50_CLASSES_PATH", os.path.join(base_dir, "resnet50_class_names.json"))

if not os.path.exists(model_path):
    try:
        from ML.image_recognition.download_model import ensure_model_downloaded
        ensure_model_downloaded(model_path)
    except Exception as dl_err:
        print(json.dumps({
            "error": f"ResNet50 model weights file not found and auto-download failed: {dl_err}",
            "instruction": "Set RESNET50_MODEL_PATH or run 'python scripts/download_model.py'."
        }))
        sys.exit(1)

import numpy as np
from PIL import Image, ImageOps
from tensorflow.keras.models import load_model
from tensorflow.keras.applications.resnet50 import preprocess_input as resnet_preprocess_input
from tensorflow.keras.applications.mobilenet_v2 import MobileNetV2, preprocess_input as mobilenet_preprocess_input
from ML.image_recognition.food_validator import validate_and_classify_food

model = load_model(model_path)
imagenet_model = MobileNetV2(weights="imagenet")

with open(class_names_path, "r", encoding="utf-8") as file:
    class_data = json.load(file)

if isinstance(class_data, list):
    class_names = class_data
else:
    class_names = list(class_data.values())

image_path = sys.argv[1]

result = validate_and_classify_food(
    image_path=image_path,
    produce_model=model,
    produce_classes=class_names,
    imagenet_model=imagenet_model,
    preprocess_produce_fn=resnet_preprocess_input,
    preprocess_imagenet_fn=mobilenet_preprocess_input
)

print(json.dumps(result))
