@echo off
setlocal EnableExtensions

set "START_PORT=%~1"
set "END_PORT=%~2"
set "LOG_PATH=%~3"
set "MODE=%~4"
set "CONNECT_ADDRESS=%~5"

if "%START_PORT%"=="" set "START_PORT=9222"
if "%END_PORT%"=="" set "END_PORT=%START_PORT%"
if "%LOG_PATH%"=="" set "LOG_PATH=%USERPROFILE%\edge-mcp-fix.log"
if "%MODE%"=="" set "MODE=v4tov6"
if "%CONNECT_ADDRESS%"=="" set "CONNECT_ADDRESS=::1"

echo === edge-mcp portproxy %START_PORT%-%END_PORT% mode=%MODE% connect=%CONNECT_ADDRESS% === >> "%LOG_PATH%" 2>&1
for /L %%P in (%START_PORT%,1,%END_PORT%) do (
  netsh interface portproxy delete v4tov4 listenport=%%P listenaddress=0.0.0.0 >> "%LOG_PATH%" 2>&1
  netsh interface portproxy delete v4tov6 listenport=%%P listenaddress=0.0.0.0 >> "%LOG_PATH%" 2>&1
  netsh interface portproxy add %MODE% listenport=%%P listenaddress=0.0.0.0 connectport=%%P connectaddress=%CONNECT_ADDRESS% >> "%LOG_PATH%" 2>&1
)
netsh interface portproxy show all >> "%LOG_PATH%" 2>&1
