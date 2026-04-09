@echo off
title COPILOTO SAGRADA FAMILIA - v1.0.0 (SUPERMAN)
echo ========================================================
echo      COPILOTO DE INTERVENTORIA - VERSION 1.0.0
echo                 CODIGO: SUPERMAN
echo ========================================================
echo.
echo [1/2] Iniciando servidor de inteligencia...
start "Copiloto Backend" cmd /c "node index.js"

:: Esperar un momento para que el backend suba
timeout /t 3 /nobreak > nul

:: Iniciar Frontend
echo [2/2] Iniciando interfaz grafica...
cd frontend
echo Cargando Dashboard en el navegador...
npm.cmd run dev

pause
