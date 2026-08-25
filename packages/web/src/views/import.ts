import { parsePlaylist, playlistFromShareFragment } from '@portamento/core';
import type { PortPlaylist } from '@portamento/core';
import { h, clear, toast } from '../dom';
import { errorNotice, runImport, servicePicker } from '../components';
import type { App } from '../main';

export interface ImportData {
  playlist?: PortPlaylist;
}

export function importView(app: App, data: ImportData = {}): HTMLElement[] {
  const body = h('div');
  const card = h('div', { className: 'card' }, body);

  if (data.playlist) showDestination(app, data.playlist, body);
  else showSourcePicker(app, body);

  return [card];
}

function showSourcePicker(app: App, body: HTMLElement): void {
  clear(body);

  const fileInput = h('input', { type: 'file' });
  fileInput.accept = '.jspf,.json,application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) void readFile(app, file, body);
  });

  const dropzone = h(
    'div',
    { className: 'dropzone', onClick: () => fileInput.click() },
    h('p', { text: 'Drop a .jspf playlist file here' }),
    h('p', { className: 'mono', text: 'or tap to browse' }),
  );
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('over');
    const file = e.dataTransfer?.files?.[0];
    if (file) void readFile(app, file, body);
  });

  const linkInput = h('input', { type: 'url', placeholder: 'https://…#p=1.…' });
  const linkRow = h(
    'div',
    { className: 'btn-row' },
    linkInput,
    h(
      'button',
      { className: 'btn', onClick: () => void readLink(app, linkInput.value, body) },
      'Open link',
    ),
  );
  linkRow.style.alignItems = 'stretch';
  linkInput.style.flex = '1';

  body.append(
    h('h2', { text: 'Import' }),
    h('p', { className: 'sub', text: 'Open a playlist someone shared — or one you exported.' }),
    dropzone,
    fileInput,
    h('p', { className: 'sub', text: 'Have a share link instead? Paste it:' }),
    linkRow,
  );
}

async function readFile(app: App, file: File, body: HTMLElement): Promise<void> {
  try {
    const playlist = parsePlaylist(await file.text());
    showDestination(app, playlist, body);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not read that file');
  }
}

async function readLink(app: App, url: string, body: HTMLElement): Promise<void> {
  try {
    const hash = url.includes('#') ? url.slice(url.indexOf('#')) : url;
    const playlist = await playlistFromShareFragment(hash);
    if (!playlist) {
      toast('That link does not contain a playlist');
      return;
    }
    showDestination(app, playlist, body);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not read that link');
  }
}

function showDestination(app: App, playlist: PortPlaylist, body: HTMLElement): void {
  clear(body);

  const preview = h('div', { className: 'rows' });
  for (const t of playlist.tracks) {
    preview.append(
      h(
        'div',
        { className: 'row report-row' },
        h(
          'div',
          { className: 'grow' },
          h('div', { className: 'name', text: `${t.title} — ${t.artists.join(', ')}` }),
        ),
        t.durationMs ? h('span', { className: 'meta', text: formatDuration(t.durationMs) }) : null,
      ),
    );
  }

  const runArea = h('div');
  body.append(
    h('h2', { text: playlist.title }),
    h('p', {
      className: 'sub',
      text:
        `${playlist.tracks.length} tracks` +
        (playlist.exportedFrom ? ` · exported from ${playlist.exportedFrom}` : '') +
        ' — where should they go?',
    }),
    servicePicker(
      app,
      app.adapters,
      () => ({ view: 'import', playlist }),
      (adapter) => {
        try {
          runImport(adapter, playlist, runArea);
        } catch (e) {
          clear(runArea);
          runArea.append(errorNotice(e));
        }
      },
    ),
    runArea,
    h('p', { className: 'sub' }),
    preview,
  );
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}
