# Security Policy

## Supported versions

mathBasher is in active early development. The latest release on `main` is the only supported version. Prior versions (0.x.x) do not receive security patches; if you're using one, upgrade.

| Version | Supported |
| --- | --- |
| Latest `main` | ✅ |
| Prior `0.x.x` releases | ❌ |

## Reporting a vulnerability

**Please do NOT open a public GitHub issue for security vulnerabilities.**

Email **rayklundt (at) Outlook (dot) com** with:

- A description of the issue
- Steps to reproduce (or a proof of concept)
- The version / commit SHA / live URL where you observed it
- Your assessment of impact (information disclosure, account takeover, etc.)
- Whether you'd like to be credited in any eventual disclosure (and how)

You should expect an acknowledgment within **5 business days**. A fix or remediation timeline follows after triage.

If the issue is urgent (active exploitation, credential exposure, etc.), put `[URGENT SECURITY]` in the subject line.

## Scope

In scope:
- The mathBasher application code (browser-side and server-side)
- Configuration of any production deployment hosted by the project owner
- The build and release pipeline once it lands

Out of scope:
- Vulnerabilities in third-party dependencies — please report those upstream first; if a project-specific mitigation is needed, follow up with us
- Social engineering or physical attacks
- Denial-of-service via traffic volume
- Issues in forks or commercial deployments not operated by the project owner — those are the operator's responsibility

## Disclosure

We follow a coordinated disclosure model: a fix lands first, then public disclosure (via GitHub Security Advisory and a `VERSIONS.md` entry) follows after a reasonable embargo. If you'd like credit in the advisory, say so when reporting.

## Future improvements

This document is a starting point. As the project matures, we plan to add:

- A PGP key for encrypted vulnerability reports
- A `.well-known/security.txt` file at the deployed domain
- A formal bounty or recognition program if scope justifies it
- GitHub Security Advisories drafted in private when accounts/PII land

If any of these are blocking your report, email anyway and we'll coordinate.
