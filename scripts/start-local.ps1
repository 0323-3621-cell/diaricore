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
$webUrl = "http://127.0.0.1:$WebPort"
$mlPredictUrl = "http://127.0.0.1:$MlPort/predict"

Write-Host "Starting DiariCore local services..."
Write-Host "Web: $webUrl"
Write-Host "ML:  $mlPredictUrl"
Write-Host "DB:  $DatabasePath"

$mlCommand = @"
cd '$mlRoot'
if (Test-Path '$activatePath') { . '$activatePath' }
`$env:PORT = '$MlPort'
`$env:HF_MODEL_ID = '$ModelId'
py -3 app.py
"@

$webCommand = @"
cd '$repoRoot'
if (Test-Path '$activatePath') { . '$activatePath' }
`$env:PORT = '$WebPort'
`$env:DATABASE_PATH = '$DatabasePath'
`$env:ML_API_URL = '$mlPredictUrl'
py -3 app.py
"@

Start-Process powershell -ArgumentList "-NoExit", "-Command", $mlCommand | Out-Null
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", $webCommand | Out-Null

Write-Host ""
Write-Host "Launched both services in separate terminals."
Write-Host "If HF model is private, set HF_TOKEN in the ML terminal before running."
