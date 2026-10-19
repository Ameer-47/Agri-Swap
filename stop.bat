@echo off
setlocal enabledelayedexpansion
title AGRI-SWAP Shutdown

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\stop.ps1"
) else (
    echo [INFO] Stopping processes manually...
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5000 .*LISTENING"') do taskkill /F /PID %%a >nul 2>nul
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr /r /c:":5173 .*LISTENING"') do taskkill /F /PID %%a >nul 2>nul
    echo [SUCCESS] Stopped services on port 5000 and 5173.
)

echo.
pause
