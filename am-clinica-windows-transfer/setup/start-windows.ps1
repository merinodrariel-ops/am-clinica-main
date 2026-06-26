Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".\node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

npm run dev
