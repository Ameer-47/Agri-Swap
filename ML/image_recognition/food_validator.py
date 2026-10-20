import os
import json
import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import convolve

# Load ImageNet class taxonomy
base_dir = os.path.dirname(os.path.abspath(__file__))
imagenet_class_path = os.environ.get(
    "IMAGENET_CLASSES_PATH",
    os.path.join(os.path.expanduser("~"), ".keras", "models", "imagenet_class_index.json")
)

if os.path.exists(imagenet_class_path):
    with open(imagenet_class_path, "r", encoding="utf-8") as f:
        imagenet_classes = json.load(f)
else:
    imagenet_classes = {}

# Semantic index sets in ImageNet (1000 classes)
# 1. Bird classes (59 classes): 7 to 24, 80 to 100, 127 to 146
BIRD_INDICES = set(list(range(7, 25)) + list(range(80, 101)) + list(range(127, 147)))

# 2. Animals, Reptiles, Amphibians, Fish, Insects (0 to 397 excluding birds)
ANIMAL_INDICES = set(range(0, 398)) - BIRD_INDICES

# 3. Vehicles & Transportation (cars, trucks, planes, boats, bikes)
VEHICLE_INDICES = {
    403, 404, 405, 436, 444, 468, 472, 479, 484, 510, 511, 554, 555, 569, 573,
    625, 627, 628, 654, 665, 670, 671, 705, 717, 734, 751, 780, 814, 817, 829,
    833, 864, 867, 871, 895, 914
}

# 4. Screenshots, charts, digital UI, monitors, documents
SCREEN_DOC_CHART_INDICES = {
    409,  # analog_clock (frequent for circular graphs/meters)
    446,  # binder
    508,  # computer_keyboard
    549,  # envelope
    664,  # monitor
    681,  # notebook
    688,  # oscilloscope (frequent for charts/plots)
    782,  # screen
    851,  # television
    916,  # web_site
    917,  # comic_book
    918,  # crossword_puzzle
    921,  # book_jacket
    922   # menu
}

# 5. Electronic devices, hand-held hardware, phones, tools
ELECTRONIC_DEVICE_INDICES = {
    481,  # cassette
    487,  # cellular_telephone
    499,  # cleaver / tool
    508,  # computer_keyboard
    527,  # desktop_computer
    528,  # dial_telephone
    590,  # hand-held_computer
    605,  # iPod
    620,  # laptop
    650,  # microphone
    651,  # microwave
    662,  # modem
    664,  # monitor
    673,  # mouse
    707,  # pay-phone
    726,  # plane (tool)
    732,  # Polaroid_camera
    742,  # printer
    754,  # radio
    759,  # reflex_camera
    760,  # refrigerator
    761,  # remote_control
    782,  # screen
    813,  # spatula
    851,  # television
    859,  # toaster
    868,  # tray
    878,  # typewriter_keyboard
    882   # vacuum
}

# 6. Agricultural Produce & Botanical indices in ImageNet (fruits, vegetables, edible plants, fungi, crops)
# Excludes fast foods, processed meals, restaurant dishes, store fixtures, and desserts (e.g. chocolate_sauce, cheeseburger, pizza)
AGRICULTURAL_PRODUCE_INDICES = {
    924,  # guacamole / avocado
    936,  # head_cabbage
    937,  # broccoli
    938,  # cauliflower
    939,  # zucchini
    940,  # spaghetti_squash
    941,  # acorn_squash
    942,  # butternut_squash
    943,  # cucumber
    944,  # artichoke
    945,  # bell_pepper
    946,  # cardoon
    947,  # mushroom
    948,  # Granny_Smith (green apple)
    949,  # strawberry
    950,  # orange
    951,  # lemon
    952,  # fig
    953,  # pineapple
    954,  # banana
    955,  # jackfruit
    956,  # custard_apple
    957,  # pomegranate
    987,  # corn
    988,  # acorn
    989,  # hip (rose hip)
    990,  # buckeye
    991, 992, 993, 994, 995, 996, 997,  # fungi, mushrooms
    998   # ear (corn / cereal grain)
}

# Squashes, pumpkins, and gourds in ImageNet (unsupported in our 36 produce classes)
SQUASH_PUMPKIN_INDICES = {
    939,  # zucchini
    940,  # spaghetti_squash
    941,  # acorn_squash
    942   # butternut_squash
}

# Explicit food/produce classes in ImageNet that are NOT in our 36 supported classes
EXPLICIT_UNSUPPORTED_FOOD_INDICES = {
    924,  # guacamole / avocado
    937,  # broccoli
    944,  # artichoke
    946,  # cardoon
    947,  # mushroom
    949,  # strawberry
    952,  # fig
    955,  # jackfruit
    956,  # custard_apple
    939,  # zucchini
    940,  # spaghetti_squash
    941,  # acorn_squash
    942,  # butternut_squash
    988,  # acorn
    989,  # hip (rose hip)
    990,  # buckeye
    991, 992, 993, 994, 995, 996, 997  # mushrooms/fungi
}

