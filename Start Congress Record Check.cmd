@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.13 or newer from https://nodejs.org/ and try again.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci --no-audit --no-fund
  if errorlevel 1 exit /b 1
)
echo Starting Congress Record Check. Your browser will open automatically.
echo Keep this window open -- closing it stops the live updates.
start "" powershell -NoProfile -WindowStyle Hidden -Command "$u='http://127.0.0.1:8787/'; for ($i=0; $i -lt 30; $i++) { try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $u; break } catch { Start-Sleep -Seconds 1 } }"
call npm.cmd start
pause
