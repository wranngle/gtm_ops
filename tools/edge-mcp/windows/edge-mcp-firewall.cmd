@echo off
echo === firewall before === >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh advfirewall firewall show rule name="edge-mcp-9222" >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh advfirewall firewall delete rule name="edge-mcp-9222" >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh advfirewall firewall add rule name="edge-mcp-9222" dir=in action=allow protocol=TCP localport=9222 >> C:\Users\root\edge-mcp-fix.log 2>&1
echo === firewall after === >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh advfirewall firewall show rule name="edge-mcp-9222" >> C:\Users\root\edge-mcp-fix.log 2>&1
