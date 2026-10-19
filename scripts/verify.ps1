# verify.ps1 for tool_revert

$ErrorActionPreference = "Stop"

Write-Host "=== [1/3] Checking Node.js Environment ===" -ForegroundColor Cyan
$nodeVersion = node -v
Write-Host "Node version: $nodeVersion"

Write-Host "=== [2/3] Running Unit Tests ===" -ForegroundColor Cyan
node --test test/tool_revert.test.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Unit tests failed!"
    exit 1
}

Write-Host "=== [3/3] Verifying CLI Executable ===" -ForegroundColor Cyan
node bin/tool_revert.js help > $null
if ($LASTEXITCODE -ne 0) {
    Write-Error "CLI test failed!"
    exit 1
}

Write-Host "`nAll verification checks passed successfully!" -ForegroundColor Green
exit 0
