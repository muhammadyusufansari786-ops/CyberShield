@echo off
setlocal
title CyberShield AI Server
cd /d "%~dp0"

rem --- Optional: pass a port as the first argument, otherwise use 3000 ---
if "%~1"=="" (set "PORT=3000") else set "PORT=%~1"
set "URL=http://localhost:%PORT%"

rem --- Make sure Node.js is available (backend + AI API need it) ---
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js was not found on PATH. Install the LTS version from https://nodejs.org
    pause
    exit /b 1
)

rem --- Install backend dependencies on first run ---
if not exist "node_modules\express" (
    echo Installing backend dependencies (first run only)...
    call npm install
    if errorlevel 1 (
        echo npm install failed. Run "npm install" manually and try again.
        pause
        exit /b 1
    )
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
echo   CyberShield AI server (site + Gemini API)
echo   Serving:  %CD%
echo   Address:  %URL%
echo   AI key:   .env file (GEMINI_API_KEY)
echo   Stop:     press Ctrl+C in this window
echo ============================================
echo.
echo Opening %URL% in your browser...
start "" %URL%
node server/server.js
