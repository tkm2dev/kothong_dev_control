/**
 * Composition root.
 *
 * Every dependency is built here and passed in. Nothing constructs its own
 * database connection or reads the environment on its own, which is what keeps
 * the pieces testable in isolation and configuration in one place.
 */

import { randomUUID } from 'node:crypto';
import { Controller, Get, Module, Post, Req, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import pg from 'pg';
import { newId } from '@kdc/db';
import { AuthController } from './auth/controller.ts';
import { DrizzleIdentityDirectory, DrizzleSessionStore } from './auth/drizzle-directory.ts';
import { GitHubOAuth, InMemoryLoginAttemptStore, type OAuthTransport } from './auth/oauth.ts';
import { SignIn } from './auth/sign-in.ts';
import type { Config } from './config.ts';
import { ApiExceptionFilter, createFastifyErrorHandler } from './errors.ts';
import { GitHubClient, type GitHubTransport } from './github/client.ts';
import { ProjectsController, ProjectsRoutes } from './projects/controller.ts';
import { DrizzleUnitOfWork } from './projects/drizzle-store.ts';
import { ProjectRegistry } from './projects/registry.ts';
import { registerSecurity, type SecurityOptions } from './security.ts';

/**
 * Liveness only.
 *
 * It reports that the process is up and says nothing about the database or
 * GitHub. A check that answers green while a dependency is down is worse than
 * none, and one that describes dependencies to an unauthenticated caller leaks
 * topology. Readiness, when it exists, belongs behind authentication.
 */
@Controller('health')
export class HealthController {
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Controller('auth')
export class AuthRoutes {
  constructor(private readonly auth: AuthController) {}

  @Get('github/start')
  start(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.auth.start(request, reply);
  }

  @Get('github/callback')
  callback(@Req() request: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    return this.auth.callback(request, reply);
  }

  @Post('logout')
  logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.auth.logout(request, reply);
  }

  @Get('me')
  me(@Req() request: FastifyRequest) {
    return this.auth.me(request);
  }
}

export interface Dependencies {
  readonly auth: AuthController;
  readonly projects: ProjectsController;
}

@Module({})
export class AppModule {}

/**
 * Builds the application from already-constructed collaborators.
 *
 * Tests use this directly with fakes; `bootstrap` below is the only place that
 * turns configuration into real ones.
 */
export async function createApp(
  options: SecurityOptions,
  dependencies: Dependencies,
): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter();
  await registerSecurity(adapter.getInstance() as unknown as FastifyInstance, options);

  const app = await NestFactory.create<NestFastifyApplication>(
    {
      module: AppModule,
      controllers: [HealthController, AuthRoutes, ProjectsRoutes],
      providers: [
        { provide: AuthController, useValue: dependencies.auth },
        { provide: ProjectsController, useValue: dependencies.projects },
      ],
    },
    adapter,
    {
      // Nest's default logger prints request detail. Structured logging with
      // redaction is separate work; until then, staying quiet beats risking a
      // line that should have been redacted.
      logger: ['error', 'warn'],
    },
  );

  app.useGlobalFilters(new ApiExceptionFilter(() => randomUUID()));
  // Installed after Nest, which sets its own during creation. Without this a
  // CSRF refusal or a rate limit answers 500 rather than saying what happened.
  adapter.getInstance().setErrorHandler(createFastifyErrorHandler(() => randomUUID()));
  return app;
}

/** Turns configuration into a running application. */
export async function bootstrap(
  config: Config,
  transports: { github: GitHubTransport; oauth: OAuthTransport },
): Promise<{ app: NestFastifyApplication; pool: pg.Pool }> {
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL });
  const db = drizzle(pool);

  const signIn = new SignIn(
    new DrizzleIdentityDirectory(db),
    new DrizzleSessionStore(db),
    newId,
    () => new Date(),
  );

  const oauth = new GitHubOAuth(
    {
      clientId: config.GITHUB_OAUTH_CLIENT_ID,
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      redirectUri: `${config.PUBLIC_ORIGIN}/auth/github/callback`,
      // Only what is needed to identify the human. Repository access comes from
      // the installation, so no repository scope is requested here.
      scopes: ['read:user'],
    },
    transports.oauth,
    new InMemoryLoginAttemptStore(),
    () => new Date(),
  );

  const auth = new AuthController(oauth, signIn, config.PUBLIC_HTTPS);
  const projects = new ProjectsController(
    new ProjectRegistry(new DrizzleUnitOfWork(db), newId, () => new Date()),
    new GitHubClient(transports.github),
    { resolve: (request) => auth.resolve(request) },
    () => new Date(),
  );

  const app = await createApp(
    { https: config.PUBLIC_HTTPS, cookieSecret: config.COOKIE_SECRET },
    { auth, projects },
  );
  return { app, pool };
}
