/**
 * AC-02 and the session half of AC-38.
 */

import { describe, expect, it } from 'vitest';
import { ApiError } from '../errors.ts';
import { InMemorySessionStore } from '../sessions.ts';
import type { RoleAssignment } from '../projects/policy.ts';
import type { AuthenticatedAccount } from './oauth.ts';
import { SignIn, type IdentityDirectory, type IdentityRecord } from './sign-in.ts';

const ORG = 'org-a';
const USER = 'user-1';
const now = new Date('2026-07-29T00:00:00Z');

const account: AuthenticatedAccount = {
  provider: 'github',
  providerSubject: '100213978',
  login: 'tkm2dev',
};

class Directory implements IdentityDirectory {
  constructor(
    private readonly identity: IdentityRecord | null,
    private readonly roles: RoleAssignment[] = [],
  ) {}
  async findByProviderSubject(): Promise<IdentityRecord | null> {
    return this.identity;
  }
  async findByUserId(): Promise<IdentityRecord | null> {
    return this.identity;
  }
  async rolesFor(): Promise<RoleAssignment[]> {
    return this.roles;
  }
}

let n = 0;
const build = (directory: IdentityDirectory) => {
  const sessions = new InMemorySessionStore();
  return {
    sessions,
    signIn: new SignIn(directory, sessions, () => `session-${(n += 1)}`, () => now),
  };
};

const provisioned = new Directory({ userId: USER, organizationId: ORG }, [
  { organizationId: ORG, projectId: null, roleCode: 'PRODUCT_OWNER' },
]);

const codeOf = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'NO_ERROR';
  } catch (error) {
    return error instanceof ApiError ? error.code : `UNEXPECTED:${String(error)}`;
  }
};

describe('signing in', () => {
  it('refuses an account nobody has provisioned', async () => {
    // Proving you hold a GitHub account must not be enough to gain standing in
    // an organization. Membership is granted deliberately, elsewhere.
    const { signIn } = build(new Directory(null));
    expect(await codeOf(signIn.completeSignIn({ account }))).toBe('FORBIDDEN');
  });

  it('issues a session for a provisioned account', async () => {
    const { signIn } = build(provisioned);
    const { session, actor } = await signIn.completeSignIn({ account });
    expect(session.userId).toBe(USER);
    expect(actor.organizationId).toBe(ORG);
  });

  it('takes roles from the directory, never from the account', async () => {
    // AC-02. Nothing about the GitHub account influences authority; an account
    // with no roles provisioned gets none.
    const { signIn } = build(new Directory({ userId: USER, organizationId: ORG }, []));
    const { actor } = await signIn.completeSignIn({ account });
    expect(actor.roles).toEqual([]);
  });

  it('revokes the previous session and issues a new identifier', async () => {
    const { signIn, sessions } = build(provisioned);
    const first = await signIn.completeSignIn({ account });
    const second = await signIn.completeSignIn({
      account,
      previousSessionId: first.session.id,
    });

    expect(second.session.id).not.toBe(first.session.id);
    expect((await sessions.find(first.session.id))?.revokedAt).not.toBeNull();
  });
});

describe('resolving an actor from a session', () => {
  it('returns nobody when there is no session', async () => {
    const { signIn } = build(provisioned);
    expect(await signIn.actorForSession(undefined)).toBeNull();
  });

  it('returns nobody for an unknown session identifier', async () => {
    const { signIn } = build(provisioned);
    expect(await signIn.actorForSession('never-issued')).toBeNull();
  });

  it('returns nobody after signing out', async () => {
    // AC-38. The identifier is worthless afterwards even if the client keeps
    // presenting it, which a self-contained token could not offer.
    const { signIn } = build(provisioned);
    const { session } = await signIn.completeSignIn({ account });
    expect(await signIn.actorForSession(session.id)).not.toBeNull();

    await signIn.signOut(session.id);
    expect(await signIn.actorForSession(session.id)).toBeNull();
  });

  it('returns nobody when the identity behind the session is gone', async () => {
    const sessions = new InMemorySessionStore();
    const signIn = new SignIn(provisioned, sessions, () => 'session-x', () => now);
    const { session } = await signIn.completeSignIn({ account });

    const orphaned = new SignIn(new Directory(null), sessions, () => 'session-y', () => now);
    expect(await orphaned.actorForSession(session.id)).toBeNull();
  });

  it('reads roles fresh rather than from the session', async () => {
    // A role removed after sign-in must take effect on the next request. A
    // session carrying a copy of its permissions would keep granting them.
    const roles: RoleAssignment[] = [
      { organizationId: ORG, projectId: null, roleCode: 'PRODUCT_OWNER' },
    ];
    const directory: IdentityDirectory = {
      findByProviderSubject: async () => ({ userId: USER, organizationId: ORG }),
      findByUserId: async () => ({ userId: USER, organizationId: ORG }),
      rolesFor: async () => roles,
    };
    const { signIn } = build(directory);
    const { session } = await signIn.completeSignIn({ account });

    roles.length = 0;
    expect((await signIn.actorForSession(session.id))?.roles).toEqual([]);
  });
});
