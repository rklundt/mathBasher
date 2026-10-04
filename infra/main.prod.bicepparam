// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// PROD environment params. Deploy against resource group rg-games-prod-use2
// (create the RG first — see infra/README.md):
//   az group create -n rg-games-prod-use2 -l eastus2
//   az deployment group what-if -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
//   az deployment group create  -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
//
// This is a NEW SWA (clean name — mathBasher, not the legacy mathBlaster typo).
// Fed by the `main` branch; the custom domain below binds to its production env.
// No preview environments in the two-SWA model, so stagingEnvironmentPolicy
// stays Disabled (the default).

using './main.bicep'

param name = 'swa-games-mathBasher-prod-use2'
param location = 'eastus2'
param customDomain = 'mathbasher.mykfam.com'
param stagingEnvironmentPolicy = 'Disabled'
