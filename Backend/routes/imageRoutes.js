const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { predictFoodImage, getVisionStatus, checkVisionHealth } = require("../services/imageService");

const router = express.Router();

const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
    "image/pjpeg",
    "image/x-png",
    "image/jfif"
]);

const ALLOWED_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png",
    ".webp"
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB limit
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();
        const mime = (file.mimetype || "").toLowerCase();
        const isMimeImage = ALLOWED_MIME_TYPES.has(mime) || mime.startsWith("image/");
        const isExtImage = ALLOWED_EXTENSIONS.has(ext);
        if (isMimeImage || isExtImage) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file format. Only JPEG, PNG, and WebP images are allowed."));
        }
    }
});

router.get("/status", async (req, res) => {
    const configStatus = getVisionStatus();
    const liveHealth = await checkVisionHealth();
    res.json({
        success: true,
        ...configStatus,
        remoteHealth: liveHealth
    });
});

router.post("/", (req, res, next) => {
    upload.single("image")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({
                    success: false,
                    message: "Image exceeds maximum allowed size of 10 MB."
                });
            }
            return res.status(400).json({
                success: false,
                message: `Upload error: ${err.message}`
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next();
    });
}, async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({
            success: false,
            message: "Image file is required"
        });
    }

    try {
        const result = await predictFoodImage(req.file.buffer, req.file.originalname, req.file.mimetype);
        if (!result.success) {
            const isServiceIssue = (
                result.status === "inference_unavailable" ||
                result.status === "inference_timeout" ||
                result.status === "service_waking" ||
                result.status === "invalid_response" ||
                result.status === "service_not_configured"
            );
            const httpStatus = result.httpStatus || (isServiceIssue ? 503 : 422);
            if (isServiceIssue) {
                res.set("Retry-After", "5");
            }
            return res.status(httpStatus).json(result);
        }
        res.json(result);
    } catch (error) {
        console.error("Food prediction error:", error);
        res.status(500).json({
            success: false,
            message: "Food prediction failed. Please try another image or select your food from Option B.",
            error: process.env.NODE_ENV === "production" ? "Model inference failure" : error.message
        });
    }
});

module.exports = router;