# AGRI-SWAP Scheduled Task Removal
$taskName = "AgriSwap_Backend_AutoStart"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "[SUCCESS] Windows Scheduled Task '$taskName' removed." -ForegroundColor Green
} else {
    Write-Host "[INFO] Task '$taskName' was not found." -ForegroundColor Yellow
}
