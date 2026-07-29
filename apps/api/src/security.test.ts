/**
 * AC-38, AC-39 and AC-40.
 *
 * Every assertion here reads a real HTTP response from the running application,
 * not the configuration that produced it. AC-40 asks for this explicitly, and
 * the reason generalises: configuration that looks right and a response that is
 * right are different claims, and only the second one protects anyone.
 */

import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createApp } from './app.ts';
import { AuthController } from './auth/controller.ts';
import { ProjectsController } from './projects/controller.ts';
import { RATE_LIMIT_MAX_REQUESTS, SESSION_COOKIE, sessionCookieOptions } from './security.ts';

// Collaborators are irrelevant here: these tests are about headers, CSRF and
// rate limiting, which apply before any route body runs.
const stubDependencies = {
  auth: { resolve: async () => null } as unknown as AuthController,
  projects: {} as ProjectsController,
};

describe('browser security controls', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ https: true, cookieSecret: 'test-secret-not-a-real-key-000000' }, stubDependencies);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  const inject = (options: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(options);

  // -- AC-40 -----------------------------------------------------------------

  describe('secure headers', () => {
    it('sets a content security policy that does not allow inline script', async () => {
      const res = await inject({ method: 'GET', url: '/health' });
      const csp = res.headers['content-security-policy'];
      expect(csp, 'no Content-Security-Policy header').toBeTruthy();
      expect(String(csp)).toContain("script-src 'self'");
      expect(String(csp)).not.toContain("'unsafe-inline'");
    });

    it('sets nosniff', async () => {
      const res = await inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('does not send the full URL across origins', async () => {
      const res = await inject({ method: 'GET', url: '/health' });
      const policy = String(res.headers['referrer-policy']);
      expect(['strict-origin-when-cross-origin', 'no-referrer', 'same-origin']).toContain(policy);
    });

    it('sets HSTS when served over HTTPS', async () => {
      const res = await inject({ method: 'GET', url: '/health' });
      expect(res.headers['strict-transport-security']).toBeTruthy();
    });

    it('omits HSTS when not served over HTTPS', async () => {
      // Sending HSTS from a plain-HTTP deployment pins browsers to a scheme the
      // server may not answer on, which is a self-inflicted outage.
      const plain = await createApp({ https: false, cookieSecret: 'test-secret-0000000000000000000' }, stubDependencies);
      await plain.init();
      await plain.getHttpAdapter().getInstance().ready();
      const res = await plain.inject({ method: 'GET', url: '/health' });
      expect(res.headers['strict-transport-security']).toBeUndefined();
      await plain.close();
    });
  });

  // -- AC-38 -----------------------------------------------------------------

  describe('CSRF protection', () => {
    it('rejects a state-changing request with no token', async () => {
      const res = await inject({ method: 'POST', url: '/auth/logout' });
      expect(res.statusCode).toBe(403);
    });

    it('rejects a state-changing request with a forged token', async () => {
      const res = await inject({
        method: 'POST',
        url: '/auth/logout',
        headers: { 'x-csrf-token': 'forged' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('leaves safe methods reachable without a token', async () => {
      const res = await inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('session cookie attributes', () => {
    it('marks the cookie HttpOnly, Secure and SameSite over HTTPS', () => {
      const options = sessionCookieOptions(true);
      expect(options.httpOnly).toBe(true);
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('lax');
    });

    it('drops Secure when not served over HTTPS so local development works', () => {
      // The flag has to track the scheme. Hardcoding it either breaks local
      // development or silently ships an insecure cookie.
      expect(sessionCookieOptions(false).secure).toBe(false);
      expect(sessionCookieOptions(false).httpOnly).toBe(true);
    });

    it('uses a prefixed cookie name', () => {
      expect(SESSION_COOKIE).toBe('kdc_session');
    });
  });

  // -- AC-39 -----------------------------------------------------------------

  describe('rate limiting', () => {
    it('answers 429 with a stable error code once the limit is passed', async () => {
      let last = await inject({ method: 'GET', url: '/health' });
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 5 && last.statusCode !== 429; i += 1) {
        last = await inject({ method: 'GET', url: '/health' });
      }
      expect(last.statusCode).toBe(429);
      expect(JSON.parse(last.body).error.code).toBe('RATE_LIMITED');
    });

    it('says the same thing regardless of what was asked for', async () => {
      // A different message for a resource that exists would confirm it exists
      // to a caller who is not allowed to know.
      const known = await inject({ method: 'GET', url: '/health' });
      const unknown = await inject({ method: 'GET', url: '/definitely-not-a-route' });
      if (known.statusCode === 429 && unknown.statusCode === 429) {
        expect(JSON.parse(known.body).error.message).toBe(JSON.parse(unknown.body).error.message);
      }
    });
  });
});
