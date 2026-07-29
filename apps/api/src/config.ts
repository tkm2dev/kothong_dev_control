/**
 * Runtime configuration.
 *
 * Everything arrives from the environment and is validated once, at startup, so
 * a misconfigured deployment fails immediately and loudly rather than at the
 * first request that happens to need the missing value.
 *
 * No secret has a default. A fallback for a signing key or a client secret is
 * the kind of convenience that ships to production and stays there.
 */

import { z } from 'zod';

const secret = (min: number) => z.string().min(min);

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Whether the service is reached over HTTPS. Drives Secure cookies and HSTS. */
  PUBLIC_HTTPS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  PUBLIC_ORIGIN: z.string().url(),

  DATABASE_URL: z.string().min(1),

  /** At least 32 bytes of entropy. Shorter keys are not worth signing with. */
  COOKIE_SECRET: secret(32),
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1),
  GITHUB_OAUTH_CLIENT_SECRET: secret(1),

  /**
   * Key encryption key material for the envelope scheme in ADR 0005.
   *
   * The file-based development KMS is refused in production by
   * `assertProductionSafe` below, rather than merely warned about.
   */
  KMS_PROVIDER: z.enum(['dev-file', 'external']).default('dev-file'),
  KMS_KEY_REFERENCE: z.string().min(1).optional(),
});

export type Config = Omit<z.infer<typeof configSchema>, never>;

export class ConfigurationError extends Error {}

/**
 * The development KMS must never run in production.
 *
 * ADR 0005 requires this to fail at startup rather than warn. A warning in a
 * log nobody is reading is not a control.
 */
export function assertProductionSafe(config: Config): void {
  if (config.NODE_ENV !== 'production') return;

  if (config.KMS_PROVIDER === 'dev-file') {
    throw new ConfigurationError(
      'KMS_PROVIDER is dev-file in production. Set an external provider before starting.',
    );
  }
  if (!config.PUBLIC_HTTPS) {
    throw new ConfigurationError(
      'PUBLIC_HTTPS is false in production. Session cookies would be sent without the Secure flag.',
    );
  }
  if (!config.PUBLIC_ORIGIN.startsWith('https://')) {
    throw new ConfigurationError('PUBLIC_ORIGIN must be an https URL in production.');
  }
}

/**
 * Reads and validates configuration.
 *
 * The error names the missing keys but never their values, so a startup failure
 * in a shared log cannot leak what was set.
 */
export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = configSchema.safeParse(env);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))];
    throw new ConfigurationError(`Invalid configuration for: ${keys.sort().join(', ')}`);
  }
  assertProductionSafe(parsed.data);
  return parsed.data;
}
