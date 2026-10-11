// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// PROD shared observability for rg-games-prod-use2 (shared by every game SWA in
// that RG). Deploy:
//   az deployment group what-if -g rg-games-prod-use2 -f infra/observability.bicep -p infra/observability.prod.bicepparam
//   az deployment group create  -g rg-games-prod-use2 -f infra/observability.bicep -p infra/observability.prod.bicepparam
//
// Cap: 0.1 GB/day ≈ 3 GB/month worst case. Revisit once real traffic shows
// the actual daily volume (docs/telemetry-plan.md has the usage query).

using './observability.bicep'

param env = 'prod'
param location = 'eastus2'
param workspaceDailyQuotaGb = '0.1'
param appInsightsDailyCapGb = '0.1'
param retentionInDays = 30
param samplingPercentage = 100
