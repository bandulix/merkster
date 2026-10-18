<p align="center"><img src="brand/logo.svg" width="96" alt="Merkster logo"></p>

# Merkster

**Snap it. Drill it. Own the test. Earn the reward.**

Photo a worksheet, vocab list, or PDF — Merkster turns it into cards. Practise with successive relearning until exam day, track how practice maps to grades, and let family promise rewards for the results. Merkster only tracks those promises — it never moves money.

Merkster is vibe coded: this app was written with AI coding agents.

<p align="center">
  <img src="screenshots/desktop-01-today.png" width="820" alt="Today dashboard on desktop">
</p>

<p align="center">
  <img src="screenshots/mobile-06-practice.png" width="240" alt="Practice session on mobile">
  &nbsp;&nbsp;
  <img src="screenshots/mobile-10-today.png" width="240" alt="Today view on mobile">
  &nbsp;&nbsp;
  <img src="screenshots/mobile-28-reward-pop.png" width="240" alt="Reward earned celebration">
</p>

## What you get

- **Import** — photo, PDF, or paste → review → cards (on-device OCR, or optional server vision LLM)
- **Practice** — retry until correct, spaced to the test date, tolerant checking, EN/DE UI
- **Results & report cards** — self-reported grades in 8 systems, Zeugnis photo → review → trends
- **Family rewards** — invite supporters, set grade/practice/report-card rules; Merkster tracks, never pays out
- **Offline PWA** — IndexedDB sync, installable, Google sign-in, GDPR export & delete

## Quick start

```bash
make env            # .env from .env.example + random secrets
$EDITOR .env        # GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (LLM optional)
make up             # http://localhost:$PORT (default 8080)
make health
```

No Google or LLM handy? `make mock-env && make mock` runs mock OIDC + vision (refused when `NODE_ENV=production`).

HTTPS: set `DOMAIN` + `PUBLIC_URL` in `.env`, then `make caddy`.

Container: `docker pull ghcr.io/bandulix/merkster:latest` (also tagged `0.1.0` / `0.1`). Every env var is documented in [`.env.example`](.env.example).

### Google redirect

Create a Web OAuth client and set the redirect URI to `<PUBLIC_URL>/api/auth/google/callback`. Optional gates: `SIGNUP_CODE`, `ALLOWED_EMAIL_DOMAINS`, `ALLOWLIST`, `REGISTRATION_OPEN`, `ADMIN_EMAILS`.

## Development

```bash
npm ci && cp .env.example .env
npm run mock-oidc & npm run mock-llm &   # optional
npm run dev:server                       # :8080
npm run dev:web                          # :5173 → proxies /api
```

| | |
|---|---|
| `npm test` | Vitest unit tests |
| `npm run typecheck` | TypeScript strict (web + server) |
| `npx playwright test` | E2E (app + mocks; set `CHROME_PATH` for system Chrome) |
| `make lint` | hadolint + compose config |

Layout: `web/` React PWA · `shared/` pure TS · `server/` Fastify + Postgres · `tools/` mocks. Details and contribution notes live in [CONTRIBUTING.md](CONTRIBUTING.md); release notes in [CHANGELOG.md](CHANGELOG.md).

## Privacy & kids

No ads, no tracking scripts. Supporters see only what the student shares. Results are self-reported unless a supporter marks them verified. Export or delete everything under *Settings → Your data*. If you host Merkster for others, get appropriate parental consent where the law requires it, and keep AI photos on a provider you’re happy with — or leave AI off.

## License

Copyright (C) 2026 bandulix — **AGPL-3.0-only**, see [`LICENSE`](LICENSE).

If you run a modified Merkster as a network service, AGPL §13 requires you to offer users the complete corresponding source. Set `SOURCE_CODE_URL` to the code you actually run (default: `https://github.com/bandulix/merkster`). Vendored Tesseract.js / PDF.js keep their own licenses under `web/public/vendor/`.
