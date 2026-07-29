/**
 * The real OAuth transport.
 *
 * It performs the two network calls the sign-in flow needs and returns the raw
 * bodies. `oauth.ts` validates them; nothing is trusted because it arrived over
 * TLS from the right host.
 *
 * The access token is used once, to read the account, and is never returned to
 * the caller or written anywhere. ADR 0004 requires that: the session is the
 * credential this system issues, and holding a GitHub token adds risk without
 * adding capability.
 */

import { ApiError } from '../errors.ts';
import type { OAuthTransport } from './oauth.ts';

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

export interface OAuthCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly redirectUri: string;
}

/** Fails the request rather than hanging until the client gives up. */
const TIMEOUT_MS = 10_000;

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return response.json();
}

export function createOAuthTransport(credentials: OAuthCredentials): OAuthTransport {
  return {
    async exchangeCode({ code, codeVerifier }) {
      // GitHub answers 200 with an `error` field on a bad code, so the status is
      // not the signal. The schema in `oauth.ts` requires `access_token`, and an
      // error body simply fails to parse — which is the outcome we want.
      return postJson(TOKEN_URL, {
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: credentials.redirectUri,
      });
    },

    async getAuthenticatedUser(accessToken) {
      const response = await fetch(USER_URL, {
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${accessToken}`,
          'user-agent': 'kothong-dev-control',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) throw new ApiError('GITHUB_ACCESS_DENIED');
      return response.json();
    },
  };
}
