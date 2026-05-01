# Safari ERP — clear local upload dirs after DB go-live purge (trial PDFs/JPEGs).
# Run on the SAME machine that hosts the API (paths must match NODE cwd / STATIC root).
#
# ⚠️  Review BEFORE running — this is irreversible outside backups.
#
# Usage (PowerShell, repo or deploy root):
#   .\scripts\go-live-clear-uploads.ps1
#
# Override root (defaults to .\uploads next to cwd):
#   $env:ERP_UPLOAD_ROOT = 'D:\apps\safari-erp\uploads'; .\scripts\go-live-clear-uploads.ps1

$ErrorActionPreference = 'Stop'
$root =
  if ($env:ERP_UPLOAD_ROOT -and ($env:ERP_UPLOAD_ROOT).Trim().Length -gt 0) {
    [System.IO.Path]::GetFullPath($env:ERP_UPLOAD_ROOT.Trim())
  } else {
    Join-Path (Split-Path $PSScriptRoot -Parent) 'uploads'
  }
if (-not (Test-Path -LiteralPath $root)) {
  Write-Host "No uploads folder at $root — nothing to delete (create uploads on first deploy or set ERP_UPLOAD_ROOT)." -ForegroundColor Yellow
  exit 0
}

# Known subtrees referenced in Nest (deps on multer/static); extend if you add storages.
$subdirs = @(
  'deposits'
  'deposit-slips'
  'bank-deposits'
  'handover-receipts'
  'executive-reports'
)
foreach ($d in $subdirs) {
  $full = Join-Path $root $d
  if (Test-Path -LiteralPath $full) {
    Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Cleared: $full"
  }
}

Write-Host 'Done. Re-create empty dirs with your deployment tool if needed.' -ForegroundColor Green
