// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// DEV shared observability for rg-games-dev-use2 (shared by every game SWA in
// that RG). Deploy:
//   az deployment group what-if -g rg-games-dev-use2 -f infra/observability.bicep -p infra/observability.dev.bicepparam
//   az deployment group create  -g rg-games-dev-use2 -f infra/observability.bicep -p infra/observability.dev.bicepparam
//
// Cap: 0.05 GB/day ≈ 1.5 GB/month worst case. Dev traffic is the owner and
// testers; anything near this cap means a logging bug, not real usage.

using './observability.bicep'

param env = 'dev'
param location = 'eastus2'
param workspaceDailyQuotaGb = '0.05'
param appInsightsDailyCapGb = '0.05'
param retentionInDays = 30
param samplingPercentage = 100
