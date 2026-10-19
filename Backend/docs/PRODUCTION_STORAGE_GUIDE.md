# AGRI-SWAP — Production Storage & External Assets Configuration Guide

This guide details how to configure external persistent storage for large datasets and model files when deploying AGRI-SWAP to a public cloud environment without including multi-gigabyte files in Git.

---

## 1. Overview of External Assets

The following two large asset collections are excluded from Git due to file size constraints (>100 MB):

| Asset | Local Relative Path | Size | Purpose |
| :--- | :--- | :--- | :--- |
| **Wholesale Mandi Parquet Files** | `Datasets/Agricultural Market Price Dataset/cleaned_dataset/*.parquet` | ~650 MB (26 files: 2001–2026) | Source of truth for dynamic DuckDB historical queries & timelines |
| **ResNet50 Produce Vision Weights** | `ML/image_recognition/resnet50_fruit_vegetable_best.keras` | 222 MB | TensorFlow neural network for 36 produce categories |

---

## 2. Configurable Environment Variables

The application code automatically respects the following environment variables, falling back to local relative paths if unset:

```bash
# Directory containing 2001.parquet through 2026.parquet
PARQUET_DATASET_DIR=/var/data/agri_swap/cleaned_dataset

# Path to the ResNet50 Keras model weights
RESNET50_MODEL_PATH=/var/models/agri_swap/resnet50_fruit_vegetable_best.keras

# Optional: Path to class names JSON (defaults to ML/image_recognition/resnet50_class_names.json)
RESNET50_CLASSES_PATH=/var/models/agri_swap/resnet50_class_names.json

# Optional: SQLite Database Paths (defaults to Backend/data/...)
HISTORICAL_PRICES_DB_PATH=/var/data/agri_swap/historical_prices.db
NUTRITION_DB_PATH=/var/data/agri_swap/nutrition.db
```

---

## 3. Recommended Cloud Storage Strategies

### Approach A: Persistent Cloud Volume / Block Storage (Recommended for VPS / Docker)
If hosting on a Virtual Private Server (DigitalOcean Droplet, Hetzner, AWS Lightsail, Linode):
1. Copy the `cleaned_dataset/` directory and `resnet50_fruit_vegetable_best.keras` to the persistent volume mount (e.g. `/mnt/agriswap_storage/`).
2. Set the environment variables in your `.env` or systemd service unit:
   ```bash
   PARQUET_DATASET_DIR=/mnt/agriswap_storage/cleaned_dataset
   RESNET50_MODEL_PATH=/mnt/agriswap_storage/resnet50_fruit_vegetable_best.keras
   ```
3. The application will directly read the assets from the mounted disk with zero latency.

### Approach B: Object Storage Pull during Build / Boot (S3 / Cloudflare R2 / MinIO)
If hosting on managed container platforms (Render, Railway, Fly.io):
1. Archive `cleaned_dataset/` into a single zip file and upload both the zip and `resnet50_fruit_vegetable_best.keras` to a private S3 or Cloudflare R2 bucket.
2. During the container build or entrypoint script, pull the assets before starting `server.js`:
   ```bash
   # Example boot-time asset download
   aws s3 cp s3://my-agriswap-assets/resnet50_fruit_vegetable_best.keras ML/image_recognition/
   aws s3 cp s3://my-agriswap-assets/cleaned_dataset.zip /tmp/
   unzip /tmp/cleaned_dataset.zip -d Datasets/Agricultural\ Market\ Price\ Dataset/
   ```
3. Since local paths are preserved as defaults, no additional environment variables are required.

---

## 4. Behavior When Files Are Missing

If an asset is missing in production, the application produces an explicit, actionable error rather than a silent failure:
- **Missing Parquet Directory:** DuckDB queries raise `FileNotFoundError` explaining that `cleaned_dataset` was not found and advising to configure `PARQUET_DATASET_DIR`.
- **Missing ResNet50 Weights:** `/api/images/status` returns `{ ready: false }`, and inference requests return HTTP 500 with a message stating that model weights were not found and advising to configure `RESNET50_MODEL_PATH`.
