# V19.9.7 — Safari ERP safety check
#
# Two modes:
#   * `precommit` (default when invoked by git pre-commit hook)
#     - Only BLOCKS the commit if TypeScript typecheck fails on a project
#       whose files are in the staged set. Everything else is warning-only.
#     - Skips entirely if no `.ts`, `.tsx`, or `.prisma` file is staged.
#     - Emergency bypass: `git commit --no-verify`.
#
#   * `full` (run manually: `pwsh scripts/safety-check.ps1 full`)
#     - Runs every check (typecheck + prisma validate + nav/i18n/role audit)
#       and prints a report. Never changes files. Never blocks a commit.
#
# Design rule: this script must NEVER modify the repo. Read-only checks only.

param(
    [ValidateSet('precommit', 'full')]
    [string]$Mode = 'precommit'
)

# NOTE: we intentionally do NOT set `$ErrorActionPreference = 'Stop'` because
# some Node CLIs (Prisma) write informational lines to stderr even on success
# and PowerShell would otherwise treat those as terminating errors. We rely
# on `$LASTEXITCODE` after each native command instead.
Set-Location -Path (Join-Path $PSScriptRoot '..')

$script:BlockingFailures = @()
$script:Warnings = @()

function Write-Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Record-Fail($msg) {
    $script:BlockingFailures += $msg
    Write-Host "  [FAIL] $msg" -ForegroundColor Red
}

function Record-Warn($msg) {
    $script:Warnings += $msg
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

function Record-Ok($msg) {
    Write-Host "  [OK]   $msg" -ForegroundColor Green
}

# ─── 1. Figure out what's staged (precommit only) ───────────────────────
$stagedFiles = @()
if ($Mode -eq 'precommit') {
    $stagedFiles = git diff --cached --name-only --diff-filter=ACMR 2>$null
    if ($LASTEXITCODE -ne 0) { $stagedFiles = @() }
    $codeStaged = @($stagedFiles | Where-Object {
        $_ -match '\.(ts|tsx|prisma)$'
    })
    if ($codeStaged.Count -eq 0) {
        Write-Host "safety-check: no code files staged, skipping." -ForegroundColor DarkGray
        exit 0
    }
    Write-Section "Pre-commit safety check ($($codeStaged.Count) code files staged)"
} else {
    Write-Section 'Safari ERP full safety audit'
}

# ─── 2. Typecheck (blocking) ────────────────────────────────────────────
$needBackend  = $true
$needFrontend = $true
if ($Mode -eq 'precommit') {
    $needBackend  = [bool](@($stagedFiles | Where-Object { $_ -match '^(src|prisma)/.*\.(ts|prisma)$' }).Count)
    $needFrontend = [bool](@($stagedFiles | Where-Object { $_ -match '^web/.*\.(ts|tsx)$'          }).Count)
}

if ($needBackend) {
    Write-Section 'Backend TypeScript typecheck'
    $beOut = & npx --no-install tsc -p tsconfig.build.json --noEmit 2>&1
    if ($LASTEXITCODE -ne 0) {
        Record-Fail "Backend tsc reported errors:"
        $beOut | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
    } else {
        Record-Ok 'Backend typecheck clean'
    }
}

if ($needFrontend) {
    Write-Section 'Frontend TypeScript typecheck'
    Push-Location web
    try {
        $feOut = & npx --no-install tsc -p tsconfig.app.json --noEmit 2>&1
        if ($LASTEXITCODE -ne 0) {
            Record-Fail "Frontend tsc reported errors:"
            $feOut | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
        } else {
            Record-Ok 'Frontend typecheck clean'
        }
    } finally {
        Pop-Location
    }
}

# ─── 3. Prisma schema (blocking if schema touched) ──────────────────────
$prismaTouched = $true
if ($Mode -eq 'precommit') {
    $prismaTouched = [bool](@($stagedFiles | Where-Object { $_ -match '^prisma/.*\.prisma$' }).Count)
}
if ($prismaTouched) {
    Write-Section 'Prisma schema validation'
    # Redirect stderr into the pipeline so it's captured as text.
    $prismaOut = & npx --no-install prisma validate 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        Record-Fail "Prisma schema invalid:"
        $prismaOut | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkRed }
    } else {
        Record-Ok 'Prisma schema valid'
    }
}

