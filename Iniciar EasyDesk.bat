@echo off
setlocal
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado. Fecha e volta a abrir esta janela e tenta novamente.
  pause
  exit /b 1
)

node -e "require('express'); require('cors'); require('systeminformation')" >nul 2>&1
if errorlevel 1 (
  echo A instalar as dependencias do EasyDesk...
  call npm ci
  if errorlevel 1 (
    echo Nao foi possivel instalar as dependencias.
    pause
    exit /b 1
  )
)

for /f "delims=" %%I in ('node -e "const os=require('os'); const a=Object.values(os.networkInterfaces()).flat().find(x=>{if(!x||x.family!=='IPv4'||x.internal)return false;const o=x.address.split('.').map(Number);return o[0]===10||(o[0]===172&&o[1]>=16&&o[1]<=31)||(o[0]===192&&o[1]===168)}); console.log(a?a.address:'127.0.0.1')"') do set "HOST=%%I"
set "URL=http://%HOST%:3000"

curl.exe -fsS "%URL%/" >nul 2>&1
if not errorlevel 1 goto open_browser

echo A iniciar o EasyDesk. Fecha a janela do servidor para parar a aplicacao.
start "EasyDesk - servidor" /D "%~dp0" node server.js

set /a ATTEMPT=0
:wait_for_server
curl.exe -fsS "%URL%/" >nul 2>&1
if not errorlevel 1 goto open_browser
set /a ATTEMPT+=1
if %ATTEMPT% geq 30 goto startup_failed
ping 127.0.0.1 -n 2 >nul
goto wait_for_server

:open_browser
start "" "%URL%"
exit /b 0

:startup_failed
echo O EasyDesk nao iniciou em 30 segundos. Verifica a janela do servidor.
pause
exit /b 1
