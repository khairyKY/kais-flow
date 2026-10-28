# The release gate, run here instead of on GitHub's metered minutes (Kai 2026-10-29, choice C;
# docs/log/2026-10-29-0300-release-move-handoff.md). Run it on the exact commit you're about to ship,
# with a clean tree:
#
#   powershell -File scripts/preship.ps1            # gate + write .github/preship.txt
#   powershell -File scripts/preship.ps1 -Commit    # … and commit that file on top
#
# Checks, the same as CI's gate (ci.yml) plus more: vitest under 4 time zones, lint, ds:check, the app
# build, the site build + link check, `deno check` of every edge function, and the birthday_on
# merge-duplicate check. Writes .github/preship.txt: the commit tested, pass/fail, when, what failed.
# release.yml's preship job skips the CI gate when that file says pass and nothing but the file
# changed since that commit. The rehearsal (migrations from scratch, the suites) always runs in CI.
# TZ needs PowerShell: Git Bash drops TZ=Area/City on Windows.
param([switch]$Commit)

$root = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
Set-Location $root
$record = '.github/preship.txt'
$sha = (git rev-parse HEAD).Trim()
$dirty = git status --porcelain -- . ":(exclude)$record"
$failed = [System.Collections.Generic.List[string]]::new()

function Step([string]$name, [scriptblock]$run) {
  Write-Host "`n== $name" -ForegroundColor Cyan
  & $run
  if ($LASTEXITCODE) { $failed.Add($name); Write-Host "!! $name failed ($LASTEXITCODE)" -ForegroundColor Red }
}

Push-Location app
if (-not (Test-Path node_modules)) { Step 'npm ci' { npm ci --no-audit --no-fund } }
foreach ($tz in 'UTC', 'Africa/Cairo', 'America/Los_Angeles', 'Asia/Tokyo') {
  $env:TZ = $tz
  Step "vitest ($tz)" { npx vitest run --reporter=dot }
}
$env:TZ = $null
Step 'lint' { npm run lint }
Step 'ds:check' { npm run ds:check -- --baseline scripts/ds-baseline.json }
Step 'build' { npm run build }
Pop-Location

Push-Location site
Step 'site build' { node build.mjs }
Step 'site links' { node tools/check-links.mjs }
Pop-Location

# CI pins deno 2.9.7 (rehearsal.yml); npm's newest is 2.9.6, close enough for a type check.
$deno, $pre = if (Get-Command deno -ErrorAction SilentlyContinue) { 'deno', @() } else { 'npx', @('-y', 'deno@2.9.6') }
foreach ($f in Get-ChildItem supabase/functions/*/index.ts) {
  Step "deno check $($f.Directory.Name)" { & $deno @pre check --quiet --no-lock $f.FullName }
}

# A bad merge once doubled these lines (docs/log handoffs: "birthday_on 1/1").
$types = @(Select-String -Path app/src/lib/types.ts -Pattern 'birthday_on').Count
$settings = @(Select-String -Path app/src/lib/settings.ts -Pattern 'birthday_on: false' -SimpleMatch).Count
Write-Host "`n== birthday_on $types/$settings"
if ($types -ne 1 -or $settings -ne 1) { $failed.Add("birthday_on $types/$settings") }

$result = if ($failed.Count) { 'fail' } elseif ($dirty) { 'dirty' } else { 'pass' }
$text = "sha=$sha`nresult=$result`ndate=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mmZ'))`nfailed=$($failed -join ', ')`n"
[IO.File]::WriteAllText((Join-Path $root $record), $text) # UTF-8, no BOM, LF: what the workflow's sed reads
Write-Host "`n$(Get-Content -Raw $record)"
if ($dirty) { Write-Host 'Uncommitted changes: recorded as dirty, so CI runs its own gate. Commit, then run this again.' -ForegroundColor Yellow }

if ($result -ne 'pass') { exit 1 }
if ($Commit) {
  git add -- $record
  git commit -m "preship: gate passed at $($sha.Substring(0, 7))" -- $record
  if ($LASTEXITCODE) { exit 1 }
  Write-Host "Committed. Push this commit to claude/ship; release.yml skips the CI gate for it." -ForegroundColor Green
} else {
  Write-Host "Passed. Commit $record on top (or rerun with -Commit) and push that to claude/ship." -ForegroundColor Green
}
