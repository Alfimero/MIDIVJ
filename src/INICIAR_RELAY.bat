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

if not exist "node_modules\ws" goto instalar
if not exist "node_modules\selfsigned" goto instalar
goto seguir

:instalar
echo  Instalando dependencias...
call npm install --ignore-scripts
if errorlevel 1 (
    color 0C
    echo  ERROR: no se pudieron instalar las dependencias.
    pause
    exit /b 1
)
echo.

:seguir

echo  Relay corriendo. No cierres esta ventana.
echo  -----------------------------------------------
echo.

echo  El navegador se abre solo con la aplicacion.
echo  Abajo aparecen las direcciones reales (el puerto puede cambiar
echo  si el 9191 esta ocupado).
echo.
echo  Para usar telefonos como mando, pulsa RELAY en la aplicacion
echo  y escanea el QR de cada uno (hasta 4 dispositivos).
echo.

node src\midivj-relay.js

echo.
echo  -----------------------------------------------
echo  El relay se detuvo.
echo.
pause
