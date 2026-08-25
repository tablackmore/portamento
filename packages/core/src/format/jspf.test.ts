import { describe, expect, it } from 'vitest';
import {
  fromJspf,
  parsePlaylist,
  serializePlaylist,
  suggestFilename,
  toJspf,
  JspfError,
  TRACK_EXT_NS,
} from './jspf.js';
import type { PortPlaylist } from '../types.js';

const playlist: PortPlaylist = {
  title: 'Road Trip Böps',
  description: 'Windows down.',
  exportedFrom: 'spotify',
  exportedAt: '2026-08-25T12:00:00.000Z',
  tracks: [
    {
      title: 'Nightcall',
      artists: ['Kavinsky', 'Lovefoxxx'],
      album: 'OutRun',
      durationMs: 258000,
      isrc: 'FR2X41200010',
      serviceIds: { spotify: '0U0ldCRmgCqhVvD6ksG63j' },
    },
    {
      title: 'Mystery Track',
      artists: [],
      serviceIds: {},
    },
  ],
};

describe('JSPF round-trip', () => {
  it('survives serialize → parse without losing identity metadata', () => {
    const restored = parsePlaylist(serializePlaylist(playlist));
    expect(restored).toEqual(playlist);
  });

  it('writes standard JSPF fields readable by other tools', () => {
    const doc = toJspf(playlist);
    const track = doc.playlist.track![0]!;
    expect(doc.playlist.title).toBe('Road Trip Böps');
    expect(doc.playlist.annotation).toBe('Windows down.');
    expect(track.title).toBe('Nightcall');
    expect(track.creator).toBe('Kavinsky, Lovefoxxx');
    expect(track.album).toBe('OutRun');
    expect(track.duration).toBe(258000);
    expect(track.identifier).toContain('https://open.spotify.com/track/0U0ldCRmgCqhVvD6ksG63j');
    expect(track.extension?.[TRACK_EXT_NS]).toBeTruthy();
  });
});

describe('fromJspf on foreign files', () => {
  it('recovers service IDs from canonical identifier URLs without our extension', () => {
    const restored = fromJspf({
      playlist: {
        title: 'Plain JSPF',
        track: [
          {
            title: 'Song',
            creator: 'Artist',
            identifier: [
              'https://open.spotify.com/track/abc123',
              'https://tidal.com/track/456',
              'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              'https://music.apple.com/us/song/example/1440857781',
            ],
          },
        ],
      },
    });
    expect(restored.tracks[0]!.serviceIds).toEqual({
      spotify: 'abc123',
      tidal: '456',
      youtube: 'dQw4w9WgXcQ',
      apple: '1440857781',
    });
  });

  it('defaults a missing playlist title', () => {
    expect(fromJspf({ playlist: { track: [] } }).title).toBe('Untitled playlist');
  });

  it('uppercases ISRCs', () => {
    const restored = fromJspf({
      playlist: {
        track: [{ title: 'x', extension: { [TRACK_EXT_NS]: [{ isrc: 'fr2x41200010' }] } }],
      },
    });
    expect(restored.tracks[0]!.isrc).toBe('FR2X41200010');
  });
});

describe('validation errors', () => {
  it('rejects non-JSON input with a friendly message', () => {
    expect(() => parsePlaylist('not json {')).toThrow(JspfError);
    expect(() => parsePlaylist('not json {')).toThrow(/not valid JSON/);
  });

  it('rejects documents without a playlist object', () => {
    expect(() => fromJspf({})).toThrow(/missing top-level "playlist"/);
  });

  it('rejects tracks without titles, pointing at the culprit', () => {
    expect(() => fromJspf({ playlist: { track: [{ title: 'ok' }, {}] } })).toThrow(/track #2/);
  });
});

describe('suggestFilename', () => {
  it('slugifies with diacritics folded', () => {
    expect(suggestFilename(playlist)).toBe('road-trip-bops.jspf');
  });

  it('falls back for unusable titles', () => {
    expect(suggestFilename({ title: '!!!', tracks: [] })).toBe('playlist.jspf');
  });
});
