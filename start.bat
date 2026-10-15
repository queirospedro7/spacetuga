@echo off
setlocal
title Tuga
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 20 ou mais recente em https://nodejs.org e volta a abrir este ficheiro.
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  echo A preparar as dependencias do Tuga...
  call npm ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)
node scripts\start.mjs
if errorlevel 1 pause
endlocal
