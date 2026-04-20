<#
.SYNOPSIS
    Canary V1 smoke-test harness for Safari-ERP staging.

.DESCRIPTION
    Runs the automatable subset of tests/canary-results.md section 1
    (Smoke) and seeds data for section 2 (RBAC). The script is
    read-only against the DB -- it does NOT perform deletes, POS
    checkouts or cron triggers. Those live in the results sheet as
    manual steps because they mutate state we would have to roll back
    by hand.

    Every check prints PASS/FAIL and accumulates into a summary at the
    end. Exit code = number of failed checks, so you can gate CI on it.

.EXAMPLE
    powershell -File .\scripts\canary-smoke.ps1 `
        -BaseUrl http://localhost:3000 `
        -Owner owner@test:secret `
        -Gm gm@test:secret `
        -Accountant accountant@test:secret `
        -Manager manager@test:secret `
        -Driver driver@test:secret `
        -CallCenter cc@test:secret

.PARAMETER BaseUrl
    Base URL of the Nest API. Default http://localhost:3000.

.PARAMETER Owner / Gm / Accountant / Manager / Driver / CallCenter
    Credentials in 'username:password' form. Any role you omit is
    skipped with a WARN.

.NOTES
    - Works on Windows PowerShell 5.1 and PowerShell 7 (pwsh).
    - ASCII-only (no box-drawing or em-dashes) so PS 5.1 can parse it
      even when the file is saved as UTF-8 without BOM.
    - Does not depend on curl or jq.
    - Does not read or export secrets to disk.
#>

[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:3000',
    [string]$Owner,
    [string]$Gm,
    [string]$Accountant,
    [string]$Manager,
    [string]$Driver,
    [string]$CallCenter,
    [string]$PayslipId,
    [string]$LeaveId,
    [string]$LoanId
)

$ErrorActionPreference = 'Stop'
$script:results = [System.Collections.Generic.List[object]]::new()

function Record {
    param(
        [string]$Id,
        [string]$Label,
        [ValidateSet('PASS', 'FAIL', 'WARN', 'SKIP')]
        [string]$Status,
        [string]$Detail = ''
    )
    $row = [pscustomobject]@{
        Id = $Id; Label = $Label; Status = $Status; Detail = $Detail
    }
    $script:results.Add($row)
    $color = switch ($Status) {
        'PASS' { 'Green' }
        'FAIL' { 'Red' }
        'WARN' { 'Yellow' }
        'SKIP' { 'DarkGray' }
    }
    Write-Host ("[{0}] {1}  {2}" -f $Status.PadRight(4), $Id, $Label) -ForegroundColor $color
    if ($Detail) { Write-Host "       $Detail" -ForegroundColor DarkGray }
}

function Split-Cred {
    param([string]$Raw)
    if (-not $Raw) { return $null }
    $parts = $Raw -split ':', 2
    if ($parts.Count -ne 2) { throw "Credential '$Raw' must be username:password" }
    [pscustomobject]@{ User = $parts[0]; Pass = $parts[1] }
}

function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers = @{},
        [object]$Body
    )
    $uri = "$BaseUrl$Path"
    $params = @{
        Method          = $Method
        Uri             = $uri
        Headers         = $Headers
        UseBasicParsing = $true
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $params.ContentType = 'application/json'
        $params.Body = ($Body | ConvertTo-Json -Depth 6 -Compress)
    }
    # PS 7 has -SkipHttpErrorCheck; PS 5.1 throws on non-2xx. Unify the
    # behaviour by catching WebException and synthesising a response
    # shape the rest of the script can read (StatusCode + Content).
    try {
        return Invoke-WebRequest @params
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if (-not $resp) { throw }
        $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $content = $sr.ReadToEnd()
        [pscustomobject]@{
            StatusCode = [int]$resp.StatusCode
            Content    = $content
        }
    }
}

Write-Host "=== Safari-ERP Canary smoke -- base=$BaseUrl ===" -ForegroundColor Cyan

# --- S1. Backend health ---------------------------------------------
try {
    $r = Invoke-Api -Method GET -Path '/api/health'
    if ($r.StatusCode -eq 200) {
        $body = $r.Content | ConvertFrom-Json
        $db = $body.data.info.database.status
        if ($db -eq 'up') {
            Record 'S1' 'GET /api/health (database up)' 'PASS'
        } else {
            Record 'S1' 'GET /api/health' 'FAIL' "database.status=$db"
        }
    } else {
        Record 'S1' 'GET /api/health' 'FAIL' "HTTP $($r.StatusCode)"
    }
} catch {
    Record 'S1' 'GET /api/health' 'FAIL' $_.Exception.Message
}

# --- S1b. Backend version -------------------------------------------
# Public /api/version returns build identity { name, version,
# gitCommit, buildTime, node, env, uptime, startedAt }. Used by canary
# gates to verify the correct commit is live before opening traffic.
try {
    $r = Invoke-Api -Method GET -Path '/api/version'
    if ($r.StatusCode -eq 200) {
        $body = $r.Content | ConvertFrom-Json
        $v = $body.data.version
        $g = $body.data.gitCommit
        if ($v) {
            Record 'S1b' 'GET /api/version' 'PASS' "version=$v commit=$g"
        } else {
            Record 'S1b' 'GET /api/version' 'FAIL' 'response missing data.version'
        }
    } else {
        Record 'S1b' 'GET /api/version' 'FAIL' "HTTP $($r.StatusCode)"
    }
} catch {
    Record 'S1b' 'GET /api/version' 'FAIL' $_.Exception.Message
}

# --- S2..S7. Role logins --------------------------------------------
$creds = [ordered]@{
    S2 = @{ Label = 'Login OWNER';       Role = 'OWNER';           Cred = Split-Cred $Owner }
    S3 = @{ Label = 'Login GM';          Role = 'GENERAL_MANAGER'; Cred = Split-Cred $Gm }
    S4 = @{ Label = 'Login ACCOUNTANT';  Role = 'ACCOUNTANT';      Cred = Split-Cred $Accountant }
    S5 = @{ Label = 'Login MANAGER';     Role = 'MANAGER';         Cred = Split-Cred $Manager }
    S6 = @{ Label = 'Login DRIVER';      Role = 'DRIVER';          Cred = Split-Cred $Driver }
    S7 = @{ Label = 'Login CALL_CENTER'; Role = 'CALL_CENTER';     Cred = Split-Cred $CallCenter }
}

$tokens = @{}
foreach ($key in $creds.Keys) {
    $entry = $creds[$key]
    if (-not $entry.Cred) {
        Record $key $entry.Label 'SKIP' 'credentials not provided'
        continue
    }
    try {
        $r = Invoke-Api -Method POST -Path '/api/auth/login' -Body @{
            username = $entry.Cred.User
            password = $entry.Cred.Pass
        }
        if ($r.StatusCode -ne 200) {
            Record $key $entry.Label 'FAIL' "HTTP $($r.StatusCode)"
            continue
        }
        $body = $r.Content | ConvertFrom-Json
        $actual = $body.user.safariRole
        if ($actual -ne $entry.Role) {
            Record $key $entry.Label 'FAIL' "expected=$($entry.Role) actual=$actual"
            continue
        }
        $tokens[$entry.Role] = $body.accessToken
        Record $key $entry.Label 'PASS' "role=$actual"
    } catch {
        Record $key $entry.Label 'FAIL' $_.Exception.Message
    }
}

# --- S10..S12. Public verify endpoints ------------------------------
function Test-Verify {
    param([string]$Id, [string]$Label, [string]$DocType, [string]$OptionalId, [string]$Hint)
    if (-not $OptionalId) {
        Record $Id $Label 'SKIP' "pass -$Hint <uuid> to run"
        return
    }
    try {
        $r = Invoke-Api -Method GET -Path "/api/verify/$DocType/$OptionalId"
        if ($r.StatusCode -ne 200) {
            Record $Id $Label 'FAIL' "HTTP $($r.StatusCode)"
            return
        }
        $body = $r.Content | ConvertFrom-Json
        if ($null -ne $body.valid) {
            Record $Id $Label 'PASS' "valid=$($body.valid)"
        } else {
            Record $Id $Label 'FAIL' 'response missing .valid'
        }
    } catch {
        Record $Id $Label 'FAIL' $_.Exception.Message
    }
}

Test-Verify -Id 'S10' -Label 'Verify Payslip' -DocType 'payslip'       -OptionalId $PayslipId -Hint 'PayslipId'
Test-Verify -Id 'S11' -Label 'Verify Leave'   -DocType 'leave_request' -OptionalId $LeaveId   -Hint 'LeaveId'
Test-Verify -Id 'S12' -Label 'Verify Loan'    -DocType 'employee_loan' -OptionalId $LoanId    -Hint 'LoanId'

# --- S13 + S14. Typechecks ------------------------------------------
# npx/npm writes warnings to stderr which, combined with
# $ErrorActionPreference='Stop', makes PowerShell treat the whole
# invocation as a failure. We relax the preference inside this block
# and rely on $LASTEXITCODE alone to decide PASS/FAIL.
function Test-Typecheck {
    param([string]$Id, [string]$Label, [string]$Dir, [string]$TsConfig)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location $Dir
    try {
        $tsc = & cmd /c "npx tsc -p $TsConfig --noEmit 2>&1"
        if ($LASTEXITCODE -eq 0) {
            Record $Id $Label 'PASS'
        } else {
            $tail = ($tsc | Select-Object -Last 3) -join ' | '
            Record $Id $Label 'FAIL' $tail
        }
    } finally {
        Pop-Location
        $ErrorActionPreference = $prev
    }
}

Test-Typecheck -Id 'S13' -Label 'Frontend typecheck' -Dir "$PSScriptRoot/../web" -TsConfig 'tsconfig.app.json'
Test-Typecheck -Id 'S14' -Label 'Backend typecheck'  -Dir "$PSScriptRoot/.."     -TsConfig 'tsconfig.build.json'

# --- R4. Pulse denied to GM -----------------------------------------
# Skip unless a GM token is available. Calls the driver-monitoring API
# which is the server-side surface behind /admin/live-monitor.
if ($tokens.ContainsKey('GENERAL_MANAGER')) {
    try {
        $r = Invoke-Api -Method GET -Path '/api/safari-stream/driver-monitoring' `
            -Headers @{ Authorization = ("Bearer " + $tokens['GENERAL_MANAGER']) }
        if ($r.StatusCode -eq 403) {
            Record 'R4' 'GM to Pulse denied' 'PASS'
        } else {
            Record 'R4' 'GM to Pulse denied' 'FAIL' "HTTP $($r.StatusCode) (expected 403)"
        }
    } catch {
        Record 'R4' 'GM to Pulse denied' 'FAIL' $_.Exception.Message
    }
} else {
    Record 'R4' 'GM to Pulse denied' 'SKIP' 'GM token unavailable'
}

