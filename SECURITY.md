# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub's private reporting: go to the [Security tab](https://github.com/scottwmacleod/rollin/security/advisories/new) and choose **Report a vulnerability**. Only the maintainer can see the report.

Include the version, your operating system, what you found, and the steps to reproduce it. A proof of concept helps.

rollin is maintained by one person in their spare time, so replies and fixes can take a while. You will get updates as the work progresses. Please give us a reasonable time to fix the problem before you disclose it publicly. We will credit you in the advisory unless you prefer otherwise.

## Supported versions

Only the latest desktop release gets fixes. The command line tool is built from source, so update to the latest `main`.

## Scope

In scope: the Rust library, the CLI, the desktop app (including its auto-updater and its handling of preset and character files), and the release workflows.

Out of scope: warnings from the operating system about unsigned installers (see [docs/desktop-install.md](docs/desktop-install.md)), and problems that need an attacker to already control your machine.
