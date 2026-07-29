import { Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { ApiExceptionFilter, createFastifyErrorHandler } from './errors.ts';
import { registerSecurity, type SecurityOptions } from './security.ts';

@Controller('health')
export class HealthController {
  /**
   * Liveness only. It reports that the process is up, nothing about the
   * database or GitHub — a health check that lies green while a dependency is
   * down is worse than none, and a check that reports dependency detail to an
   * unauthenticated caller leaks topology.
   */
  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Controller('auth')
export class AuthController {
  /**
   * State-changing, so CSRF protection applies. Real session revocation lands
   * with the OAuth flow; this exists now so the security controls around it are
   * exercised rather than asserted in the abstract.
   */
  @Post('logout')
  logout(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({ controllers: [HealthController, AuthController] })
export class AppModule {}

export async function createApp(options: SecurityOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter();
  await registerSecurity(adapter.getInstance() as unknown as FastifyInstance, options);

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    // Nest's default logger prints request detail. Structured logging with
    // redaction arrives with the audit work; until then, stay quiet rather than
    // risk writing something that should have been redacted.
    logger: ['error', 'warn'],
  });

  // Registered here rather than per-controller so nothing can answer with an
  // error shape that was never in the catalogue.
  app.useGlobalFilters(new ApiExceptionFilter(() => randomUUID()));

  // Installed after Nest, which sets its own during creation. Without this a
  // CSRF refusal or a rate limit answers 500 rather than saying what happened.
  adapter.getInstance().setErrorHandler(createFastifyErrorHandler(() => randomUUID()));
  return app;
}
