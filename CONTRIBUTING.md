# Contributing to Merkster

Thanks for helping. Merkster is free software under the [GNU AGPL-3.0](LICENSE).

Merkster is vibe coded: this app was written with AI coding agents. Read the surrounding code and tests before changing behaviour, and keep new work covered by the checks below.

## Setup

```bash
npm ci
cp .env.example .env
npm test
npm run typecheck
```

Local development without Google or a real LLM is in the README (`make mock-env && make mock`, or the `npm run dev:server` / `npm run dev:web` pair plus the mock processes). Do not commit `.env` or any secret.

## Pull requests

1. Branch from `main`.
2. Run `npm test` and `npm run typecheck`.
3. If you change the server image, `docker compose config` should still succeed.
4. Fill in the pull request template.

## Version numbers

The published version is `0.1.0` until the next release. Before you tag a release, update [CHANGELOG.md](CHANGELOG.md) and the version named in [README.md](README.md) (the container pull command and any other version the README states). Then keep these in step:

- `package.json` (`version`)
- `shared/brand.ts` (`APP_VERSION`)
- `server/src/config.ts` (`version`)
- the version label in `Dockerfile`

Tag the release `vX.Y.Z`. That tag publishes `ghcr.io/bandulix/merkster` on GitHub Packages.

## Reporting issues

Use the bug or feature templates. Do not paste secrets, student data, or access tokens.
