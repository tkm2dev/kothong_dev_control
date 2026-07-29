/**
 * Turning an authenticated GitHub account into a session and an actor.
 *
 * This is where AC-02 is decided. The only inputs that affect authority are the
 * identity row matched by `(provider, provider_subject)` and the role rows read
 * from the database. Nothing the client sent — a role field in a body, a header
 * claiming an actor type, an organization id in a payload — is consulted, and
 * there is no parameter here through which it could be.
 */

import { ApiError } from '../errors.ts';
import { establishSession, isUsable, type SessionRecord, type SessionStore } from '../sessions.ts';
import type { Actor, RoleAssignment } from '../projects/policy.ts';
import type { AuthenticatedAccount } from './oauth.ts';

export interface IdentityRecord {
  readonly userId: string;
  readonly organizationId: string;
}

export interface IdentityDirectory {
  /** The identity for a provider account, or null if nobody has signed in with it. */
  findByProviderSubject(provider: string, providerSubject: string): Promise<IdentityRecord | null>;
  /** The identity behind a session's user. */
  findByUserId(userId: string): Promise<IdentityRecord | null>;
  /** Roles held by a user, read from `role_assignments` and nowhere else. */
  rolesFor(userId: string, organizationId: string): Promise<RoleAssignment[]>;
}

export class SignIn {
  constructor(
    private readonly identities: IdentityDirectory,
    private readonly sessions: SessionStore,
    private readonly newSessionId: () => string,
    private readonly now: () => Date,
  ) {}

  /**
   * Establishes a session for an account that has just proved itself.
   *
   * An account nobody has provisioned is refused rather than being created on
   * the spot. Signing in with any GitHub account must not be enough to obtain
   * standing in an organization; membership is granted deliberately, elsewhere.
   */
  async completeSignIn(input: {
    account: AuthenticatedAccount;
    previousSessionId?: string | undefined;
  }): Promise<{ session: SessionRecord; actor: Actor }> {
    const identity = await this.identities.findByProviderSubject(
      input.account.provider,
      input.account.providerSubject,
    );
    if (identity === null) throw new ApiError('FORBIDDEN');

    // AC-38: a new identifier, and the previous one revoked. Reusing it would
    // leave a fixated identifier valid across the privilege change.
    const session = await establishSession(this.sessions, {
      newId: this.newSessionId(),
      userId: identity.userId,
      previousSessionId: input.previousSessionId,
      now: this.now(),
    });

    return { session, actor: await this.actorFor(identity) };
  }

  /** Resolves the actor for a session, or null when there is no usable one. */
  async actorForSession(sessionId: string | undefined): Promise<Actor | null> {
    if (sessionId === undefined) return null;
    const session = await this.sessions.find(sessionId);
    if (!isUsable(session, this.now())) return null;

    const identity = await this.identities.findByUserId(session.userId);
    if (identity === null) return null;
    return this.actorFor(identity);
  }

  private async actorFor(identity: IdentityRecord): Promise<Actor> {
    const roles = await this.identities.rolesFor(identity.userId, identity.organizationId);
    return {
      userId: identity.userId,
      organizationId: identity.organizationId,
      // Roles are whatever the database says and nothing else. There is no
      // parameter on this method through which a caller could add one.
      roles,
    };
  }

  async signOut(sessionId: string | undefined): Promise<void> {
    // AC-38: logout must make the session unusable server-side, not merely
    // clear a cookie the client could put back.
    if (sessionId !== undefined) await this.sessions.revoke(sessionId);
  }
}
