$ErrorActionPreference = "Stop"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    $_.CommandLine -like "*server/index.mjs*"
  }

if (-not $processes) {
  Write-Host "O MEXC Signal Radar já está parado." -ForegroundColor Yellow
  exit 0
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
}

Write-Host "MEXC Signal Radar encerrado." -ForegroundColor Green
