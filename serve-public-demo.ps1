<#
.SYNOPSIS
    Starts Farmily locally and shares it through a public ngrok endpoint.
.DESCRIPTION
    Starts only the local services that are not already healthy. The frontend is exposed
    through ngrok; its /api requests continue to proxy to the local FastAPI backend.
.EXAMPLE
    .\serve-public-demo.ps1
#>

[CmdletBinding()]
param(
    [switch]$KeepLocalServices
)

$ErrorActionPreference = 'Stop'
$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendProcess = $null
$FrontendProcess = $null
$TunnelProcess = $null
$LogRoot = Join-Path $env:TEMP 'farmily-public-demo-logs'

function Test-Endpoint {
    param([Parameter(Mandatory)][string]$Uri)
    try {
        $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    }
    catch {
        return $false
    }
}

function Wait-Endpoint {
    param(
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$Name,
        [int]$TimeoutSeconds = 45
    )
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if (Test-Endpoint -Uri $Uri) {
            Write-Host "[ready] $Name" -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 1
    }
    throw "$Name did not become ready at $Uri. Check the logs in $LogRoot."
}

function Stop-OwnedProcess {
    param($Process, [string]$Name)
    if ($null -eq $Process) { return }
    try {
        if (-not $Process.HasExited) {
            $TaskKill = Get-Command taskkill.exe -ErrorAction SilentlyContinue
            if ($TaskKill) {
                & $TaskKill.Source /PID $Process.Id /T /F *> $null
            }
            else {
                Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
            }
            Write-Host "Stopped $Name (started by this script)." -ForegroundColor DarkGray
        }
    }
    catch { }
}

$NgrokCommand = Get-Command ngrok -ErrorAction SilentlyContinue
$NgrokPath = if ($NgrokCommand) { $NgrokCommand.Source } else { $null }
if (-not $NgrokPath) {
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\ngrok.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe'),
        (Join-Path $env:ProgramFiles 'ngrok\ngrok.exe')
    )) {
        if (Test-Path -LiteralPath $candidate) { $NgrokPath = $candidate; break }
    }
}
if (-not $NgrokPath) {
    Write-Host 'ngrok is required to create the public endpoint.' -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        $install = Read-Host 'Install ngrok from Microsoft Store with winget now? (Y/N)'
        if ($install -match '^(y|yes)$') {
            & winget install ngrok -s msstore --accept-package-agreements --accept-source-agreements
            $WingetExitCode = $LASTEXITCODE
            $NgrokCommand = Get-Command ngrok -ErrorAction SilentlyContinue
            if ($NgrokCommand) { $NgrokPath = $NgrokCommand.Source }
            if (-not $NgrokPath) {
                foreach ($candidate in @(
                    (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\ngrok.exe'),
                    (Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ngrok.exe'),
                    (Join-Path $env:ProgramFiles 'ngrok\ngrok.exe')
                )) {
                    if (Test-Path -LiteralPath $candidate) { $NgrokPath = $candidate; break }
                }
            }
            if (-not $NgrokPath -and $WingetExitCode -ne 0) {
                throw 'ngrok installation failed. Install ngrok, reopen PowerShell, and run this script again.'
            }
        }
    }
    if (-not $NgrokPath) {
        throw 'Install ngrok from https://ngrok.com/download/windows and run this script again.'
    }
}

New-Item -ItemType Directory -Path $LogRoot -Force | Out-Null
$BackendLog = Join-Path $LogRoot 'backend.log'
$BackendErrorLog = Join-Path $LogRoot 'backend-error.log'
$FrontendLog = Join-Path $LogRoot 'frontend.log'
$FrontendErrorLog = Join-Path $LogRoot 'frontend-error.log'

try {
    if (-not (Test-Endpoint -Uri 'http://127.0.0.1:8000/health')) {
        $Python = Get-Command python -ErrorAction SilentlyContinue
        if (-not $Python) { throw 'Python was not found in PATH. Start the backend manually or install Python 3.10+.' }
        Write-Host 'Starting FastAPI on 127.0.0.1:8000...' -ForegroundColor Cyan
        $BackendProcess = Start-Process -FilePath $Python.Source `
            -ArgumentList @('-m', 'uvicorn', '--app-dir', 'backend', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
            -WorkingDirectory $RootPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $BackendLog -RedirectStandardError $BackendErrorLog
    }
    else {
        Write-Host '[ready] Existing FastAPI backend' -ForegroundColor Green
    }
    Wait-Endpoint -Uri 'http://127.0.0.1:8000/health' -Name 'FastAPI backend'

    if (-not (Test-Endpoint -Uri 'http://127.0.0.1:5173/')) {
        $Node = Get-Command node.exe -ErrorAction SilentlyContinue
        if (-not $Node) { throw 'Node.js was not found in PATH. Start the frontend manually or install Node.js.' }
        $NpmCmd = Join-Path (Split-Path -Parent $Node.Source) 'npm.cmd'
        if (-not (Test-Path -LiteralPath $NpmCmd)) { throw "npm.cmd was not found beside Node.js at $NpmCmd" }
        Write-Host 'Starting Vite on 127.0.0.1:5173...' -ForegroundColor Cyan
        $FrontendProcess = Start-Process -FilePath $NpmCmd `
            -ArgumentList @('run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173') `
            -WorkingDirectory $RootPath -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $FrontendLog -RedirectStandardError $FrontendErrorLog
    }
    else {
        Write-Host '[ready] Existing Vite frontend' -ForegroundColor Green
    }
    Wait-Endpoint -Uri 'http://127.0.0.1:5173/' -Name 'Vite frontend'
    Wait-Endpoint -Uri 'http://127.0.0.1:5173/api/health' -Name 'Frontend-to-backend API proxy'

    $NgrokDomain = 'https://guiding-spendable-spinal.ngrok-free.dev'
    Write-Host ''
    Write-Host "Starting the public ngrok endpoint at $NgrokDomain..." -ForegroundColor Green
    Write-Host 'Keep this window and this PC running while visitors use the demo. Press Ctrl+C to stop the tunnel.' -ForegroundColor Yellow
    Write-Host ''
    & $NgrokPath http 5173 --url $NgrokDomain
}
finally {
    if ($TunnelProcess) { Stop-OwnedProcess -Process $TunnelProcess -Name 'ngrok endpoint' }
    if (-not $KeepLocalServices) {
        Stop-OwnedProcess -Process $FrontendProcess -Name 'Vite frontend'
        Stop-OwnedProcess -Process $BackendProcess -Name 'FastAPI backend'
    }
    else {
        Write-Host 'Local services were left running (-KeepLocalServices).' -ForegroundColor DarkGray
    }
}
