<p align="center"><img src="brand/logo.svg" width="96" alt="Merkster logo"></p>

# Merkster

**Snap it. Drill it. Own the test.**

Photo a vocab list or a sheet of learning goals → practise until exam day.  
Merkster picks a method for each goal and keeps the plan paced to the exam.  
The light design is a warm grey page, white cards, and a soft lime wash on the daily review.

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
  <img src="screenshots/mobile-43-plan.png" width="240" alt="Study plan with methods">
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

| Student | Class |
|---|---|
| Cards from a photo, or a plan from a Lernziele sheet | Share one scan with the whole class |
| The method follows the kind of knowledge | Boss fights and vocab clashes |
| Practice that adapts when a day is missed | See a classmate’s progress on the same sheet |

## What you get

- **Import** — photo, PDF, or paste → review → cards  
- **Learning goals** — photo a Lernziele sheet for any subject. The app extracts the goals, asks only if something important is missing, picks a method, and builds the programme up to the exam. Cards then come from your own photos, or from a cited Wikipedia, Wikibooks or Klexikon article — never from an invented fact  
- **Same sheet** — a second student can join that plan (own progress, same tasks) instead of generating it again  
- **Grades** — enter the mark after the exam (1–6, points, or percent). Stats show a success rate (Erfolgsquote), a trend, and plan vs no plan. Compare that rate with someone on the same plan or in the same class. Exact grades stay opt-in  
- **Practice** — successive relearning, tolerant checking, EN/DE  
- **Class** — share one scan with the whole class; XP board, boss fights, 1v1 clashes  
- **Merki** — an alien who speaks in one short bubble (no chat). Today gets a greeting or a “time to learn” card. A plan, a session, and the grade stats get a small line beside the content. Saving a grade can open one full-screen moment. The line is written on the server from the student’s name, year, streak, and plan, cached for the day, and replaced by a fixed line if the model fails. Years 1–4 get a bouncy Merki, years 5–7 a middle one, year 8 and up a calm one with a visor. Quiet mode is in Settings. One bubble at a time.
- **Custom avatars** — a companion can speak in Merki’s places: a face (a built-in alien, or a photo cropped to a circle), a name, and a short personality. The personality is only tone, and the same safety rules still apply. Share a code with someone you study with, or take it back. Merki stays available.
- **Practice test (Probeprüfung)** — a few days before the exam (3, 4 or 5, you choose) the subject gets a short mixed paper. Choices and short answers are graded on the server; a written answer is checked gently. Weak goals are added back into the remaining days. On a shared plan the paper is the same; the score stays private unless grade privacy allows a summary.
- **Explain it another way (Erklär's mir anders)** — on a wrong answer, or whenever you ask, the same card comes back as an example, a memory hook, steps, or a small sketch. The line is cached per language. Links, shame and pressure are dropped.
- **Offline and push reminders** — today’s cards stay on the device, and a synced answer keeps the further-along review. Push reminders are off until you opt in, at most once a day, and never before 07:00 or after 20:00. The text uses the companion’s name.
- **Shared challenge** — a plan can aim for 20 units together this week. The bar is the group. Names are listed alphabetically. You can sit a week out. Merki celebrates when the group reaches it.
- **Streak joker** — one freeze each week, used on its own if a day is missed. A finished group challenge earns one more. Merki says so when it was used.  

## Run for real (Google sign-in)

```bash
make env
$EDITOR .env    # GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, plus LLM_* for vision
make up
make health     # → http://localhost:8080
```

OAuth redirect: `<PUBLIC_URL>/api/auth/google/callback`  
Image: `ghcr.io/bandulix/merkster:latest` (also `0.3.0` / `0.3`)

HTTPS at home: set `DOMAIN` + `PUBLIC_URL`, then `make caddy`.

### Environment

Every variable is listed in [`.env.example`](.env.example). The ones a real install usually sets:

| Variable | What it does |
|---|---|
| `APP_SECRET`, `POSTGRES_PASSWORD` | Session secret and database password |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google sign-in |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_VISION_MODEL` | Photo and Lernziele extraction, Merki lines, and “explain it another way” |
| `LLM_TEXT_MODEL` | Optional text model. Defaults to the vision model |
| `LLM_IMAGE_MODEL` | Optional. Draws a companion. The draw button stays hidden when this is unset |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push reminders. When unset, the server generates a key pair in memory. That is fine for a demo and is lost on restart |
| `WIKI_API_BASE` | Optional. Empty uses Wikipedia, Wikibooks and Klexikon. Point it at a mock for tests |
| `PHOTO_RETRY_MINUTES` | How long a failed upload is kept before it is deleted. Default 15. A successful upload is deleted at once |

Push reminders also need a browser that allows notifications. Quiet hours stay 20:00–07:00 either way.

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

No ads. No tracking scripts. Classmates on a shared plan see a first name and, by default, a success rate — not each grade, and never a note. A shared plan still shares the generated cards, including their wording and any figure that was extracted as text.  
Photos of worksheets and book pages are used once to make that student’s cards. They are not used to train an AI model. The original file is deleted as soon as processing succeeds, and a failed upload is deleted after a short retry window (`PHOTO_RETRY_MINUTES`, default 15).  
Export or delete under *Settings → Your data*. Host for others? Get parental consent where the law asks, and only send photos to an AI provider you’re fine with — or leave AI off.

## License

**AGPL-3.0-only** — see [`LICENSE`](LICENSE).  
Network use of a modified Merkster must offer the corresponding source (`SOURCE_CODE_URL`).
