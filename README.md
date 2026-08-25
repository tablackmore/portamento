<p align="center">
  <img src="packages/web/public/favicon.svg" width="88" alt="Portamento logo" />
</p>

<h1 align="center"><em>portamento</em></h1>

<p align="center"><strong>Playlists that glide between services.</strong><br/>
Move playlists between Spotify, TIDAL and YouTube — or share them as a file or a link<br/>
that anyone can open and pour into their own service.</p>

<p align="center">
  <a href="https://tablackmore.github.io/portamento/">Open the app</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#setup">Setup</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

_Portamento_ (It.): gliding smoothly from one note to the next.

## What it does

- **Transfer** — copy a playlist straight from Spotify ↔ TIDAL, or into YouTube, in your browser.
- **Export & share** — bottle a playlist into a portable `.jspf` file _or a plain URL_. Send either to anyone: the link literally contains the whole playlist, so there is nothing to host and no account needed to share.
- **Import** — open a shared file or link, pick a destination service, and Portamento recreates the playlist there, telling you exactly which tracks matched exactly, which are close matches, and which it couldn't find.

**No backend. No database. No tracking.** The app is a static page on GitHub Pages. Your logins (OAuth PKCE) and API keys live in your browser's storage; playlists travel inside files and URL fragments, which never touch a server.

## How it works

- **The file** is [JSPF](https://xspf.org/jspf) — the JSON flavor of the open XSPF playlist standard — with a Portamento extension per track carrying the **ISRC** (the international recording code) and native service IDs. Other XSPF tools can read our files; ours can read theirs.
- **The share link** packs the same JSPF into the URL fragment (`#p=1.…`), deflate-compressed and base64url-encoded. Fragments are never sent to any server. A 50-track playlist is roughly a 6,000-character link — fine for chat apps and email.
- **Matching** is ISRC-first: Spotify and TIDAL both speak ISRC, so most transfers between them are _exact_, not guessed. When ISRC fails, a scored text search (title + artist + duration) takes over, and anything below the confidence bar is honestly reported as not found rather than silently wrong.
- **YouTube is import-only**: turning noisy YouTube videos back into songs is unreliable, so Portamento never pretends to do it.

## Setup

Portamento is open source with no server, so you bring your own (free) API credentials. Open the app's **Settings** page — it shows the redirect URI to register and walks you through each service:

| Service | Where                                                                      | Notes                                                                                          |
| ------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Spotify | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) | Owner needs Premium; dev-mode apps allow you + 4 invited users (Spotify policy since Feb 2026) |
| TIDAL   | [developer.tidal.com/dashboard](https://developer.tidal.com/dashboard)     | Dev-mode rate limits are modest but workable                                                   |
| YouTube | [console.cloud.google.com](https://console.cloud.google.com)               | Enable _YouTube Data API v3_; default quota fits ~2 fifty-track imports per day                |

Client IDs are not secrets (the PKCE flow needs none) and are stored only in your browser.

## Development

```bash
npm install
npm run dev        # app at http://127.0.0.1:5173
npm run test       # core library tests (vitest)
npm run lint       # eslint + prettier check via npm run format:check
npm run build      # library + app production build
```

The monorepo has two workspaces:

- **`packages/core`** — `@portamento/core`: the service-neutral library (JSPF format, share links, PKCE auth, ISRC-first matching, one adapter per service). Zero dependencies, browser-first, works in Node ≥ 20.
- **`packages/web`** — the static app: vanilla TypeScript + Vite, no framework, ~13 kB gzipped.

Deploys to GitHub Pages automatically on every push to `main` (repo Settings → Pages → Source: **GitHub Actions**).

## Roadmap

- **Apple Music** — feasible (MusicKit is browser-native, ISRC lookup included); needs an Apple Developer membership for the developer token. The file format already reserves Apple track IDs.
- **Amazon Music** — blocked: their API is partner-gated. Reserved in the format regardless.

## License

[MIT](LICENSE)
