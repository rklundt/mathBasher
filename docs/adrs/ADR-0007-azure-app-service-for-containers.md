# ADR-0007: Azure App Service for Containers (over Container Apps)

**Status:** Accepted (2026-05-08)

## Context

The user's deployment target is Azure. Two reasonable Azure homes for a single-container web app:

1. **Azure App Service for Containers** (Linux) — mature, single-container per app, easy custom domain + managed TLS, deployment slots for blue/green, health check, "Always On."
2. **Azure Container Apps** — newer, KEDA-based scaling, supports microservices and Dapr, more flexible scale-to-zero.

mathBasher is a single-container, low-traffic kid's game. KEDA scaling, microservice patterns, and Dapr provide nothing of value here.

## Decision

**Azure App Service for Containers (Linux)**, B1 SKU initially. Backed by Azure Container Registry (ACR) with managed-identity pull. Application Insights for telemetry. Key Vault for secrets. Bicep for infra-as-code. GitHub Actions with federated workload identity for CI/CD.

## Consequences

- **Pro:** Simple, well-trodden path. Plenty of docs and examples.
- **Pro:** Deployment slots give us a clean blue/green via slot swap, with a smoke-test gate before swapping into production.
- **Pro:** Managed TLS via free App Service Managed Certificate; one less thing to renew.
- **Pro:** App Insights integrates as an App Setting (Key Vault reference); both browser and server telemetry land in one resource, distinguished by `cloudRoleName`.
- **Con:** Single-container only. If we ever split the app into multiple services, we'd revisit (probably moving to Container Apps then).
- **Con:** B1 SKU is always-on (no scale-to-zero). Small cost overhead even when no one's playing. Acceptable for v1.
- **Future:** If usage grows substantially, scale up the App Service Plan (B → S → P series) before considering a re-platform. Replatforming is its own ADR if we ever go there.
