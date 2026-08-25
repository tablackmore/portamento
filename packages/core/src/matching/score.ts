import { coreTitle, textSimilarity } from './normalize.js';
import type { PortTrack } from '../types.js';

/** A search result on the destination service, in the minimal shape scoring needs. */
export interface MatchCandidate {
  id: string;
  title: string;
  /** Empty when the service didn't tell us (scored neutrally, not as a mismatch). */
  artists: string[];
  durationMs?: number;
}

/** Search matches at or above this score are accepted (flagged as fuzzy in reports). */
export const MATCH_THRESHOLD = 0.62;

const WEIGHTS = { title: 0.55, artist: 0.3, duration: 0.15 };

/**
 * 0..1 similarity between the wanted track and a candidate. Title dominates,
 * artists confirm, duration tiebreaks — durations within 3s score full marks,
 * fading to zero at 15s apart, because two renditions of the same song rarely
 * differ by more and different songs sharing a title rarely differ by less.
 */
export function scoreCandidate(
  track: Pick<PortTrack, 'title' | 'artists' | 'durationMs'>,
  candidate: MatchCandidate,
): number {
  const titleScore = Math.max(
    textSimilarity(track.title, candidate.title),
    textSimilarity(coreTitle(track.title), coreTitle(candidate.title)),
  );

  let artistScore: number;
  if (track.artists.length === 0 || candidate.artists.length === 0) {
    artistScore = 0.5; // unknown — neither evidence for nor against
  } else {
    artistScore = textSimilarity(track.artists.join(' '), candidate.artists.join(' '));
  }

  let durationScore: number;
  if (track.durationMs === undefined || candidate.durationMs === undefined) {
    durationScore = 0.5;
  } else {
    const deltaSec = Math.abs(track.durationMs - candidate.durationMs) / 1000;
    durationScore = deltaSec <= 3 ? 1 : Math.max(0, 1 - (deltaSec - 3) / 12);
  }

  return (
    WEIGHTS.title * titleScore + WEIGHTS.artist * artistScore + WEIGHTS.duration * durationScore
  );
}

export interface BestMatch {
  candidate: MatchCandidate;
  score: number;
}

/** The best acceptable candidate, or undefined when nothing clears the threshold. */
export function pickBest(
  track: Pick<PortTrack, 'title' | 'artists' | 'durationMs'>,
  candidates: MatchCandidate[],
  threshold: number = MATCH_THRESHOLD,
): BestMatch | undefined {
  let best: BestMatch | undefined;
  for (const candidate of candidates) {
    const score = scoreCandidate(track, candidate);
    if (score >= threshold && (!best || score > best.score)) {
      best = { candidate, score };
    }
  }
  return best;
}
