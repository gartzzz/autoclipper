@echo off
chcp 65001 >nul 2>&1
echo.
echo ==================================
echo   AutoClipper - Instalador Windows
echo ==================================
echo.

REM Resolve the directory where this script lives
set "SCRIPT_DIR=%~dp0"
set "EXTENSION_SRC=%SCRIPT_DIR%extension"

REM Target: CEP extensions folder
set "TARGET_DIR=%APPDATA%\Adobe\CEP\extensions\com.gartzzz.autoclipper"

REM 1. Copy extension
echo [1/3] Copiando extension a CEP...
if exist "%TARGET_DIR%" rmdir /s /q "%TARGET_DIR%"
xcopy "%EXTENSION_SRC%" "%TARGET_DIR%" /E /I /Q /Y
echo       -^> %TARGET_DIR%

REM 2. Enable PlayerDebugMode via registry
echo [2/3] Habilitando modo debug para CEP...
reg add "HKCU\Software\Adobe\CSXS.11" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
reg add "HKCU\Software\Adobe\CSXS.12" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul 2>&1
echo       -^> CSXS.11 y CSXS.12 habilitados

REM 3. Done
echo [3/3] Listo!
echo.
echo ==================================
echo   Instalacion completada
echo ==================================
echo.
echo Ahora:
echo   1. Abre (o reinicia) Adobe Premiere Pro
echo   2. Ve a Window ^> Extensions ^> AutoClipper
echo.
pause
