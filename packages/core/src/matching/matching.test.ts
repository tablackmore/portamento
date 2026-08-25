import { describe, expect, it } from 'vitest';
import { coreTitle, diceCoefficient, normalize, textSimilarity, tokenSet } from './normalize.js';
import { pickBest, scoreCandidate, MATCH_THRESHOLD } from './score.js';

describe('normalize', () => {
  it('lowercases, de-accents and strips punctuation', () => {
    expect(normalize('Beyoncé — "Déjà Vu"!')).toBe('beyonce deja vu');
  });

  it('drops apostrophes rather than splitting words', () => {
    expect(normalize("Don't Stop Me Now")).toBe('dont stop me now');
  });
});

describe('coreTitle', () => {
  it('removes bracketed qualifiers and dash suffixes', () => {
    expect(coreTitle('One (Remastered 2011) [Live]')).toBe('One');
    expect(coreTitle('Africa - Single Version')).toBe('Africa');
  });

  it('never reduces a title to nothing', () => {
    expect(coreTitle('(Untitled)')).toBe('(Untitled)');
  });
});

describe('diceCoefficient', () => {
  it('is 1 for identical sets and 0 for disjoint or empty sets', () => {
    expect(diceCoefficient(tokenSet('hello world'), tokenSet('world hello'))).toBe(1);
    expect(diceCoefficient(tokenSet('aaa'), tokenSet('bbb'))).toBe(0);
    expect(diceCoefficient(new Set(), new Set())).toBe(0);
  });
});

describe('scoreCandidate', () => {
  const track = {
    title: 'Nightcall',
    artists: ['Kavinsky'],
    durationMs: 258000,
  };

  it('gives near-perfect scores to the same recording', () => {
    const score = scoreCandidate(track, {
      id: 'a',
      title: 'Nightcall',
      artists: ['Kavinsky'],
      durationMs: 258200,
    });
    expect(score).toBeGreaterThan(0.95);
  });

  it('accepts remaster-style title noise via coreTitle', () => {
    const score = scoreCandidate(track, {
      id: 'a',
      title: 'Nightcall (Remastered)',
      artists: ['Kavinsky'],
      durationMs: 258000,
    });
    expect(score).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it('punishes a karaoke cover with wrong artist and duration', () => {
    const score = scoreCandidate(track, {
      id: 'a',
      title: 'Nightcall (Karaoke Version)',
      artists: ['Karaoke Hits Band'],
      durationMs: 301000,
    });
    expect(score).toBeLessThan(MATCH_THRESHOLD + 0.15);
  });

  it('treats unknown artists/durations as neutral, not as mismatches', () => {
    const score = scoreCandidate(track, { id: 'a', title: 'Nightcall', artists: [] });
    expect(score).toBeGreaterThan(MATCH_THRESHOLD);
  });
});

describe('pickBest', () => {
  const track = { title: 'Africa', artists: ['Toto'], durationMs: 295000 };

  it('prefers the genuine article over lookalikes', () => {
    const best = pickBest(track, [
      {
        id: 'cover',
        title: 'Africa (Tribute to Toto)',
        artists: ['Cover Kings'],
        durationMs: 295000,
      },
      { id: 'real', title: 'Africa', artists: ['Toto'], durationMs: 295000 },
      { id: 'live', title: 'Africa - Live', artists: ['Toto'], durationMs: 341000 },
    ]);
    expect(best?.candidate.id).toBe('real');
  });

  it('returns undefined when nothing is plausible', () => {
    const best = pickBest(track, [
      {
        id: 'x',
        title: 'Completely Different Song',
        artists: ['Someone Else'],
        durationMs: 100000,
      },
    ]);
    expect(best).toBeUndefined();
  });

  it('returns undefined for an empty candidate list', () => {
    expect(pickBest(track, [])).toBeUndefined();
  });
});

describe('textSimilarity', () => {
  it('is robust to word order and case', () => {
    expect(textSimilarity('The Less I Know The Better', 'the less i know the better')).toBe(1);
  });
});
