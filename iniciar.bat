@echo off
title Smart Buy CL
cd /d "%~dp0"
py iniciar.py
if errorlevel 1 pause
