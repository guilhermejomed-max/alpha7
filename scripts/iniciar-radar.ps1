$ErrorActionPreference = "Stop"
$projectDir = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:8787/"
$healthUrl = "http://127.0.0.1:8787/api/health"

function Test-Radar {
  try {
    $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    return $response.ok -eq $true
  } catch {
    return $false
  }
}

if (-not (Test-Radar)) {
  $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
  $nodeExe = if ($nodeCommand) {
    $nodeCommand.Source
  } else {
    Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  }

  if (-not (Test-Path -LiteralPath $nodeExe)) {
    Write-Host ""
    Write-Host "Node.js não foi encontrado." -ForegroundColor Red
    Write-Host "Instale Node.js 20 ou superior em https://nodejs.org/" -ForegroundColor Yellow
    exit 1
  }

  $logDir = Join-Path $env:LOCALAPPDATA "MexcSignalRadar"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  $stdout = Join-Path $logDir "server.log"
  $stderr = Join-Path $logDir "server-error.log"

  Start-Process `
    -FilePath $nodeExe `
    -ArgumentList "server/index.mjs" `
    -WorkingDirectory $projectDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr

  $started = $false
  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    Start-Sleep -Milliseconds 350
    if (Test-Radar) {
      $started = $true
      break
    }
  }

  if (-not $started) {
    Write-Host ""
    Write-Host "O servidor não iniciou." -ForegroundColor Red
    Write-Host "Consulte: $stderr" -ForegroundColor Yellow
    exit 1
  }
}

Start-Process $url
Write-Host "MEXC Signal Radar aberto em $url" -ForegroundColor Green
