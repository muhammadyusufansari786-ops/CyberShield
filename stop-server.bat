@echo off
setlocal
title Stop CyberShield Server

rem --- Optional: pass a port as the first argument, otherwise use 3000 ---
if "%~1"=="" (set "PORT=3000") else set "PORT=%~1"

echo Looking for a process listening on port %PORT%...
set "FOUND="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess" 2^>nul') do (
    set FOUND=1
    echo Stopping PID %%P ...
    taskkill /PID %%P /F >nul 2>&1
)

if not defined FOUND (
    echo No server found on port %PORT%. Nothing to stop.
) else (
    echo.
    echo Server stopped.
)
pause
