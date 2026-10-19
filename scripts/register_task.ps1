# AGRI-SWAP Scheduled Task Registration
$ErrorActionPreference = "Stop"

if ($PSScriptRoot) {
    $rootDir = Split-Path -Parent $PSScriptRoot
} else {
    $rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
}

$taskName = "AgriSwap_Backend_AutoStart"
$taskScript = Join-Path $rootDir "scripts\startup_task.ps1"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "     AGRI-SWAP - Register Windows Logon Startup Task            " -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Task Name:      $taskName" -ForegroundColor White
Write-Host "Target Script:  $taskScript" -ForegroundColor Gray
Write-Host "Working Dir:    $rootDir" -ForegroundColor Gray
Write-Host "Run As User:    $env:USERNAME`n" -ForegroundColor Gray

# Define Action: run powershell hidden with Bypass execution policy
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$taskScript`"" -WorkingDirectory $rootDir

# Define Trigger: At Logon for current user
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Define Settings: allow battery, keep alive, restart on failure
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 24) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

# Register task
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "AGRI-SWAP Backend & Frontend Auto-Start Daemon" -Force | Out-Null

$registered = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($registered) {
    Write-Host "[SUCCESS] Windows Scheduled Task '$taskName' is REGISTERED and ACTIVE." -ForegroundColor Green
    Write-Host "          State: $($registered.State)" -ForegroundColor Green
    Write-Host "          Triggers: At Logon for $env:USERNAME" -ForegroundColor White
    Write-Host "          Agri-Swap backend will start automatically every time you log in." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to register '$taskName'." -ForegroundColor Red
    exit 1
}
Write-Host "=================================================================`n" -ForegroundColor Cyan
