@echo off
title Smart Buy CL
cd /d "%~dp0"
rem Si el comparador ya está abierto, solo abre el navegador.
netstat -ano | findstr /r /c:"127.0.0.1:8000 .*LISTENING" >nul
if %errorlevel%==0 (
  start "" http://localhost:8000
  exit /b
)
echo Comparador Smart Buy CL - no cierres esta ventana mientras lo uses.
py server.py
pause
