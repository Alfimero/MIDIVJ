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

where node >nul 2>nul
if errorlevel 1 goto sin_node
for /f "delims=" %%v in ('node -v') do echo  Node: %%v
echo.

rem Instala si falta algo o si un git pull cambio package-lock.json.
rem 0 = al dia, 1 = falta algo, 2 = versiones distintas.
node src\midivj-dependencias.js
set DEPENDENCIAS=%errorlevel%
if "%DEPENDENCIAS%"=="0" goto seguir

echo  Instalando dependencias...
call npm install --ignore-scripts
if not errorlevel 1 goto instaladas
if "%DEPENDENCIAS%"=="2" goto sin_actualizar
color 0C
echo.
echo  ERROR: no se pudieron instalar las dependencias.
echo  Revisa que haya conexion a internet y vuelve a abrir este archivo.
echo.
pause
exit /b 1

:sin_actualizar
echo.
echo  AVISO: no se pudieron actualizar las dependencias; se usan las
echo  que ya estaban instaladas. Con internet se actualizan solas.
echo.
goto seguir

:instaladas
echo.
goto seguir

:sin_node
color 0C
echo  ERROR: Node.js no esta instalado o no aparece en el PATH.
echo.
echo  Instala la version LTS de https://nodejs.org
echo  y vuelve a abrir este archivo.
echo.
pause
exit /b 1

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
