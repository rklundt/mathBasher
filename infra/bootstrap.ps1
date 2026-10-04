# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license - see COMMERCIAL.md

<#
.SYNOPSIS
  Idempotently wires a custom domain to a mathBasher Static Web App:
  1. ensures a CNAME in the mykfam.com DNS zone -> the SWA's default hostname
  2. binds the custom domain to the SWA and waits for validation + the free
     managed TLS certificate (status goes Validating -> Ready)

.DESCRIPTION
  The mykfam.com DNS zone lives in a SEPARATE resource group
  (rg-GlobalNetwork-use2). This script is run interactively by an operator who
  already has rights there (your az login) - it is deliberately NOT part of the
  app-deploy pipeline, so the pipeline's deploy identity never needs write
  access to the shared DNS zone (least privilege).

  Idempotent: re-running is safe. It checks what exists first and skips the
  CNAME create if the record already points at the right target, and skips the
  binding if the hostname is already Ready. Other mykfam.com records (e.g.
  cosmos-dev, cosmos) are never touched - only the one label is managed.

.EXAMPLE
  # Dev first
  ./infra/bootstrap.ps1 -SwaName swa-games-mathBlaster-dev-use2 `
                        -SwaResourceGroup rg-games-dev-use2 `
                        -CustomDomain mathbasher-dev.mykfam.com

  # Prod (after dev is validated and you say "go")
  ./infra/bootstrap.ps1 -SwaName swa-games-mathBasher-prod-use2 `
                        -SwaResourceGroup rg-games-prod-use2 `
                        -CustomDomain mathbasher.mykfam.com
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $SwaName,
  [Parameter(Mandatory = $true)] [string] $SwaResourceGroup,
  [Parameter(Mandatory = $true)] [string] $CustomDomain,
  [string] $DnsZone = 'mykfam.com',
  [string] $DnsZoneResourceGroup = 'rg-GlobalNetwork-use2',
  # CNAME TTL in seconds; 1 hour is plenty for a rarely-changing apex label.
  [int]    $TtlSeconds = 3600
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
# available" notice, or a NotFound) into a terminating error under
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

# --- Derive + validate the record label (the part of the domain under the zone) ---
$CustomDomain = $CustomDomain.Trim().ToLowerInvariant()
$DnsZone = $DnsZone.Trim().ToLowerInvariant()
if (-not $CustomDomain.EndsWith(".$DnsZone")) {
  Fail "CustomDomain '$CustomDomain' is not under the zone '$DnsZone'."
}
$recordLabel = $CustomDomain.Substring(0, $CustomDomain.Length - ".$DnsZone".Length)
# Reject an empty/apex/odd label before anything touches the shared zone.
if ($recordLabel -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$') {
  Fail "Derived record label '$recordLabel' is not a valid DNS label (apex/@ is not supported)."
}
Write-Host "Zone '$DnsZone' (RG $DnsZoneResourceGroup); managing ONLY label '$recordLabel'." -ForegroundColor Cyan

# --- 1. Resolve the SWA default hostname (the CNAME target) ---
$defaultHost = Invoke-AzOrFail "Reading SWA '$SwaName'" @(
  'staticwebapp', 'show', '-n', $SwaName, '-g', $SwaResourceGroup, '--query', 'defaultHostname', '-o', 'tsv')
if ([string]::IsNullOrWhiteSpace($defaultHost)) { Fail "SWA '$SwaName' in '$SwaResourceGroup' returned no default hostname." }
Write-Host "SWA '$SwaName' default host: $defaultHost" -ForegroundColor Cyan

# --- 2. Ensure the CNAME record (idempotent) ---
# Only a NotFound means "record absent, create it". Any other failure (expired
# login, no rights on the zone's RG, wrong zone) stops the script instead of
# being mistaken for a missing record.
# The query accepts both key casings: current az returns `CNAMERecord`, older
# versions `cnameRecord` (JMESPath is case-sensitive).
$probe = Invoke-Az -AzArgs @(
  'network', 'dns', 'record-set', 'cname', 'show',
  '-g', $DnsZoneResourceGroup, '-z', $DnsZone, '-n', $recordLabel,
  '--query', 'CNAMERecord.cname || cnameRecord.cname', '-o', 'tsv')
if ($probe.ExitCode -eq 0) {
  $recordSetExists = $true
  $existing = $probe.Out
}
elseif ($probe.Err -match '\(NotFound\)|resource record .* does not exist') {
  $recordSetExists = $false
  $existing = $null
}
else {
  Fail "Could not check CNAME '$recordLabel' in '$DnsZone' (az exit $($probe.ExitCode)). $($probe.Err)"
}

$setRecordArgs = @(
  'network', 'dns', 'record-set', 'cname', 'set-record',
  '-g', $DnsZoneResourceGroup, '-z', $DnsZone, '-n', $recordLabel, '-c', $defaultHost)

if ($existing -eq $defaultHost) {
  Write-Host "CNAME '$recordLabel' already points at '$defaultHost' - skipping." -ForegroundColor Green
}
elseif (-not [string]::IsNullOrWhiteSpace($existing)) {
  Fail "CNAME '$recordLabel' exists but points at '$existing', not '$defaultHost'. Refusing to overwrite - resolve by hand."
}
elseif ($recordSetExists) {
  # The record set exists but has no target (e.g. a half-finished earlier run).
  # Only add the target -- `record-set ... create` would replace the whole set.
  Write-Host "CNAME record set '$recordLabel' exists with no target; setting -> '$defaultHost'..." -ForegroundColor Yellow
  Invoke-AzOrFail "Setting CNAME '$recordLabel' target" $setRecordArgs | Out-Null
  Write-Host "CNAME target set." -ForegroundColor Green
}
else {
  Write-Host "Creating CNAME '$recordLabel' -> '$defaultHost' (TTL $TtlSeconds)..." -ForegroundColor Yellow
  Invoke-AzOrFail "Creating CNAME record set '$recordLabel'" @(
    'network', 'dns', 'record-set', 'cname', 'create',
    '-g', $DnsZoneResourceGroup, '-z', $DnsZone, '-n', $recordLabel, '--ttl', "$TtlSeconds") | Out-Null
  Invoke-AzOrFail "Setting CNAME '$recordLabel' target" $setRecordArgs | Out-Null
  Write-Host "CNAME created." -ForegroundColor Green
}

# --- 3. Bind the custom domain to the SWA (idempotent) ---
$statusArgs = @('staticwebapp', 'hostname', 'list', '-n', $SwaName, '-g', $SwaResourceGroup,
  '--query', "[?name=='$CustomDomain'].status | [0]", '-o', 'tsv')
$status = Invoke-AzOrFail "Listing custom domains on '$SwaName'" $statusArgs
if ($status -eq 'Ready') {
  Write-Host "Custom domain '$CustomDomain' already bound and Ready - nothing to do." -ForegroundColor Green
}
else {
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
    Fail "Custom domain '$CustomDomain' status is '$status', not 'Ready'. Validation may still be in progress - re-run this script in a few minutes."
  }
  Write-Host "Custom domain '$CustomDomain' status: Ready" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Verify: https://$CustomDomain" -ForegroundColor Cyan
