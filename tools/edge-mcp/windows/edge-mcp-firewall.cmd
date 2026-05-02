@echo off
setlocal EnableExtensions

set "START_PORT=%~1"
set "END_PORT=%~2"
set "LOG_PATH=%~3"

if "%START_PORT%"=="" set "START_PORT=9222"
if "%END_PORT%"=="" set "END_PORT=%START_PORT%"
if "%LOG_PATH%"=="" set "LOG_PATH=%USERPROFILE%\edge-mcp-fix.log"

set "RULE_NAME=edge-mcp-%START_PORT%-%END_PORT%"
set "LOCAL_PORT=%START_PORT%"
if not "%START_PORT%"=="%END_PORT%" set "LOCAL_PORT=%START_PORT%-%END_PORT%"

echo === firewall before === >> "%LOG_PATH%" 2>&1
netsh advfirewall firewall show rule name="%RULE_NAME%" >> "%LOG_PATH%" 2>&1
netsh advfirewall firewall delete rule name="%RULE_NAME%" >> "%LOG_PATH%" 2>&1
netsh advfirewall firewall delete rule name="edge-mcp-9222" >> "%LOG_PATH%" 2>&1
netsh advfirewall firewall add rule name="%RULE_NAME%" dir=in action=allow protocol=TCP localport=%LOCAL_PORT% >> "%LOG_PATH%" 2>&1
echo === firewall after === >> "%LOG_PATH%" 2>&1
netsh advfirewall firewall show rule name="%RULE_NAME%" >> "%LOG_PATH%" 2>&1
