@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

REM ============================================================
REM  Credibas - servidor de desarrollo accesible desde la LAN
REM
REM  - Local:  http://localhost:5173
REM  - Red:    http://<IP-LAN>:5173  (se muestra al iniciar)
REM
REM  La primera vez Windows puede pedir permiso de firewall para
REM  Node.js: acepta "Redes privadas".
REM ============================================================

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No se encontro npm. Instala Node.js 22+ desde https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Instalando dependencias, espera...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install fallo.
    pause
    exit /b 1
  )
)

REM Crea la regla de firewall solo si la consola esta elevada.
net session >nul 2>&1
if not errorlevel 1 (
  netsh advfirewall firewall show rule name="Credibas dev 5173" >nul 2>&1
  if errorlevel 1 (
    echo Creando regla de firewall para el puerto 5173...
    netsh advfirewall firewall add rule name="Credibas dev 5173" dir=in action=allow protocol=TCP localport=5173 profile=private >nul
  )
)

set "LAN_IP="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "$x = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1; $x"`) do set "LAN_IP=%%i"

echo.
echo ============================================================
echo   Credibas - servidor de desarrollo
echo ============================================================
echo   Local:  http://localhost:5173
if defined LAN_IP (
  echo   Red:    http://%LAN_IP%:5173
) else (
  echo   Red:    no se detecto IP de LAN ^(revisa con: ipconfig^)
)
echo.
echo   Si otro equipo no puede conectarse, abre el puerto 5173
echo   en una consola como Administrador:
echo     netsh advfirewall firewall add rule name="Credibas dev 5173" dir=in action=allow protocol=TCP localport=5173 profile=private
echo.
echo   Ctrl+C para detener el servidor.
echo ============================================================
echo.

call npm run dev -- --host 0.0.0.0 --port 5173 --strictPort

echo.
echo El servidor se detuvo. Revisa los mensajes anteriores si hubo errores.
pause
endlocal
