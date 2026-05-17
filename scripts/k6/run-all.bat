@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "BASE_URL=%BASE_URL%"
if "%BASE_URL%"=="" set "BASE_URL=http://localhost:3000/api"

set "K6_USERNAME=%K6_USERNAME%"
if "%K6_USERNAME%"=="" set "K6_USERNAME=admin"

set "K6_PASSWORD=%K6_PASSWORD%"
if "%K6_PASSWORD%"=="" set "K6_PASSWORD=admin"

set "PAYMENTS_MOCK=true"

set "K6_BIN=%K6_BIN%"
if "%K6_BIN%"=="" set "K6_BIN=C:\Program Files\k6\k6.exe"

set "RESULT_DIR=%USERPROFILE%\Desktop\k6-results"
if not exist "%RESULT_DIR%" mkdir "%RESULT_DIR%"

set "SCRIPT_DIR=%~dp0"
set "EXIT_CODE=0"

echo Safari ERP k6 stress suite
echo Base URL: %BASE_URL%
echo PAYMENTS_MOCK: %PAYMENTS_MOCK%
echo Results: %RESULT_DIR%
echo.

for %%F in (
  01-api-baseline.js
  02-concurrent-orders.js
  03-payment-stress.js
  04-peak-day.js
  05-database-stress.js
) do (
  echo ============================================================
  echo Running %%F
  echo ============================================================

  "%K6_BIN%" run ^
    -e BASE_URL="%BASE_URL%" ^
    -e K6_USERNAME="%K6_USERNAME%" ^
    -e K6_PASSWORD="%K6_PASSWORD%" ^
    -e PAYMENTS_MOCK="%PAYMENTS_MOCK%" ^
    --summary-export "%RESULT_DIR%\%%~nF-summary.json" ^
    "%SCRIPT_DIR%%%F" > "%RESULT_DIR%\%%~nF-output.txt" 2>&1

  if errorlevel 1 (
    echo FAIL %%F
    set "EXIT_CODE=1"
  ) else (
    echo PASS %%F
  )
)

echo.
echo Results saved to: %RESULT_DIR%
exit /b %EXIT_CODE%

