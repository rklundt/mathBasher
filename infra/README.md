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
| `bootstrap.ps1` | Idempotent domain binding: prints the CNAME target, read-only DNS check, bind + wait for cert. |

## DNS: Cloudflare

DNS for `mykfam.com` is hosted on **Cloudflare** (free plan); the domain
registration itself is an **Azure App Service Domain**. The old Azure DNS zone
(`mykfam.com` in `rg-GlobalNetwork-use2`) is **not** the live zone any more —
edits there have no effect. DNS records for mathBasher are managed in the
Cloudflare dashboard:

| Name | Type | Target | Proxy |
|---|---|---|---|
| `mathbasher-dev` | CNAME | `brave-river-0f2e36c0f.7.azurestaticapps.net` (dev SWA) | Proxied |
| `mathbasher` | CNAME | `polite-desert-0af64970f.5.azurestaticapps.net` (prod SWA) | Proxied |

What the Cloudflare proxy means for the SWAs:

- **Certificate validation sees the CNAME only when the record is "DNS only".**
  Azure validates a custom domain (first bind, and managed-certificate renewal)
  by resolving the CNAME to the SWA host; a proxied record hides it. For a first
  bind, or if Azure reports a renewal/validation failure, switch the record to
  **DNS only** (grey cloud), run `bootstrap.ps1`, then switch back to Proxied.
- **SSL/TLS mode must be Full (strict).** The SWA serves a valid certificate for
  the custom domain, so strict works; "Flexible" causes redirect loops.
- **Edge cache.** Cloudflare honours the `cache-control` headers from
  `public/staticwebapp.config.json`. If a shipped asset is ever overwritten in
  place (the rename-don't-overwrite rule exists to avoid this), purge it in
  Cloudflare as well.
- **Security headers:** HSTS comes from Cloudflare; the Content-Security-Policy
  (and nosniff / referrer / frame options) come from `staticwebapp.config.json`
  — one place per header. The CSP allows only the site itself, Google Fonts,
  `data:`/`blob:` images and audio (Phaser), and Cloudflare Web Analytics
  (`static.cloudflareinsights.com` script, `cloudflareinsights.com` beacon).
  It blocks Cloudflare's injected inline bot-detection snippet, which the
  game doesn't need. If a browser
  telemetry endpoint is ever added (e.g. Application Insights), add its hosts
  to `connect-src`.

## What Bicep manages — and deliberately does NOT

**Manages:** the Static Web App resource (SKU Free, region, staging-env policy, tags).

**Does NOT manage:**
- **The custom domain + its DNS record.** DNS lives in Cloudflare (see above),
  outside Azure entirely, and the hostname binding is done by `bootstrap.ps1`,
  run interactively by an operator. Keeping both out of Bicep means a future
  pipeline deploy identity scoped to the app's RG never needs DNS rights (least
  privilege). The `customDomain` param in the bicepparam is the single source of
  the domain name (fed to the script + docs); it is a recorded output, not
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

### Check the Bicep against a live SWA (non-destructive)

```bash
az deployment group what-if -g rg-games-dev-use2  -f infra/main.bicep -p infra/main.dev.bicepparam
az deployment group what-if -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
```

