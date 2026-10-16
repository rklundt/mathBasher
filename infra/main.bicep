// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// =============================================================================
// mathBasher infrastructure — Azure Static Web App (Free).
//
// ONE SWA PER ENVIRONMENT (dev + prod), matching the existing cosmos pattern
// (swa-catchupcosmos-dev + swa-catchupcosmos-prod). Reason: SWA Free tier can
// only bind a custom domain to a SWA's PRODUCTION environment, not to a
// preview/named environment. So each environment is its own Free SWA, each with
// its custom domain on its own production env — instead of one SWA with a
// `development` preview environment (which can't carry a custom domain on Free).
//
// This template describes ONE SWA; it's deployed twice, once per environment,
// via the two `*.bicepparam` files in this folder:
//   - main.dev.bicepparam  → swa-games-mathBlaster-dev-use2  (rg-games-dev-use2)
//   - main.prod.bicepparam → swa-games-mathBasher-prod-use2  (rg-games-prod-use2)
//
// WHAT THIS DOES NOT MANAGE (deliberately):
//   - The custom domain + its DNS record. DNS for mykfam.com is hosted on
//     Cloudflare (outside Azure); keeping the domain out of Bicep means a
//     future pipeline deploy identity scoped to this RG never needs DNS rights
//     (least privilege). The hostname is bound by `infra/bootstrap.ps1`
//     instead (see infra/README.md "DNS: Cloudflare"). The `customDomain` param here
//     is declared ONLY so the name lives in one place (the bicepparam) and can
//     be fed to the bootstrap script + docs — it is recorded as an output, not
//     applied to the resource.
//   - The GitHub repo/branch binding + deploy token. We use a bring-your-own
//     GitHub Actions workflow (.github/workflows/deploy.yml) with the SWA deploy
//     token as a secret, NOT SWA's built-in GitHub integration. So no
//     repositoryUrl / branch / provider here (that would try to re-link the
//     built-in integration). The token is read post-deploy (az staticwebapp
//     secrets list) and stored as a GitHub Actions secret out-of-band.
//
// COST: Free tier = $0. Free includes the managed TLS certificate + up to 2
// custom domains per SWA (both on the production environment).
// =============================================================================

targetScope = 'resourceGroup'

@description('Static Web App resource name, e.g. swa-games-mathBasher-prod-use2.')
param name string

@description('Azure region of record for the SWA resource. The fleet standardizes on East US 2.')
param location string = 'eastus2'

@description('''
The custom domain this environment serves, e.g. mathbasher.mykfam.com. NOT
applied here — bound by infra/bootstrap.ps1 (DNS lives in Cloudflare).
Declared so the name lives in one place and flows to the bootstrap script + docs.
''')
param customDomain string

@allowed([ 'Enabled', 'Disabled' ])
@description('''
Preview (named) environments policy. The two-SWA model uses only each SWA's
production environment, so the default is Disabled (no preview envs). Both
SWAs use it since sprint 2.6.2.
''')
param stagingEnvironmentPolicy string = 'Disabled'

@description('Resource tags (project / environment / managed-by), set per environment in the bicepparam.')
param tags object = {}

resource swa 'Microsoft.Web/staticSites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Bring-your-own GitHub Actions workflow + deploy token — no built-in
    // GitHub integration (no repositoryUrl/branch/provider).
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: stagingEnvironmentPolicy
  }
}

@description('The *.azurestaticapps.net default hostname — the CNAME target for the custom domain.')
output defaultHostname string = swa.properties.defaultHostname

@description('The SWA resource name (for scripts/pipelines).')
output swaName string = swa.name

@description('The custom domain this environment will serve (wired by bootstrap.ps1).')
output customDomain string = customDomain
