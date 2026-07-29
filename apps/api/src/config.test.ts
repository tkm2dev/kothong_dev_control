import { describe, expect, it } from 'vitest';
import { ConfigurationError, assertProductionSafe, loadConfig, type Config } from './config.ts';

const valid = {
  PUBLIC_ORIGIN: 'https://devcontrol.example',
  DATABASE_URL: 'postgres://user@localhost:5432/kdc',
  COOKIE_SECRET: 'x'.repeat(32),
  GITHUB_OAUTH_CLIENT_ID: 'client-id',
  GITHUB_OAUTH_CLIENT_SECRET: 'client-secret',
};

const production = (overrides: Partial<Config> = {}): Config =>
  ({
    NODE_ENV: 'production',
    PORT: 3000,
    PUBLIC_HTTPS: true,
    PUBLIC_ORIGIN: 'https://devcontrol.example',
    DATABASE_URL: 'postgres://user@localhost:5432/kdc',
    COOKIE_SECRET: 'x'.repeat(32),
    GITHUB_OAUTH_CLIENT_ID: 'id',
    GITHUB_OAUTH_CLIENT_SECRET: 'secret',
    KMS_PROVIDER: 'external',
    ...overrides,
  }) as Config;

describe('configuration', () => {
  it('accepts a complete environment', () => {
    expect(loadConfig(valid as NodeJS.ProcessEnv).PORT).toBe(3000);
  });

  it('refuses a cookie secret that is too short to be worth signing with', () => {
    expect(() => loadConfig({ ...valid, COOKIE_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      ConfigurationError,
    );
  });

  it('names the missing keys without printing their values', () => {
    // A startup failure often lands in a shared log. It may say what was
    // missing; it must not say what was set.
    try {
      loadConfig({ ...valid, COOKIE_SECRET: 'secret-value-that-is-too-short' } as NodeJS.ProcessEnv);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).toContain('COOKIE_SECRET');
      expect(String(error)).not.toContain('secret-value-that-is-too-short');
    }
  });

  it.each(['DATABASE_URL', 'GITHUB_OAUTH_CLIENT_ID', 'PUBLIC_ORIGIN'])(
    'refuses an environment with no %s',
    (key) => {
      const incomplete = { ...valid } as Record<string, string>;
      delete incomplete[key];
      expect(() => loadConfig(incomplete as NodeJS.ProcessEnv)).toThrow(ConfigurationError);
    },
  );
});

describe('production safety', () => {
  it('refuses the development KMS', () => {
    // ADR 0005 requires this to stop startup, not warn. A warning in a log
    // nobody reads is not a control.
    expect(() => assertProductionSafe(production({ KMS_PROVIDER: 'dev-file' }))).toThrow(
      ConfigurationError,
    );
  });

  it('refuses to serve without HTTPS', () => {
    // Session cookies would go out without the Secure flag.
    expect(() => assertProductionSafe(production({ PUBLIC_HTTPS: false }))).toThrow(
      ConfigurationError,
    );
  });

  it('refuses a public origin that is not https', () => {
    expect(() =>
      assertProductionSafe(production({ PUBLIC_ORIGIN: 'http://devcontrol.example' })),
    ).toThrow(ConfigurationError);
  });

  it('allows the development KMS outside production', () => {
    expect(() =>
      assertProductionSafe(
        production({ NODE_ENV: 'development', KMS_PROVIDER: 'dev-file', PUBLIC_HTTPS: false }),
      ),
    ).not.toThrow();
  });

  it('accepts a production environment that is configured properly', () => {
    expect(() => assertProductionSafe(production())).not.toThrow();
  });
});
