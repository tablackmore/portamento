# CLAUDE.md

Guidance for AI assistants (and humans) working in this repo.

## What this is

Portamento moves playlists between Spotify, TIDAL and YouTube via a portable
JSPF file or a share URL that contains the whole playlist in its fragment.
Static app, no backend: OAuth (PKCE) and API calls run entirely in the
browser. `packages/core` is the zero-dependency library; `packages/web` is the
vanilla TS + Vite app deployed to GitHub Pages.

## Git workflow — linear history, PRs only

- `main` is protected. **Every change goes through a pull request** — no
  direct pushes, including from maintainers and assistants.
- **History is linear: merge commits are disabled repo-wide.** PRs land via
  squash merge (default) or rebase; branch protection enforces
  `required_linear_history`.
- **PR titles must be Conventional Commits** (`feat(core): …`, `fix(web): …`,
  `ci: …`, `docs: …`). The squash commit takes the PR title as its message, so
  the title _is_ the history — CI rejects non-conforming titles.
- Required checks before merge: `check` (lint, format, typecheck, tests with
  coverage thresholds, build) and `lint-title`. Branches must be up to date
  with `main` before merging.
- Branches auto-delete after merge.

## Commands

```bash
npm run dev            # app dev server at http://127.0.0.1:5173
npm run test           # core tests (vitest)
npm run test:coverage  # tests + enforced coverage thresholds (what CI runs)
npm run lint           # eslint
npm run format         # prettier --write (run before committing)
npm run typecheck      # tsc across workspaces, includes test files
npm run build          # core dist + web production build
```

## Conventions

- Core stays **zero-runtime-dependency** and browser-first; relative imports
  in `packages/core/src` use explicit `.js` extensions so the emitted ESM
  works in plain Node as well as bundlers.
- Pure logic (format, share codec, matching, PKCE) is unit-tested; coverage
  thresholds (85% lines/functions, 80% branches) are enforced on those
  modules. Service adapters and the OAuth redirect flow are exercised
  manually — they need live APIs.
- Adapter changes should cite the endpoint/doc they follow; service APIs
  drift. Known caveat: the TIDAL adapter was written from the official
  OpenAPI spec and may need small shape fixes on first live use.
- UI changes: verify at a mobile width (~390px) and desktop; keep 44px touch
  targets, `:focus-visible` rings and `prefers-reduced-motion` handling.
- Design system (see `packages/web/src/style.css`): dark only, single mint
  accent `#6ee7a8`, hairline white-alpha borders, Fraunces / Hanken Grotesk /
  Fragment Mono. The mint→blue gradient appears **only** in the logo.

## Platform limits worth remembering

- Spotify dev-mode: owner needs Premium, max 5 authorized users, search
  `limit=10`, playlist items live at `/playlists/{id}/items`.
- YouTube: ~100 searches/day ≈ two 50-track imports per Google project;
  import-only by design.
- Users bring their own client IDs (app Settings) — they are not secrets.
