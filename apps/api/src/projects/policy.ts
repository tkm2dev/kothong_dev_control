/**
 * Authorisation for the project registry.
 *
 * ADR 0004 makes `role_assignments` the only source of authority. Nothing here
 * consults GitHub organization membership or repository permission: write
 * access on GitHub is not permission to approve a merge in this system.
 *
 * The Denied Response Policy in `docs/SLICE_01_ACCEPTANCE_CRITERIA.md` §3.1 is
 * encoded in `denialFor`. It is the part most likely to be got wrong by
 * accident, because the intuitive answer — 403 for "you may not" — is the one
 * that leaks.
 */

import { ApiError } from '../errors.ts';

export type RoleCode = 'PRODUCT_OWNER' | 'MEMBER';
export type Permission = 'project:read' | 'project:manage';

export interface RoleAssignment {
  readonly organizationId: string;
  /** Null for a role that covers the whole organization. */
  readonly projectId: string | null;
  readonly roleCode: RoleCode;
}

export interface Actor {
  readonly userId: string;
  readonly organizationId: string;
  readonly roles: readonly RoleAssignment[];
}

const GRANTS: Record<RoleCode, readonly Permission[]> = {
  PRODUCT_OWNER: ['project:read', 'project:manage'],
  MEMBER: ['project:read'],
};

/**
 * True when the actor holds the permission for this project.
 *
 * A role assignment only counts inside its own organization. That check is
 * duplicated here even though the composite foreign key on `role_assignments`
 * already prevents a cross-tenant row from existing — a constraint stops bad
 * data being written, it does not stop a query from being written wrongly.
 */
export function can(
  actor: Actor,
  permission: Permission,
  target: { organizationId: string; projectId?: string | undefined },
): boolean {
  if (actor.organizationId !== target.organizationId) return false;

  return actor.roles.some((role) => {
    if (role.organizationId !== target.organizationId) return false;
    if (role.projectId !== null && role.projectId !== target.projectId) return false;
    return GRANTS[role.roleCode].includes(permission);
  });
}

/**
 * Chooses the refusal for a request that will not be carried out.
 *
 * `visible` means the actor is already allowed to know the resource exists. If
 * they are not, the answer must be the same one they would get for a resource
 * that does not exist, or the refusal itself confirms it is there.
 */
export function denialFor(input: { visible: boolean }): ApiError {
  return new ApiError(input.visible ? 'FORBIDDEN' : 'NOT_FOUND');
}

/**
 * Whether the actor may know this resource exists at all.
 *
 * Read permission is the boundary. Someone with no read access in the
 * organization must not be able to tell an existing project from a made-up id.
 */
export function isVisible(
  actor: Actor,
  target: { organizationId: string; projectId?: string | undefined },
): boolean {
  return can(actor, 'project:read', target);
}

/** The refusal for an actor who may see the project but not change it. */
export function requireManage(
  actor: Actor,
  target: { organizationId: string; projectId?: string | undefined },
): void {
  if (can(actor, 'project:manage', target)) return;
  throw denialFor({ visible: isVisible(actor, target) });
}

export function requireRead(
  actor: Actor,
  target: { organizationId: string; projectId?: string | undefined },
): void {
  if (can(actor, 'project:read', target)) return;
  // Nothing to reveal: an actor without read access is told the same thing
  // whether or not the project is real.
  throw new ApiError('NOT_FOUND');
}
