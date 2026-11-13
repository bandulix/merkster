# Changelog

All notable changes to Merkster are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [semantic versions](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A study plan can make its cards in one of two ways, and the choice can be changed later. Photograph your own book or worksheet pages, and the cards come only from those photos. Or let the AI look the topic up: it reads Wikipedia (German first, then English), then Wikibooks, then Klexikon, and writes cards only from that article.
- Each researched card names its source (`Quelle: Wikipedia – Artikel`) with the article URL and the revision it was written from. A card whose answer is not in the article is dropped. If no article is found, the app says so and offers the photo path instead of inventing a fact.
- Original photos are deleted when processing succeeds. A failed upload is kept only for a short retry window, then a startup cleanup removes it. Photos are not used to train a model. The upload step says this in a short notice.

## [0.2.0] - 2026-11-12

Minor release. The container image is `ghcr.io/bandulix/merkster:0.2.0` (also `latest` and `0.2`).

### Added

- Lernziele plans for any subject. Photograph a sheet, review the extracted goals, answer a clarifying question only when the plan needs it, and get a day-by-day programme. The method follows the kind of knowledge (retrieval, worked examples, self-explanation, outlines, sequence drills, mixed practice).
- Shared and social plans. A second photo of the same sheet joins the existing programme. Each student keeps their own schedule and progress. First names only.
- Grades, stats, Erfolgsquote, and compare. Enter the mark (German 1–6 with +/−, Oberstufe points, or percent), see a success rate against a target, a trend, and plan versus no plan. Compare with someone on the same plan or in the same class. Exact grades are opt-in.
- Merki, an alien mascot. Years 1–4 get a round, bouncy Merki; years 5–7 a middle one; year 8 and up a calm Merki with a hood and visor. Speech is one-way: a greeting or a nudge on Today, and a short line beside a plan, a session, or the grade stats. Saving a grade can open one full-screen moment. Lines are generated on the server, cached per day and trigger, and fall back to fixed copy. They can be muted.
- Custom avatars and sharing. A companion has a name, a face (a built-in alien or a photo), and a personality that speaks in Merki’s places. Share with a code, revoke it, or go back to Merki. Photos are cropped, resized, and stripped of camera data. The personality cannot override the safety rules.
- Probeprüfung. A practice test opens 3–5 days before the exam, mixes question types, grades what it can, and puts weak goals back into the plan. A shared plan reuses the paper. Scores stay private unless the grade privacy setting allows a summary.
- Erklär's mir anders. The same card comes back as an example, a memory hook, steps, or a small sketch. Cached per card, style, and language. Unsafe lines fall back to a fixed sentence.
- Offline mode and push reminders. An offline pack keeps the cards already on the device, and a merge keeps the further-along review. Web Push reminders are opt-in, once a day, with quiet hours from 20:00 to 07:00.
- Cooperative weekly challenges on a shared plan: 20 units together, contributions without a ranking, and a way to sit the week out.
- One streak joker per week, applied automatically on a missed day. Finishing a group challenge earns one more. Merki comments when a joker is used.
- Class boss fight: the class picks a shared test and chips a shared HP bar by practising that deck correctly. 1v1 vocab clash: challenge a classmate on a shared deck; the server grades answers and names a winner.

### Changed

- Today lists each test once. Onboarding keeps the next step on screen. Compare explains an empty You column, and a first grade is a labelled mark instead of a blank chart. The streak card uses the full width. Practice, explain, offline, and the streak joker each use one clear action. Tap targets are at least 44px.
- The first JavaScript load no longer includes OCR or the secondary pages. Those screens load with their routes. Review lookups use partial indexes for plan members, reminders, push preferences, companion grants, and Merki lines.
- Practice, results, home, review, import, and vocab clash use a more tactile layout: segmented question progress, whole-tile answer feedback, stat chips with an XP glow, a daily-review hero, a stacked card preview, and a versus bar. Logo, palette, and type stay the same.
- Count labels use the singular when the number is 1 (for example “1 Tag in Folge”). The session time chip shows a duration, and confetti stays behind buttons.

### Removed

- Zeugnis upload, the grade simulator, and reward rules that depended on a report card.
- Parent and family invites, supporter accounts, family cheers, and promised rewards. Classmates and shared-plan members stay.

### Security

- A practice paper and its answer key require ownership or an active shared-plan membership.
- A push endpoint cannot be moved onto another account.
- Explanations count toward the same hourly and daily AI limits as extraction. Student text sent to the model is wrapped as data. The explanation cache key includes the language.
- Profile and companion pictures drop camera data. PNG uploads drop ancillary text chunks. A truncated companion upload is rejected as too large. Class boards show a first name.

## [0.1.2] - 2026-10-18

Patch release. The container image is `ghcr.io/bandulix/merkster:0.1.2` (also `latest` and `0.1`).

### Added

- Incentive rules can set a valid-as-of date so past practice and grades do not count toward a new reward.
- Invited parents and other relatives can see the student's grades and practice stats when the invite grants that access.

### Changed

- Cloud Agent environment installs Chrome and OpenSSL so Playwright and TLS tooling work in the agent image.

## [0.1.1] - 2026-10-18

Patch release. The container image is `ghcr.io/bandulix/merkster:0.1.1` (also `latest` and `0.1`).

### Changed

- README is shorter and leads with real app screenshots from `screenshots/` instead of the brand sheet.
- UX polish from the design review: toast queue, New Test wizard layout, localized OCR notes, invite loopback gating, primary Cheer CTA, Profile social-first with collapsed badges, progressive Results charts, locked taglines, Extrarunde contrast, desktop Today layout, pluralization, multi-currency expander, simulator unlock chips, and modal focus trap with skip link.

## [0.1.0] - 2026-10-18

First published version. The container image is `ghcr.io/bandulix/merkster:0.1.0`.

### Added

- Exam-prep PWA: photo, PDF, and paste import, review before save, successive-relearning practice, and EN/DE UI.
- Tests with dates and formats, self-reported results in eight grading systems, and report cards.
- Supporters, cheers, reward promises, and a clearly labelled simulator. Merkster records promises and does not move money.
- Offline-first sync, Google sign-in, optional signup codeword, and GDPR export and delete.
- Docker Compose for the app and Postgres 16, plus mock Google and mock vision services for local tests.
- AGPL-3.0-only license, with a source-code link for network use.
- Community docs: contributing guide, code of conduct, issue templates, and pull request template.
- GitHub Actions publishes the server image to GitHub Container Registry when a `vX.Y.Z` tag is pushed.
- Parents, grandparents, aunts and uncles can share one reward for the same student, or share every reward so the set stays the same when either person adds a new one. An invite link can do either. The student still sees each promise once.
- Photo and PDF uploads are checked before AI extraction. Merkster only reads worksheets, notes, vocabulary, textbook pages, and report cards. Other pictures are refused, and they are not turned into cards on the device either. If the check itself does not clearly say yes, the upload is refused.
- Profile pictures can be chosen, replaced, and removed. The picture is stored and shown the same way as the cached Google picture. A later Google login leaves a picture the student set, or the choice to show initials, as it is.
- A student can create at most 3 tests in any 24 hours, and each test can include at most 10 pictures. Both limits are enforced on the server. Deleting a test does not give the slot back.
- A student without a parent sees a prompt on Today, right after a new test, and at the end of the intro: invite a parent so a reward can start. The prompt leaves once a parent has joined. Practice stays one tap away.
- Students can create a class, invite classmates, and share a test so the cards are copied instead of scanned again. Each class has an XP leaderboard. The student who created the class sets its cover, name and motto.

### Changed

- The login page, intro, invites, share cards, and README pitch a promised reward with the same weight as practice. English and German both name the parent reward and the extra report-card reward beside snap-and-drill.
- A page load no longer asks the database who is signed in for every font, script and icon. The class leaderboard and a sync of practice sessions each use one query for the whole group.
- Exam-grade rewards and report-card rewards are separate. A Klausur pays only an exam rule. A report-card reward is extra, and it can apply to every report card or only the end-of-year report.
- Every page sends `noindex`, in the HTML shell and on each response, so the app stays out of search engines.
- The repository is public. The container package is `ghcr.io/bandulix/merkster`, tagged `latest`, `0.1`, and `0.1.0`. The package is public and can be pulled without logging in.
- Docker Compose publishes `PORT` from `.env` on the host and inside the container.
- `docker-compose.yml` runs the published image `ghcr.io/bandulix/merkster:latest` instead of building a local `merkster:latest`.

### Security

- PDF import uses PDF.js 4 with JavaScript inside the file switched off, so a worksheet cannot run script in the browser. When `DATABASE_SSL` is on, the database certificate is checked unless `DATABASE_SSL_INSECURE` is set. Expired sign-in sessions are deleted on the next sign-in.

### Fixed

- PDF.js loads from the vendored file while developing. The app starts again, and JavaScript inside a worksheet stays switched off.
- The add-cards heading bolds the test name inside the sentence. It no longer shows a leftover `<b>` tag.
- The reward amount next to the currency stays wide enough to read the number on a desktop screen.

[0.2.0]: https://github.com/bandulix/merkster/releases/tag/v0.2.0
[0.1.2]: https://github.com/bandulix/merkster/releases/tag/v0.1.2
[0.1.1]: https://github.com/bandulix/merkster/releases/tag/v0.1.1
[0.1.0]: https://github.com/bandulix/merkster/releases/tag/v0.1.0
