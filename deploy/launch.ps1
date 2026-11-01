$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
try {
    & node deploy/preflight.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Preflight failed. No private key requested and no transaction sent.' }
    if ($env:CRUMBS_CHECK_ONLY -eq '1') { Write-Host 'CHECK PASSED. No key requested. No transaction sent.'; exit 0 }
    $secret = Read-Host 'BNB mainnet private key (masked, local only)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    try { $env:CRUMBS_DEPLOY_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    try { & node deploy/mainnet.mjs }
    finally { Remove-Item Env:CRUMBS_DEPLOY_KEY -ErrorAction SilentlyContinue }
    if ($LASTEXITCODE -ne 0) { throw 'Mainnet step stopped. Preserve deployment records. Read the error above.' }
} catch { Write-Host ('STOPPED: ' + $_.Exception.Message) -ForegroundColor Yellow; exit 1 }
