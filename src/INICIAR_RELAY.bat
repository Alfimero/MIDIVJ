@echo off
title MIDIVJ Relay
color 0A

echo.
echo  =============================================
echo   MIDIVJ Relay
echo  =============================================
echo.

cd /d "%~dp0.."
echo  Carpeta: %CD%
echo.

if not exist "src\midivj-relay.js" (
    color 0C
    echo  ERROR: src\midivj-relay.js no encontrado en:
    echo  %CD%
    echo.
    pause
    exit /b 1
)

if not exist "node_modules\ws" (
    echo  Instalando dependencia "ws"...
    call npm install --ignore-scripts
    if errorlevel 1 (
        color 0C
        echo  ERROR: no se pudo instalar la dependencia "ws".
        pause
        exit /b 1
    )
    echo.
)

echo  Relay corriendo. No cierres esta ventana.
echo  -----------------------------------------------
echo.

echo  Aplicacion: http://localhost:9191/
echo  Emisor MIDI: http://localhost:9191/sender
echo.

node src\midivj-relay.js

echo.
echo  -----------------------------------------------
echo  El relay se detuvo.
echo.
pause
