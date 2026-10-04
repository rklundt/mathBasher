// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// DEV environment params. Deploy against resource group rg-games-dev-use2:
//   az deployment group what-if -g rg-games-dev-use2 -f infra/main.bicep -p infra/main.dev.bicepparam
//   az deployment group create  -g rg-games-dev-use2 -f infra/main.bicep -p infra/main.dev.bicepparam
//
// This describes the EXISTING SWA (currently serving prod via `main` + a
// `development` preview env). In the two-SWA migration it becomes the DEV SWA,
// fed by the `development` branch; the custom domain below binds to its
// production env. `stagingEnvironmentPolicy` is left Enabled here so the
// what-if shows no disruptive change while the preview env is still live during
// migration; flip to Disabled once the preview env is retired.

using './main.bicep'

param name = 'swa-games-mathBlaster-dev-use2'
param location = 'eastus2'
param customDomain = 'mathbasher-dev.mykfam.com'
param stagingEnvironmentPolicy = 'Enabled'
