/**
 * AC-01, AC-02 and the sign-in half of AC-38.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.ts';
import {
  GitHubOAuth,
  InMemoryLoginAttemptStore,
  codeChallengeFor,
  newCodeVerifier,
  newState,
  safeRedirect,
  statesMatch,
  type OAuthTransport,
} from './oauth.ts';

const config = {
  clientId: 'client-id',
  authorizeUrl: 'https://github.com/login/oauth/authorize',
  redirectUri: 'https://devcontrol.example/auth/github/callback',
  scopes: ['read:user'],
};

const account = { id: 100213978, login: 'tkm2dev', name: 'TKM' };

const transport = (overrides: Partial<OAuthTransport> = {}): OAuthTransport => ({
  exchangeCode: async () => ({ access_token: 'gho_token', token_type: 'bearer' }),
  getAuthenticatedUser: async () => account,
  ...overrides,
});

const now = new Date('2026-07-29T00:00:00Z');

const build = (t: OAuthTransport = transport(), clock: () => Date = () => now) => {
  const attempts = new InMemoryLoginAttemptStore();
  return { attempts, oauth: new GitHubOAuth(config, t, attempts, clock) };
};

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof ApiError ? error.code : `UNEXPECTED:${String(error)}`;
  }
};

describe('starting a sign-in', () => {
  it('sends PKCE with the challenge, never the verifier', async () => {
    // The verifier crossing the wire would defeat PKCE entirely: anyone who
    // captured the redirect could complete the exchange themselves.
    const { oauth, attempts } = build();
    const { url, state } = await oauth.start('/projects');
    const params = new URL(url).searchParams;

    expect(params.get('code_challenge_method')).toBe('S256');
    const stored = await attempts.take(state);
    expect(params.get('code_challenge')).toBe(codeChallengeFor(stored!.codeVerifier));
    expect(url).not.toContain(stored!.codeVerifier);
  });

  it('uses a fresh state and verifier each time', async () => {
    const { oauth } = build();
    const a = await oauth.start('/');
    const b = await oauth.start('/');
    expect(a.state).not.toBe(b.state);
  });

  it('produces enough entropy to be unguessable', () => {
    expect(newState().length).toBeGreaterThanOrEqual(43);
    expect(newCodeVerifier().length).toBeGreaterThanOrEqual(43);
  });
});

describe('post-login destination', () => {
  it.each([
    ['an absolute URL', 'https://evil.example/steal'],
    ['a protocol-relative URL', '//evil.example'],
    ['a backslash trick', '/\\evil.example'],
    ['a non-string', 42],
  ])('refuses %s and falls back to the root', (_label, value) => {
    // Otherwise sign-in becomes an open redirect: a victim completes a genuine
    // login and lands wherever the attacker chose, with the real domain's
    // credibility behind it.
    expect(safeRedirect(value)).toBe('/');
  });

  it('keeps a relative path', () => {
    expect(safeRedirect('/projects?added=1')).toBe('/projects?added=1');
  });
});

describe('completing a sign-in', () => {
  it('identifies the account by its numeric id, not its login', async () => {
    // ADR 0004. A login can be changed and later taken by someone else, so
    // keying identity on it would let one account inherit another's history.
    const { oauth } = build();
    const { state } = await oauth.start('/');
    const { account: authenticated } = await oauth.complete({ state, code: 'code' });

    expect(authenticated.providerSubject).toBe('100213978');
    expect(authenticated.providerSubject).not.toBe(authenticated.login);
  });

  it('returns the caller to where they were going', async () => {
    const { oauth } = build();
    const { state } = await oauth.start('/projects');
    expect((await oauth.complete({ state, code: 'code' })).redirectTo).toBe('/projects');
  });

  it('never hands back the access token', async () => {
    // Repository reads use the installation token, so keeping this one would
    // put a credential in the session for no purpose.
    const { oauth } = build();
    const { state } = await oauth.start('/');
    const result = await oauth.complete({ state, code: 'code' });
    expect(JSON.stringify(result)).not.toContain('gho_token');
  });

  it.each([
    ['an unknown state', async (o: GitHubOAuth) => o.complete({ state: 'never-issued', code: 'c' })],
    ['a missing state', async (o: GitHubOAuth) => o.complete({ state: undefined, code: 'c' })],
    ['a missing code', async (o: GitHubOAuth) => o.complete({ state: 'x', code: undefined })],
  ])('refuses %s', async (_label, call) => {
    const { oauth } = build();
    expect(await codeOf(call(oauth))).toBe('OAUTH_STATE_INVALID');
  });

  it('answers the same way whichever part was wrong', async () => {
    // Telling "unknown" apart from "expired" would confirm to an attacker that
    // a value they hold was once real.
    const { oauth } = build();
    const unknown = await codeOf(oauth.complete({ state: 'never-issued', code: 'c' }));
    const missing = await codeOf(oauth.complete({ state: undefined, code: 'c' }));
    expect(unknown).toBe(missing);
  });

  it('refuses an attempt that has expired', async () => {
    let clock = now;
    const { oauth } = build(transport(), () => clock);
    const { state } = await oauth.start('/');
    clock = new Date(now.getTime() + 11 * 60 * 1000);
    expect(await codeOf(oauth.complete({ state, code: 'code' }))).toBe('OAUTH_STATE_INVALID');
  });

  it('refuses a replay of a callback that already succeeded', async () => {
    // The attempt is consumed on first use, so a captured callback URL is worth
    // nothing afterwards.
    const { oauth } = build();
    const { state } = await oauth.start('/');
    await oauth.complete({ state, code: 'code' });
    expect(await codeOf(oauth.complete({ state, code: 'code' }))).toBe('OAUTH_STATE_INVALID');
  });

  it('consumes the attempt even when the exchange fails', async () => {
    const failing = transport({
      exchangeCode: async () => {
        throw new Error('upstream refused');
      },
    });
    const { oauth, attempts } = build(failing);
    const { state } = await oauth.start('/');
    await codeOf(oauth.complete({ state, code: 'code' }));
    expect(await attempts.take(state)).toBeNull();
  });

  it('refuses a token response in an unexpected shape', async () => {
    const { oauth } = build(transport({ exchangeCode: async () => ({ error: 'bad_code' }) }));
    const { state } = await oauth.start('/');
    expect(await codeOf(oauth.complete({ state, code: 'code' }))).toBe('GITHUB_CONTRACT_MISMATCH');
  });

  it('refuses an account response missing its id', async () => {
    const { oauth } = build(transport({ getAuthenticatedUser: async () => ({ login: 'tkm2dev' }) }));
    const { state } = await oauth.start('/');
    expect(await codeOf(oauth.complete({ state, code: 'code' }))).toBe('GITHUB_CONTRACT_MISMATCH');
  });

  it('carries no authority from GitHub', async () => {
    // ADR 0004. Nothing about permissions, organizations or repository access
    // comes back from sign-in — roles are read from role_assignments only.
    const { oauth } = build();
    const { state } = await oauth.start('/');
    const { account: authenticated } = await oauth.complete({ state, code: 'code' });
    expect(Object.keys(authenticated).sort()).toEqual(['login', 'provider', 'providerSubject']);
  });
});

describe('state comparison', () => {
  it('matches identical values and rejects others', () => {
    const state = newState();
    expect(statesMatch(state, state)).toBe(true);
    expect(statesMatch(state, newState())).toBe(false);
    expect(statesMatch(state, `${state}x`)).toBe(false);
  });
});
