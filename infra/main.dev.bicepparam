// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// DEV environment params. Deploy against resource group rg-games-dev-use2:
//   az deployment group what-if -g rg-games-dev-use2 -f infra/main.bicep -p infra/main.dev.bicepparam
//   az deployment group create  -g rg-games-dev-use2 -f infra/main.bicep -p infra/main.dev.bicepparam
//
// The DEV SWA: the original hand-created SWA (legacy `mathBlaster` name kept to
// avoid a recreate), now fed by the `development` branch since the 2026-10-04
// two-SWA cutover. The custom domain below binds to its production env.
// `stagingEnvironmentPolicy` stays Enabled until the old `development` preview
// environment (left over from the single-SWA model) is confirmed unused and
// deleted; then flip it to Disabled.

using './main.bicep'

param name = 'swa-games-mathBlaster-dev-use2'
param location = 'eastus2'
param customDomain = 'mathbasher-dev.mykfam.com'
param stagingEnvironmentPolicy = 'Enabled'
