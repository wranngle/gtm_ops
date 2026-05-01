# install-edge-shortcut.ps1 — drop "Edge (Debug).lnk" into the user's Start Menu
# so a single click auto-launches Edge with the right debug flags + profile.
#
# Run from PowerShell on Windows (or via `powershell.exe -File ...` from WSL).
#
# Env (optional):
#   EDGE_DEBUG_PORT     default 9222
#   EDGE_DEBUG_PROFILE  default $env:LOCALAPPDATA\EdgeDebugProfile

param(
    [int]$Port = ${env:EDGE_DEBUG_PORT} ?? 9222,
    [string]$Profile = "$($env:EDGE_DEBUG_PROFILE ?? "$env:LOCALAPPDATA\EdgeDebugProfile")",
    [string]$EdgeExe = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    [string]$ShortcutDir = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
)

if (-not (Test-Path $EdgeExe)) {
    Write-Error "Edge not found at $EdgeExe"
    exit 1
}

if (-not (Test-Path $Profile)) {
    New-Item -ItemType Directory -Path $Profile -Force | Out-Null
}

$shortcutPath = Join-Path $ShortcutDir "Edge (Debug).lnk"
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $EdgeExe
$shortcut.Arguments = "--remote-debugging-port=$Port --user-data-dir=`"$Profile`" --no-first-run --no-default-browser-check --window-position=30000,30000 --window-size=1280,800 about:blank"
$shortcut.WorkingDirectory = (Split-Path $EdgeExe -Parent)
$shortcut.IconLocation = $EdgeExe
$shortcut.Description = "Microsoft Edge with remote debugging on port $Port (separate profile)"
$shortcut.Save()

Write-Host "Created: $shortcutPath"
Write-Host "Profile: $Profile"
Write-Host "Port:    $Port"
