@echo off
rem Teplyi Brod launcher: starts a local server and opens the game in the browser.
rem index.html uses ES modules, so it cannot be opened from disk; a server is needed.
rem Falls back to dist\forest.html (the single-file build) if neither Node nor Python is installed.
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

echo Neither Node.js nor Python found. Opening the single-file build dist\forest.html instead.
echo (It may be older than the sources: run build.bat after installing Node.js.)
start "" "%~dp0dist\forest.html"
pause
