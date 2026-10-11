# Local Gold Watch launcher for Windows 10/11 + Docker Desktop WSL2.
# No cloud account, payment method, broker order submission or router changes.
[CmdletBinding()]
param(
    [ValidateSet('Start','Stop','Status','Logs','Backup','Check')]
    [string]$Action = 'Start',
    [ValidateSet('Standard','Lite')]
    [string]$Mode = 'Standard',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = (Resolve-Path (Join-Path $ScriptRoot '..\..')).Path
$ComposeFile = Join-Path $ScriptRoot 'compose.yaml'
$EnvFile = Join-Path $ScriptRoot '.env'
$DataRoot = Join-Path $RepoRoot 'local-data'
$BackupRoot = Join-Path $RepoRoot 'local-backups'
$Url = 'http://127.0.0.1:3000'

function Say([string]$Message) {
    Write-Host "[Gold Watch] $Message"
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw 'Docker Desktop is missing. Install the free Docker Personal Desktop with WSL2, then launch Docker Desktop.'
    }
    & docker info --format '{{.OSType}}' 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Engine is not running. Start Docker Desktop and wait for Engine running.'
    }
    $osType = (& docker info --format '{{.OSType}}').Trim()
    if ($LASTEXITCODE -ne 0 -or $osType -ne 'linux') {
        throw 'Switch Docker Desktop to Linux containers (WSL2) before starting Gold Watch.'
    }
    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose v2 is unavailable.' }
}

function Invoke-Compose([string[]]$ComposeArguments) {
    $args = @('compose', '--project-directory', $ScriptRoot, '--env-file', $EnvFile, '-f', $ComposeFile)
    $args += $ComposeArguments
    & docker @args
    if ($LASTEXITCODE -ne 0) { throw "Docker Compose failed with exit code $LASTEXITCODE" }
}

function Prepare-Local {
    foreach ($name in @('web','ml','neural')) {
        $folder = Join-Path $DataRoot $name
        New-Item -Path $folder -ItemType Directory -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        Copy-Item -LiteralPath (Join-Path $ScriptRoot '.env.example') -Destination $EnvFile
        Say 'Created your local .env file. Keep any keys in this file private.'
    }
}

function Check-Resources {
    try {
        $totalGb = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB,1)
        if ($totalGb -lt 8) {
            Say "WARNING: $totalGb GB RAM. Standard mode may run out of memory; try Lite mode."
        } elseif ($totalGb -lt 16) {
            Say "$totalGb GB RAM detected. Close heavy apps while Docker builds; Lite mode uses less RAM."
        } else {
            Say "$totalGb GB RAM detected."
        }
    } catch {
        Say 'Could not check physical RAM; Docker Desktop recommends at least 8 GB.'
    }
    try {
        $driveRoot = [IO.Path]::GetPathRoot($RepoRoot)
        $drive = Get-PSDrive -Name ($driveRoot.Substring(0,1)) -ErrorAction Stop
        if ($drive.Free -lt 8GB) {
            Say 'WARNING: Less than 8 GB disk space free; Docker builds may fail.'
        }
    } catch { Say 'Disk space check was skipped.' }
}

function Check-Live {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/live" -TimeoutSec 8
        if ($response.StatusCode -eq 200) { Say "Website health OK: $Url" }
        else { Say "Website returned HTTP $($response.StatusCode)." }
    } catch {
        Say 'Website is not responding yet. Check Docker Desktop and run Status-GoldWatch.cmd.'
    }
}

function Stop-Containers {
    Invoke-Compose @('--profile','ml','down','--remove-orphans')
}

try {
    switch ($Action) {
        'Check' {
            Assert-Docker
            Prepare-Local
            Check-Resources
            Invoke-Compose @('config','--quiet')
            Say 'Docker, Compose and safe local configuration are ready.'
        }
        'Start' {
            Assert-Docker
            Prepare-Local
            Check-Resources
            if ($Mode -eq 'Lite') {
                # The empty process variable overrides the .env value, disabling ML.
                $env:ML_ENGINE_URL = ''
                Say 'Starting Lite: website + paper scalper (ML model disabled).'
                Invoke-Compose @('--profile','ml','stop','ml')
                Invoke-Compose @('up','-d','--build','web','worker','--remove-orphans')
            } else {
                Remove-Item Env:\ML_ENGINE_URL -ErrorAction SilentlyContinue
                Say 'Starting Standard: website + BTC ML + paper scalper.'
                Invoke-Compose @('--profile','ml','up','-d','--build','web','ml','worker','--remove-orphans')
            }
            Say "Open $Url"
            Check-Live
            if (-not $NoBrowser) { Start-Process $Url }
        }
        'Stop' {
            Assert-Docker
            Prepare-Local
            Stop-Containers
            Say 'Stopped. All saved data remains in local-data.'
        }
        'Status' {
            Assert-Docker
            Prepare-Local
            Invoke-Compose @('--profile','ml','ps')
            Check-Live
        }
        'Logs' {
            Assert-Docker
            Prepare-Local
            Invoke-Compose @('--profile','ml','logs','--tail','100','web','worker','ml')
        }
        'Backup' {
            # A consistent snapshot requires all writers to be stopped.
            Assert-Docker
            Prepare-Local
            Say 'Stopping local services to create a consistent, offline backup. Restart them afterward.'
            Stop-Containers
            New-Item -Path $BackupRoot -ItemType Directory -Force | Out-Null
            $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
            $backup = Join-Path $BackupRoot "gold-watch-$stamp.tar.gz"
            & tar.exe -czf $backup -C $DataRoot web ml neural
            if ($LASTEXITCODE -ne 0) { throw 'Local backup archive could not be created.' }
            $hash = Get-FileHash -Path $backup -Algorithm SHA256
            Say "Created archive: $backup"
            Say "SHA256: $($hash.Hash)"
            Say 'The local stack is STOPPED. Start it again with Start-GoldWatch.cmd.'
        }
    }
    exit 0
} catch {
    Write-Host "[Gold Watch] ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'See deploy\windows\README.md for installation and troubleshooting.' -ForegroundColor Yellow
    exit 1
}
