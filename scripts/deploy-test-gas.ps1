param([string]$Description = 'Test environment update')
$ErrorActionPreference = 'Stop'
$molRepoRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $molRepoRoot
try {
    $molTarget = Get-Content -LiteralPath '.gas-test-env.json' -Raw | ConvertFrom-Json
    $molClasp = Get-Content -LiteralPath '.clasp.json' -Raw | ConvertFrom-Json
    if ($molTarget.environment -ne 'test' -or !$molTarget.scriptId -or
        !$molTarget.deploymentId -or $molTarget.scriptId -ne $molClasp.scriptId) {
        throw 'Test environment and clasp target do not match.'
    }
    $molExpectedIgnore = @('**/**', '!Code.gs', '!Student.html', '!Monitor.html', '!appsscript.json')
    $molActualIgnore = @(Get-Content -LiteralPath '.claspignore' | Where-Object { $_.Trim() -ne '' })
    if (($molActualIgnore -join "`n") -cne ($molExpectedIgnore -join "`n")) {
        throw 'Unexpected clasp upload allowlist. Review .claspignore before deploying.'
    }
    if ($molClasp.rootDir -ne '.') { throw 'Expected clasp rootDir to be the repository root.' }
    & npm.cmd test
    if ($LASTEXITCODE -ne 0) { throw 'Tests failed. GAS was not changed.' }
    & clasp.cmd push --force
    if ($LASTEXITCODE -ne 0) { throw 'GAS source push failed. Web app was not updated.' }
    & clasp.cmd redeploy $molTarget.deploymentId --description $Description
    if ($LASTEXITCODE -ne 0) { throw 'Web app update failed. Source was pushed; inspect deployment before retrying.' }
    Write-Output 'Open MONITOR_URL in the settings sheet for the authenticated teacher monitor.'
    Write-Output 'Open TEST_STUDENT_URL in the settings sheet for browser verification.'
} finally {
    Pop-Location
}
