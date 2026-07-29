/**
 * Error code catalogue.
 *
 * `docs/ERROR_CODES.md` is the source of truth. This file mirrors it so the
 * codes can be typed and asserted, and a test verifies the two stay in step.
 *
 * A code's meaning must never change once it is in use. Introduce a new code
 * and deprecate the old one instead. See AC-30.
 */

export const ERROR_CODES = {
  // Authentication and session
  UNAUTHENTICATED: 401,
  SESSION_EXPIRED: 401,
  CSRF_TOKEN_INVALID: 403,
  OAUTH_STATE_INVALID: 400,
  REAUTHENTICATION_REQUIRED: 401,

  // Authorization
  //
  // NOT_FOUND deliberately covers both "does not exist" and "you may not know
  // it exists". Splitting them would defeat the Denied Response Policy in
  // docs/SLICE_01_ACCEPTANCE_CRITERIA.md section 3.1.
  FORBIDDEN: 403,
  NOT_FOUND: 404,

  // Validation and contract
  VALIDATION_FAILED: 422,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  PAGINATION_INVALID: 422,

  // Project and repository
  PROJECT_ALREADY_REGISTERED: 409,
  VERSION_CONFLICT: 409,
  REPOSITORY_BINDING_MISMATCH: 409,
  TENANT_BOUNDARY_VIOLATION: 404,

  // GitHub upstream. These five map one to one onto the five conditions in
  // AC-11 so that a test exists per condition.
  GITHUB_REPOSITORY_NOT_FOUND: 404,
  GITHUB_ACCESS_DENIED: 403,
  GITHUB_INSTALLATION_SUSPENDED: 403,
  GITHUB_TIMEOUT: 504,
  GITHUB_RATE_LIMITED: 503,
  GITHUB_CONTRACT_MISMATCH: 502,

  // This system's own rate limiting
  RATE_LIMITED: 429,

  // Internal
  INTERNAL_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;

export const ERROR_CODE_LIST = Object.keys(ERROR_CODES) as ErrorCode[];

export function isErrorCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CODES, value);
}

export function httpStatusFor(code: ErrorCode): number {
  return ERROR_CODES[code];
}
