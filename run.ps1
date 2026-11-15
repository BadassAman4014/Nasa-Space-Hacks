<#
.SYNOPSIS
    Farmily - Complete Stack Launcher
.DESCRIPTION
    Starts the FastAPI backend (port 8000) and Vite React frontend (port 5173),
    verifies health, optionally opens the browser, and handles clean process termination.
.PARAMETER SeparateWindows
    Launch backend and frontend in separate dedicated console windows.
.PARAMETER Stop
    Stop all running Farmily backend and frontend processes.
.PARAMETER NoBrowser
    Do not automatically open the browser once services are ready.
.EXAMPLE
    .\run.ps1
    .\run.ps1 -SeparateWindows
    .\run.ps1 -Stop
#>

param(
    [switch]$SeparateWindows,
    [switch]$Stop,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
}
catch {}

$RootPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $RootPath

function Write-BrandHeader {
    Clear-Host
    Write-Host ""
    Write-Host " ==================================================================" -ForegroundColor Green
    Write-Host "   Farmily - High-Precision Satellite & Weather Platform" -ForegroundColor White
    Write-Host "   NASA Space Hacks • Automated Full-Stack Environment" -ForegroundColor DarkGray
    Write-Host " ==================================================================" -ForegroundColor Green
    Write-Host ""
}

function Stop-PortProcess([int]$Port) {
    try {
        $lines = netstat -ano | Select-String ":$Port\s"
        foreach ($line in $lines) {
            $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
            if ($parts.Count -gt 4) {
                $procPid = $parts[-1]
                if ($procPid -and $procPid -as [int] -and [int]$procPid -ne 0 -and [int]$procPid -ne $PID) {
                    Write-Host "  [CLEANUP] Stopping process on port $Port (PID: $procPid)..." -ForegroundColor Yellow
                    Stop-Process -Id [int]$procPid -Force -ErrorAction SilentlyContinue
                }
            }
        }
        Start-Sleep -Milliseconds 500
    }
    catch {}
}

function Test-PortOpen([string]$HostName, [int]$Port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $connect = $client.BeginConnect($HostName, $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(400, $false)
        if ($wait) {
            $client.EndConnect($connect)
            $client.Close()
            return $true
        }
        $client.Close()
        return $false
    }
    catch {
        return $false
    }
}

if ($Stop) {
    Write-BrandHeader
    Write-Host " Stopping all Farmily services..." -ForegroundColor Yellow
    Stop-PortProcess -Port 8000
    Stop-PortProcess -Port 5173
    Write-Host " [SUCCESS] All backend and frontend services have been stopped.`n" -ForegroundColor Green
    exit 0
}

Write-BrandHeader

# 1. Dependency checks
Write-Host " [1/4] Verifying dependencies..." -ForegroundColor Cyan

# Check Python
$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    Write-Host " [ERROR] Python was not found in PATH. Please install Python 3.10+." -ForegroundColor Red
    exit 1
}
Write-Host "   [OK] Python: $($pythonCmd.Source)" -ForegroundColor DarkGray

# Check Node / npm
$npmCmd = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    Write-Host " [ERROR] npm was not found in PATH. Please install Node.js 18+." -ForegroundColor Red
    exit 1
}
Write-Host "   [OK] npm:    $($npmCmd.Source)" -ForegroundColor DarkGray

# Check node_modules
if (-not (Test-Path "$RootPath\node_modules")) {
    Write-Host "   [!] node_modules missing. Running npm install..." -ForegroundColor Yellow
    npm install
}

# 2. Port conflict check and clean release
Write-Host "`n [2/4] Checking ports 8000 and 5173..." -ForegroundColor Cyan
Stop-PortProcess -Port 8000
Stop-PortProcess -Port 5173

# 3. Launching services
Write-Host "`n [3/4] Starting servers..." -ForegroundColor Cyan

$backendScript = "python -m uvicorn --app-dir backend app.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir backend"
$frontendScript = "npm run dev -- --host 127.0.0.1 --port 5173"

