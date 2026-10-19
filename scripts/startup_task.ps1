# AGRI-SWAP Background Logon & Startup Task
$ErrorActionPreference = "Continue"

if ($PSScriptRoot) {
    $rootDir = Split-Path -Parent $PSScriptRoot
} else {
    $rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}
Set-Location $rootDir

$logsDir = Join-Path $rootDir "Backend\logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

$startupLog = Join-Path $logsDir "startup.log"
function Log-Startup([string]$msg) {
    $ts = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    Add-Content -Path $startupLog -Value "[$ts] $msg"
    Write-Host "[$ts] $msg"
}

Log-Startup "[STARTUP-TASK] Initiating Agri-Swap background startup..."

# 1. Start or Verify Backend
$backendUrl = "http://127.0.0.1:5000/api/health"
$backendReady = $false

try {
    $res = Invoke-RestMethod -Uri $backendUrl -TimeoutSec 2 -ErrorAction Stop
    if ($res.status -eq "healthy" -or $res.success -eq $true) {
        $backendReady = $true
        Log-Startup "[INFO] Backend is already running and healthy on port 5000."
    }
} catch {}

if (-not $backendReady) {
    Log-Startup "[INFO] Backend is not active. Launching Backend Supervisor..."
    $supScript = Join-Path $rootDir "Backend\supervisor.js"
    
    # Spawn supervisor as detached background process
    Start-Process -FilePath "node" -ArgumentList "`"$supScript`"" -WorkingDirectory $rootDir -WindowStyle Hidden

    # Poll health endpoint up to 45 seconds to confirm readiness
    $startWait = Get-Date
    while ((Get-Date) - $startWait -lt (New-TimeSpan -Seconds 45)) {
        Start-Sleep -Milliseconds 800
        try {
            $chk = Invoke-RestMethod -Uri $backendUrl -TimeoutSec 2 -ErrorAction Stop
            if ($chk.status -eq "healthy" -or $chk.success -eq $true) {
                $backendReady = $true
                break
            }
        } catch {}
    }

    if ($backendReady) {
        Log-Startup "[SUCCESS] Backend confirmed healthy and listening on port 5000."
    } else {
        Log-Startup "[ERROR] Backend failed to confirm health on port 5000 within 45 seconds."
    }
}

# 2. Start or Verify Frontend
$frontendPort = 5173
$fConn = Get-NetTCPConnection -LocalPort $frontendPort -State Listen -ErrorAction SilentlyContinue
if (-not $fConn) {
    Log-Startup "[INFO] Frontend is not listening on port 5173. Starting Vite dev server..."
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run frontend" -WorkingDirectory $rootDir -WindowStyle Hidden
    
    # Wait up to 15 seconds for frontend
    $fReady = $false
    for ($i = 0; $i -lt 15; $i++) {
        Start-Sleep -Seconds 1
        $chkF = Get-NetTCPConnection -LocalPort $frontendPort -State Listen -ErrorAction SilentlyContinue
        if ($chkF) {
            $fReady = $true
            break
        }
    }
    if ($fReady) {
        Log-Startup "[SUCCESS] Frontend active on port 5173."
    } else {
        Log-Startup "[WARN] Frontend launched, waiting for port 5173 to bind."
    }
} else {
    Log-Startup "[INFO] Frontend is already listening on port 5173."
}

Log-Startup "[STARTUP-TASK] Startup sequence completed."