# ─── 4. WARNING-ONLY checks (always run in `full`, best-effort in precommit) ──
if ($Mode -eq 'full' -or $needFrontend) {
    Write-Section 'Nav / i18n consistency (warning-only)'

    $navItemsPath = 'web/src/modules/shared/nav/nav-items.ts'
    if (Test-Path $navItemsPath) {
        $navKeys = @(Select-String -Path $navItemsPath -Pattern "labelKey: 'nav\.([a-zA-Z]+)'" | ForEach-Object { $_.Matches.Groups[1].Value } | Sort-Object -Unique)
        foreach ($locale in @('ar', 'en')) {
            $localePath = "web/src/i18n/locales/$locale.ts"
            if (-not (Test-Path $localePath)) { continue }
            $content = Get-Content $localePath -Raw -Encoding UTF8
            $missing = @()
            foreach ($k in $navKeys) {
                if ($content -notmatch "(?m)^\s*$k\s*:") { $missing += $k }
            }
            if ($missing.Count -gt 0) {
                Record-Warn "Locale '$locale' missing nav keys: $($missing -join ', ')"
            } else {
                Record-Ok "Locale '$locale' nav keys complete"
            }
        }

        # Every nav target must resolve to an App.tsx route. We check the last
        # segment against any `path="..."` in App.tsx (nested routes use
        # relative paths so matching the full /a/b would produce false
        # positives). Warning-only: new sidebar entries sometimes land before
        # the route commit, we just want visibility.
        $tos = @(Select-String -Path $navItemsPath -Pattern "to: '([^']+)'" | ForEach-Object { $_.Matches.Groups[1].Value } | Sort-Object -Unique)
        $appContent = Get-Content 'web/src/App.tsx' -Raw -Encoding UTF8
        $noRoute = @()
        foreach ($t in $tos) {
            $p = $t.TrimStart('/')
            if ($p -eq '') { continue }
            $segments = $p -split '/'
            $lastSeg  = [regex]::Escape($segments[-1])
            $firstSeg = [regex]::Escape($segments[0])
            if ($appContent -notmatch "path=`"[^`"]*$lastSeg[`"/]" -and $appContent -notmatch "path=`"$firstSeg") {
                $noRoute += $t
            }
        }
        if ($noRoute.Count -gt 0) {
            Record-Warn "Nav entries without matching App.tsx route: $($noRoute -join ', ')"
        } else {
            Record-Ok 'Every nav target has a matching route'
        }
    }
}

# ─── 5. Role consistency audit (full mode only) ─────────────────────────
if ($Mode -eq 'full') {
    Write-Section 'Role consistency (FLEET_SUPERVISOR / CALL_CENTER_SUPERVISOR)'
    $rolesToCheck = @('FLEET_SUPERVISOR', 'CALL_CENTER_SUPERVISOR')
    $filesToCheck = @(
        'prisma/schema.prisma',
        'prisma/seed.ts',
        'src/main.ts',
        'src/auth/auth.service.ts',
        'src/users/dto/create-user.dto.ts',
        'web/src/lib/api.ts',
        'web/src/modules/shared/auth/access-matrix.ts',
        'web/src/modules/shared/nav/resolve-sidebar-nav.ts',
        'web/src/modules/shared/shell/resolve-shell-guidance.ts',
        'web/src/modules/shared/reactors/StaffControlReactor.tsx'
    )
    foreach ($role in $rolesToCheck) {
        $missingIn = @()
        foreach ($f in $filesToCheck) {
            if (-not (Test-Path $f)) { continue }
            $content = Get-Content $f -Raw -Encoding UTF8
            if ($content -notmatch [regex]::Escape($role)) { $missingIn += $f }
        }
        if ($missingIn.Count -gt 0) {
            Record-Warn "Role $role not referenced in: $($missingIn -join ', ')"
        } else {
            Record-Ok "Role $role wired in all critical files"
        }
    }
}

# ─── 6. Summary ─────────────────────────────────────────────────────────
Write-Section 'Summary'
$failColor = if ($script:BlockingFailures.Count -gt 0) { 'Red' }    else { 'Green' }
$warnColor = if ($script:Warnings.Count         -gt 0) { 'Yellow' } else { 'Green' }
Write-Host ("  Failures : {0}" -f $script:BlockingFailures.Count) -ForegroundColor $failColor
Write-Host ("  Warnings : {0}" -f $script:Warnings.Count)         -ForegroundColor $warnColor

if ($script:BlockingFailures.Count -gt 0) {
    Write-Host ""
    Write-Host "COMMIT BLOCKED. Fix the typecheck errors above or override with: git commit --no-verify" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Safety check passed." -ForegroundColor Green
exit 0