MSG_NOT_FOOD = "Not a valid fruit or vegetable image. Please upload a clear fruit or vegetable photo."
MSG_UNCLEAR = "Unable to identify — please upload a clear fruit or vegetable image"
MSG_UNKNOWN_PRODUCE = "Unable to identify this produce — this item may be an unsupported fruit/vegetable or unclear. Please select from our supported produce list or enter the name manually."


def validate_and_classify_food(
    image_path,
    produce_model,
    produce_classes,
    imagenet_model,
    preprocess_produce_fn,
    preprocess_imagenet_fn
):
    """
    Three-outcome validation and food image recognition pipeline:
    1. Supported fruit or vegetable: Identified using ResNet50 model.
    2. Unknown or unsupported fruit/vegetable: Produce detected, but unsupported or cannot be reliably identified.
    3. Non-food image: Rejected as non-produce (birds, phones, cars, screens, charts, documents, animals).
    """
    if not os.path.exists(image_path):
        return {
            "success": False,
            "error": f"Image file not found: {image_path}"
        }

    try:
        raw_img = Image.open(image_path)
        raw_img = ImageOps.exif_transpose(raw_img)
    except Exception:
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

    # Layer 1: Image Clarity & Integrity Metrics
    gray_224 = img_rgb.convert("L").resize((224, 224))
    arr_gray = np.array(gray_224, dtype=np.float32)
    laplacian_kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    lap_var = float(np.var(convolve(arr_gray, laplacian_kernel)))
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
    arr_rgb_224 = np.array(img_rgb.resize((224, 224)), dtype=np.float32)
    white_ratio = float(np.mean(np.all(arr_rgb_224 > 220, axis=-1)))
    black_ratio = float(np.mean(np.all(arr_rgb_224 < 25, axis=-1)))

    # Layer 3: ImageNet Out-of-Domain Classification (MobileNetV2)
    mb_arr = preprocess_imagenet_fn(np.expand_dims(arr_rgb_224.copy(), 0))
    mb_preds = imagenet_model.predict(mb_arr, verbose=0)[0]

    top5_mb_indices = np.argsort(mb_preds)[-5:][::-1]
    top1_mb_idx = int(top5_mb_indices[0])
    top1_mb_prob = float(mb_preds[top1_mb_idx])

    bird_prob = float(sum(mb_preds[i] for i in BIRD_INDICES))
    animal_prob = float(sum(mb_preds[i] for i in ANIMAL_INDICES))
    vehicle_prob = float(sum(mb_preds[i] for i in VEHICLE_INDICES))
    screen_doc_prob = float(sum(mb_preds[i] for i in SCREEN_DOC_CHART_INDICES))
    electronic_prob = float(sum(mb_preds[i] for i in ELECTRONIC_DEVICE_INDICES))
    produce_prob = float(sum(mb_preds[i] for i in AGRICULTURAL_PRODUCE_INDICES))

    # Evaluate ResNet50 Produce Model
    # Aspect-ratio preservation: direct squashing on non-square images distorts geometry
    # (e.g. landscape grapes squashed by 56% mimic elongated green eggplants).
    # Neutral edge padding preserves true natural shape and proportions.
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
    res_preds = produce_model.predict(res_arr, verbose=0)[0]

    top_indices = np.argsort(res_preds)[-3:][::-1]
    top1_res_idx = int(top_indices[0])
    confidence = float(res_preds[top1_res_idx])
    predicted_food = produce_classes[top1_res_idx]
    margin = confidence - float(res_preds[top_indices[1]])

    top_candidates = [
        {"food": produce_classes[i], "confidence": round(float(res_preds[i]), 4)}
        for i in top_indices
    ]

    # If MobileNetV2 detected additional supported produce (e.g. banana at index 954),
    # ensure it is represented in the candidate list for mixed fruit recognition
    mb_banana_prob = float(mb_preds[954]) if len(mb_preds) > 954 else 0.0
    if mb_banana_prob >= 0.04 and not any(c["food"] == "banana" for c in top_candidates):
        top_candidates.append({"food": "banana", "confidence": round(mb_banana_prob, 4)})

    # --- OUTCOME 3: NON-FOOD REJECTION ---
    is_non_food = (
        top1_mb_idx in BIRD_INDICES or bird_prob >= 0.12 or
        top1_mb_idx in VEHICLE_INDICES or vehicle_prob >= 0.15 or
        top1_mb_idx in SCREEN_DOC_CHART_INDICES or screen_doc_prob >= 0.05 or
        (top1_mb_idx in ELECTRONIC_DEVICE_INDICES and produce_prob < 0.15) or
        (top1_mb_idx in ANIMAL_INDICES and animal_prob >= 0.18 and produce_prob < 0.08) or
        (white_ratio > 0.40 and produce_prob < 0.08 and confidence < 0.85) or
        (black_ratio > 0.40 and produce_prob < 0.08 and confidence < 0.85) or
        (produce_prob < 0.08 and top1_mb_prob >= 0.18 and top1_mb_idx not in AGRICULTURAL_PRODUCE_INDICES and confidence < 0.85)
    )

    if is_non_food:
        return {
            "success": True,
            "status": "non_food",
            "isValidProduce": False,
            "isSupportedProduce": False,
            "rejectionReason": "not_food",
            "message": MSG_NOT_FOOD,
            "food": None,
            "confidence": None,
            "isConfident": False
        }

    # Compute aggregate produce probabilities
    squash_prob = float(sum(mb_preds[i] for i in SQUASH_PUMPKIN_INDICES if i < len(mb_preds)))
    unsupported_produce_prob = float(sum(mb_preds[i] for i in EXPLICIT_UNSUPPORTED_FOOD_INDICES if i < len(mb_preds)))

    # Detect Squash / Pumpkin / Gourd:
    # If MobileNetV2 detects squashes (>= 10% prob or in top-3) and ResNet50 tries to force it into
    # orange, bell pepper, capsicum, tomato, eggplant, cucumber, or watermelon:
    has_squash_detection = (
        squash_prob >= 0.10 or
        any(idx in SQUASH_PUMPKIN_INDICES and mb_preds[idx] >= 0.08 for idx in top5_mb_indices[:3])
    )
    is_pumpkin_or_squash = bool(
        has_squash_detection and
        predicted_food in ("orange", "bell pepper", "capsicum", "tomato", "eggplant", "cucumber", "watermelon")
    )

    # Detect Plum / stone fruit out-of-distribution confusion:
    # Plum is not in ResNet50's 36 classes and gets erroneously pushed to eggplant or beetroot.
    # When MobileNetV2 detects stone fruit / berry / fig / hip (989, 952, 949, 988, 990)
    # or ResNet50 lacks overwhelming confidence (>= 0.85 with margin >= 0.30):
    is_plum_like_ood = bool(
        predicted_food in ("eggplant", "beetroot") and
        (any(idx in (989, 952, 949, 988, 990) and mb_preds[idx] >= 0.05 for idx in top5_mb_indices[:3]) or
         (confidence < 0.85 or margin < 0.30))
    )

    # Explicit unsupported produce in ImageNet (strawberry, avocado, broccoli, squashes, etc.)
    # Note: ImageNet has no red apple class (only green Granny Smith at 948), and frequently
    # maps red apples to strawberry (949). When ResNet50 is confident (>= 0.85) on apple,
    # tomato, or pomegranate, ImageNet's strawberry guess must not override ResNet50.
    has_unsupported_mb_match = (
        (top1_mb_idx in EXPLICIT_UNSUPPORTED_FOOD_INDICES and top1_mb_prob >= 0.15) or
        any(idx in EXPLICIT_UNSUPPORTED_FOOD_INDICES and mb_preds[idx] >= 0.18 for idx in top5_mb_indices[:3]) or
        (unsupported_produce_prob >= 0.25)
    )
    is_explicit_unsupported = (
        (has_unsupported_mb_match or is_pumpkin_or_squash or is_plum_like_ood)
        and not (predicted_food in ("apple", "tomato", "pomegranate") and confidence >= 0.85 and top1_mb_idx in (948, 957, 949))
    )

    # --- MIXED-FRUIT / MULTI-PRODUCE RECOGNITION (STEP 3) ---
    # Detect fruit hampers/baskets (ImageNet class 588) or multi-produce images where
    # total produce probability is high and top candidate belongs to our supported produce catalog.
    has_fruit_basket = (
        top1_mb_idx in (588, 790) or
        (len(mb_preds) > 588 and mb_preds[588] >= 0.04) or
        (len(mb_preds) > 790 and mb_preds[790] >= 0.04)
    )
    is_mixed_produce = bool(
        has_fruit_basket and
        predicted_food in produce_classes and
        confidence >= 0.35 and
        not is_explicit_unsupported
    )

    # --- OUTCOME 1: SUPPORTED FRUIT OR VEGETABLE ---
    # Return the identified supported class when:
    # 1. High single-produce confidence (>= 72% with margin >= 14%)
    # 2. Dominant single-produce margin (>= 62% confidence with margin >= 42%, e.g. clear grape image)
    # 3. Verified mixed produce / fruit basket containing supported fruits
    is_single_supported = (
        ((confidence >= 0.72 and margin >= 0.14) or
         (confidence >= 0.62 and margin >= 0.42))
        and not is_explicit_unsupported
    )
    is_supported = is_single_supported or is_mixed_produce

    if is_supported:
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
            "isMixedProduce": bool(is_mixed_produce),
            "topCandidates": top_candidates
        }

    # --- OUTCOME 2: UNKNOWN OR UNSUPPORTED PRODUCE ---
    # The image contains produce, but either:
    # 1. The item is an unsupported produce (e.g., strawberry, avocado, fig), or
    # 2. ResNet50 confidence is split / uncertain (< 70%, e.g., beetroot vs onion).
    # Return 'Unknown produce' and never make a confident incorrect food identification.
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
        "topCandidates": top_candidates
    }
