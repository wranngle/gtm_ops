@echo off
netsh interface portproxy delete v4tov4 listenport=9222 listenaddress=0.0.0.0 >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh interface portproxy add v4tov6 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=::1 >> C:\Users\root\edge-mcp-fix.log 2>&1
netsh interface portproxy show all >> C:\Users\root\edge-mcp-fix.log 2>&1
