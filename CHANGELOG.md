# Changelog

All notable changes to Merkster are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [semantic versions](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Students can create a class, invite classmates, and share a test so the cards are copied instead of scanned again. Each class has an XP leaderboard. The student who created the class sets its cover, name and motto.

### Changed

- The repository is public. The previous container package was deleted and `ghcr.io/bandulix/merkster` is published again as `latest`, `1.0`, and `1.0.0`. The new package is public and can be pulled without logging in.

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
