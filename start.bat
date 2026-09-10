@echo off
setlocal
cd /d "%~dp0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo Stopping old server process on port 8080: %%p
  taskkill /PID %%p /F >nul 2>nul
)

echo Starting BUG AI on http://127.0.0.1:8080
echo.

node server.js

if errorlevel 1 (
  echo.
  echo Server stopped with an error.
  pause
)
