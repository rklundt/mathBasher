# Security Policy

Found a bug that isn't a security problem (something looks wrong, a game gets stuck, a sound doesn't play)? Please use the [bug report form](https://github.com/rklundt/mathBasher/issues/new/choose) instead.

## Supported versions

Only the live game at [mathbasher.mykfam.com](https://mathbasher.mykfam.com), built from the latest `main`, gets security fixes. Older releases are not patched.

## Reporting a vulnerability

**Please do not open a public issue for a security problem.** Report it privately:

1. **Preferred:** use GitHub's private form: this repository's **Security** tab → **Report a vulnerability** ([direct link](https://github.com/rklundt/mathBasher/security/advisories/new)). Only the project maintainers see it.
2. **Or email** **rayklundt (at) Outlook (dot) com**. Put `[URGENT SECURITY]` in the subject if it's being actively exploited.

Please include:

- What the problem is, and how to reproduce it (or a proof of concept)
- Where you saw it (the live URL, or a version / commit if you know it)
- What someone could do with it (for example: run code on the page, read data they shouldn't, change what the site serves)
- Whether you'd like credit when it's fixed, and how

You should get an acknowledgment within **5 business days**; a fix timeline follows once it's understood.

## Scope

In scope:
- The mathBasher game code, and the small server in `server/` (not deployed today)
- The live sites run by the project owner (mathbasher.mykfam.com and its dev copy)
- The build and deploy pipeline (`.github/workflows/`)

Out of scope:
- Vulnerabilities in third-party packages — please report those to that project first; if mathBasher needs its own mitigation, tell us too
- Social engineering or physical attacks
- Denial of service by traffic volume
- Forks or commercial deployments not run by the project owner

## What the game does and doesn't collect

The game has no accounts and asks for no personal information. Settings, high scores and My Scores (points per day and challenge) stay in your own browser. The hosting network counts visits with Cloudflare Web Analytics, which uses no cookies. Like any website, the services that deliver the game (Cloudflare, Microsoft Azure, and Google Fonts for the lettering) receive the ordinary details of each request, such as the IP address and browser type. If the game ever adds accounts or personal data, this policy will be updated first.

## Disclosure

We follow coordinated disclosure: the fix ships first, then a public note (a GitHub Security Advisory and a `VERSIONS.md` entry) after a reasonable delay. Tell us if you'd like credit.

## Future improvements

- A `.well-known/security.txt` file on the live site
- A PGP key for encrypted email reports
