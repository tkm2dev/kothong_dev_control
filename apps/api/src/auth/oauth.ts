/**
 * GitHub sign-in, per ADR 0004.
 *
 * Two mechanisms are kept apart on purpose. This one establishes who the human
 * is. Reading repositories is done with the installation token, never with the
 * token issued here — otherwise the access status the system records would
 * reflect whoever happened to click rather than the installation's rights.
 *
 * What this deliberately does not do:
 *
 * - derive any authority from GitHub. Roles come from `role_assignments` and
 *   nowhere else. Write access on GitHub is not permission to approve a merge
 * - key identity on a login name. GitHub logins can be changed and later reused
 *   by someone else, so the numeric account id is the identity
 * - keep the access token. It is used once to read the account and then dropped
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from '../errors.ts';

/** Seconds a pending sign-in stays valid. Short: it only spans one redirect. */
export const LOGIN_ATTEMPT_TTL_SECONDS = 10 * 60;

export interface LoginAttempt {
  readonly state: string;
  readonly codeVerifier: string;
  readonly redirectTo: string;
  readonly expiresAt: Date;
}

export interface LoginAttemptStore {
  save(attempt: LoginAttempt): Promise<void>;
  /** Returns the attempt and removes it. An attempt is usable exactly once. */
  take(state: string): Promise<LoginAttempt | null>;
}

export class InMemoryLoginAttemptStore implements LoginAttemptStore {
  readonly #attempts = new Map<string, LoginAttempt>();

  async save(attempt: LoginAttempt): Promise<void> {
    this.#attempts.set(attempt.state, attempt);
  }

  async take(state: string): Promise<LoginAttempt | null> {
    const attempt = this.#attempts.get(state);
    // Removed whether or not it turns out to be valid, so a captured callback
    // cannot be replayed.
    this.#attempts.delete(state);
    return attempt ?? null;
  }
}

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

export function newState(): string {
  return base64url(randomBytes(32));
}

export function newCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function codeChallengeFor(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

/** Constant-time comparison, so a mismatch reveals nothing through timing. */
export function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Only relative paths are accepted as a post-login destination.
 *
 * An absolute URL here would turn sign-in into an open redirect: an attacker
 * sends someone through a genuine login and lands them on a page of their
 * choosing, carrying the credibility of the real domain.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/')) return '/';
  // `//host` and `/\host` are protocol-relative and leave the site.
  if (value.startsWith('//') || value.startsWith('/\\')) return '/';
  return value;
}

export const githubUserSchema = z.object({
  id: z.number().int().positive().transform(String),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
});

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
});

export interface OAuthTransport {
  exchangeCode(input: { code: string; codeVerifier: string }): Promise<unknown>;
  getAuthenticatedUser(accessToken: string): Promise<unknown>;
}

export interface OAuthConfig {
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly redirectUri: string;
  readonly scopes: readonly string[];
}

export interface AuthenticatedAccount {
  readonly provider: 'github';
  /** The numeric account id, never the login. */
  readonly providerSubject: string;
  readonly login: string;
}

export class GitHubOAuth {
  constructor(
    private readonly config: OAuthConfig,
    private readonly transport: OAuthTransport,
    private readonly attempts: LoginAttemptStore,
    private readonly now: () => Date,
  ) {}

  async start(redirectTo: unknown): Promise<{ url: string; state: string }> {
    const state = newState();
    const codeVerifier = newCodeVerifier();

    await this.attempts.save({
      state,
      codeVerifier,
      redirectTo: safeRedirect(redirectTo),
      expiresAt: new Date(this.now().getTime() + LOGIN_ATTEMPT_TTL_SECONDS * 1000),
    });

    const url = new URL(this.config.authorizeUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallengeFor(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString(), state };
  }

  /**
   * Completes a sign-in.
   *
   * Every failure answers OAUTH_STATE_INVALID rather than describing what went
   * wrong. Distinguishing "unknown state" from "expired state" would tell an
   * attacker whether a value they hold was ever real.
   */
  async complete(input: {
    state: unknown;
    code: unknown;
  }): Promise<{ account: AuthenticatedAccount; redirectTo: string }> {
    if (typeof input.state !== 'string' || typeof input.code !== 'string') {
      throw new ApiError('OAUTH_STATE_INVALID');
    }

    const attempt = await this.attempts.take(input.state);
    if (attempt === null) throw new ApiError('OAUTH_STATE_INVALID');
    if (!statesMatch(attempt.state, input.state)) throw new ApiError('OAUTH_STATE_INVALID');
    if (attempt.expiresAt.getTime() <= this.now().getTime()) {
      throw new ApiError('OAUTH_STATE_INVALID');
    }

    const tokenRaw = await this.transport.exchangeCode({
      code: input.code,
      codeVerifier: attempt.codeVerifier,
    });
    const token = tokenResponseSchema.safeParse(tokenRaw);
    if (!token.success) throw new ApiError('GITHUB_CONTRACT_MISMATCH');

    const userRaw = await this.transport.getAuthenticatedUser(token.data.access_token);
    const user = githubUserSchema.safeParse(userRaw);
    if (!user.success) throw new ApiError('GITHUB_CONTRACT_MISMATCH');

    // The access token is not returned and not stored. Its only job was to read
    // the account; keeping it would put a credential in the session for no
    // purpose, since repository reads use the installation token.
    return {
      account: { provider: 'github', providerSubject: user.data.id, login: user.data.login },
      redirectTo: attempt.redirectTo,
    };
  }
}
