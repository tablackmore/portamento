import { h, toast } from '../dom';
import { redirectUri, saveSettings } from '../state';
import type { App } from '../main';

/**
 * Portamento is open source with no backend, so each user registers their own
 * (free) API apps and pastes the client IDs here. IDs are not secrets — the
 * PKCE flow needs no secret at all — and they never leave this browser.
 */
export function settingsView(app: App): HTMLElement[] {
  const uri = redirectUri();

  const spotify = idField('Spotify client ID', app.settings.spotifyClientId);
  const tidal = idField('TIDAL client ID', app.settings.tidalClientId);
  const youtube = idField('Google (YouTube) client ID', app.settings.youtubeClientId);

  const form = h(
    'div',
    { className: 'card' },
    h('h2', { text: 'Settings' }),
    h('p', {
      className: 'sub',
      text: 'Bring your own API keys — free to create, stored only in this browser.',
    }),
    h(
      'div',
      { className: 'view' },
      spotify.label,
      tidal.label,
      youtube.label,
      h(
        'div',
        { className: 'btn-row' },
        h(
          'button',
          {
            className: 'btn primary',
            onClick: () => {
              saveSettings({
                spotifyClientId: spotify.input.value.trim(),
                tidalClientId: tidal.input.value.trim(),
                youtubeClientId: youtube.input.value.trim(),
              });
              toast('Saved');
              app.refresh();
            },
          },
          'Save',
        ),
      ),
    ),
  );

  const redirect = h(
    'div',
    { className: 'card' },
    h('h2', { text: 'Redirect URI' }),
    h('p', {
      className: 'sub',
      text: 'Every service asks for this when you register your app — it is just this page:',
    }),
    h(
      'div',
      { className: 'btn-row' },
      h('input', { type: 'text', value: uri }),
      h(
        'button',
        {
          className: 'btn',
          onClick: () => {
            void navigator.clipboard.writeText(uri).then(() => toast('Copied'));
          },
        },
        '⧉ Copy',
      ),
    ),
  );

  const help = h(
    'div',
    { className: 'card' },
    h('h2', { text: 'Getting your IDs' }),
    helpBlock(
      'Spotify',
      [
        'Create an app at developer.spotify.com/dashboard (needs a Premium account).',
        'Add the redirect URI above, then copy the Client ID here.',
        'Development-mode apps allow you + 4 invited friends.',
      ],
      'https://developer.spotify.com/dashboard',
    ),
    helpBlock(
      'TIDAL',
      [
        'Create an app at developer.tidal.com/dashboard.',
        'Add the redirect URI above, then copy the Client ID here.',
      ],
      'https://developer.tidal.com/dashboard',
    ),
    helpBlock(
      'YouTube',
      [
        'Create a project at console.cloud.google.com, enable the YouTube Data API v3.',
        'Create an OAuth client (Web application) with the redirect URI above.',
        'Daily quota fits roughly two 50-track imports — it resets every day.',
      ],
      'https://console.cloud.google.com',
    ),
  );

  return [form, redirect, help];
}

function idField(
  labelText: string,
  value: string,
): { label: HTMLElement; input: HTMLInputElement } {
  const input = h('input', { type: 'text', value, placeholder: 'paste client ID' });
  const label = h('label', { className: 'field' }, labelText, input);
  return { label, input };
}

function helpBlock(service: string, steps: string[], href: string): HTMLElement {
  const details = h('details');
  const summary = h('summary', { text: service });
  summary.style.cursor = 'pointer';
  summary.style.padding = '0.4rem 0';
  const list = h('ol');
  list.style.paddingLeft = '1.2rem';
  list.style.color = 'var(--muted)';
  list.style.fontSize = '0.9rem';
  for (const step of steps) list.append(h('li', { text: step }));
  details.append(
    summary,
    list,
    h('p', {}, h('a', { href, target: '_blank', text: `Open ${service} console ↗` })),
  );
  return details;
}
