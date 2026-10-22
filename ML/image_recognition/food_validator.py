import os
import json
import numpy as np
from PIL import Image, ImageOps

# Messages for validation feedback
MSG_NOT_FOOD = "Non-Food Image Detected — Please upload a fruit or vegetable image."
MSG_UNCLEAR = "Image is unclear, blurred, or corrupt. Please upload a well-lit, focused image of produce."
MSG_UNKNOWN_PRODUCE = "Unable to identify this produce — this item may be an unsupported fruit/vegetable or unclear. Please select from our supported produce list or enter the name manually."


def resnet50_preprocess(arr):
    """
    Standard ResNet50 Caffe-style preprocessing:
    Converts RGB to BGR and subtracts ImageNet channel means [103.939, 116.779, 123.68].
    Implemented in pure NumPy to eliminate TensorFlow imports in the validator.
    """
    x = arr.copy()[..., ::-1]
    x[..., 0] -= 103.939
    x[..., 1] -= 116.779
    x[..., 2] -= 123.68
    return x


def run_produce_model(model, input_arr):
    """Polymorphic runner for TFLite Interpreter, Keras Model, or callable."""
    if hasattr(model, "invoke"):
        inp_idx = getattr(model, "_cached_input_index", None)
        out_idx = getattr(model, "_cached_output_index", None)
        if inp_idx is None or out_idx is None:
            inp_idx = model.get_input_details()[0]["index"]
            out_idx = model.get_output_details()[0]["index"]
            try:
                model._cached_input_index = inp_idx
                model._cached_output_index = out_idx
            except Exception:
                pass
        model.set_tensor(inp_idx, input_arr)
        model.invoke()
        return model.get_tensor(out_idx)[0]
    elif callable(model):
        try:
            return model(input_arr, training=False).numpy()[0]
        except Exception:
            return model(input_arr).numpy()[0]
    else:
        return model.predict(input_arr, verbose=0)[0]


