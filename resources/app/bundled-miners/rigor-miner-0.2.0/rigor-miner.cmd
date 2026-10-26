@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"
title RIGOR MAINNET SOLO Miner

echo.
echo RIGOR v0.2 MAINNET SOLO miner
echo RPC http://127.0.0.1:8761
echo.

REM Edit the three lines below in Notepad. Do not double-click this file to edit it.
set "RPC_USER=CHANGE_ME"
set "RPC_PASS=CHANGE_ME"
set "COINBASE_ADDR=rg1qCHANGE_ME"
if not "%~1"=="" set "COINBASE_ADDR=%~1"

if /I "%RPC_USER%"=="CHANGE_ME" goto need_edit
if /I "%RPC_PASS%"=="CHANGE_ME" goto need_edit
if "%COINBASE_ADDR%"=="" goto need_edit
if /I "%COINBASE_ADDR%"=="rg1qCHANGE_ME" goto need_edit
if /I "%COINBASE_ADDR%"=="rg1qYOURADDRESS" goto need_edit

if not exist "rigor-miner.exe" (
  echo rigor-miner.exe is missing from this folder.
  pause
  exit /b 1
)

echo %COINBASE_ADDR% | findstr /i /b /c:"rg1q" >nul 2>&1
if errorlevel 1 (
  echo Payout must be a MAINNET rg1q address.
  pause
  exit /b 1
)

echo Payout: %COINBASE_ADDR%
echo.

REM To override threads, add this line above the start command: set MINER_THREADS=2
if defined MINER_THREADS (
  if !MINER_THREADS! LSS 1 set "MINER_THREADS=1"
  rigor-miner.exe -a rgrpow01 -q -t !MINER_THREADS! --no-getwork --coinbase-addr="%COINBASE_ADDR%" -o "http://127.0.0.1:8761" -u "%RPC_USER%" -p "%RPC_PASS%"
) else (
  rigor-miner.exe -a rgrpow01 -q --no-getwork --coinbase-addr="%COINBASE_ADDR%" -o "http://127.0.0.1:8761" -u "%RPC_USER%" -p "%RPC_PASS%"
)
set "EC=%ERRORLEVEL%"
echo.
echo Miner exited with code %EC%.
pause
endlocal & exit /b %EC%

:need_edit
echo Right-click this file, choose Edit, and change RPC_USER and RPC_PASS.
echo They must match ^<wallet-install^>\data\rpc-auth.conf or rigor.conf.
echo Set COINBASE_ADDR to your rg1q address, or pass that address as the first argument.
echo Do not double-click rigor-miner.exe.
echo.
pause
exit /b 1
