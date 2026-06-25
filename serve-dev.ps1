# Local dev preview for Silver Vault frontend
# Usage: .\serve-dev.ps1
# Opens http://localhost:8765 with live reload on file save

$ErrorActionPreference = "Stop"
$Port = 8765
$Root = $PSScriptRoot

Write-Host ""
Write-Host "Silver Vault — Dev Preview" -ForegroundColor Cyan
Write-Host "Folder: $Root"
Write-Host "URL:    http://localhost:$Port" -ForegroundColor Green
Write-Host ""
Write-Host "Edit files here, save, and the browser refreshes automatically."
Write-Host "Green banner = local dev (not live site). Press Ctrl+C to stop."
Write-Host ""

Set-Location $Root

$npx = Get-Command npx -ErrorAction SilentlyContinue
if ($npx) {
    npx --yes live-server --port=$Port --open=/index.html --watch=. --host=localhost
    exit $LASTEXITCODE
}

$python = Get-Command python -ErrorAction SilentlyContinue
if ($python) {
    Write-Host "Tip: install Node for auto-reload, or refresh the browser manually." -ForegroundColor Yellow
    Start-Process "http://localhost:$Port"
    python -m http.server $Port
    exit $LASTEXITCODE
}

Write-Host "Need Python or Node.js to run a local server." -ForegroundColor Red
exit 1
