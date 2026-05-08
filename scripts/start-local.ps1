param(
    [string]$WebPort = "5000",
    [string]$MlPort = "5001",
    [string]$DatabasePath = "diaricore.local.db",
    [string]$ModelId = "sseia/diari-core-mood"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$mlRoot = Join-Path $repoRoot "ml-service"
$activatePath = Join-Path $repoRoot ".venv\Scripts\Activate.ps1"
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
$webUrl = "http://127.0.0.1:$WebPort"
$mlPredictUrl = "http://127.0.0.1:$MlPort/predict"
$mlHealthUrl = "http://127.0.0.1:$MlPort/health"
$webHealthUrl = "http://127.0.0.1:$WebPort/api/health"

Write-Host "Starting DiariCore local services..."
Write-Host "Web: $webUrl"
Write-Host "ML:  $mlPredictUrl"
Write-Host "DB:  $DatabasePath"

$mlCommand = @"
cd '$mlRoot'
if (Test-Path '$activatePath') { . '$activatePath' }
`$env:PORT = '$MlPort'
`$env:HF_MODEL_ID = '$ModelId'
if (Test-Path '$venvPython') { & '$venvPython' app.py } elseif (Get-Command python -ErrorAction SilentlyContinue) { python app.py } elseif (Get-Command py -ErrorAction SilentlyContinue) { py -3 app.py } else { Write-Error 'Python runtime not found.'; exit 1 }
"@

$webCommand = @"
cd '$repoRoot'
if (Test-Path '$activatePath') { . '$activatePath' }
`$env:PORT = '$WebPort'
`$env:DATABASE_PATH = '$DatabasePath'
`$env:ML_API_URL = '$mlPredictUrl'
if (Test-Path '$venvPython') { & '$venvPython' app.py } elseif (Get-Command python -ErrorAction SilentlyContinue) { python app.py } elseif (Get-Command py -ErrorAction SilentlyContinue) { py -3 app.py } else { Write-Error 'Python runtime not found.'; exit 1 }
"@

Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $mlCommand | Out-Null
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $webCommand | Out-Null

function Test-HttpUp([string]$url, [int]$timeoutSec = 30) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }
    return $false
}

$mlUp = Test-HttpUp -url $mlHealthUrl -timeoutSec 35
$webUp = Test-HttpUp -url $webHealthUrl -timeoutSec 20

Write-Host ""
Write-Host "Launched both services in separate terminals."
Write-Host "If HF model is private, set HF_TOKEN in the ML terminal before running."
Write-Host "ML health:  $mlHealthUrl  => $mlUp"
Write-Host "Web health: $webHealthUrl => $webUp"
if (-not $mlUp) {
    Write-Host "ML service did not start. Check the ML terminal for errors (often missing HF_TOKEN or model download/load error)." -ForegroundColor Yellow
}
