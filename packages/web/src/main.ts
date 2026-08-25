import './style.css';
import { playlistFromShareFragment } from '@portamento/core';
import type { PortPlaylist, ServiceAdapter, ServiceId } from '@portamento/core';
import { h, clear, toast } from './dom';
import { buildAdapters, loadSettings, takeResume } from './state';
import type { Settings } from './state';
import { homeView } from './views/home';
import { exportView } from './views/export';
import { importView } from './views/import';
import { transferView } from './views/transfer';
import { settingsView } from './views/settings';

export type ViewName = 'home' | 'transfer' | 'export' | 'import' | 'settings';

export interface App {
  settings: Settings;
  adapters: ServiceAdapter[];
  adapter(id: ServiceId): ServiceAdapter | undefined;
  navigate(view: ViewName, data?: { playlist?: PortPlaylist }): void;
  /** Rebuild adapters after settings change and re-render the current view. */
  refresh(): void;
}

// Static, trusted markup only — never interpolate user or API content here.
const LOGO_SVG = `<svg viewBox="0 0 64 64" role="img" aria-label="Portamento logo">
  <defs><linearGradient id="glide-m" x1="0" y1="1" x2="1" y2="0">
    <stop offset="0" stop-color="#74f0b7"/><stop offset="1" stop-color="#6aa4ff"/>
  </linearGradient></defs>
  <path d="M 14 44 C 30 44, 34 20, 50 20" fill="none" stroke="url(#glide-m)" stroke-width="5" stroke-linecap="round"/>
  <circle cx="14" cy="44" r="6" fill="#74f0b7"/>
  <circle cx="50" cy="20" r="6" fill="#6aa4ff"/>
</svg>`;

const NAV: Array<{ view: ViewName; label: string }> = [
  { view: 'home', label: 'Home' },
  { view: 'transfer', label: 'Transfer' },
  { view: 'export', label: 'Export' },
  { view: 'import', label: 'Import' },
  { view: 'settings', label: 'Settings' },
];

function createApp(root: HTMLElement): App {
  let current: ViewName = 'home';
  let currentData: { playlist?: PortPlaylist } | undefined;

  const navEl = h('nav', { className: 'nav' });
  const viewEl = h('main', { className: 'view' });

  const app: App = {
    settings: loadSettings(),
    adapters: buildAdapters(loadSettings()),
    adapter: (id) => app.adapters.find((a) => a.id === id),
    navigate(view, data) {
      current = view;
      currentData = data;
      render();
    },
    refresh() {
      app.settings = loadSettings();
      app.adapters = buildAdapters(app.settings);
      render();
    },
  };

  function render(): void {
    clear(navEl);
    for (const item of NAV) {
      navEl.append(
        h('button', {
          text: item.label,
          ariaCurrent: String(item.view === current),
          onClick: () => app.navigate(item.view),
        }),
      );
    }
    clear(viewEl);
    const views: Record<ViewName, () => HTMLElement[]> = {
      home: () => homeView(app),
      transfer: () => transferView(app),
      export: () => exportView(app),
      import: () => importView(app, currentData),
      settings: () => settingsView(app),
    };
    viewEl.append(...views[current]());
  }

  const masthead = h(
    'header',
    { className: 'masthead' },
    h('span', { html: LOGO_SVG }),
    h(
      'div',
      {},
      h('div', { className: 'word', text: 'portamento' }),
      h('div', { className: 'tag', text: 'playlists that glide between services' }),
    ),
  );

  root.append(masthead, navEl, viewEl);
  render();
  return app;
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#app');
  if (!root) return;
  const app = createApp(root);

  // 1. Finish any OAuth round-trip that brought us back to this page.
  let loginError: string | null = null;
  let loggedIn = false;
  for (const adapter of app.adapters) {
    try {
      if (await adapter.completeLoginRedirect()) {
        loggedIn = true;
        toast(`${adapter.label} connected`);
        break;
      }
    } catch (e) {
      loginError = e instanceof Error ? e.message : 'Login failed';
    }
  }
  if (loginError) toast(loginError);

  // Share links must also work when the app is already open — navigating from
  // "/" to "/#p=…" is a fragment-only change, so the page never reloads.
  window.addEventListener('hashchange', () => void openShareFragment(app));

  // 2. Resume whatever flow the login interrupted.
  const resume = takeResume();
  if (resume && (loggedIn || loginError === null)) {
    app.navigate(resume.view, resume.playlist ? { playlist: resume.playlist } : undefined);
    return;
  }

  // 3. A share link? Straight to import with the playlist decoded.
  await openShareFragment(app);
}

async function openShareFragment(app: App): Promise<void> {
  try {
    const shared = await playlistFromShareFragment(location.hash);
    if (shared) app.navigate('import', { playlist: shared });
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not read that share link');
  }
}

void boot();
