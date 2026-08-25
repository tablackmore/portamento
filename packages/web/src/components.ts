import { AuthRequiredError, QuotaExceededError } from '@portamento/core';
import type {
  ImportReport,
  PortPlaylist,
  ServiceAdapter,
  ServiceId,
  TrackMatch,
} from '@portamento/core';
import { h, clear, spinner, toast } from './dom';
import { clientIdFor, saveResume } from './state';
import type { App } from './main';
import type { ResumeState } from './state';

/** A service choice button: brand dot, name, connection state. */
export function serviceButton(
  adapter: ServiceAdapter,
  onClick: () => void,
  hint?: string,
): HTMLButtonElement {
  return h(
    'button',
    { className: 'btn', onClick },
    h('span', { className: `dot ${adapter.id}` }),
    adapter.label,
    adapter.isConnected()
      ? h('span', { className: 'mono', text: '· connected' })
      : hint
        ? h('span', { className: 'mono', text: `· ${hint}` })
        : null,
  );
}

/**
 * Renders service buttons and handles the connect dance: missing client ID →
 * settings; not connected → stash flow state and start OAuth (page navigates
 * away); connected → hand the adapter to the flow.
 */
export function servicePicker(
  app: App,
  services: ServiceAdapter[],
  resumeFor: (id: ServiceId) => ResumeState & { playlist?: PortPlaylist },
  onReady: (adapter: ServiceAdapter) => void,
): HTMLElement {
  const row = h('div', { className: 'btn-row' });
  for (const adapter of services) {
    row.append(
      serviceButton(
        adapter,
        () => {
          if (!clientIdFor(app.settings, adapter.id)) {
            toast(`Add your ${adapter.label} client ID first`);
            app.navigate('settings');
            return;
          }
          if (!adapter.isConnected()) {
            saveResume(resumeFor(adapter.id));
            void adapter.login();
            return;
          }
          onReady(adapter);
        },
        clientIdFor(app.settings, adapter.id) ? undefined : 'needs setup',
      ),
    );
  }
  return row;
}

/** Loads and lists the user's playlists on a service; click hands one back. */
export function playlistPicker(
  adapter: ServiceAdapter,
  onPick: (id: string, name: string) => void,
): HTMLElement {
  const box = h('div', { className: 'rows' }, spinner(`Loading your ${adapter.label} playlists…`));
  void adapter
    .listMyPlaylists()
    .then((playlists) => {
      clear(box);
      if (playlists.length === 0) {
        box.append(h('p', { className: 'sub', text: 'No playlists found on this account.' }));
        return;
      }
      for (const p of playlists) {
        box.append(
          h(
            'button',
            { className: 'row', onClick: () => onPick(p.id, p.name) },
            h('div', { className: 'grow' }, h('div', { className: 'name', text: p.name })),
            h('span', { className: 'meta', text: `${p.trackCount} tracks` }),
          ),
        );
      }
    })
    .catch((e: unknown) => {
      clear(box);
      box.append(errorNotice(e));
    });
  return box;
}

/** Runs an import with live progress, then swaps in the match report. */
export function runImport(
  adapter: ServiceAdapter,
  playlist: PortPlaylist,
  mount: HTMLElement,
): void {
  const fill = h('div', { className: 'fill' });
  const stage = h('div', { className: 'stage', text: 'warming up…' });
  clear(mount);
  mount.append(h('div', { className: 'progress' }, h('div', { className: 'bar' }, fill), stage));

  const stageNames = {
    matching: 'matching tracks',
    creating: 'creating playlist',
    adding: 'adding tracks',
  } as const;

  void adapter
    .importPlaylist(playlist, (done, total, s) => {
      fill.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
      stage.textContent = `${stageNames[s]} · ${done}/${total}`;
    })
    .then((report) => {
      clear(mount);
      mount.append(reportView(report, adapter));
    })
    .catch((e: unknown) => {
      clear(mount);
      mount.append(errorNotice(e));
    });
}

/** The post-import report: verdict, actions, and a per-track account. */
export function reportView(report: ImportReport, adapter: ServiceAdapter): HTMLElement {
  const exact = report.matches.filter((m) => m.method === 'service-id' || m.method === 'isrc');
  const fuzzy = report.matches.filter((m) => m.method === 'search');
  const missed = report.matches.filter((m) => m.method === 'none');
  const landed = exact.length + fuzzy.length;

  const rows = h('div', { className: 'rows' });
  for (const m of report.matches) rows.append(matchRow(m));

  return h(
    'div',
    { className: 'card' },
    h('div', {
      className: 'verdict',
      text:
        missed.length === 0
          ? `All ${landed} tracks glided across.`
          : `${landed} of ${report.matches.length} tracks glided across.`,
    }),
    h('p', {
      className: 'sub',
      text:
        `${exact.length} exact · ${fuzzy.length} close match · ${missed.length} not found` +
        (fuzzy.length ? ' — close matches are worth a listen.' : ''),
    }),
    report.playlistUrl
      ? h(
          'div',
          { className: 'btn-row' },
          h(
            'a',
            { className: 'btn primary', href: report.playlistUrl, target: '_blank' },
            `Open in ${adapter.label}`,
          ),
        )
      : null,
    h('div', { className: 'sub' }),
    rows,
  );
}

function matchRow(m: TrackMatch): HTMLElement {
  const badge =
    m.method === 'none'
      ? h('span', { className: 'badge miss', text: 'not found' })
      : m.method === 'search'
        ? h('span', { className: 'badge fuzzy', text: `≈ ${Math.round(m.confidence * 100)}%` })
        : h('span', { className: 'badge exact', text: m.method === 'isrc' ? 'ISRC' : 'exact' });

  return h(
    'div',
    { className: 'row report-row' },
    h(
      'div',
      { className: 'grow' },
      h('div', { className: 'name', text: `${m.track.title} — ${m.track.artists.join(', ')}` }),
      m.method === 'search' && m.matchedTitle
        ? h('div', { className: 'matched', text: `→ ${m.matchedTitle}` })
        : null,
    ),
    badge,
  );
}

export function errorNotice(e: unknown): HTMLElement {
  let message = 'Something went wrong. Please try again.';
  if (e instanceof AuthRequiredError || e instanceof QuotaExceededError) message = e.message;
  else if (e instanceof Error && e.message) message = e.message;
  return h('div', { className: 'notice error', text: message });
}
