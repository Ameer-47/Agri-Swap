@echo off
setlocal enabledelayedexpansion
title AGRI-SWAP Launcher

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
cd /d "%ROOT_DIR%"

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT_DIR%\start.ps1"
    if %ERRORLEVEL% neq 0 (
        echo.
        echo [ERROR] AGRI-SWAP startup encountered an error.
    )
) else (
    echo [ERROR] PowerShell is required to execute pre-flight and health checks.
    pause
    exit /b 1
)

echo.
pause
