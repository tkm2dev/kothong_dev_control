/**
 * Sign-in routes.
 *
 * The session cookie is written here and nowhere else, so its flags cannot
 * differ between one path and another.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiError } from '../errors.ts';
import { SESSION_COOKIE, sessionCookieOptions } from '../security.ts';
import type { Actor } from '../projects/policy.ts';
import type { GitHubOAuth } from './oauth.ts';
import type { SignIn } from './sign-in.ts';

export interface MeView {
  readonly userId: string;
  readonly organizationId: string;
  readonly permissions: readonly string[];
}

export class AuthController {
  constructor(
    private readonly oauth: GitHubOAuth,
    private readonly signIn: SignIn,
    private readonly https: boolean,
  ) {}

  #sessionId(request: FastifyRequest): string | undefined {
    const raw = request.cookies?.[SESSION_COOKIE];
    if (raw === undefined) return undefined;
    // The cookie is signed. An unsigned or tampered value is treated as absent
    // rather than trusted, so a forged cookie is worth no more than none.
    const unsigned = request.unsignCookie(raw);
    return unsigned.valid && unsigned.value !== null ? unsigned.value : undefined;
  }

  async start(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = request.query as Record<string, unknown> | undefined;
    const { url } = await this.oauth.start(query?.['redirectTo']);
    await reply.redirect(url, 302);
  }

  async callback(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const query = request.query as Record<string, unknown> | undefined;
    const { account, redirectTo } = await this.oauth.complete({
      state: query?.['state'],
      code: query?.['code'],
    });

    const { session } = await this.signIn.completeSignIn({
      account,
      // Rotation: whatever session the browser arrived with is revoked, so a
      // fixated identifier cannot survive the privilege change.
      previousSessionId: this.#sessionId(request),
    });

    await reply
      .setCookie(SESSION_COOKIE, session.id, sessionCookieOptions(this.https))
      .redirect(redirectTo, 302);
  }

  async logout(request: FastifyRequest, reply: FastifyReply): Promise<{ status: 'ok' }> {
    await this.signIn.signOut(this.#sessionId(request));
    // Clearing the cookie is the lesser half. The record is revoked server-side
    // above, so presenting the old value again achieves nothing.
    await reply.clearCookie(SESSION_COOKIE, sessionCookieOptions(this.https));
    return { status: 'ok' };
  }

  async me(request: FastifyRequest): Promise<MeView> {
    const actor = await this.resolve(request);
    if (actor === null) throw new ApiError('UNAUTHENTICATED');
    return {
      userId: actor.userId,
      organizationId: actor.organizationId,
      // What the UI may enable, derived server-side. Sending role names would
      // invite a client to decide for itself what they permit.
      permissions: [
        ...new Set(
          actor.roles.flatMap((role) =>
            role.roleCode === 'PRODUCT_OWNER'
              ? ['project:read', 'project:manage']
              : ['project:read'],
          ),
        ),
      ],
    };
  }

  /** Used by the projects routes to identify the caller. */
  async resolve(request: FastifyRequest): Promise<Actor | null> {
    return this.signIn.actorForSession(this.#sessionId(request));
  }
}
