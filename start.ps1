# AGRI-SWAP PowerShell Startup Script
$ErrorActionPreference = "Stop"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "            AGRI-SWAP - Reliable Startup and Recovery            " -ForegroundColor Cyan
Write-Host "=================================================================`n" -ForegroundColor Cyan

if ($PSScriptRoot) {
    $rootDir = $PSScriptRoot
} else {
    $rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
Set-Location $rootDir

# Ensure logs directory exists
$logsDir = Join-Path $rootDir "Backend\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# 1. Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Node.js (v18+) from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# 2. Check Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Python is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install Python 3.10+ from https://python.org/ and check 'Add to PATH'." -ForegroundColor Yellow
    exit 1
}

# 3. Check Data Persistence Files
if (-not (Test-Path "Backend\data\nutrition.db")) {
    Write-Host "[WARN] Backend\data\nutrition.db is missing." -ForegroundColor Yellow
}
if (-not (Test-Path "Datasets\food_substitution_dataset\food_substitution_dataset_150plus.csv")) {
    Write-Host "[ERROR] Substitution CSV is missing: Datasets\food_substitution_dataset\food_substitution_dataset_150plus.csv" -ForegroundColor Red
    exit 1
}

# 4. Check & Start Backend via Supervisor
$backendHealthUrl = "http://127.0.0.1:5000/api/health"
$backendHealthy = $false

Write-Host "[INFO] Checking existing backend service status..." -ForegroundColor Gray
try {
    $res = Invoke-RestMethod -Uri $backendHealthUrl -TimeoutSec 2 -ErrorAction Stop
    if ($res.status -eq "healthy" -or $res.success -eq $true) {
        $backendHealthy = $true
        Write-Host "[SUCCESS] AGRI-SWAP Backend is already healthy and listening on port 5000." -ForegroundColor Green
    }
} catch {
    # Not yet healthy
}

if (-not $backendHealthy) {
    # Check if a non-responsive or rogue process is occupying port 5000
    $port5000Conn = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
    if ($port5000Conn) {
        $roguePid = $port5000Conn.OwningProcess
        Write-Host "[WARN] Port 5000 is occupied by unresponsive PID $roguePid. Reclaiming port..." -ForegroundColor Yellow
        try {
            Stop-Process -Id $roguePid -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        } catch {}
    }

    Write-Host "[INFO] Starting AGRI-SWAP Backend Supervisor (Port 5000)..." -ForegroundColor Cyan
    $supScript = Join-Path $rootDir "Backend\supervisor.js"
    Start-Process -FilePath "node" -ArgumentList "`"$supScript`"" -WorkingDirectory $rootDir -WindowStyle Hidden

    # Poll health endpoint up to 60 seconds (accommodates cold start & model pre-loading)
    Write-Host "[INFO] Waiting for backend readiness check at $backendHealthUrl..." -ForegroundColor Gray
    $startWait = Get-Date
    while ((Get-Date) - $startWait -lt (New-TimeSpan -Seconds 60)) {
        Start-Sleep -Milliseconds 800
        try {
            $chk = Invoke-RestMethod -Uri $backendHealthUrl -TimeoutSec 2 -ErrorAction Stop
            if ($chk.status -eq "healthy" -or $chk.success -eq $true) {
                $backendHealthy = $true
                break
            }
        } catch {
            Write-Host -NoNewline "."
        }
    }
    Write-Host ""

    if ($backendHealthy) {
        Write-Host "[SUCCESS] AGRI-SWAP Backend is active and confirmed HEALTHY on port 5000." -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Backend launched, but health endpoint did not confirm readiness within 60 seconds." -ForegroundColor Red
        Write-Host "Recent errors from Backend\logs\backend_error.log:" -ForegroundColor Yellow
        $errLog = Join-Path $logsDir "backend_error.log"
        if (Test-Path $errLog) {
            Get-Content -Path $errLog -Tail 15 | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
        }
        exit 1
    }
}

# 5. Check & Start Frontend (Port 5173)
$port5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
if ($port5173) {
    Write-Host "[INFO] Frontend is already running on port 5173 (PID $($port5173.OwningProcess))." -ForegroundColor Green
} else {
    Write-Host "[INFO] Starting AGRI-SWAP Frontend (Vite) on port 5173..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$rootDir'; npm run frontend"
    
    # Wait up to 12 seconds for frontend to bind port 5173
    $frontendReady = $false
    for ($i = 0; $i -lt 12; $i++) {
        Start-Sleep -Seconds 1
        $fChk = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
        if ($fChk) {
            $frontendReady = $true
            break
        }
    }
    if ($frontendReady) {
        Write-Host "[SUCCESS] AGRI-SWAP Frontend is active on port 5173." -ForegroundColor Green
    } else {
        Write-Host "[WARN] Frontend started, waiting for port 5173 to bind." -ForegroundColor Yellow
    }
}

# Note: Windows Logon Auto-Start is disabled. Launch manually via start.bat / start.ps1.

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host "AGRI-SWAP Services Active:" -ForegroundColor Green
Write-Host "  - Backend API:    http://localhost:5000" -ForegroundColor White
Write-Host "  - Backend Health: http://localhost:5000/api/health" -ForegroundColor White
Write-Host "  - Frontend App:   http://localhost:5173" -ForegroundColor White
Write-Host "  - Logs Directory: $logsDir" -ForegroundColor White
Write-Host "`nTo stop all services cleanly, run: .\stop.ps1" -ForegroundColor Gray
Write-Host "=================================================================`n" -ForegroundColor Cyan
