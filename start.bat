@echo off
REM Launches the DMS backend and frontend in two terminals.
REM Ports 8090/5180 - an unrelated older project holds 8080/5173.
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

echo  Starting backend  -^> http://localhost:8090
start "DMS Backend" cmd /k "cd /d "%~dp0backend" && go run ./cmd/server"

echo  Waiting for the backend to come up...
timeout /t 4 >nul

echo  Starting frontend -^> http://localhost:5180
start "DMS Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo.
echo  Both services are starting in separate windows.
echo.
echo    Open:   http://localhost:5180
echo    Login:  admin@dms.local  /  Admin@123
echo.
echo  Closing THIS window is fine. To stop the app, close the two
echo  windows titled "DMS Backend" and "DMS Frontend".
echo.
timeout /t 6 >nul
