/**
 * API client.
 *
 * Errors arrive as catalogue codes, and the UI decides what to show from the
 * code rather than from the server's prose. That keeps a message change from
 * silently altering behaviour, and means a caller can react to
 * `VERSION_CONFLICT` without string matching.
 */

export interface ApiFailure {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string | null;
}

export class ApiRequestError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.code);
    this.name = 'ApiRequestError';
  }
}

export interface ProjectView {
  id: string;
  name: string;
  version: number;
  repository: {
    externalRepositoryId: string;
    ownerLogin: string;
    repositoryName: string;
    visibility: string;
    defaultBranch: string;
    accessStatus: string;
  };
  lastVerifiedAt: string | null;
  freshness: 'FRESH' | 'AGING' | 'STALE';
}

export interface Me {
  userId: string;
  organizationId: string;
  permissions: string[];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    // Sends the session cookie. It is HttpOnly, so script never sees its value.
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: Partial<ApiFailure> } | null)?.error;
    throw new ApiRequestError({
      code: error?.code ?? 'INTERNAL_ERROR',
      message: error?.message ?? 'Something went wrong.',
      correlationId:
        error?.correlationId ?? response.headers.get('x-correlation-id') ?? null,
    });
  }
  return body as T;
}

export const api = {
  me: () => request<Me>('/api/auth/me'),

  listProjects: (cursor?: string) =>
    request<{ items: ProjectView[]; nextCursor: string | null }>(
      `/api/projects${cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`}`,
    ),

  getProject: (id: string) => request<ProjectView>(`/api/projects/${encodeURIComponent(id)}`),

  createProject: (input: {
    name: string;
    installationId: string;
    owner: string;
    repo: string;
    idempotencyKey: string;
  }) =>
    request<ProjectView>('/api/projects', {
      method: 'POST',
      // AC-09 only works if the key survives a retry, so it is generated once
      // by the caller and reused, not created here per attempt.
      headers: { 'idempotency-key': input.idempotencyKey },
      body: JSON.stringify({
        name: input.name,
        installationId: input.installationId,
        owner: input.owner,
        repo: input.repo,
      }),
    }),
};

/** Wording the user sees, chosen from the code rather than the server's prose. */
export function messageFor(failure: ApiFailure): string {
  switch (failure.code) {
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return 'Your session has ended. Sign in again to continue.';
    case 'FORBIDDEN':
      return 'You do not have permission to do that.';
    case 'NOT_FOUND':
      return 'Not found.';
    case 'PROJECT_ALREADY_REGISTERED':
      return 'That repository is already registered in this organization.';
    case 'VERSION_CONFLICT':
      return 'Someone else changed this while you were editing. Refresh to see their version.';
    case 'GITHUB_REPOSITORY_NOT_FOUND':
      return 'That repository could not be found on GitHub.';
    case 'GITHUB_ACCESS_DENIED':
      return 'The GitHub installation cannot access that repository.';
    case 'GITHUB_INSTALLATION_SUSPENDED':
      return 'The GitHub installation is suspended.';
    case 'GITHUB_RATE_LIMITED':
      return 'GitHub is rate limiting requests. Try again shortly.';
    case 'GITHUB_TIMEOUT':
      return 'GitHub did not respond in time. Try again.';
    case 'RATE_LIMITED':
      return 'Too many requests. Wait a moment and try again.';
    case 'VALIDATION_FAILED':
      return 'Check the details and try again.';
    default:
      return failure.message;
  }
}
