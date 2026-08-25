import { h } from '../dom';
import type { App } from '../main';

export function homeView(app: App): HTMLElement[] {
  const card = (glyph: string, title: string, sub: string, onClick: () => void) =>
    h(
      'button',
      { className: 'card action-card', onClick },
      h('div', { className: 'glyph', text: glyph }),
      h('h2', { text: title }),
      h('p', { className: 'sub', text: sub }),
    );

  return [
    card('01 · glide', 'Transfer', 'Copy a playlist straight from one service to another.', () =>
      app.navigate('transfer'),
    ),
    card(
      '02 · bottle it',
      'Export & share',
      'Save a playlist as a file or a link anyone can open — no account needed to share.',
      () => app.navigate('export'),
    ),
    card(
      '03 · pour it out',
      'Import',
      'Open a shared playlist and recreate it on your service of choice.',
      () => app.navigate('import'),
    ),
    h('p', {
      className: 'footer',
      text: 'No servers. No tracking. Your playlists travel as files and links, and your logins stay in your browser.',
    }),
  ];
}
