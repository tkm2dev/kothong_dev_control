/**
 * Server-side session store.
 *
 * ADR 0004 chose server-side sessions over JWTs precisely so that logout can
 * make a session unusable immediately. AC-38 requires that, plus a new session
 * identifier after every successful authentication.
 *
 * The store interface is kept narrow so the PostgreSQL implementation and the
 * in-memory one used by tests cannot drift apart in behaviour.
 */

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly lastAuthenticatedAt: Date;
  readonly revokedAt: Date | null;
}

export interface SessionStore {
  create(record: SessionRecord): Promise<void>;
  find(id: string): Promise<SessionRecord | null>;
  revoke(id: string): Promise<void>;
}

/** Seconds. Recorded in operational documentation per AC-36. */
export const SESSION_IDLE_SECONDS = 60 * 60 * 8;
export const SESSION_ABSOLUTE_SECONDS = 60 * 60 * 24;
/** How recently the user must have authenticated for an approval action. */
export const RECENT_AUTH_SECONDS = 60 * 15;

export class InMemorySessionStore implements SessionStore {
  readonly #records = new Map<string, SessionRecord>();

  async create(record: SessionRecord): Promise<void> {
    this.#records.set(record.id, record);
  }

  async find(id: string): Promise<SessionRecord | null> {
    return this.#records.get(id) ?? null;
  }

  async revoke(id: string): Promise<void> {
    const existing = this.#records.get(id);
    if (existing) this.#records.set(id, { ...existing, revokedAt: new Date() });
  }
}

export function isUsable(session: SessionRecord | null, now: Date): session is SessionRecord {
  if (session === null) return false;
  if (session.revokedAt !== null) return false;
  if (session.expiresAt.getTime() <= now.getTime()) return false;
  if (session.absoluteExpiresAt.getTime() <= now.getTime()) return false;
  return true;
}

export function hasRecentAuthentication(session: SessionRecord, now: Date): boolean {
  const age = (now.getTime() - session.lastAuthenticatedAt.getTime()) / 1000;
  return age <= RECENT_AUTH_SECONDS;
}

/**
 * Issues a session for a user who has just authenticated.
 *
 * Any previous session id is revoked rather than reused. Reusing it would leave
 * a fixated identifier valid across the privilege change, which is the whole
 * point of the rotation requirement in AC-38.
 */
export async function establishSession(
  store: SessionStore,
  input: { newId: string; userId: string; previousSessionId?: string | undefined; now: Date },
): Promise<SessionRecord> {
  if (input.previousSessionId !== undefined) {
    await store.revoke(input.previousSessionId);
  }
  const record: SessionRecord = {
    id: input.newId,
    userId: input.userId,
    expiresAt: new Date(input.now.getTime() + SESSION_IDLE_SECONDS * 1000),
    absoluteExpiresAt: new Date(input.now.getTime() + SESSION_ABSOLUTE_SECONDS * 1000),
    lastAuthenticatedAt: input.now,
    revokedAt: null,
  };
  await store.create(record);
  return record;
}
