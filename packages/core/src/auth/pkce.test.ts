import { describe, expect, it } from 'vitest';
import { pkceChallenge, randomString } from './pkce.js';
import { iso8601DurationToMs } from '../services/http.js';

describe('pkceChallenge', () => {
  it('matches the RFC 7636 appendix B test vector', async () => {
    const challenge = await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('randomString', () => {
  it('produces distinct values of the requested length from the unreserved charset', () => {
    const a = randomString(64);
    const b = randomString(64);
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });
});

describe('iso8601DurationToMs', () => {
  it('parses typical track durations', () => {
    expect(iso8601DurationToMs('PT3M52S')).toBe(232000);
    expect(iso8601DurationToMs('PT1H2M3S')).toBe(3723000);
    expect(iso8601DurationToMs('PT45S')).toBe(45000);
  });

  it('returns undefined for garbage', () => {
    expect(iso8601DurationToMs('3:52')).toBeUndefined();
    expect(iso8601DurationToMs(undefined)).toBeUndefined();
    expect(iso8601DurationToMs('PT')).toBeUndefined();
  });
});
