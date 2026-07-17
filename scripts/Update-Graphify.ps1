[CmdletBinding()]
param(
    [switch]$CodeOnlyIncremental,
    [switch]$CodeOnly
)

$previousPreference = $ErrorActionPreference
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
& (Join-Path $PSScriptRoot 'Export-InlineScripts.ps1')

$bin = (& uv tool dir --bin).Trim()
$graphify = Join-Path $bin 'graphify.exe'
if (-not (Test-Path -LiteralPath $graphify)) {
    throw "No se encontró Graphify en $graphify"
}

$ErrorActionPreference = 'Continue'
$version = (& $graphify --version 2>&1 | Out-String)
$versionCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($versionCode -ne 0 -or $version -notmatch '0\.9\.16') {
    throw 'Se requiere Graphify 0.9.16 instalado por uv.'
}

$gitignorePath = Join-Path $root '.gitignore'
$gitignoreOriginal = [System.IO.File]::ReadAllText($gitignorePath)
$gitignoreForExtraction = [regex]::Replace($gitignoreOriginal, '(?m)^graphify-src/\r?\n?', '')
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

Push-Location $root
try {
    if ($gitignoreForExtraction -ne $gitignoreOriginal) {
        [System.IO.File]::WriteAllText($gitignorePath, $gitignoreForExtraction, $utf8NoBom)
    }
    $ErrorActionPreference = 'Continue'
    $sourceDirectory = Join-Path $root 'graphify-src'
    & $graphify extract $sourceDirectory --out $root --code-only
    $extractCode = $LASTEXITCODE
    if ($extractCode -eq 0) {
        & $graphify cluster-only $root --no-label
    }
    $code = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($code -ne 0) {
        throw "Graphify terminó con código $code."
    }
}
finally {
    [System.IO.File]::WriteAllText($gitignorePath, $gitignoreOriginal, $utf8NoBom)
    $ErrorActionPreference = $previousPreference
    Pop-Location
}
