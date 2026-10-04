# Infrastructure (Bicep IaC)

Infrastructure-as-code for mathBasher's Azure hosting. Authored in sprint 2.5.x
to capture the hand-created Static Web App(s) as code (disaster recovery + a
reviewable source of truth) and to wire the custom domains.

## Architecture: two Free Static Web Apps (one per environment)

mathBasher runs on **two separate Free SWAs**, one per environment — the same
pattern as the project owner's `cosmos` site (`swa-catchupcosmos-dev` +
`swa-catchupcosmos-prod`).

**Why two SWAs instead of one with a `development` preview environment:** the
SWA **Free** tier can only bind a custom domain to a SWA's **production**
environment, never to a preview/named environment. To give both environments a
custom domain at $0, each environment is its own Free SWA.

| Env | SWA | Resource group | Custom domain | Fed by branch |
|---|---|---|---|---|
| **dev** | `swa-games-mathBlaster-dev-use2` (existing) | `rg-games-dev-use2` | `mathbasher-dev.mykfam.com` | `development` |
| **prod** | `swa-games-mathBasher-prod-use2` (new) | `rg-games-prod-use2` (new) | `mathbasher.mykfam.com` | `main` |

Both are Free (managed TLS cert + up to 2 custom domains per SWA included at no
cost). East US 2.

> The dev SWA keeps its legacy `...mathBlaster...` name to avoid a disruptive
> rename (renaming an SWA = recreate = new default host + new deploy token). The
> new prod SWA uses the corrected `...mathBasher...` spelling.

## Files

| File | What |
|---|---|
| `main.bicep` | One parameterized Static Web App (Free). Deployed once per env. |
| `main.dev.bicepparam` | Dev params (existing SWA, `rg-games-dev-use2`, `mathbasher-dev.mykfam.com`). |
| `main.prod.bicepparam` | Prod params (new SWA, `rg-games-prod-use2`, `mathbasher.mykfam.com`). |
| `bootstrap.ps1` | Idempotent domain wiring: CNAME in the mykfam.com zone + bind + wait for cert. |

## What Bicep manages — and deliberately does NOT

**Manages:** the Static Web App resource (SKU Free, region, staging-env policy).

**Does NOT manage:**
- **The custom domain + its DNS record.** The `mykfam.com` DNS zone lives in a
  *different* resource group (`rg-GlobalNetwork-use2`). Keeping the domain out of
  Bicep means any future pipeline deploy identity scoped to the app's RG never
  needs write rights on the shared DNS zone (least privilege). The domain is
  wired by `bootstrap.ps1`, run interactively by an operator who already has
  rights there. The `customDomain` param in the bicepparam is the single source
  of the domain name (fed to the script + docs); it is a recorded output, not
  applied to the resource.
- **The GitHub repo/branch binding + deploy token.** We deploy via a
  bring-your-own GitHub Actions workflow (`.github/workflows/deploy.yml`) + the
  SWA deploy token as a GitHub secret — not SWA's built-in GitHub integration.
  So no `repositoryUrl`/`branch`/`provider` in Bicep. The token is read
  post-create (`az staticwebapp secrets list`) and stored as a GitHub Actions
  secret out-of-band.
- **App Insights.** Not provisioned (telemetry is console-only today). Backlog:
  decide whether to add one App Insights per game RG, shared across that RG's
  SWAs.

## Usage

Prereqs: `az login` to the Pay-As-You-Go subscription; Bicep CLI (bundled with
recent `az`).

> **Git Bash on Windows:** `export MSYS_NO_PATHCONV=1` before `az` commands — it
> otherwise mangles `/subscriptions/...` resource ids. (Not needed in
> PowerShell, where `bootstrap.ps1` runs.)

### Prove fidelity against the existing dev SWA (non-destructive)

```bash
az deployment group what-if -g rg-games-dev-use2 -f infra/main.bicep -p infra/main.dev.bicepparam
```

A clean run shows **no meaningful changes** — confirming the Bicep matches the
live resource.

### Stand up prod (new resource group + SWA)

```bash
az group create -n rg-games-prod-use2 -l eastus2
az deployment group what-if -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
az deployment group create  -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
# then read the deploy token and store it as the prod GitHub Actions secret:
az staticwebapp secrets list -n swa-games-mathBasher-prod-use2 -g rg-games-prod-use2 --query properties.apiKey -o tsv
```

### Wire a custom domain (dev first, then prod)

```powershell
# Dev
./infra/bootstrap.ps1 -SwaName swa-games-mathBlaster-dev-use2 -SwaResourceGroup rg-games-dev-use2 -CustomDomain mathbasher-dev.mykfam.com
# Prod (only after dev is validated)
./infra/bootstrap.ps1 -SwaName swa-games-mathBasher-prod-use2 -SwaResourceGroup rg-games-prod-use2 -CustomDomain mathbasher.mykfam.com
```

## Deploy pipeline (two-SWA model)

`.github/workflows/deploy.yml` deploys per branch to the matching SWA, each with
its own deploy token secret:

- `main` → prod SWA (`AZURE_SWA_TOKEN_PROD`)
- `development` → dev SWA (`AZURE_SWA_TOKEN_DEV`)

(Replaces the former single-SWA model that used one token +
`deployment_environment: development` for a preview environment.)
