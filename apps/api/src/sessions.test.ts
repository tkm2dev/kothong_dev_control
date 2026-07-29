/**
 * AC-38, the parts that are about session lifetime rather than HTTP headers.
 */

import { describe, expect, it } from 'vitest';
import {
  InMemorySessionStore,
  RECENT_AUTH_SECONDS,
  SESSION_ABSOLUTE_SECONDS,
  establishSession,
  hasRecentAuthentication,
  isUsable,
} from './sessions.ts';

const now = new Date('2026-07-29T00:00:00Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);

describe('session lifecycle', () => {
  it('issues a new identifier and revokes the previous one', async () => {
    const store = new InMemorySessionStore();
    const first = await establishSession(store, { newId: 'a', userId: 'u', now });
    const second = await establishSession(store, {
      newId: 'b',
      userId: 'u',
      previousSessionId: first.id,
      now,
    });

    expect(second.id).not.toBe(first.id);
    // Session fixation only matters if the old identifier survives the
    // privilege change, so this is the assertion that carries the requirement.
    expect(isUsable(await store.find('a'), now)).toBe(false);
    expect(isUsable(await store.find('b'), now)).toBe(true);
  });

  it('makes a session unusable after logout', async () => {
    const store = new InMemorySessionStore();
    await establishSession(store, { newId: 'a', userId: 'u', now });
    await store.revoke('a');
    expect(isUsable(await store.find('a'), now)).toBe(false);
  });

  it('treats an unknown session as unusable', async () => {
    const store = new InMemorySessionStore();
    expect(isUsable(await store.find('missing'), now)).toBe(false);
  });

  it('expires on idle timeout', async () => {
    const store = new InMemorySessionStore();
    const session = await establishSession(store, { newId: 'a', userId: 'u', now });
    expect(isUsable(session, later(1))).toBe(true);
    expect(isUsable(session, new Date(session.expiresAt.getTime() + 1000))).toBe(false);
  });

  it('expires on absolute timeout even while active', async () => {
    // Without this a session refreshed often enough would live forever.
    const store = new InMemorySessionStore();
    const session = await establishSession(store, { newId: 'a', userId: 'u', now });
    expect(isUsable(session, later(SESSION_ABSOLUTE_SECONDS + 1))).toBe(false);
  });

  it('reports recent authentication only inside the window', async () => {
    const store = new InMemorySessionStore();
    const session = await establishSession(store, { newId: 'a', userId: 'u', now });
    expect(hasRecentAuthentication(session, later(RECENT_AUTH_SECONDS - 1))).toBe(true);
    expect(hasRecentAuthentication(session, later(RECENT_AUTH_SECONDS + 1))).toBe(false);
  });
});
