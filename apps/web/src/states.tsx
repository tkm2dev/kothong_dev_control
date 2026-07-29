/**
 * The states every critical action must have: loading, empty, error, success.
 *
 * They live in one place so the wording and the shape stay the same wherever
 * they appear, and so no screen can quietly ship without one.
 *
 * Status never rests on colour alone — each carries an icon and a word, which
 * AC-26 requires and which is also the only way the states read correctly in
 * greyscale or for anyone who cannot distinguish them.
 */

import type { ReactNode } from 'react';
import { messageFor, type ApiFailure } from './api.ts';

export function Loading({ what }: { what: string }): ReactNode {
  return (
    // Announced politely so a screen reader hears that work is in progress
    // rather than silence.
    <p className="muted" role="status" aria-live="polite" data-testid="loading">
      <span aria-hidden="true">◌ </span>
      Loading {what}…
    </p>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="card stack" data-testid="empty">
      <strong>{title}</strong>
      {/* An empty state that only says "nothing here" leaves the user stuck.
          It has to name the next safe step. */}
      <span className="muted">{hint}</span>
      {action}
    </div>
  );
}

export function ErrorState({
  failure,
  onRetry,
}: {
  failure: ApiFailure;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div className="card stack" role="alert" data-testid="error">
      <span className="status status--blocked">
        <span aria-hidden="true">▲</span> Something went wrong
      </span>
      <span>{messageFor(failure)}</span>
      {/* The correlation reference is what turns a support conversation from
          guesswork into a lookup, so it is shown and selectable. */}
      {failure.correlationId !== null && (
        <span className="muted">
          Reference: <code data-testid="correlation">{failure.correlationId}</code>
        </span>
      )}
      {onRetry !== undefined && (
        <div>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

export function SuccessNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <p className="status status--ok" role="status" aria-live="polite" data-testid="success">
      <span aria-hidden="true">✓</span> {children}
    </p>
  );
}

const FRESHNESS: Record<string, { className: string; icon: string; label: string }> = {
  FRESH: { className: 'status--ok', icon: '✓', label: 'Checked recently' },
  AGING: { className: 'status--attention', icon: '•', label: 'May be out of date' },
  STALE: { className: 'status--attention', icon: '▲', label: 'Not checked recently' },
};

/**
 * Freshness, always next to the timestamp it describes.
 *
 * AC-16 forbids presenting cached data as though it were live, so the moment it
 * was last verified travels with it rather than living somewhere else.
 */
export function Freshness({
  freshness,
  lastVerifiedAt,
}: {
  freshness: string;
  lastVerifiedAt: string | null;
}): ReactNode {
  const state = FRESHNESS[freshness] ?? FRESHNESS['STALE']!;
  return (
    <span className={`status ${state.className}`} data-testid="freshness">
      <span aria-hidden="true">{state.icon}</span>
      {state.label}
      {lastVerifiedAt !== null && (
        <span className="muted"> · {new Date(lastVerifiedAt).toLocaleString()}</span>
      )}
    </span>
  );
}