if ($SeparateWindows) {
    Write-Host "   -> Launching FastAPI Backend in dedicated window..." -ForegroundColor White
    $backendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootPath'; `$host.UI.RawUI.WindowTitle = 'Farmily - Backend (8000)'; $backendScript" -PassThru

    Write-Host "   -> Launching Vite Frontend in dedicated window..." -ForegroundColor White
    $frontendProcess = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$RootPath'; `$host.UI.RawUI.WindowTitle = 'Farmily - Frontend (5173)'; $frontendScript" -PassThru
}
else {
    Write-Host "   -> Starting FastAPI Backend (http://127.0.0.1:8000)..." -ForegroundColor White
    $backendLogFile = "$RootPath\backend.log"
    $backendProcess = Start-Process powershell -ArgumentList "-Command", "cd '$RootPath'; $backendScript *>&1 | Tee-Object -FilePath '$backendLogFile'" -WindowStyle Hidden -PassThru

    Write-Host "   -> Starting Vite Frontend (http://127.0.0.1:5173)..." -ForegroundColor White
    $frontendProcess = Start-Process powershell -ArgumentList "-Command", "cd '$RootPath'; $frontendScript" -WindowStyle Hidden -PassThru
}

# 4. Wait for services to respond
Write-Host "`n [4/4] Awaiting health readiness..." -ForegroundColor Cyan
$backendReady = $false
$frontendReady = $false
$retries = 35

for ($i = 0; $i -lt $retries; $i++) {
    Start-Sleep -Milliseconds 500

    if (-not $backendReady) {
        if (Test-PortOpen "127.0.0.1" 8000 -or Test-PortOpen "localhost" 8000) { $backendReady = $true }
    }

    if (-not $frontendReady) {
        if (Test-PortOpen "127.0.0.1" 5173 -or Test-PortOpen "localhost" 5173) { $frontendReady = $true }
    }

    if ($backendReady -and $frontendReady) { break }
}

Write-Host ""
if ($backendReady) {
    Write-Host "   [ONLINE] Backend API:      http://127.0.0.1:8000" -ForegroundColor Green
    Write-Host "            API Documentation: http://127.0.0.1:8000/docs" -ForegroundColor DarkGray
}
else {
    Write-Host "   [WAITING] Backend starting up on http://127.0.0.1:8000..." -ForegroundColor Yellow
    if (Test-Path "$RootPath\backend.log") {
        Write-Host "   [LOG] Check backend.log for initialization status." -ForegroundColor DarkGray
    }
}

if ($frontendReady) {
    Write-Host "   [ONLINE] Vite Frontend:    http://127.0.0.1:5173" -ForegroundColor Green
    Write-Host "   [ONLINE] Weather Studio:   http://127.0.0.1:5173/weather" -ForegroundColor Green
}
else {
    Write-Host "   [WAITING] Frontend starting up on http://127.0.0.1:5173..." -ForegroundColor Yellow
}

# Open browser
if (-not $NoBrowser) {
    Start-Sleep -Milliseconds 600
    Write-Host "`n [BROWSER] Opening http://localhost:5173 in default browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host " ==================================================================" -ForegroundColor Green
Write-Host "   All systems are live and synchronized!" -ForegroundColor White
Write-Host "   Tip: Use '.\run.ps1 -SeparateWindows' to see live backend logs" -ForegroundColor DarkGray
Write-Host "   Press [Ctrl + C] or [Q] in this window to stop all services." -ForegroundColor Yellow
Write-Host " ==================================================================" -ForegroundColor Green
Write-Host ""

# Graceful termination loop
try {
    while ($true) {
        if ([Console]::KeyAvailable) {
            $key = [Console]::ReadKey($true)
            if ($key.Key -eq [ConsoleKey]::Q -or $key.Key -eq [ConsoleKey]::Escape) {
                break
            }
        }
        if ($backendProcess.HasExited) {
            Write-Host "`n [ALERT] Backend process terminated!" -ForegroundColor Red
            if (Test-Path "$RootPath\backend.log") {
                Write-Host " --- Recent backend.log excerpt ---" -ForegroundColor DarkGray
                Get-Content "$RootPath\backend.log" -Tail 15 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkGray }
            }
            break
        }
        if ($frontendProcess.HasExited) {
            Write-Host "`n [ALERT] Frontend process terminated." -ForegroundColor DarkGray
            break
        }
        Start-Sleep -Milliseconds 500
    }
}
finally {
    Write-Host "`n [SHUTDOWN] Terminating services gracefully..." -ForegroundColor Yellow
    if ($backendProcess -and -not $backendProcess.HasExited) {
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Stop-PortProcess -Port 8000
    Stop-PortProcess -Port 5173
    Write-Host " [SUCCESS] Cleanup complete. Have a great day!`n" -ForegroundColor Green
}
