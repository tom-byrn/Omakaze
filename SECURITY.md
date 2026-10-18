# Security policy

## Supported versions

Guided PRs has not had a stable release yet. Security fixes are made on the `main` branch and included in the next release. Once releases are published, fixes target the latest release.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| 0.1.x | Yes, once released |

## Reporting a vulnerability

Do not open a public issue for security problems.

Report vulnerabilities through GitHub's private vulnerability reporting: open the [Security tab](https://github.com/tom-byrn/guided-prs/security) of the repository and choose **Report a vulnerability**, or go directly to [a new security advisory](https://github.com/tom-byrn/guided-prs/security/advisories/new).

Include:

- a description of the problem and its impact;
- steps to reproduce, or a proof of concept;
- the version or commit, and relevant configuration (for example the sign-in methods, GitHub connection type and storage driver);
- any suggested fix.

## Scope

In scope is the code in this repository, for example:

- authentication and sessions, OAuth for MCP clients, and API tokens;
- workspace isolation and role checks;
- handling of GitHub credentials, AI provider keys and other stored secrets;
- webhook signature verification;
- uploads, markdown rendering and other cross-site scripting or request forgery risks;
- the Docker image and `docker-compose.yml` as shipped.

Out of scope:

- vulnerabilities in dependencies without a way to exploit them through Guided PRs (report those to the dependency);
- attacks that need an already compromised server, database or `APP_SECRET`;
- insecure deployments that contradict the documentation, such as serving over plain HTTP on a public network;
- denial of service through request volume, and social engineering.

## What happens next

The maintainers will:

1. acknowledge the report and ask for any missing details;
2. confirm the problem and assess its impact;
3. prepare and test a fix, and agree on a disclosure date with you;
4. publish the fix and a GitHub security advisory, crediting you if you want to be credited.

Please keep the details private until the advisory is published.
