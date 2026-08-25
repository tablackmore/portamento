import { describe, expect, it } from 'vitest';
import { playlistFromShareFragment, playlistToShareFragment, playlistToShareUrl } from './share.js';
import { JspfError } from './jspf.js';
import type { PortPlaylist } from '../types.js';

function samplePlaylist(trackCount: number): PortPlaylist {
  return {
    title: 'Shared Vibes',
    exportedFrom: 'spotify',
    exportedAt: '2026-08-25T12:00:00.000Z',
    tracks: Array.from({ length: trackCount }, (_, i) => ({
      title: `Track Number ${i} (Album Version)`,
      artists: [`Artist ${i}`, 'Featured Guest'],
      album: `Album ${i}`,
      durationMs: 180000 + i * 1000,
      isrc: `USUM7${String(1000000 + i)}`,
      serviceIds: { spotify: `spotifyid${i}xxxxxxxxxx` },
    })),
  };
}

describe('share links', () => {
  it('round-trips a playlist through a URL fragment', async () => {
    const playlist = samplePlaylist(5);
    const fragment = await playlistToShareFragment(playlist);
    const restored = await playlistFromShareFragment(`#${fragment}`);
    expect(restored).toEqual(playlist);
  });

  it('builds a full URL on the app base, replacing any existing hash', async () => {
    const url = await playlistToShareUrl(samplePlaylist(1), 'https://x.github.io/portamento/#old');
    expect(url).toMatch(/^https:\/\/x\.github\.io\/portamento\/#p=1\./);
  });

  it('keeps a 50-track playlist within messaging-app-friendly length', async () => {
    const fragment = await playlistToShareFragment(samplePlaylist(50));
    expect(fragment.length).toBeLessThan(8000);
  });

  it('returns null for hashes that are not share links', async () => {
    expect(await playlistFromShareFragment('#about')).toBeNull();
    expect(await playlistFromShareFragment('')).toBeNull();
  });

  it('rejects unknown versions and corrupt payloads with friendly errors', async () => {
    await expect(playlistFromShareFragment('#p=9.abc')).rejects.toThrow(JspfError);
    await expect(playlistFromShareFragment('#p=1.!!!not-base64!!!')).rejects.toThrow(/damaged/);
    await expect(playlistFromShareFragment('#p=1.AAAA')).rejects.toThrow(/damaged/);
  });
});
