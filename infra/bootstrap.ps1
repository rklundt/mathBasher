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

function Fail($msg) { Write-Error $msg; exit 1 }

# --- Derive the record label (the part of the custom domain under the zone) ---
if (-not $CustomDomain.EndsWith(".$DnsZone")) {
  Fail "CustomDomain '$CustomDomain' is not under the zone '$DnsZone'."
}
$recordLabel = $CustomDomain.Substring(0, $CustomDomain.Length - ".$DnsZone".Length)
Write-Host "Zone '$DnsZone' (RG $DnsZoneResourceGroup); managing ONLY label '$recordLabel'." -ForegroundColor Cyan

# --- 1. Resolve the SWA default hostname (the CNAME target) ---
$defaultHost = az staticwebapp show -n $SwaName -g $SwaResourceGroup --query defaultHostname -o tsv
if ([string]::IsNullOrWhiteSpace($defaultHost)) { Fail "Could not read default hostname for SWA '$SwaName' in '$SwaResourceGroup'." }
Write-Host "SWA '$SwaName' default host: $defaultHost" -ForegroundColor Cyan

# --- 2. Ensure the CNAME record (idempotent) ---
$existing = az network dns record-set cname show -g $DnsZoneResourceGroup -z $DnsZone -n $recordLabel --query cnameRecord.cname -o tsv 2>$null
if ($existing -eq $defaultHost) {
  Write-Host "CNAME '$recordLabel' already points at '$defaultHost' - skipping." -ForegroundColor Green
}
elseif ([string]::IsNullOrWhiteSpace($existing)) {
  Write-Host "Creating CNAME '$recordLabel' -> '$defaultHost' (TTL $TtlSeconds)..." -ForegroundColor Yellow
  az network dns record-set cname create -g $DnsZoneResourceGroup -z $DnsZone -n $recordLabel --ttl $TtlSeconds | Out-Null
  az network dns record-set cname set-record -g $DnsZoneResourceGroup -z $DnsZone -n $recordLabel -c $defaultHost | Out-Null
  Write-Host "CNAME created." -ForegroundColor Green
}
else {
  Fail "CNAME '$recordLabel' exists but points at '$existing', not '$defaultHost'. Refusing to overwrite - resolve by hand."
}

# --- 3. Bind the custom domain to the SWA (idempotent) ---
$status = az staticwebapp hostname list -n $SwaName -g $SwaResourceGroup --query "[?name=='$CustomDomain'].status | [0]" -o tsv 2>$null
if ($status -eq 'Ready') {
  Write-Host "Custom domain '$CustomDomain' already bound and Ready - nothing to do." -ForegroundColor Green
}
else {
  if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "Binding '$CustomDomain' (cname-delegation); this blocks until validation + cert finish..." -ForegroundColor Yellow
  }
  else {
    Write-Host "Custom domain '$CustomDomain' present but status '$status'; waiting for it to finish..." -ForegroundColor Yellow
  }
  az staticwebapp hostname set -n $SwaName -g $SwaResourceGroup --hostname $CustomDomain --validation-method cname-delegation | Out-Null
  $status = az staticwebapp hostname list -n $SwaName -g $SwaResourceGroup --query "[?name=='$CustomDomain'].status | [0]" -o tsv
  Write-Host "Custom domain '$CustomDomain' status: $status" -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Verify: https://$CustomDomain" -ForegroundColor Cyan
