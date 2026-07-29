/**
 * Browser security controls for AC-38, AC-39 and AC-40.
 *
 * These are registered on the Fastify instance rather than as Nest middleware
 * so they apply to every route, including ones added later by someone who never
 * reads this file. A control that has to be remembered per-route is a control
 * that will eventually be forgotten.
 */

import type { FastifyInstance } from 'fastify';

/** Session cookie name. Prefixed so it cannot collide with another app sharing a host. */
export const SESSION_COOKIE = 'kdc_session';

/** Seconds. Recorded in operational documentation per AC-39. */
export const RATE_LIMIT_WINDOW_SECONDS = 60;
export const RATE_LIMIT_MAX_REQUESTS = 60;
export const RATE_LIMIT_MAX_AUTH_REQUESTS = 10;

export interface SecurityOptions {
  /** True when served over HTTPS. Drives the Secure cookie flag and HSTS. */
  readonly https: boolean;
  /** Signing key for cookies and CSRF tokens. Never hardcoded, never logged. */
  readonly cookieSecret: string;
}

export function sessionCookieOptions(https: boolean) {
  return {
    httpOnly: true,
    secure: https,
    sameSite: 'lax' as const,
    path: '/',
    signed: true,
  };
}

export async function registerSecurity(
  app: FastifyInstance,
  options: SecurityOptions,
): Promise<void> {
  const helmet = (await import('@fastify/helmet')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const csrf = (await import('@fastify/csrf-protection')).default;
  const rateLimit = (await import('@fastify/rate-limit')).default;

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        // No 'unsafe-inline' for scripts. AC-40 names this explicitly, and it
        // is the directive that actually stops injected markup from executing.
        scriptSrc: [`'self'`],
        styleSrc: [`'self'`],
        imgSrc: [`'self'`, 'data:', 'https://avatars.githubusercontent.com'],
        connectSrc: [`'self'`],
        frameAncestors: [`'none'`],
        objectSrc: [`'none'`],
        baseUri: [`'self'`],
        formAction: [`'self'`],
      },
    },
    // Do not send the full URL to another origin. Paths here carry project and
    // organization identifiers.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Only meaningful over HTTPS, and actively unhelpful in local development.
    hsts: options.https ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    xContentTypeOptions: true,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
  });

  await app.register(cookie, {
    secret: options.cookieSecret,
    parseOptions: sessionCookieOptions(options.https),
  });

  await app.register(csrf, {
    sessionPlugin: '@fastify/cookie',
    cookieOpts: sessionCookieOptions(options.https),
  });

  // The plugin only exposes a hook; it does not guard anything on its own.
  // Attaching it per route means the first route someone adds without
  // remembering is unprotected, so it is applied to every unsafe method here.
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method.toUpperCase())) return;
    await new Promise<void>((resolve, reject) => {
      app.csrfProtection(request, reply, (err?: unknown) => (err ? reject(err) : resolve()));
    });
  });

  await app.register(rateLimit, {
    global: true,
    max: RATE_LIMIT_MAX_REQUESTS,
    timeWindow: RATE_LIMIT_WINDOW_SECONDS * 1000,
    // Counting by IP rather than by session means an unauthenticated flood is
    // counted too, which AC-39 requires.
    keyGenerator: (request) => request.ip,
    // Only tags the thrown error. The response envelope is built in one place,
    // by the error handler, so a caller cannot tell rate limiting apart from
    // any other refusal by its shape.
    errorResponseBuilder: () => ({ statusCode: 429, code: 'RATE_LIMITED' }),
  });
}
