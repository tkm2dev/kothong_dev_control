/**
 * Every error the API returns passes through here.
 *
 * AC-30 requires that responses only ever carry codes from
 * `docs/ERROR_CODES.md`, and AC-21 requires a correlation reference on every
 * response. Both are far easier to guarantee at one choke point than by asking
 * each handler to remember.
 *
 * It also fixes a concrete problem: Fastify plugins signal refusal by throwing,
 * and Nest turns an exception it does not recognise into a bare 500. Without
 * this filter a rate-limited request answers `500 Internal server error`, which
 * is both wrong and unhelpful to the caller.
 */

import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES, httpStatusFor, isErrorCode, type ErrorCode } from '@kdc/contracts';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * User-facing text. Deliberately incurious: none of these reveal whether a
 * resource exists, who owns it, or what went wrong internally.
 */
const MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Sign in to continue.',
  SESSION_EXPIRED: 'Your session has expired. Sign in again.',
  CSRF_TOKEN_INVALID: 'The request could not be verified. Reload the page and try again.',
  OAUTH_STATE_INVALID: 'The sign-in attempt could not be verified. Start again.',
  REAUTHENTICATION_REQUIRED: 'Confirm your identity to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'Not found.',
  VALIDATION_FAILED: 'The request was not valid.',
  IDEMPOTENCY_KEY_REQUIRED: 'This request requires an idempotency key.',
  IDEMPOTENCY_KEY_REUSED: 'That idempotency key was already used with a different request.',
  PAGINATION_INVALID: 'The pagination parameters were not valid.',
  PROJECT_ALREADY_REGISTERED: 'That repository is already registered.',
  VERSION_CONFLICT: 'This was changed by someone else. Refresh and review the changes.',
  REPOSITORY_BINDING_MISMATCH: 'The repository no longer matches what was registered.',
  TENANT_BOUNDARY_VIOLATION: 'Not found.',
  GITHUB_REPOSITORY_NOT_FOUND: 'That repository could not be found on GitHub.',
  GITHUB_ACCESS_DENIED: 'The installation cannot access that repository.',
  GITHUB_INSTALLATION_SUSPENDED: 'The GitHub installation is suspended.',
  GITHUB_TIMEOUT: 'GitHub did not respond in time. Try again.',
  GITHUB_RATE_LIMITED: 'GitHub is rate limiting requests. Try again shortly.',
  GITHUB_CONTRACT_MISMATCH: 'GitHub returned data in an unexpected shape.',
  RATE_LIMITED: 'Too many requests. Try again shortly.',
  INTERNAL_ERROR: 'Something went wrong.',
};

/** Thrown by application code that already knows which catalogue entry applies. */
export class ApiError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = 'ApiError';
  }
}

function statusOf(exception: unknown): number {
  const direct = (exception as { statusCode?: unknown } | null)?.statusCode;
  if (typeof direct === 'number') return direct;
  // Nest's HttpException carries its status behind a method instead.
  const getStatus = (exception as { getStatus?: unknown } | null)?.getStatus;
  if (typeof getStatus === 'function') {
    const value: unknown = getStatus.call(exception);
    if (typeof value === 'number') return value;
  }
  return 500;
}

/**
 * Maps a thrown value onto a catalogue entry.
 *
 * Anything unrecognised becomes INTERNAL_ERROR rather than being passed
 * through, so a plugin's own error text can never reach the caller.
 */
export function codeFor(exception: unknown): ErrorCode {
  if (exception instanceof ApiError) return exception.code;

  const explicit = (exception as { code?: unknown } | null)?.code;
  if (typeof explicit === 'string' && isErrorCode(explicit)) return explicit;

  switch (statusOf(exception)) {
    case 429:
      return 'RATE_LIMITED';
    case 403:
      return 'CSRF_TOKEN_INVALID';
    case 401:
      return 'UNAUTHENTICATED';
    case 404:
      return 'NOT_FOUND';
    default:
      return 'INTERNAL_ERROR';
  }
}

const CORRELATION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Accepts a caller-supplied reference only if it is well formed. */
export function correlationIdFrom(request: FastifyRequest, fallback: string): string {
  const supplied = request.headers[CORRELATION_HEADER];
  const value = Array.isArray(supplied) ? supplied[0] : supplied;
  return typeof value === 'string' && CORRELATION_PATTERN.test(value) ? value : fallback;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly newCorrelationId: () => string) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const code = codeFor(exception);
    const correlationId = correlationIdFrom(request, this.newCorrelationId());

    void reply
      .status(httpStatusFor(code))
      .header(CORRELATION_HEADER, correlationId)
      .send({ error: { code, message: MESSAGES[code], correlationId } });
  }
}

/**
 * Fastify-level handler.
 *
 * Errors thrown from a Fastify hook — CSRF refusal, rate limiting — happen
 * before Nest's request pipeline exists, so a Nest exception filter never sees
 * them and they surface as a bare 500. Both layers are wired to this same
 * mapping so a caller cannot tell which one refused, and neither can answer
 * with a shape that is not in the catalogue.
 */
export function createFastifyErrorHandler(newCorrelationId: () => string) {
  return function handle(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
    const code = codeFor(error);
    const correlationId = correlationIdFrom(request, newCorrelationId());
    void reply
      .status(httpStatusFor(code))
      .header(CORRELATION_HEADER, correlationId)
      .send({ error: { code, message: MESSAGES[code], correlationId } });
  };
}

export const ALL_MESSAGES_DEFINED = Object.keys(ERROR_CODES).every((c) => c in MESSAGES);
