@echo off
setlocal
title CyberShield Local Server
cd /d "%~dp0"

rem --- Optional: pass a port as the first argument, otherwise use 3000 ---
if "%~1"=="" (set "PORT=3000") else set "PORT=%~1"
set "URL=http://localhost:%PORT%"

rem --- Make sure Python is available ---
where python >nul 2>&1
if errorlevel 1 (
    echo Python was not found on PATH. Install Python from https://python.org
    pause
    exit /b 1
)

rem --- If something is already listening on the port, offer to reuse it ---
set "PID_ON_PORT="
for /f "delims=" %%P in ('powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue).OwningProcess" 2^>nul') do set "PID_ON_PORT=%%P"

if defined PID_ON_PORT (
    echo A process with PID %PID_ON_PORT% is already listening on port %PORT%.
    choice /C YN /M "Stop it and start a fresh server"
    if errorlevel 2 (
        echo.
        echo Keeping the existing server. Opening %URL% ...
        start "" %URL%
        ping -n 3 127.0.0.1 >nul
        exit /b 0
    )
    taskkill /PID %PID_ON_PORT% /F >nul 2>&1
    ping -n 2 127.0.0.1 >nul
)

echo ============================================
echo   CyberShield local server
echo   Serving:  %CD%
echo   Address:  %URL%
echo   Stop:     press Ctrl+C in this window
echo ============================================
echo.
echo Opening %URL% in your browser...
start "" %URL%
python -m http.server %PORT% --bind 127.0.0.1
