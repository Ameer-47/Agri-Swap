# 🌾 AGRI-SWAP — Agricultural Produce Price Analytics & Intelligent Food Substitution

AGRI-SWAP is a full-stack agricultural economics and consumer intelligence platform. It bridges wholesale agricultural price forecasting, nutritional parity analysis, and smart produce substitution to protect consumer food budgets against commodity price shocks.

---

## 🏛 Architecture Overview

- **Frontend**: React 19 + Vite with responsive dashboards, interactive pricing charts, and instant substitution recommendations.
- **Backend**: Express.js REST API on Node.js (Port `5000`), routing to persistent SQLite stores and Python ML microservices.
- **Machine Learning & Analytics**:
  - **LSTM Neural Network**: 6-feature commodity price forecasting trained on historical APMC wholesale arrivals.
  - **Food Substitution Engine**: Deterministic multi-objective optimization (nutritional similarity, cooking role, price suitability, and seasonal availability).
  - **ResNet50 Vision Classifier**: Produce image classification for rapid camera-based food identification.
- **Persistence Layer**:
  - SQLite (`nutrition.db` & `historical_prices.db`): Zero-latency persistent storage with WAL mode.
  - USDA Comprehensive Nutrition Dataset: 40,000 reference foods standardized to kcal per 100g.
  - Agricultural Market Datasets: Parquet and DuckDB for fast localized APMC analytics.

---

## 📋 Prerequisites

Ensure the following runtimes are installed on your machine:
- **Node.js**: v18.0.0 or higher (v20+ recommended with `node:sqlite` support)
- **Python**: 3.10 or higher (with `pip` and Python added to system `PATH`)
- **Operating System**: Windows 10/11, Linux, or macOS

---

## ⚙️ Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Agri_Swap_Project
```

### 2. Install Dependencies
Install root, backend, and frontend packages:
```bash
# Install root orchestration dependencies
npm install

# Install backend dependencies
cd Backend
npm install
cd ..

# Install frontend dependencies
cd Frontend
npm install
cd ..
```

### 3. Install Python Dependencies
```bash
pip install pandas numpy scikit-learn torch torchvision duckdb pyarrow joblib
```

### 4. Configure Environment Variables
Copy the template configuration in `Backend/`:
```bash
# Windows CMD:
copy Backend\.env.example Backend\.env

# PowerShell:
Copy-Item Backend\.env.example Backend\.env

# Linux / macOS:
cp Backend/.env.example Backend/.env
```
> **Note:** MongoDB is optional. If `MONGO_URI` is omitted or disconnected, AGRI-SWAP runs locally using SQLite and Parquet datasets without loss of functionality.

---

## 🚀 Starting the Application

### Option A: Windows 1-Click Launcher (Recommended)
Double-click `start.bat` or run in PowerShell:
```powershell
.\start.ps1
```
This script:
1. Performs pre-flight checks (Node.js, Python, datasets).
2. Verifies ports `5000` and `5173` to prevent duplicate backend processes.
3. Launches the Backend and Frontend in separate dedicated terminal windows.

### Option B: Manual Command-Line Startup
Run each service in its own terminal window:

**Terminal 1 — Backend (Port 5000):**
```bash
npm run server
```

**Terminal 2 — Frontend (Port 5173):**
```bash
npm run frontend
```

### Accessing the Application
- **Frontend Web UI**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:5000](http://localhost:5000)
- **Backend Health Check**: [http://localhost:5000/api/health](http://localhost:5000/api/health)

---

## 🛑 Stopping the Application

To cleanly terminate all running backend and frontend processes and prevent port binding conflicts:

**Windows Batch:**
```cmd
stop.bat
```

**PowerShell:**
```powershell
.\stop.ps1
```

---

## 💾 Data Persistence & Safety

AGRI-SWAP is designed with **idempotent startup**:
- Normal startup **never** deletes, overwrites, or redownloads existing databases or datasets.
- `Backend/data/nutrition.db` persistently stores 206 food nutrition profiles and 40,000 USDA reference foods.
- `Backend/data/historical_prices.db` caches APMC historical price queries to eliminate repeated heavy compute.

### Database Backup & Restore Utility
A safe SQLite backup and restore CLI is provided at `Backend/scripts/backupRestoreDatabases.js`:

```bash
# Check current database integrity, sizes, and record counts
node Backend/scripts/backupRestoreDatabases.js status

# Create an atomic, verified backup in Backend/data/backups/
node Backend/scripts/backupRestoreDatabases.js backup

# Restore a database from its latest verified backup
node Backend/scripts/backupRestoreDatabases.js restore --db=nutrition --latest
node Backend/scripts/backupRestoreDatabases.js restore --db=historical --latest
node Backend/scripts/backupRestoreDatabases.js restore --all --latest
```

---

## 📦 Large Files & External Storage Guide

GitHub enforces strict file limits:
- **Warning Threshold**: Files > 50 MB
- **Hard Reject Limit**: Files > 100 MB

The following large files are excluded from regular Git via `.gitignore`:

| File / Folder | Size | Storage Recommendation | Access Method for Fresh Clones |
| :--- | :--- | :--- | :--- |
| `ML/image_recognition/resnet50_fruit_vegetable_best.keras` | 212 MB | GitHub Release Asset / Git LFS | Download from GitHub Releases into `ML/image_recognition/` |
| `Datasets/Agricultural Market Price Dataset.zip` | 1.44 GB | Google Drive / Zenodo / S3 | Raw wholesale archive; Parquet subsets are pre-cleaned |
| `Datasets/Agricultural Market Price Dataset/csv/` | ~6.0 GB | External Data Lake | Multi-year raw APMC CSVs |
| `Datasets/Fruit and Vegetable image dataset.zip` | 2.03 GB | Kaggle / Cloud Bucket | Raw training image archive |
| `Datasets/Fruit_and_Vegetable_Cleaned.zip` | 1.44 GB | Cloud Bucket | Cleaned vision training images |

> **Fresh Clone Guarantee:** The repository includes `nutrition.db`, `historical_prices.db`, `food_substitution_dataset_150plus.csv`, `locations.json`, and `lstm_price_prediction.pth`. **Price Analytics, LSTM Predictions, and Food Substitution work out-of-the-box on a fresh clone without downloading the 6 GB archive.**

---

## 🧪 Verification & Health Testing

Run the included verification test suites to validate endpoints and model connections:

```bash
# Test food substitution endpoint & 204 foods parity
node Backend/scripts/verifyFoodSubstitutionFeature.js

# Test location filter hierarchies & APMC markets
python Backend/scripts/verifyLocationFilters.py

# Build frontend production bundle
npm run build --prefix Frontend
```

---

## 🔒 Security Best Practices
- Never commit `Backend/.env` or any production credentials.
- Always review `git status` before pushing to ensure `.gitignore` excludes sensitive files.
