# Changelog

All notable changes to Merkster are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [semantic versions](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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
- The repository is public. The previous container package was deleted and `ghcr.io/bandulix/merkster` is published again as `latest`, `1.0`, and `1.0.0`. The new package is public and can be pulled without logging in.
- Docker Compose publishes `PORT` from `.env` on the host and inside the container.
- `docker-compose.yml` runs the published image `ghcr.io/bandulix/merkster:latest` instead of building a local `merkster:latest`.

### Security

- PDF import uses PDF.js 4 with JavaScript inside the file switched off, so a worksheet cannot run script in the browser. When `DATABASE_SSL` is on, the database certificate is checked unless `DATABASE_SSL_INSECURE` is set. Expired sign-in sessions are deleted on the next sign-in.

### Fixed

- The add-cards heading bolds the test name inside the sentence. It no longer shows a leftover `<b>` tag.
- The reward amount next to the currency stays wide enough to read the number on a desktop screen.

## [1.0.0] - 2026-10-17

First published version. The container image is `ghcr.io/bandulix/merkster:1.0.0`.

### Added

- Exam-prep PWA: photo, PDF, and paste import, review before save, successive-relearning practice, and EN/DE UI.
- Tests with dates and formats, self-reported results in eight grading systems, and report cards.
- Supporters, cheers, reward promises, and a clearly labelled simulator. Merkster records promises and does not move money.
- Offline-first sync, Google sign-in, optional signup codeword, and GDPR export and delete.
- Docker Compose for the app and Postgres 16, plus mock Google and mock vision services for local tests.
- AGPL-3.0-only license, with a source-code link for network use.
- Community docs: contributing guide, code of conduct, issue templates, and pull request template.
- GitHub Actions publishes the server image to GitHub Container Registry when a `vX.Y.Z` tag is pushed.

[1.0.0]: https://github.com/bandulix/merkster/releases/tag/v1.0.0