# --- R8. Accountant blocked from POS --------------------------------
if ($tokens.ContainsKey('ACCOUNTANT')) {
    try {
        $r = Invoke-Api -Method POST -Path '/api/pos/checkout' `
            -Headers @{ Authorization = ("Bearer " + $tokens['ACCOUNTANT']) } `
            -Body @{ branchId = '00000000-0000-0000-0000-000000000000'; items = @() }
        if ($r.StatusCode -eq 403) {
            Record 'R8' 'ACCOUNTANT to POS denied' 'PASS'
        } else {
            Record 'R8' 'ACCOUNTANT to POS denied' 'FAIL' "HTTP $($r.StatusCode) (expected 403)"
        }
    } catch {
        Record 'R8' 'ACCOUNTANT to POS denied' 'FAIL' $_.Exception.Message
    }
} else {
    Record 'R8' 'ACCOUNTANT to POS denied' 'SKIP' 'Accountant token unavailable'
}

# --- Summary --------------------------------------------------------
Write-Host ""
Write-Host "=== Summary ===" -ForegroundColor Cyan
$grouped = $script:results | Group-Object Status
foreach ($g in $grouped) {
    Write-Host ("  {0}: {1}" -f $g.Name, $g.Count)
}

$failed = ($script:results | Where-Object { $_.Status -eq 'FAIL' }).Count
if ($failed -gt 0) {
    Write-Host ""
    Write-Host "FAIL rows:" -ForegroundColor Red
    $script:results | Where-Object { $_.Status -eq 'FAIL' } | Format-Table Id, Label, Detail -AutoSize
}

exit $failed
