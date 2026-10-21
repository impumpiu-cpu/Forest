@echo off
rem Teplyi Brod launcher: starts a local server and opens the game in the browser.
rem index.html uses ES modules, so it cannot be opened from disk; a server is needed: Node.js or Python.
cd /d "%~dp0"
title Teplyi Brod

where node >nul 2>&1
if %errorlevel%==0 (
  node tools\serve.mjs 8000
  goto :eof
)

where py >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:8000/
  py -3 -m http.server 8000
  goto :eof
)

python --version >nul 2>&1
if %errorlevel%==0 (
  start "" http://localhost:8000/
  python -m http.server 8000
  goto :eof
)

echo Neither Node.js nor Python found.
echo Install Node.js (https://nodejs.org) or Python (https://python.org) and run start.bat again.
pause
