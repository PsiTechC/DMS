@echo off
REM Launches the DMS backend and frontend in two terminals.
title DMS Launcher

echo.
echo  ============================================
echo   DMS - Device Management System
echo  ============================================
echo.

cd /d "%~dp0"

if not exist "backend\.env" (
  echo  [!] backend\.env is missing.
  echo      Copy backend\.env.example to backend\.env and fill it in.
  echo.
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo  Installing frontend dependencies, this runs once...
  cd frontend
  call npm install
  cd ..
  echo.
)

echo  Starting backend  -^> http://localhost:8080
start "DMS Backend" cmd /k "cd /d "%~dp0backend" && go run ./cmd/server"

echo  Starting frontend -^> http://localhost:5173
start "DMS Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Both services are starting in separate windows.
echo  Open http://localhost:5173 once the frontend is ready.
echo.
echo  Login: admin@dms.local / Admin@123
echo.
timeout /t 5 >nul
