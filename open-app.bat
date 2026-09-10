@echo off
setlocal
cd /d "%~dp0"

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8080" ^| findstr "LISTENING"') do (
  echo Stopping old server process on port 8080: %%p
  taskkill /PID %%p /F >nul 2>nul
)

echo Starting BUG AI server...
start "BUG AI Server" cmd /k "cd /d %~dp0 && node server.js"

echo Waiting for server on http://127.0.0.1:8080 ...
set "URL=http://localhost:8080/index.html"
set "HEALTH_URL=http://127.0.0.1:8080/api/health"

for /l %%i in (1,1,20) do (
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing '%HEALTH_URL%' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
  if not errorlevel 1 goto :openBrowser
  timeout /t 1 /nobreak >nul
)

echo Server did not respond in time.
echo Check the "BUG AI Server" window for errors.
pause
exit /b 1

:openBrowser
echo Opening %URL%
powershell -NoProfile -Command "Start-Process '%URL%'" >nul 2>nul
if errorlevel 1 explorer.exe "%URL%"
if errorlevel 1 start "" "%URL%"
echo %URL% | clip
echo.
echo If the browser does not open automatically:
echo 1. Open Chrome or Edge
echo 2. Press Ctrl+V in the address bar
echo 3. Press Enter
echo.
echo URL copied to clipboard:
echo %URL%
pause
