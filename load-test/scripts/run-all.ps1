<#
 .SYNOPSIS
   Safari-ERP end-to-end load test orchestrator.

 .DESCRIPTION
   1. Pre-flight: backend reachable on :3001, DB monitor started.
   2. Stage A: Driver-concurrency (50 -> 1000 VUs).
   3. Reconcile after stage A.
   4. Stage B: Invoice-throughput (100 -> 2000 inv/min).
   5. Reconcile after stage B.
   6. Generate summary report.
#>
param(
  [int]$BackendPort = 3001
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$reports = Join-Path $root 'reports'
New-Item -ItemType Directory -Force -Path $reports | Out-Null

function Step($msg) { Write-Host "`n==>" $msg -ForegroundColor Cyan }

Step "Preflight backend health"
try {
  $h = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:$BackendPort/api/health" -TimeoutSec 5
  Write-Host "   health=$($h.StatusCode) OK"
} catch {
  Write-Host "   backend NOT reachable on :$BackendPort - aborting." -ForegroundColor Red
  exit 1
}

Step "Pre-run reconciliation (baseline)"
& npx --yes tsx "$root/scripts/reconcile.ts" baseline | Out-Host

Step "Starting background DB monitor (2s)"
$env:DATABASE_URL = 'postgresql://postgres@localhost:5432/safari_loadtest'
$monitorOut = Join-Path $reports 'db-monitor.jsonl'
Remove-Item $monitorOut -ErrorAction SilentlyContinue
$monitor = Start-Process -PassThru -WindowStyle Hidden -FilePath 'npx.cmd' `
  -ArgumentList '--yes','tsx',"$root/scripts/db-monitor.ts",$monitorOut,'2000' `
  -RedirectStandardOutput (Join-Path $reports 'db-monitor.stdout.log') `
  -RedirectStandardError  (Join-Path $reports 'db-monitor.stderr.log')
Write-Host "   monitor pid=$($monitor.Id)"

try {
  Step "STAGE A: driver-concurrency (50 to 1000 VUs)"
  & npx --yes --package=artillery@2.0.30 artillery run `
      --output (Join-Path $reports 'stage-a.json') `
      "$root/scenarios/drivers-concurrent.yml" 2>&1 | Tee-Object -FilePath (Join-Path $reports 'stage-a.stdout.log') | Out-Host
  & npx --yes tsx "$root/scripts/reconcile.ts" after-stage-a | Out-Host

  Step "STAGE B: invoice-throughput (100 to 2000 inv/min)"
  & npx --yes --package=artillery@2.0.30 artillery run `
      --output (Join-Path $reports 'stage-b.json') `
      "$root/scenarios/invoices-throughput.yml" 2>&1 | Tee-Object -FilePath (Join-Path $reports 'stage-b.stdout.log') | Out-Host
  & npx --yes tsx "$root/scripts/reconcile.ts" after-stage-b | Out-Host
}
finally {
  Step "Stopping DB monitor"
  Stop-Process -Id $monitor.Id -Force -ErrorAction SilentlyContinue
}

Step "Generating capacity report"
& npx --yes tsx "$root/scripts/generate-report.ts" | Out-Host

Step "DONE - see load-test/reports/capacity-report.md"
