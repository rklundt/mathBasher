# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license - see COMMERCIAL.md

<#
.SYNOPSIS
  Idempotently binds a custom domain to a mathBasher Static Web App and waits
  for validation + the free managed TLS certificate (Validating -> Ready).

.DESCRIPTION
  DNS for mykfam.com is hosted on Cloudflare (the domain registration is an
  Azure App Service Domain; the old Azure DNS zone is no longer the live zone).
  This script does NOT create DNS records - add the record in the Cloudflare
  dashboard first:

      Type CNAME   Name <label>   Target <the SWA default hostname>

  The script prints the exact target. For the FIRST bind of a domain (and if a
  certificate renewal ever fails), set that record to "DNS only" (grey cloud):
  Azure validates by seeing the CNAME, which the Cloudflare proxy hides. Once
  the binding is Ready the record can go back to "Proxied" (orange cloud) with
  Cloudflare SSL mode "Full (strict)".

  Steps:
  1. read the SWA's default hostname (the CNAME target)
  2. read-only DNS check: is the CNAME visible (DNS only) or proxied?
  3. bind the custom domain (cname-delegation) and wait for Ready

  Idempotent: if the hostname is already bound and Ready, nothing changes.
  Run interactively by an operator; it is not part of the app-deploy pipeline.

.EXAMPLE
  ./infra/bootstrap.ps1 -SwaName swa-games-mathBlaster-dev-use2 `
                        -SwaResourceGroup rg-games-dev-use2 `
                        -CustomDomain mathbasher-dev.mykfam.com

  ./infra/bootstrap.ps1 -SwaName swa-games-mathBasher-prod-use2 `
                        -SwaResourceGroup rg-games-prod-use2 `
                        -CustomDomain mathbasher.mykfam.com
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $SwaName,
  [Parameter(Mandatory = $true)] [string] $SwaResourceGroup,
  [Parameter(Mandatory = $true)] [string] $CustomDomain
)

$ErrorActionPreference = 'Stop'

# Print a red error and exit 1. (Write-Error under 'Stop' would throw before
# `exit 1` ran, so plain Write-Host + exit keeps the exit code reliable.)
function Fail([string] $msg) {
  Write-Host "ERROR: $msg" -ForegroundColor Red
  exit 1
}

# Run `az` and judge success ONLY by its exit code. Windows PowerShell 5.1
# turns any native-command stderr output (az warnings, the "newer version
# available" notice) into a terminating error under
# $ErrorActionPreference='Stop' -- even with 2>$null -- while a genuine
# non-zero exit does NOT stop the script. So: relax the preference for the
# call, capture stdout and stderr separately, and return the exit code.
function Invoke-Az([string[]] $AzArgs) {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $raw = & az @AzArgs 2>&1
    $code = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $prevEap
  }
  $isErr = { $_ -is [System.Management.Automation.ErrorRecord] }
  $out = @($raw | Where-Object { -not (& $isErr) } | ForEach-Object { "$_" })
  $err = @($raw | Where-Object $isErr | ForEach-Object { "$_" })
  [pscustomobject]@{ ExitCode = $code; Out = ($out -join "`n").Trim(); Err = ($err -join "`n").Trim() }
}

# Invoke-Az, but stop the script with a clear message if az fails.
function Invoke-AzOrFail([string] $What, [string[]] $AzArgs) {
  $r = Invoke-Az -AzArgs $AzArgs
  if ($r.ExitCode -ne 0) { Fail "$What failed (az exit $($r.ExitCode)). $($r.Err)" }
  return $r.Out
}

$CustomDomain = $CustomDomain.Trim().ToLowerInvariant()
if ($CustomDomain -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') {
  Fail "CustomDomain '$CustomDomain' is not a valid hostname."
}

# --- 1. Resolve the SWA default hostname (the CNAME target) ---
$defaultHost = Invoke-AzOrFail "Reading SWA '$SwaName'" @(
  'staticwebapp', 'show', '-n', $SwaName, '-g', $SwaResourceGroup, '--query', 'defaultHostname', '-o', 'tsv')
