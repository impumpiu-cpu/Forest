@echo off
rem Rebuilds dist\forest.html (one file with everything inside) from src\. Needs Node.js.
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js not found: install it from https://nodejs.org and run again. & pause & exit /b 1)
if not exist node_modules\esbuild call npm install
call npm run build
pause
