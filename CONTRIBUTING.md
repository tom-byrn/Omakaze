# Contributing

Thank you for helping with Omakaze. This page explains how to report problems and propose changes.

## Issues

- Search the [existing issues](https://github.com/tom-byrn/omakaze/issues) first.
- For bugs, include the steps to reproduce, what you expected, what happened, the version or commit, how you run Omakaze (Docker or Node.js), the GitHub connection type and, if relevant, the AI provider or MCP client. Remove tokens and secrets from logs.
- For feature requests, describe the problem you want to solve before the solution.
- Report security vulnerabilities privately as described in [SECURITY.md](SECURITY.md), not in an issue.

## Pull requests

1. For larger changes, open an issue first so the approach can be discussed.
2. Set up the project as described in [docs/development.md](docs/development.md).
3. Keep each pull request to one change. Add or update tests for logic changes, and update the documentation in `docs/` when behavior, configuration or the API changes.
4. If you change `src/db/schema.ts`, include the generated migration (`pnpm db:generate`).
5. Run the checks below and fill in the pull request template.

## Checks

CI runs these on every pull request; run them locally first:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

If your change includes a migration, also run `pnpm db:migrate` against a local database. For changes to pages or flows, run `pnpm test:e2e` and add or update a spec in `e2e/`; it seeds its own database and needs no GitHub access (see [Demo data and end-to-end tests](docs/development.md#demo-data-and-end-to-end-tests)).

## Commits

- Write the subject line in the imperative mood and keep it short, for example `Add coverage to the REST API response`.
- Use the body to explain why the change is needed when it is not obvious.
- Keep unrelated changes in separate commits.

## Code style

Match the surrounding code: naming, file layout, error handling and the tone of interface text. ESLint and TypeScript strict mode are enforced by the checks above. Explain new dependencies in the pull request description. More conventions are listed in [docs/development.md](docs/development.md#conventions).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE). Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
