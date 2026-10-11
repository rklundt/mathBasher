// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// =============================================================================
// Shared observability for a GAME RESOURCE GROUP — Log Analytics workspace +
// workspace-based Application Insights.
//
// ONE PER GAME RG, SHARED BY EVERY SWA IN THAT RG (see
// docs/adrs/ADR-0012-app-insights-per-game-resource-group.md):
//   - observability.dev.bicepparam  → appi-games-dev-use2  (rg-games-dev-use2)
//   - observability.prod.bicepparam → appi-games-prod-use2 (rg-games-prod-use2)
// Games are told apart inside the shared resource by `cloudRoleName`
// (`MathBasher.Web`, a future `<Game>.Web`, ...). Dev and prod never share one,
// so dev noise can't pollute prod queries or eat prod's daily cap.
//
// Deliberately a SIBLING template, not part of main.bicep: main.bicep's
// lifecycle is the mathBasher SWA; this resource belongs to the RG and outlives
// any one game. A future game repo references it by name (`existing`) rather
// than re-declaring it.
//
// COST: usage-billed (no fixed charge). An idle workspace costs $0. Spend is
// bounded by TWO daily caps — on workspace-based App Insights the effective
// cap is the LOWER of the workspace cap and the component cap, and Microsoft
// recommends setting both. Caps are a backstop against runaway volume, not a
// cost-control strategy; normal volume should sit well under them.
//
// WHAT THIS DOES NOT DO: the browser SDK wiring. Nothing sends telemetry here
// until `src/shared/telemetry-core.ts` gains the App Insights path. The deploy
// workflow already passes the connection string to the build as
// VITE_APPINSIGHTS_CONNECTION_STRING (see docs/telemetry-plan.md).
// =============================================================================

targetScope = 'resourceGroup'

@description('Workload segment of the resource names, e.g. `games` → appi-games-dev-use2.')
param workload string = 'games'

@allowed([ 'dev', 'prod' ])
@description('Environment segment of the resource names.')
param env string

@description('Azure region. The fleet standardizes on East US 2.')
param location string = 'eastus2'

@description('Region suffix of the resource names (matches the RG naming).')
param regionSuffix string = 'use2'

@description('''
Log Analytics workspace daily cap, in GB/day, as a decimal STRING (Bicep has
no float literals), e.g. '0.1'. Collection stops for the rest of the 24h window
once hit. Set the same value as `appInsightsDailyCapGb`.
''')
param workspaceDailyQuotaGb string

@description('App Insights component daily cap, in GB/day, as a decimal STRING. Effective cap = min(this, workspace cap).')
param appInsightsDailyCapGb string

@minValue(30)
@maxValue(730)
@description('Workspace interactive retention in days. 30 is the PerGB2018 minimum; App Insights tables are retained up to 90 days at no extra charge regardless.')
param retentionInDays int = 30

@description('''
Ingestion sampling percentage applied at the App Insights endpoint (100 = keep
everything). Only takes effect when the SDK isn't sampling itself. Must be
100/N (100, 50, 25, 20, 10, ...). A kids' game at current traffic doesn't need
sampling; this is the knob to turn without redeploying the app.
''')
param samplingPercentage int = 100

var workspaceName = 'log-${workload}-${env}-${regionSuffix}'
var appInsightsName = 'appi-${workload}-${env}-${regionSuffix}'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: json(workspaceDailyQuotaGb)
    }
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    SamplingPercentage: samplingPercentage
    // Keep the default: App Insights uses the client IP for geo lookup, then
    // stores it as 0.0.0.0. Players are kids — never store their IPs.
    DisableIpMasking: false
    // The browser SDK authenticates with the connection string (no Entra
    // token from an anonymous kid's browser), so local auth must stay on.
    DisableLocalAuth: false
    // Browsers ingest over the public internet; there's no private network.
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// The component's own daily cap. Without this it defaults to 100 GB/day, so
// only the workspace cap would be guarding spend.
resource appInsightsCap 'Microsoft.Insights/components/pricingPlans@2017-10-01' = {
  parent: appInsights
  name: 'current'
  properties: {
    planType: 'Basic'
    cap: json(appInsightsDailyCapGb)
    warningThreshold: 80
    stopSendNotificationWhenHitCap: false
    stopSendNotificationWhenHitThreshold: false
  }
}

@description('App Insights connection string. Not a secret — it ends up in the public browser bundle — but it is not committed either: it goes to a GitHub Actions variable (see infra/README.md).')
output connectionString string = appInsights.properties.ConnectionString

@description('App Insights resource name.')
output appInsightsName string = appInsights.name

@description('Log Analytics workspace name.')
output workspaceName string = workspace.name
