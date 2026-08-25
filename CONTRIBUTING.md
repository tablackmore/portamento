# Contributing to Portamento

Thanks for helping playlists glide! This project is small on purpose — a zero-dependency core library and a framework-free web app — and contributions that keep it small are the most welcome kind.

## Ground rules

- **All changes land through pull requests.** `main` is protected; nobody pushes to it directly, including maintainers.
- **Conventional Commits.** PRs are squash-merged and the PR title becomes the commit message, so title your PR like a conventional commit — CI checks it:
  - `feat(core): add Apple Music adapter`
  - `fix(web): keep share links working after OAuth redirect`
  - `docs: explain YouTube quota math`
  - Types we use: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **CI must be green**: lint, format, tests, build.

## Getting started

```bash
git clone git@github.com:tablackmore/portamento.git
cd portamento
npm install
npm run dev
```

You'll need your own API client IDs to exercise real transfers — the app's Settings page explains how to get each one (free). Much of the core library needs no credentials at all: format, share links and matching are pure functions with tests.

## Project layout

```
packages/core/src/
  format/     JSPF read/write + share-link codec   ← fully unit-tested, no network
  matching/   normalization + scoring              ← fully unit-tested, no network
  auth/       PKCE + OAuth client
  services/   spotify.ts · tidal.ts · youtube.ts   ← one adapter per service
packages/web/src/
  views/      one file per screen
  components.ts, dom.ts, state.ts, main.ts, style.css
```

## What a good PR looks like

- Pure logic changes (format, matching) come with vitest cases in the same directory.
- Adapter changes state which endpoint/doc they follow — service APIs drift, receipts help reviewers.
- UI changes include a screenshot at a mobile width (~390px) and a desktop width.
- New adapters implement the `ServiceAdapter` interface in one file and add a service dot color + settings entry; nothing else should need touching.

## Useful scripts

| Command                                                   | Does                            |
| --------------------------------------------------------- | ------------------------------- |
| `npm run dev`                                             | app dev server (127.0.0.1:5173) |
| `npm run test` / `npm run test:watch -w @portamento/core` | core tests                      |
| `npm run lint` / `npm run format`                         | eslint / prettier write         |
| `npm run build`                                           | full production build           |

## Repo settings (maintainers)

For the PR-only workflow, enable on GitHub: Settings → Branches → protect `main` (require a pull request before merging, require status checks: **CI / check** and **Conventional PR title / lint-title**). Settings → General → Pull Requests: allow **squash merging only**, default to PR title for the commit message. Settings → Pages → Source: **GitHub Actions**.