if ([string]::IsNullOrWhiteSpace($defaultHost)) { Fail "SWA '$SwaName' in '$SwaResourceGroup' returned no default hostname." }
Write-Host "SWA '$SwaName' default host: $defaultHost" -ForegroundColor Cyan
Write-Host "Cloudflare record needed: CNAME  $CustomDomain  ->  $defaultHost" -ForegroundColor Cyan

# --- 2. Current binding status (skip everything if already Ready) ---
$statusArgs = @('staticwebapp', 'hostname', 'list', '-n', $SwaName, '-g', $SwaResourceGroup,
  '--query', "[?name=='$CustomDomain'].status | [0]", '-o', 'tsv')
$status = Invoke-AzOrFail "Listing custom domains on '$SwaName'" $statusArgs
if ($status -eq 'Ready') {
  Write-Host "Custom domain '$CustomDomain' already bound and Ready - nothing to do." -ForegroundColor Green
  Write-Host "Done. Verify: https://$CustomDomain" -ForegroundColor Cyan
  exit 0
}

# --- 3. Read-only DNS check (public resolution; never writes DNS) ---
# DNS only (grey cloud): the CNAME resolves to the SWA host - Azure can validate.
# Proxied (orange cloud): the name resolves to Cloudflare addresses and the
# CNAME is hidden - Azure validation will not see it.
$cname = $null
try {
  $answer = Resolve-DnsName -Name $CustomDomain -Type CNAME -DnsOnly -ErrorAction Stop
  $cname = ($answer | Where-Object { $_.Type -eq 'CNAME' } | Select-Object -First 1).NameHost
}
catch {
  $cname = $null
}
if ($cname -and $cname.TrimEnd('.').ToLowerInvariant() -eq $defaultHost.ToLowerInvariant()) {
  Write-Host "DNS check: CNAME is visible and points at $defaultHost (DNS only) - good." -ForegroundColor Green
}
elseif ($cname) {
  Fail "DNS check: '$CustomDomain' is a CNAME to '$cname', not '$defaultHost'. Fix the record in Cloudflare, then re-run."
}
else {
  Write-Host "DNS check: no CNAME visible for '$CustomDomain' (missing, or proxied through Cloudflare)." -ForegroundColor Yellow
  Write-Host "  Add/confirm the CNAME above in Cloudflare and set it to 'DNS only' until this binding is Ready." -ForegroundColor Yellow
  Write-Host "  Continuing - Azure validation will fail (and this script will say so) if it can't see the CNAME." -ForegroundColor Yellow
}

# --- 4. Bind the custom domain to the SWA and wait for Ready ---
if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host "Binding '$CustomDomain' (cname-delegation); this blocks until validation + cert finish." -ForegroundColor Yellow
  Write-Host "(The FIRST bind of a new domain can take several minutes; re-runs are instant.)" -ForegroundColor Yellow
}
else {
  Write-Host "Custom domain '$CustomDomain' present but status '$status'; waiting for it to finish..." -ForegroundColor Yellow
}
Invoke-AzOrFail "Binding '$CustomDomain' to '$SwaName'" @(
  'staticwebapp', 'hostname', 'set', '-n', $SwaName, '-g', $SwaResourceGroup,
  '--hostname', $CustomDomain, '--validation-method', 'cname-delegation') | Out-Null
$status = Invoke-AzOrFail "Re-reading '$CustomDomain' status" $statusArgs
if ($status -ne 'Ready') {
  Fail "Custom domain '$CustomDomain' status is '$status', not 'Ready'. If the Cloudflare record is Proxied, switch it to 'DNS only' and re-run."
}
Write-Host "Custom domain '$CustomDomain' status: Ready" -ForegroundColor Green
Write-Host "You can now set the Cloudflare record back to 'Proxied' (SSL mode: Full (strict))." -ForegroundColor Cyan

Write-Host ""
Write-Host "Done. Verify: https://$CustomDomain" -ForegroundColor Cyan
