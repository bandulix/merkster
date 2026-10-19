<p align="center"><img src="brand/logo.svg" width="96" alt="Merkster logo"></p>

# Merkster

**Snap it. Drill it. Own the test. Earn the reward.**

Photo a worksheet → practise until exam day → family can promise a reward for the grade.  
Merkster tracks the promise. It never moves money.

> **Vibe coded** — this app was written with AI coding agents.  
> **LLM API needed** — photo → smart cards needs an OpenAI-compatible vision key (`LLM_BASE_URL` / `LLM_API_KEY` / `LLM_VISION_MODEL` in `.env`). Without it you only get on-device OCR, which is weaker on worksheets.

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

## Try it in two minutes

No Google account. No real LLM key. Mock sign-in + mock vision:

```bash
make mock-env        # creates a mock .env (stop here if you already have one)
make mock
make health          # → http://localhost:8080
```

Open the app → sign in with the mock login → add a test → practise.  
Done exploring? `make down`.

> Mock mode is for local try-outs only (`NODE_ENV=development`). Production refuses the mocks.

## Why people stick

| Student | Family |
|---|---|
| Cards from a photo, not typing all night | Promise a reward for practice or the grade |
| Practice that adapts to the test date | Cheer from your phone when they crush a session |
| Class boss fights & vocab clashes with classmates | See grades/stats only if invited |

## What you get

- **Import** — photo, PDF, or paste → review → cards  
- **Practice** — successive relearning, tolerant checking, EN/DE  
- **Class** — share one scan with the whole class; XP board, boss fights, 1v1 clashes  
- **Family rewards** — rules for grades, practice, report cards (tracked, not paid out)  
- **Offline PWA** — works without a signal; export or delete your data anytime  

## Run for real (Google sign-in)

```bash
make env
$EDITOR .env    # GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, plus LLM_* for vision
make up
make health     # → http://localhost:8080
```

OAuth redirect: `<PUBLIC_URL>/api/auth/google/callback`  
Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_VISION_MODEL` for AI extraction (see [`.env.example`](.env.example)).  
Image: `ghcr.io/bandulix/merkster:latest` (also `0.1.2` / `0.1`)

HTTPS at home: set `DOMAIN` + `PUBLIC_URL`, then `make caddy`.

## Develop

```bash
npm ci && cp .env.example .env
npm run mock-oidc & npm run mock-llm &
npm run dev:server    # :8080
npm run dev:web       # :5173 → proxies /api
```

| | |
|---|---|
| `npm test` | unit tests |
| `npm run typecheck` | TypeScript |
| `npx playwright test` | E2E (set `CHROME_PATH` if needed) |

More in [CONTRIBUTING.md](CONTRIBUTING.md) · changes in [CHANGELOG.md](CHANGELOG.md).

## Privacy & kids

No ads. No tracking scripts. Supporters see only what the student shares.  
Export or delete under *Settings → Your data*. Host for others? Get parental consent where the law asks, and only send photos to an AI provider you’re fine with — or leave AI off.

## License

**AGPL-3.0-only** — see [`LICENSE`](LICENSE).  
Network use of a modified Merkster must offer the corresponding source (`SOURCE_CODE_URL`).
