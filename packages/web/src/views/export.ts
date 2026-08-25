import {
  playlistToShareUrl,
  serializePlaylist,
  suggestFilename,
  SHARE_URL_COMFORT_LIMIT,
} from '@portamento/core';
import type { PortPlaylist, ServiceAdapter } from '@portamento/core';
import { h, clear, downloadText, spinner, toast } from '../dom';
import { errorNotice, playlistPicker, servicePicker } from '../components';
import type { App } from '../main';

export function exportView(app: App): HTMLElement[] {
  const body = h('div');
  const card = h(
    'div',
    { className: 'card' },
    h('h2', { text: 'Export & share' }),
    h('p', { className: 'sub', text: 'Pick the service the playlist lives on.' }),
    body,
  );

  body.append(
    servicePicker(
      app,
      app.adapters.filter((a) => a.canExport),
      () => ({ view: 'export' }),
      (adapter) => showPlaylists(app, adapter, body),
    ),
  );

  return [card];
}

function showPlaylists(app: App, adapter: ServiceAdapter, body: HTMLElement): void {
  clear(body);
  body.append(
    h('p', { className: 'sub', text: `Choose a ${adapter.label} playlist to export.` }),
    playlistPicker(adapter, (id) => {
      clear(body);
      body.append(spinner('Reading playlist…'));
      void adapter
        .exportPlaylist(id)
        .then((playlist) => showResult(app, playlist, body))
        .catch((e: unknown) => {
          clear(body);
          body.append(errorNotice(e));
        });
    }),
  );
}

function showResult(app: App, playlist: PortPlaylist, body: HTMLElement): void {
  clear(body);
  const actions = h('div', { className: 'btn-row' });

  actions.append(
    h(
      'button',
      {
        className: 'btn primary',
        onClick: () => {
          downloadText(suggestFilename(playlist), serializePlaylist(playlist));
        },
      },
      '↓ Download file',
    ),
    h(
      'button',
      {
        className: 'btn',
        onClick: () => {
          void shareLink(playlist, 'copy');
        },
      },
      '⧉ Copy link',
    ),
  );
  if ('share' in navigator) {
    actions.append(
      h(
        'button',
        {
          className: 'btn',
          onClick: () => {
            void shareLink(playlist, 'share');
          },
        },
        '⇪ Share…',
      ),
    );
  }
  actions.append(
    h(
      'button',
      { className: 'btn ghost', onClick: () => app.navigate('import', { playlist }) },
      '→ Import elsewhere',
    ),
  );

  body.append(
    h('div', { className: 'verdict', text: playlist.title }),
    h('p', {
      className: 'sub',
      text: `${playlist.tracks.length} tracks bottled up and ready to travel.`,
    }),
    actions,
    h('p', {
      className: 'footer',
      text: 'The file and the link both contain the whole playlist — send either to anyone.',
    }),
  );
}

async function shareLink(playlist: PortPlaylist, mode: 'copy' | 'share'): Promise<void> {
  const url = await playlistToShareUrl(playlist, location.href);
  if (url.length > SHARE_URL_COMFORT_LIMIT) {
    toast('Long playlist — the file will travel better than this link');
  }
  if (mode === 'share' && navigator.share) {
    await navigator.share({ title: playlist.title, url }).catch(() => undefined);
    return;
  }
  await navigator.clipboard.writeText(url);
  toast('Share link copied');
}