def validate_and_classify_food(
    image_path,
    produce_model,
    produce_classes,
    imagenet_model=None,
    preprocess_produce_fn=None,
    preprocess_imagenet_fn=None
):
    """
    Validates input produce image and classifies it using the ResNet50 model.
    Operates in ultra-low memory mode when imagenet_model is None (pure ResNet50 TFLite).
    """
    if preprocess_produce_fn is None:
        preprocess_produce_fn = resnet50_preprocess

    # Step 1: Open and inspect image (supports path, BytesIO stream, raw bytes, or PIL Image)
    try:
        if isinstance(image_path, Image.Image):
            raw_img = image_path
        elif isinstance(image_path, (bytes, bytearray)):
            import io
            raw_img = Image.open(io.BytesIO(image_path))
        else:
            raw_img = Image.open(image_path)
    except Exception as e:
        return {
            "success": False,
            "status": "unclear",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "unclear",
            "message": MSG_UNCLEAR,
            "food": None,
            "confidence": None,
            "isConfident": False,
            "error": str(e)
        }

    # Minimum dimension check
    w, h = raw_img.size
    if w < 40 or h < 40:
        return {
            "success": True,
            "status": "unclear",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "unclear",
            "message": MSG_UNCLEAR,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # Alpha / transparency flattening onto white background
    if raw_img.mode in ("RGBA", "LA") or (raw_img.mode == "P" and "transparency" in raw_img.info):
        bg = Image.new("RGB", raw_img.size, (255, 255, 255))
        try:
            bg.paste(raw_img, mask=raw_img.convert("RGBA").split()[3])
            img_rgb = bg
        except Exception:
            img_rgb = raw_img.convert("RGB")
    else:
        img_rgb = raw_img.convert("RGB")

    # Efficient single 224x224 RGB resize for clarity metrics and document heuristics
    img_rgb_224 = img_rgb.resize((224, 224))
    arr_rgb_224 = np.array(img_rgb_224, dtype=np.float32)

    # Layer 1: Image Clarity & Integrity Metrics (Laplacian variance and pixel variance)
    gray_224 = img_rgb_224.convert("L")
    arr_gray = np.array(gray_224, dtype=np.float32)
    # Discrete 2D Laplacian operator (-4*center + top + bottom + left + right) in pure NumPy
    laplacian_diff = (
        -4.0 * arr_gray[1:-1, 1:-1]
        + arr_gray[:-2, 1:-1]
        + arr_gray[2:, 1:-1]
        + arr_gray[1:-1, :-2]
        + arr_gray[1:-1, 2:]
    )
    lap_var = float(np.var(laplacian_diff))
    pix_std = float(np.std(arr_gray))

    # Reject solid or flat images (blank canvases, single solid color)
    if pix_std < 12.0:
        return {
            "success": True,
            "status": "unclear",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "unclear",
            "message": MSG_UNCLEAR,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # Reject severely blurred images (low edge frequency)
    if lap_var < 15.0:
        return {
            "success": True,
            "status": "unclear",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "unclear",
            "message": MSG_UNCLEAR,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # Layer 2: Synthetic UI / Chart / Document Heuristics
    white_ratio = float(np.mean(np.all(arr_rgb_224 > 220, axis=-1)))
    light_ratio = float(np.mean(np.all(arr_rgb_224 > 195, axis=-1)))
    black_ratio = float(np.mean(np.all(arr_rgb_224 < 25, axis=-1)))

    # Document / Presentation / White-paper / Chart heuristic
    max_c = np.max(arr_rgb_224, axis=-1)
    min_c = np.min(arr_rgb_224, axis=-1)
    saturation = (max_c - min_c) / (max_c + 1e-5)
    mean_saturation = float(np.mean(saturation))
    neutral_ratio = float(np.mean((max_c - min_c) < 32))

    is_blank_doc = (white_ratio > 0.85 or black_ratio > 0.85)
    is_text_paper = (white_ratio > 0.50 and mean_saturation < 0.22)
    is_chart_or_slide = (white_ratio > 0.35 and neutral_ratio > 0.55 and mean_saturation < 0.28)
    is_poster_doc = (light_ratio > 0.60 and neutral_ratio > 0.48 and mean_saturation < 0.25)

    # Reject predominantly empty/blank documents, pure text papers, slides, or charts upfront
    if is_blank_doc or is_text_paper or is_chart_or_slide or is_poster_doc:
        return {
            "success": True,
            "status": "not_food",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "not_food",
            "message": MSG_NOT_FOOD,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # Evaluate ResNet50 Produce Model with Aspect-Ratio Padding
    img_w, img_h = img_rgb.size
    aspect_ratio = (img_w / img_h) if img_h > 0 else 1.0
    if 0.88 <= aspect_ratio <= 1.14:
        prepared_img = img_rgb.resize((224, 224), Image.Resampling.BICUBIC)
    else:
        edge_pixels = np.concatenate([
            arr_rgb_224[0, :, :], arr_rgb_224[-1, :, :],
            arr_rgb_224[:, 0, :], arr_rgb_224[:, -1, :]], axis=0)
        edge_color = tuple(int(x) for x in np.median(edge_pixels, axis=0))
        prepared_img = ImageOps.pad(img_rgb, (224, 224), method=Image.Resampling.BICUBIC, color=edge_color)

    res_arr = preprocess_produce_fn(np.expand_dims(np.array(prepared_img, dtype=np.float32), 0))
    res_preds = run_produce_model(produce_model, res_arr)

    top_indices = np.argsort(res_preds)[-3:][::-1]
    top1_res_idx = int(top_indices[0])
    confidence = float(res_preds[top1_res_idx])
    predicted_food = produce_classes[top1_res_idx]
    margin = confidence - float(res_preds[top_indices[1]])

    top_candidates = [
        {"food": produce_classes[i], "confidence": round(float(res_preds[i]), 4)}
        for i in top_indices
    ]

    # Optional Layer 3: ImageNet Out-of-Domain Classification (Only if MobileNetV2 is provided)
    if imagenet_model is not None and preprocess_imagenet_fn is not None:
        try:
            mb_arr = preprocess_imagenet_fn(np.expand_dims(arr_rgb_224.copy(), 0))
            mb_preds = imagenet_model.predict(mb_arr, verbose=0)[0]
            top1_mb_idx = int(np.argmax(mb_preds))
            top1_mb_prob = float(mb_preds[top1_mb_idx])

            # Non-food detection via MobileNet
            if top1_mb_prob >= 0.25 and top1_mb_idx < 900 and confidence < 0.70:
                return {
                    "success": True,
                    "status": "not_food",
                    "isValidProduce": False,
                    "isSupportedProduce": False,
                    "rejectionReason": "not_food",
                    "message": MSG_NOT_FOOD,
                    "food": None,
                    "confidence": None,
                    "isConfident": False
                }
        except Exception:
            pass

    # Reject non-confident images that exhibit document, poster, slide, or chart characteristics
    if confidence < 0.70 and ((white_ratio > 0.30 or light_ratio > 0.45) and (neutral_ratio > 0.50 or mean_saturation < 0.32)):
        return {
            "success": True,
            "status": "not_food",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "not_food",
            "message": MSG_NOT_FOOD,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # --- OUTCOME 1: HIGH-CONFIDENCE SUPPORTED PRODUCE ---
    # Confident single-produce identification:
    # Requires high confidence (>= 70%) and clear margin (>= 14%)
    is_confident_supported = (confidence >= 0.70 and margin >= 0.14)

    if is_confident_supported:
        return {
            "success": True,
            "status": "supported_produce",
            "isValidProduce": True,
            "isSupportedProduce": True,
            "rejectionReason": None,
            "message": None,
            "food": predicted_food,
            "confidence": float(confidence),
            "isConfident": True,
            "topCandidates": top_candidates
        }

    # --- OUTCOME 2: MODERATE CONFIDENCE (PRODUCE DETECTED, CONFIRMATION NEEDED) ---
    # Top confidence is between 35% and 70%: item may be produce, but requires user confirmation
    if confidence >= 0.35 and margin >= 0.08:
        return {
            "success": True,
            "status": "uncertain_produce",
            "isValidProduce": True,
            "isSupportedProduce": True,
            "rejectionReason": None,
            "message": "Confidence is below 70%. Food not identified clearly.",
            "food": predicted_food,
            "confidence": float(confidence),
            "isConfident": False,
            "topCandidates": top_candidates
        }

    # --- OUTCOME 3: UNKNOWN OR OUT-OF-DISTRIBUTION PRODUCE ---
    # Low confidence (< 35%) or flat spread across classes:
    # Return 'Unknown produce' cleanly without candidate recommendations.
    return {
        "success": True,
        "status": "unknown_produce",
        "isValidProduce": False,
        "isSupportedProduce": False,
        "rejectionReason": "unknown_produce",
        "message": MSG_UNKNOWN_PRODUCE,
        "food": "Unknown produce",
        "confidence": None,
        "isConfident": False,
        "topCandidates": []
    }
