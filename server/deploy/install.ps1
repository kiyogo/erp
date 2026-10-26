# ==============================================================================
# Kiyo Platform - 1-Click Self-Hosted Server Installer (Windows Server)
# ==============================================================================
$ErrorActionPreference = "Stop"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "        Kiyo Platform - Windows Server Self-Hosted Installer       " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan

$InstallDir = "C:\Kiyo"
$DataDir = "$InstallDir\data"
$StorageDir = "$DataDir\files"

Write-Host "[1/3] Creating directories in $InstallDir..." -ForegroundColor Yellow
if (!(Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir | Out-Null }
if (!(Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
if (!(Test-Path $StorageDir)) { New-Item -ItemType Directory -Path $StorageDir | Out-Null }

Write-Host "[2/3] Setting up configuration..." -ForegroundColor Yellow
$EnvPath = "$InstallDir\.env"
if (!(Test-Path $EnvPath)) {
    $RandomSecret = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 64 | ForEach-Object { [char]$_ })
    $AdminPass = "KiyoAdmin@" + (-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 8 | ForEach-Object { [char]$_ })) + "#"
    
    $EnvContent = @"
KIYO_API_HOST=0.0.0.0
KIYO_API_PORT=3001
KIYO_API_DB_PATH=$DataDir\kiyo.sqlite
KIYO_API_STORAGE_PATH=$StorageDir
KIYO_STATIC_DIR=$InstallDir\dist
KIYO_JWT_SECRET=$RandomSecret
KIYO_BOOTSTRAP_ADMIN_EMAIL=admin@kiyo.local
KIYO_BOOTSTRAP_ADMIN_PASSWORD=$AdminPass
"@
    Set-Content -Path $EnvPath -Value $EnvContent
    Write-Host "Generated new .env configuration file." -ForegroundColor Green
}

Write-Host "[3/3] Copying files..." -ForegroundColor Yellow
if (Test-Path ".\kiyo-server.exe") {
    Copy-Item -Path ".\kiyo-server.exe" -Destination "$InstallDir\kiyo-server.exe" -Force
}
if (Test-Path ".\dist") {
    Copy-Item -Path ".\dist" -Destination "$InstallDir\dist" -Recurse -Force
}

# Add Windows Firewall rule
try {
    netsh advfirewall firewall add rule name="Kiyo Server (Port 3001)" dir=in action=allow protocol=TCP localport=3001 | Out-Null
} catch {}

Write-Host "==================================================================" -ForegroundColor Green
Write-Host "  Kiyo Platform Server Prepared Successfully!                    " -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Green
Write-Host "  - To start manually: cd $InstallDir; .\kiyo-server.exe" -ForegroundColor Cyan
Write-Host "  - Local URL:         http://localhost:3001" -ForegroundColor Cyan
Write-Host "  - Default Admin:     admin@kiyo.local" -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Green
