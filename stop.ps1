# AGRI-SWAP PowerShell Shutdown Script
$ErrorActionPreference = "Continue"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "            AGRI-SWAP - Stopping Local Services                  " -ForegroundColor Cyan
Write-Host "=================================================================`n" -ForegroundColor Cyan

if ($PSScriptRoot) {
    $rootDir = $PSScriptRoot
} else {
    $rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}
Set-Location $rootDir

$stopped = 0
$pidFile = Join-Path $rootDir "Backend\data\supervisor.pid"
$backendPidFile = Join-Path $rootDir "Backend\data\backend.pid"

# 1. Stop active Scheduled Task instance if running
$taskName = "AgriSwap_Backend_AutoStart"
try {
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
} catch {}

# 2. Stop Supervisor via CLI if possible
$supScript = Join-Path $rootDir "Backend\supervisor.js"
if (Test-Path $supScript) {
    try {
        & node $supScript --stop | Out-Null
    } catch {}
}

# 2. Check and stop supervisor PID from file
if (Test-Path $pidFile) {
    try {
        $sPid = Get-Content -Path $pidFile -ErrorAction SilentlyContinue
        if ($sPid) {
            $p = Get-Process -Id ([int]$sPid) -ErrorAction SilentlyContinue
            if ($p) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                Write-Host "[SUCCESS] Stopped Supervisor process (PID $($p.Id))." -ForegroundColor Green
                $stopped++
            }
        }
        Remove-Item -Path $pidFile -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 3. Check and stop child backend PID from file
if (Test-Path $backendPidFile) {
    try {
        $bPid = Get-Content -Path $backendPidFile -ErrorAction SilentlyContinue
        if ($bPid) {
            $p = Get-Process -Id ([int]$bPid) -ErrorAction SilentlyContinue
            if ($p) {
                Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
                Write-Host "[SUCCESS] Stopped Child Backend process (PID $($p.Id))." -ForegroundColor Green
                $stopped++
            }
        }
        Remove-Item -Path $backendPidFile -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 4. Terminate any remaining processes on port 5000 and 5173
$ports = @(5000, 5173)
foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $pidToKill = $conn.OwningProcess
            try {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
                Write-Host "[SUCCESS] Terminated process PID $pidToKill listening on port $port." -ForegroundColor Green
                $stopped++
            } catch {
                Write-Host "[WARN] Could not stop process PID $pidToKill on port $port." -ForegroundColor Yellow
            }
        }
    }
}

if ($stopped -eq 0) {
    Write-Host "[INFO] No active AGRI-SWAP processes found on port 5000 or 5173." -ForegroundColor Cyan
} else {
    Write-Host "`n[SUCCESS] AGRI-SWAP services stopped cleanly ($stopped process(es) terminated)." -ForegroundColor Green
}
Write-Host "=================================================================`n" -ForegroundColor Cyan
