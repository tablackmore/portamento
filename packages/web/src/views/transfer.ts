import type { PortPlaylist, ServiceAdapter } from '@portamento/core';
import { h, clear, spinner } from '../dom';
import { errorNotice, playlistPicker, runImport, servicePicker } from '../components';
import { saveResume } from '../state';
import { clientIdFor } from '../state';
import { toast } from '../dom';
import type { App } from '../main';

/** Direct transfer = export chained into import; the playlist never leaves the browser. */
export function transferView(app: App): HTMLElement[] {
  const body = h('div');
  const card = h(
    'div',
    { className: 'card' },
    h('h2', { text: 'Transfer' }),
    h('p', { className: 'sub', text: 'From which service?' }),
    body,
  );

  body.append(
    servicePicker(
      app,
      app.adapters.filter((a) => a.canExport),
      () => ({ view: 'transfer' }),
      (source) => pickPlaylist(app, source, body),
    ),
  );

  return [card];
}

function pickPlaylist(app: App, source: ServiceAdapter, body: HTMLElement): void {
  clear(body);
  body.append(
    h('p', { className: 'sub', text: `Choose a ${source.label} playlist.` }),
    playlistPicker(source, (id, name) => {
      clear(body);
      body.append(spinner(`Reading “${name}”…`));
      void source
        .exportPlaylist(id)
        .then((playlist) => pickDestination(app, source, playlist, body))
        .catch((e: unknown) => {
          clear(body);
          body.append(errorNotice(e));
        });
    }),
  );
}

function pickDestination(
  app: App,
  source: ServiceAdapter,
  playlist: PortPlaylist,
  body: HTMLElement,
): void {
  clear(body);
  const runArea = h('div');
  const destinations = app.adapters.filter((a) => a.id !== source.id);

  const row = h('div', { className: 'btn-row' });
  for (const dest of destinations) {
    row.append(
      h(
        'button',
        {
          className: 'btn',
          onClick: () => {
            if (!clientIdFor(app.settings, dest.id)) {
              toast(`Add your ${dest.label} client ID first`);
              app.navigate('settings');
              return;
            }
            if (!dest.isConnected()) {
              // The exported playlist rides along through the OAuth redirect,
              // landing in the import view with the destination connected.
              saveResume({ view: 'import', playlist });
              void dest.login();
              return;
            }
            runImport(dest, playlist, runArea);
          },
        },
        h('span', { className: `dot ${dest.id}` }),
        dest.label,
        dest.isConnected() ? h('span', { className: 'mono', text: '· connected' }) : null,
      ),
    );
  }

  body.append(
    h('div', { className: 'verdict', text: playlist.title }),
    h('p', {
      className: 'sub',
      text: `${playlist.tracks.length} tracks · now pick a destination.`,
    }),
    row,
    runArea,
  );
}
