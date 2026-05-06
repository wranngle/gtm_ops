/**
 * Unit Tests for lib/rbac.js
 *
 * Tests role-based access control:
 * - Role validation
 * - Permission checks
 * - Resource ownership
 * - Role change rules
 * - Middleware functions
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let Role: any;
let Permission: any;
let isValidRole: any;
let hasPermission: any;
let hasAnyPermission: any;
let hasAllPermissions: any;
let getPermissions: any;
let compareRoles: any;
let isRoleAtLeast: any;
let canAccessResource: any;
let canChangeRole: any;
let canRemoveUser: any;
let canTransferOwnership: any;
let requireRole: any;
let requirePermission: any;
let getPermissionSummary: any;
let resolveDevAuthRole: any;
let _resetAuthEnvWarningForTests: any;

beforeEach(async () => {
  const module = await import('../../lib/rbac.js');
  Role = module.Role;
  Permission = module.Permission;
  isValidRole = module.isValidRole;
  hasPermission = module.hasPermission;
  hasAnyPermission = module.hasAnyPermission;
  hasAllPermissions = module.hasAllPermissions;
  getPermissions = module.getPermissions;
  compareRoles = module.compareRoles;
  isRoleAtLeast = module.isRoleAtLeast;
  canAccessResource = module.canAccessResource;
  canChangeRole = module.canChangeRole;
  canRemoveUser = module.canRemoveUser;
  canTransferOwnership = module.canTransferOwnership;
  requireRole = module.requireRole;
  requirePermission = module.requirePermission;
  getPermissionSummary = module.getPermissionSummary;
  resolveDevAuthRole = module.resolveDevAuthRole;
  _resetAuthEnvWarningForTests = module._resetAuthEnvWarningForTests;
  _resetAuthEnvWarningForTests();
});

describe('[P0] Role Constants', () => {
  it('[P0] should define all roles', () => {
    expect(Role.VIEWER).toBe('viewer');
    expect(Role.MEMBER).toBe('member');
    expect(Role.ADMIN).toBe('admin');
    expect(Role.OWNER).toBe('owner');
  });

  it('[P0] should validate correct roles', () => {
    expect(isValidRole('viewer')).toBe(true);
    expect(isValidRole('member')).toBe(true);
    expect(isValidRole('admin')).toBe(true);
    expect(isValidRole('owner')).toBe(true);
  });

  it('[P0] should reject invalid roles', () => {
    expect(isValidRole('superadmin')).toBe(false);
    expect(isValidRole('')).toBe(false);
    expect(isValidRole(null)).toBe(false);
    expect(isValidRole(undefined)).toBe(false);
  });
});

describe('[P0] Permission Constants', () => {
  it('[P0] should define document permissions', () => {
    expect(Permission.DOCUMENT_VIEW).toBe('document:view');
    expect(Permission.DOCUMENT_CREATE).toBe('document:create');
    expect(Permission.DOCUMENT_EDIT_OWN).toBe('document:edit_own');
    expect(Permission.DOCUMENT_EDIT_ANY).toBe('document:edit_any');
    expect(Permission.DOCUMENT_DELETE_OWN).toBe('document:delete_own');
    expect(Permission.DOCUMENT_DELETE_ANY).toBe('document:delete_any');
  });

  it('[P0] should define user management permissions', () => {
    expect(Permission.USER_VIEW).toBe('user:view');
    expect(Permission.USER_INVITE).toBe('user:invite');
    expect(Permission.USER_REMOVE).toBe('user:remove');
    expect(Permission.USER_CHANGE_ROLE).toBe('user:change_role');
  });

  it('[P0] should define workspace permissions', () => {
    expect(Permission.WORKSPACE_VIEW).toBe('workspace:view');
    expect(Permission.WORKSPACE_SETTINGS).toBe('workspace:settings');
    expect(Permission.WORKSPACE_DELETE).toBe('workspace:delete');
    expect(Permission.WORKSPACE_TRANSFER).toBe('workspace:transfer');
  });

  it('[P0] should define billing permissions', () => {
    expect(Permission.BILLING_VIEW).toBe('billing:view');
    expect(Permission.BILLING_MANAGE).toBe('billing:manage');
  });
});

describe('[P0] Viewer Role Permissions', () => {
  it('[P0] should allow viewing documents', () => {
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_VIEW)).toBe(true);
  });

  it('[P0] should allow downloading documents', () => {
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_DOWNLOAD)).toBe(true);
  });

  it('[P0] should NOT allow creating documents', () => {
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_CREATE)).toBe(false);
  });

  it('[P0] should NOT allow editing documents', () => {
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_EDIT_OWN)).toBe(false);
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_EDIT_ANY)).toBe(false);
  });

  it('[P0] should NOT allow deleting documents', () => {
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_DELETE_OWN)).toBe(false);
    expect(hasPermission(Role.VIEWER, Permission.DOCUMENT_DELETE_ANY)).toBe(false);
  });

  it('[P0] should NOT allow user management', () => {
    expect(hasPermission(Role.VIEWER, Permission.USER_INVITE)).toBe(false);
    expect(hasPermission(Role.VIEWER, Permission.USER_REMOVE)).toBe(false);
  });
});

describe('[P0] Member Role Permissions', () => {
  it('[P0] should allow viewing documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_VIEW)).toBe(true);
  });

  it('[P0] should allow creating documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_CREATE)).toBe(true);
  });

  it('[P0] should allow editing own documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_EDIT_OWN)).toBe(true);
  });

  it('[P0] should NOT allow editing others documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_EDIT_ANY)).toBe(false);
  });

  it('[P0] should allow deleting own documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_DELETE_OWN)).toBe(true);
  });

  it('[P0] should NOT allow deleting others documents', () => {
    expect(hasPermission(Role.MEMBER, Permission.DOCUMENT_DELETE_ANY)).toBe(false);
  });

  it('[P0] should NOT allow user management', () => {
    expect(hasPermission(Role.MEMBER, Permission.USER_INVITE)).toBe(false);
    expect(hasPermission(Role.MEMBER, Permission.USER_REMOVE)).toBe(false);
  });
});

describe('[P0] Admin Role Permissions', () => {
  it('[P0] should allow all document operations', () => {
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_VIEW)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_CREATE)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_EDIT_OWN)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_EDIT_ANY)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_DELETE_OWN)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.DOCUMENT_DELETE_ANY)).toBe(true);
  });

  it('[P0] should allow user management', () => {
    expect(hasPermission(Role.ADMIN, Permission.USER_INVITE)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.USER_REMOVE)).toBe(true);
    expect(hasPermission(Role.ADMIN, Permission.USER_CHANGE_ROLE)).toBe(true);
  });

  it('[P0] should allow workspace settings', () => {
    expect(hasPermission(Role.ADMIN, Permission.WORKSPACE_SETTINGS)).toBe(true);
  });

  it('[P0] should NOT allow workspace deletion', () => {
    expect(hasPermission(Role.ADMIN, Permission.WORKSPACE_DELETE)).toBe(false);
  });

  it('[P0] should NOT allow billing management', () => {
    expect(hasPermission(Role.ADMIN, Permission.BILLING_VIEW)).toBe(false);
    expect(hasPermission(Role.ADMIN, Permission.BILLING_MANAGE)).toBe(false);
  });
});

describe('[P0] Owner Role Permissions', () => {
  it('[P0] should have all document permissions', () => {
    expect(hasPermission(Role.OWNER, Permission.DOCUMENT_VIEW)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.DOCUMENT_CREATE)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.DOCUMENT_EDIT_ANY)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.DOCUMENT_DELETE_ANY)).toBe(true);
  });

  it('[P0] should have all user management permissions', () => {
    expect(hasPermission(Role.OWNER, Permission.USER_INVITE)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.USER_REMOVE)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.USER_CHANGE_ROLE)).toBe(true);
  });

  it('[P0] should have workspace deletion permission', () => {
    expect(hasPermission(Role.OWNER, Permission.WORKSPACE_DELETE)).toBe(true);
  });

  it('[P0] should have billing permissions', () => {
    expect(hasPermission(Role.OWNER, Permission.BILLING_VIEW)).toBe(true);
    expect(hasPermission(Role.OWNER, Permission.BILLING_MANAGE)).toBe(true);
  });

  it('[P0] should have ownership transfer permission', () => {
    expect(hasPermission(Role.OWNER, Permission.WORKSPACE_TRANSFER)).toBe(true);
  });
});

describe('[P0] Role Comparison', () => {
  it('[P0] should correctly compare role hierarchy', () => {
    expect(compareRoles(Role.VIEWER, Role.MEMBER)).toBeLessThan(0);
    expect(compareRoles(Role.MEMBER, Role.ADMIN)).toBeLessThan(0);
    expect(compareRoles(Role.ADMIN, Role.OWNER)).toBeLessThan(0);
    expect(compareRoles(Role.OWNER, Role.VIEWER)).toBeGreaterThan(0);
  });

  it('[P0] should return 0 for same roles', () => {
    expect(compareRoles(Role.ADMIN, Role.ADMIN)).toBe(0);
    expect(compareRoles(Role.OWNER, Role.OWNER)).toBe(0);
  });

  it('[P0] should check if role is at least required level', () => {
    expect(isRoleAtLeast(Role.OWNER, Role.ADMIN)).toBe(true);
    expect(isRoleAtLeast(Role.ADMIN, Role.ADMIN)).toBe(true);
    expect(isRoleAtLeast(Role.MEMBER, Role.ADMIN)).toBe(false);
  });
});

describe('[P0] Permission Helpers', () => {
  it('[P0] should check any permission', () => {
    expect(
      hasAnyPermission(Role.MEMBER, [Permission.DOCUMENT_CREATE, Permission.BILLING_MANAGE])
    ).toBe(true);
    expect(
      hasAnyPermission(Role.VIEWER, [Permission.DOCUMENT_CREATE, Permission.BILLING_MANAGE])
    ).toBe(false);
  });

  it('[P0] should check all permissions', () => {
    expect(
      hasAllPermissions(Role.ADMIN, [Permission.DOCUMENT_CREATE, Permission.USER_INVITE])
    ).toBe(true);
    expect(
      hasAllPermissions(Role.MEMBER, [Permission.DOCUMENT_CREATE, Permission.USER_INVITE])
    ).toBe(false);
  });

  it('[P0] should get permissions list', () => {
    const viewerPerms = getPermissions(Role.VIEWER);
    expect(viewerPerms).toContain(Permission.DOCUMENT_VIEW);
    expect(viewerPerms).not.toContain(Permission.DOCUMENT_CREATE);
  });

  it('[P0] should return empty array for invalid role', () => {
    expect(getPermissions('invalid')).toEqual([]);
  });
});

describe('[P0] Resource Access Control', () => {
  it('[P0] should allow owner to view any document', () => {
    expect(
      canAccessResource({
        userRole: Role.MEMBER,
        userId: 'user-1',
        action: 'view',
        resource: { owner_id: 'user-2' },
      })
    ).toBe(true);
  });

  it('[P0] should allow member to edit own document', () => {
    expect(
      canAccessResource({
        userRole: Role.MEMBER,
        userId: 'user-1',
        action: 'edit',
        resource: { owner_id: 'user-1' },
      })
    ).toBe(true);
  });

  it('[P0] should NOT allow member to edit others document', () => {
    expect(
      canAccessResource({
        userRole: Role.MEMBER,
        userId: 'user-1',
        action: 'edit',
        resource: { owner_id: 'user-2' },
      })
    ).toBe(false);
  });

  it('[P0] should allow admin to edit any document', () => {
    expect(
      canAccessResource({
        userRole: Role.ADMIN,
        userId: 'user-1',
        action: 'edit',
        resource: { owner_id: 'user-2' },
      })
    ).toBe(true);
  });

  it('[P0] should allow member to delete own document', () => {
    expect(
      canAccessResource({
        userRole: Role.MEMBER,
        userId: 'user-1',
        action: 'delete',
        resource: { owner_id: 'user-1' },
      })
    ).toBe(true);
  });

  it('[P0] should NOT allow member to delete others document', () => {
    expect(
      canAccessResource({
        userRole: Role.MEMBER,
        userId: 'user-1',
        action: 'delete',
        resource: { owner_id: 'user-2' },
      })
    ).toBe(false);
  });

  it('[P0] should allow admin to delete any document', () => {
    expect(
      canAccessResource({
        userRole: Role.ADMIN,
        userId: 'user-1',
        action: 'delete',
        resource: { owner_id: 'user-2' },
      })
    ).toBe(true);
  });

  it('[P0] should NOT allow viewer to edit even own document', () => {
    expect(
      canAccessResource({
        userRole: Role.VIEWER,
        userId: 'user-1',
        action: 'edit',
        resource: { owner_id: 'user-1' },
      })
    ).toBe(false);
  });
});

describe('[P1] Role Change Rules', () => {
  it('[P1] should NOT allow changing own role', () => {
    const result = canChangeRole({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-1',
      targetCurrentRole: Role.ADMIN,
      targetNewRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot change own role');
  });

  it('[P1] should NOT allow member to change roles', () => {
    const result = canChangeRole({
      actorRole: Role.MEMBER,
      actorId: 'user-1',
      targetId: 'user-2',
      targetCurrentRole: Role.VIEWER,
      targetNewRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Insufficient permissions');
  });

  it('[P1] should allow admin to promote member', () => {
    const result = canChangeRole({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetCurrentRole: Role.MEMBER,
      targetNewRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(true);
  });

  it('[P1] should NOT allow admin to promote to owner', () => {
    const result = canChangeRole({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetCurrentRole: Role.MEMBER,
      targetNewRole: Role.OWNER,
    });
    expect(result.allowed).toBe(false);
  });

  it('[P1] should NOT allow admin to demote another admin', () => {
    const result = canChangeRole({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetCurrentRole: Role.ADMIN,
      targetNewRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot modify role of equal or higher ranked user');
  });

  it('[P1] should allow owner to change any role', () => {
    const result = canChangeRole({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      targetId: 'user-2',
      targetCurrentRole: Role.ADMIN,
      targetNewRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('[P1] User Removal Rules', () => {
  it('[P1] should NOT allow removing self', () => {
    const result = canRemoveUser({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-1',
      targetRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot remove self');
  });

  it('[P1] should NOT allow member to remove users', () => {
    const result = canRemoveUser({
      actorRole: Role.MEMBER,
      actorId: 'user-1',
      targetId: 'user-2',
      targetRole: Role.VIEWER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Insufficient permissions');
  });

  it('[P1] should allow admin to remove member', () => {
    const result = canRemoveUser({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(true);
  });

  it('[P1] should NOT allow admin to remove another admin', () => {
    const result = canRemoveUser({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(false);
  });

  it('[P1] should NOT allow removing owner', () => {
    const result = canRemoveUser({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      targetId: 'user-2',
      targetRole: Role.OWNER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot remove workspace owner');
  });

  it('[P1] should allow owner to remove admin', () => {
    const result = canRemoveUser({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      targetId: 'user-2',
      targetRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('[P1] Ownership Transfer', () => {
  it('[P1] should allow owner to transfer ownership', () => {
    const result = canTransferOwnership({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      newOwnerId: 'user-2',
      newOwnerRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(true);
  });

  it('[P1] should NOT allow non-owner to transfer', () => {
    const result = canTransferOwnership({
      actorRole: Role.ADMIN,
      actorId: 'user-1',
      newOwnerId: 'user-2',
      newOwnerRole: Role.ADMIN,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Only owner can transfer ownership');
  });

  it('[P1] should NOT allow transfer to self', () => {
    const result = canTransferOwnership({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      newOwnerId: 'user-1',
      newOwnerRole: Role.OWNER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot transfer ownership to self');
  });

  it('[P1] should NOT allow transfer to viewer', () => {
    const result = canTransferOwnership({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      newOwnerId: 'user-2',
      newOwnerRole: Role.VIEWER,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cannot transfer ownership to viewer');
  });

  it('[P1] should allow transfer to member', () => {
    const result = canTransferOwnership({
      actorRole: Role.OWNER,
      actorId: 'user-1',
      newOwnerId: 'user-2',
      newOwnerRole: Role.MEMBER,
    });
    expect(result.allowed).toBe(true);
  });
});

describe('[P1] Middleware - requireRole', () => {
  it('[P1] should pass for allowed role', () => {
    const middleware = requireRole(Role.ADMIN, Role.OWNER);
    const req = { user_role: Role.ADMIN } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('[P1] should reject for disallowed role', () => {
    const middleware = requireRole(Role.ADMIN, Role.OWNER);
    const req = { user_role: Role.MEMBER } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
      })
    );
  });

  it('[P1] should reject when no role present', () => {
    const middleware = requireRole(Role.ADMIN);
    const req = {} as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('[P0] Dev auth shim - resolveDevAuthRole', () => {
  it('[P0] should prefer X-User-Role header over every fallback', () => {
    expect(
      resolveDevAuthRole({ 'x-user-role': 'admin' }, { NODE_ENV: 'production' }),
    ).toBe('admin');
    expect(
      resolveDevAuthRole(
        { 'x-user-role': 'member' },
        { NODE_ENV: 'development', WRANNGLE_AUTH_DEFAULT_ROLE: 'viewer' },
      ),
    ).toBe('member');
  });

  it('[P0] should fall through to WRANNGLE_AUTH_DEFAULT_ROLE when header is absent', () => {
    expect(
      resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'admin' }),
    ).toBe('admin');
  });

  it('[P0] should default to VIEWER in production (fail-closed)', () => {
    // Regression guard: prior implementation defaulted to OWNER, which
    // turned every requireRole guard into a no-op for any caller that
    // forgot the X-User-Role header. Production must fail-closed.
    expect(resolveDevAuthRole({}, { NODE_ENV: 'production' })).toBe('viewer');
  });

  it('[P0] should default to OWNER in development for ergonomics', () => {
    // Dev DX: local curl/Postman calls should "just work" without
    // needing to set an env var or header. The dev server is bound to
    // 127.0.0.1 (PR #92) so this is not a network attack surface.
    expect(resolveDevAuthRole({}, { NODE_ENV: 'development' })).toBe('owner');
    expect(resolveDevAuthRole({}, {})).toBe('owner');
  });

  it('[P1] should ignore an empty-string header', () => {
    // Some HTTP clients send empty headers; treat that as "no header"
    // rather than letting an empty string propagate as a role token.
    expect(resolveDevAuthRole({ 'x-user-role': '' }, { NODE_ENV: 'production' })).toBe('viewer');
  });

  it('[P1] should ignore a non-string header value (defensive)', () => {
    expect(
      resolveDevAuthRole({ 'x-user-role': ['admin', 'owner'] as any }, { NODE_ENV: 'production' }),
    ).toBe('viewer');
  });

  it('[P0] should reject an invalid WRANNGLE_AUTH_DEFAULT_ROLE and fall through to env default', () => {
    // Operator typo: "admni" instead of "admin". Without this guard,
    // every request resolves to "admni", which requireRole rejects
    // with INVALID_ROLE — the API silently breaks. Falling through
    // keeps it functional under the env-aware default.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'admni' }),
    ).toBe('viewer');
    expect(
      resolveDevAuthRole({}, { NODE_ENV: 'development', WRANNGLE_AUTH_DEFAULT_ROLE: 'admni' }),
    ).toBe('owner');

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('[P1] should warn only once per process for repeat invalid env values', () => {
    // Per-request warnings would spam the access log. The flag has
    // module scope; the test reset hook clears it so this assertion
    // is hermetic.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'admni' });
    resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'admni' });
    resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'admni' });

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('[P0] should still honor a valid WRANNGLE_AUTH_DEFAULT_ROLE without warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(
      resolveDevAuthRole({}, { NODE_ENV: 'production', WRANNGLE_AUTH_DEFAULT_ROLE: 'member' }),
    ).toBe('member');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('[P1] Middleware - requirePermission', () => {
  it('[P1] should pass for user with permission', () => {
    const middleware = requirePermission(Permission.DOCUMENT_CREATE);
    const req = { user_role: Role.MEMBER } as any;
    const res = {} as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('[P1] should reject for user without permission', () => {
    const middleware = requirePermission(Permission.DOCUMENT_CREATE);
    const req = { user_role: Role.VIEWER } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;
    const next = vi.fn();

    middleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('[P1] Permission Summary', () => {
  it('[P1] should return correct summary for owner', () => {
    const summary = getPermissionSummary(Role.OWNER);
    expect(summary.role).toBe(Role.OWNER);
    expect(summary.privilegeLevel).toBe(3);
    expect(summary.canManageUsers).toBe(true);
    expect(summary.canManageBilling).toBe(true);
    expect(summary.canDeleteWorkspace).toBe(true);
    expect(summary.canEditAnyDocument).toBe(true);
  });

  it('[P1] should return correct summary for viewer', () => {
    const summary = getPermissionSummary(Role.VIEWER);
    expect(summary.role).toBe(Role.VIEWER);
    expect(summary.privilegeLevel).toBe(0);
    expect(summary.canManageUsers).toBe(false);
    expect(summary.canManageBilling).toBe(false);
    expect(summary.canDeleteWorkspace).toBe(false);
    expect(summary.canEditAnyDocument).toBe(false);
  });
});

// ========== USER MANAGER TESTS ==========

describe('[P1] UserManager', () => {
  let UserManager: any;
  let userManager: any;
  const TEST_DB_PATH = `./config/users_test_${Date.now()}_${Math.random().toString(36).slice(7)}.db`;

  beforeEach(async () => {
    const module = await import('../../lib/rbac.js');
    UserManager = module.UserManager;
    userManager = new UserManager(TEST_DB_PATH);
    // Wait for initialization
    await userManager._ready();
  });

  afterEach(async () => {
    if (userManager) {
      userManager.close();
    }

    // Clean up test database
    const fs = await import('fs/promises');
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // Ignore if file doesn't exist
    }
  });

  it('[P1] should add a user to workspace', async () => {
    const user = await userManager.addUser('workspace1', 'test@example.com', 'member');

    expect(user.user_id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('member');
    expect(user.joined_at).toBeDefined();
  });

  it('[P1] should get all users in workspace', async () => {
    await userManager.addUser('workspace1', 'user1@example.com', 'owner');
    await userManager.addUser('workspace1', 'user2@example.com', 'admin');
    await userManager.addUser('workspace1', 'user3@example.com', 'member');

    const users = await userManager.getWorkspaceUsers('workspace1');

    expect(users).toHaveLength(3);
    expect(users.map((u: any) => u.email)).toContain('user1@example.com');
    expect(users.map((u: any) => u.email)).toContain('user2@example.com');
    expect(users.map((u: any) => u.email)).toContain('user3@example.com');
  });

  it('[P1] should update user role', async () => {
    const user = await userManager.addUser('workspace1', 'test@example.com', 'member');

    await userManager.updateUserRole('workspace1', user.user_id, 'admin');

    const updatedUser = await userManager.getUser('workspace1', user.user_id);
    expect(updatedUser.role).toBe('admin');
  });

  it('[P1] should remove user from workspace', async () => {
    const user = await userManager.addUser('workspace1', 'test@example.com', 'member');

    await userManager.removeUser('workspace1', user.user_id);

    const users = await userManager.getWorkspaceUsers('workspace1');
    expect(users).toHaveLength(0);
  });

  it('[P1] should get user by email', async () => {
    await userManager.addUser('workspace1', 'test@example.com', 'admin');

    const user = await userManager.getUserByEmail('workspace1', 'test@example.com');

    expect(user).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.role).toBe('admin');
  });

  it('[P1] should create and accept invitation', async () => {
    const invitation = await userManager.createInvitation('workspace1', 'newuser@example.com', 'member');

    expect(invitation.invitation_id).toBeDefined();
    expect(invitation.email).toBe('newuser@example.com');
    expect(invitation.expires_at).toBeGreaterThan(Date.now());

    const user = await userManager.acceptInvitation(invitation.invitation_id);

    expect(user.email).toBe('newuser@example.com');
    expect(user.role).toBe('member');

    // Verify user was added
    const users = await userManager.getWorkspaceUsers('workspace1');
    expect(users).toHaveLength(1);
  });

  it('[P1] should ensure workspace has owner', async () => {
    await userManager.ensureWorkspaceOwner('workspace1', 'owner@example.com');

    const users = await userManager.getWorkspaceUsers('workspace1');
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe('owner');
    expect(users[0].email).toBe('owner@example.com');

    // Calling again should not add duplicate owner
    await userManager.ensureWorkspaceOwner('workspace1', 'other@example.com');
    const usersAfter = await userManager.getWorkspaceUsers('workspace1');
    expect(usersAfter).toHaveLength(1);
  });

  it('[P1] should reject invalid role', async () => {
    await expect(
      userManager.addUser('workspace1', 'test@example.com', 'superadmin')
    ).rejects.toThrow('Invalid role');
  });

  it('[P1] should reject duplicate user in same workspace', async () => {
    await userManager.addUser('workspace1', 'test@example.com', 'member');

    await expect(
      userManager.addUser('workspace1', 'test@example.com', 'admin')
    ).rejects.toThrow();
  });

  it('[P1] should isolate users between workspaces', async () => {
    await userManager.addUser('workspace1', 'shared@example.com', 'member');
    await userManager.addUser('workspace2', 'shared@example.com', 'admin');

    const users1 = await userManager.getWorkspaceUsers('workspace1');
    const users2 = await userManager.getWorkspaceUsers('workspace2');

    expect(users1).toHaveLength(1);
    expect(users1[0].role).toBe('member');
    expect(users2).toHaveLength(1);
    expect(users2[0].role).toBe('admin');
  });
});