**Expected drift — not a mismatch.** On both SWAs the what-if shows a single
Modify listing these properties as removed: `branch`, `provider`,
`repositoryUrl`, `deploymentAuthPolicy` (the GitHub Actions deploy step writes
these onto the resource on every upload; Bicep deliberately doesn't model them),
plus `stableInboundIP` and `trafficSplitting` (server-computed values). Nothing
is deleted or recreated. Because the deploy action re-asserts the first four on
its next upload, prefer **not** to `create` against a live SWA just to "sync" —
the SKU, region and staging policy are the properties Bicep owns, and they match.

### Stand up prod (new resource group + SWA)

```bash
az group create -n rg-games-prod-use2 -l eastus2 --tags project=mathbasher environment=prod
az deployment group what-if -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
az deployment group create  -g rg-games-prod-use2 -f infra/main.bicep -p infra/main.prod.bicepparam
# then pipe the deploy token straight into the prod GitHub Environment's secret
# (never print it — terminal scrollback and session logs keep it):
az staticwebapp secrets list -n swa-games-mathBasher-prod-use2 -g rg-games-prod-use2 --query properties.apiKey -o tsv | gh secret set AZURE_SWA_TOKEN --env production --repo rklundt/mathBasher
```

### Wire a custom domain (dev first, then prod)

1. In Cloudflare, add `CNAME <label> -> <SWA default host>` (the script prints
   the exact target) and set it to **DNS only** for the first bind.
2. Run the script:

```powershell
# Dev
./infra/bootstrap.ps1 -SwaName swa-games-mathBlaster-dev-use2 -SwaResourceGroup rg-games-dev-use2 -CustomDomain mathbasher-dev.mykfam.com
# Prod (only after dev is validated)
./infra/bootstrap.ps1 -SwaName swa-games-mathBasher-prod-use2 -SwaResourceGroup rg-games-prod-use2 -CustomDomain mathbasher.mykfam.com
```

3. Once it reports `Ready`, set the Cloudflare record back to **Proxied**.

The **first** bind of a new domain blocks for a few minutes while Azure validates
the CNAME and issues the managed certificate. Re-runs are instant (the script
sees a `Ready` binding and exits without changing anything). The script never
writes DNS. It exits 1 with a message on any failure, including a CNAME that
points somewhere else or a binding that isn't `Ready` yet.

### Tear down an environment

Delete the custom domain's CNAME in **Cloudflare** before (or along with)
deleting the SWA or its resource group — `az group delete` cannot touch
Cloudflare, and a CNAME left pointing at a deleted `*.azurestaticapps.net` host
is a dangling record (subdomain-takeover risk):

```bash
# 1. Cloudflare dashboard: delete the <label> CNAME record
# 2. then:
az group delete -n <resource-group>
```

## Deploy pipeline (two-SWA model)

`.github/workflows/deploy.yml` deploys per branch to the matching SWA through a
**GitHub Environment**, each holding its own `AZURE_SWA_TOKEN` secret and
accepting deploys only from its branch (so no other branch's workflow can read
the prod token):

- `main` → `production` environment → prod SWA
- `development` → `development` environment → dev SWA

Pull requests into `development` / `main` run `.github/workflows/ci.yml`
(typecheck, tests, build) — no secrets. Every action in both workflows is
pinned to a full commit SHA, with the release tag in a comment; bump them
deliberately (resolve the new tag's commit, check its release notes). One
limit: `Azure/static-web-apps-deploy` is a Docker action whose image is
Microsoft's moving `:stable` tag, so pinning the action pins its wrapper, not
the uploader inside it.

Both SWAs carry tags `project=mathbasher`, `environment=dev|prod`,
`managed-by=bicep` (set in the bicepparam files); the resource groups carry
`project` and `environment`.

**Changing a live app's settings:** a `what-if` of a full Bicep redeploy lists
the deploy metadata GitHub writes onto each app (`repositoryUrl`, `branch`,
`provider`) as *Delete*, because the template doesn't declare it. For a small
change (tags, preview policy) prefer a targeted update so that metadata stays:
`az tag update --operation Merge …` for tags, and a `PATCH` of just the
property (`az rest --method patch … --body '{"properties":{…}}'`). Keep the
bicepparam files in step, so they still describe the live state.

(Replaces the former single-SWA model that used one token +
`deployment_environment: development` for a preview environment.)

The workflow fails closed: a "Check deploy token" step refuses to deploy if the
environment's secret is empty, and a "Check deploy target" step fails the run
if the app that received the upload isn't this branch's (its default hostname
is compared with the one expected for the environment), so a token pasted into
the wrong environment is caught on its first run. It also sets `VITE_SOURCE_URL` to the exact commit being
built (`.../tree/<short-sha>`) for the footer's AGPL §13 source link.

**Rollback:** prefer reverting the bad commit (the push redeploys). Re-running an
older Actions run is only safe for runs from the sprint 2.6.2 release onward
(the first deploy through the `production` environment): older runs read the
retired repo-level token secrets, which are deleted, so they stop at "Check
deploy token" without deploying.
