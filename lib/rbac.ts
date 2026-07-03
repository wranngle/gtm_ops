// @ts-nocheck — migrated from .js (was checkJs:false); incremental tightening tracked separately.


/**
 * Role-Based Access Control (RBAC)
 *
 * Implements permission-based authorization for multi-tenant workspaces.
 *
 * Roles (in order of privilege):
 * - owner: Full control, billing, delete workspace, transfer ownership
 * - admin: Manage users, documents, settings (no billing access)
 * - member: Create and edit own documents, view others' documents
 * - viewer: Read-only access to all documents
 *
 * Usage:
 *   import { hasPermission, requireRole, Role, Permission } from './rbac.js';
 *
 *   if (hasPermission(userRole, Permission.DOCUMENT_CREATE)) { ... }
 *   app.delete('/documents/:id', requireRole(Role.OWNER, Role.ADMIN), handler);
 */

/**
 * Role enum - ordered by privilege level (lowest to highest)
 */
// ========== USER MANAGER ==========

import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import sqlite3 from 'sqlite3';

export const Role = {
  VIEWER: 'viewer',
  MEMBER: 'member',
  ADMIN: 'admin',
  OWNER: 'owner',
};

/**
 * Role hierarchy - higher privilege roles inherit all permissions of lower roles
 */
const RoleHierarchy = {
  [Role.VIEWER]: 0,
  [Role.MEMBER]: 1,
  [Role.ADMIN]: 2,
  [Role.OWNER]: 3,
};

/**
 * Permission enum - all possible actions in the system
 */
export const Permission = {
  // Document permissions
  DOCUMENT_VIEW: 'document:view',
  DOCUMENT_CREATE: 'document:create',
  DOCUMENT_EDIT_OWN: 'document:edit_own',
  DOCUMENT_EDIT_ANY: 'document:edit_any',
  DOCUMENT_DELETE_OWN: 'document:delete_own',
  DOCUMENT_DELETE_ANY: 'document:delete_any',
  DOCUMENT_DOWNLOAD: 'document:download',
  DOCUMENT_SHARE: 'document:share',

  // User management permissions
  USER_VIEW: 'user:view',
  USER_INVITE: 'user:invite',
  USER_REMOVE: 'user:remove',
  USER_CHANGE_ROLE: 'user:change_role',

  // Workspace permissions
  WORKSPACE_VIEW: 'workspace:view',
  WORKSPACE_SETTINGS: 'workspace:settings',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_TRANSFER: 'workspace:transfer',

  // Billing permissions
  BILLING_VIEW: 'billing:view',
  BILLING_MANAGE: 'billing:manage',

  // Webhook permissions
  WEBHOOK_VIEW: 'webhook:view',
  WEBHOOK_MANAGE: 'webhook:manage',

  // Audit permissions
  AUDIT_VIEW: 'audit:view',
  AUDIT_EXPORT: 'audit:export',

  // API key permissions
  API_KEY_VIEW: 'api_key:view',
  API_KEY_MANAGE: 'api_key:manage',
};

/**
 * Permission matrix - maps roles to their permissions
 * Using a Set for O(1) lookup
 */
const PermissionMatrix = {
  [Role.VIEWER]: new Set([
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_DOWNLOAD,
    Permission.USER_VIEW,
    Permission.WORKSPACE_VIEW,
  ]),

  [Role.MEMBER]: new Set([
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_CREATE,
    Permission.DOCUMENT_EDIT_OWN,
    Permission.DOCUMENT_DELETE_OWN,
    Permission.DOCUMENT_DOWNLOAD,
    Permission.DOCUMENT_SHARE,
    Permission.USER_VIEW,
    Permission.WORKSPACE_VIEW,
  ]),

  [Role.ADMIN]: new Set([
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_CREATE,
    Permission.DOCUMENT_EDIT_OWN,
    Permission.DOCUMENT_EDIT_ANY,
    Permission.DOCUMENT_DELETE_OWN,
    Permission.DOCUMENT_DELETE_ANY,
    Permission.DOCUMENT_DOWNLOAD,
    Permission.DOCUMENT_SHARE,
    Permission.USER_VIEW,
    Permission.USER_INVITE,
    Permission.USER_REMOVE,
    Permission.USER_CHANGE_ROLE,
    Permission.WORKSPACE_VIEW,
    Permission.WORKSPACE_SETTINGS,
    Permission.WEBHOOK_VIEW,
    Permission.WEBHOOK_MANAGE,
    Permission.AUDIT_VIEW,
    Permission.AUDIT_EXPORT,
    Permission.API_KEY_VIEW,
    Permission.API_KEY_MANAGE,
  ]),

  [Role.OWNER]: new Set([
    // All permissions
    Permission.DOCUMENT_VIEW,
    Permission.DOCUMENT_CREATE,
    Permission.DOCUMENT_EDIT_OWN,
    Permission.DOCUMENT_EDIT_ANY,
    Permission.DOCUMENT_DELETE_OWN,
    Permission.DOCUMENT_DELETE_ANY,
    Permission.DOCUMENT_DOWNLOAD,
    Permission.DOCUMENT_SHARE,
    Permission.USER_VIEW,
    Permission.USER_INVITE,
    Permission.USER_REMOVE,
    Permission.USER_CHANGE_ROLE,
    Permission.WORKSPACE_VIEW,
    Permission.WORKSPACE_SETTINGS,
    Permission.WORKSPACE_DELETE,
    Permission.WORKSPACE_TRANSFER,
    Permission.BILLING_VIEW,
    Permission.BILLING_MANAGE,
    Permission.WEBHOOK_VIEW,
    Permission.WEBHOOK_MANAGE,
    Permission.AUDIT_VIEW,
    Permission.AUDIT_EXPORT,
    Permission.API_KEY_VIEW,
    Permission.API_KEY_MANAGE,
  ]),
};

/**
 * Check if a role is valid
 * @param {string} role - The role to validate
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(Role).includes(role);
}

/**
 * Check if a role has a specific permission
 * @param {string} role - User's role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
  if (!isValidRole(role)) {
    return false;
  }

  const permissions = PermissionMatrix[role];
  return permissions ? permissions.has(permission) : false;
}

/**
 * Check if a role has ANY of the specified permissions
 * @param {string} role - User's role
 * @param {string[]} permissions - Permissions to check
 * @returns {boolean}
 */
export function hasAnyPermission(role, permissions) {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Check if a role has ALL of the specified permissions
 * @param {string} role - User's role
 * @param {string[]} permissions - Permissions to check
 * @returns {boolean}
 */
export function hasAllPermissions(role, permissions) {
  return permissions.every((p) => hasPermission(role, p));
}

/**
 * Get all permissions for a role
 * @param {string} role - User's role
 * @returns {string[]}
 */
export function getPermissions(role) {
  if (!isValidRole(role)) {
    return [];
  }

  const permissions = PermissionMatrix[role];
  return permissions ? [...permissions] : [];
}

/**
 * Compare role privilege levels
 * @param {string} roleA - First role
 * @param {string} roleB - Second role
 * @returns {number} - Negative if A < B, 0 if equal, positive if A > B
 */
export function compareRoles(roleA, roleB) {
  const levelA = RoleHierarchy[roleA] ?? -1;
  const levelB = RoleHierarchy[roleB] ?? -1;
  return levelA - levelB;
}

/**
 * Check if roleA has equal or higher privilege than roleB
 * @param {string} roleA - Role to check
 * @param {string} roleB - Minimum required role
 * @returns {boolean}
 */
export function isRoleAtLeast(roleA, roleB) {
  return compareRoles(roleA, roleB) >= 0;
}

/**
 * Check if a user can perform an action on a resource
 * Combines permission check with ownership check
 *
 * @param {object} params
 * @param {string} params.userRole - User's role in the workspace
 * @param {string} params.userId - User's ID
 * @param {string} params.action - Action to perform (edit, delete)
 * @param {object} params.resource - Resource being accessed
 * @param {string} params.resource.owner_id - ID of the resource owner
 * @returns {boolean}
 */
export function canAccessResource({ userRole, userId, action, resource }) {
  if (!isValidRole(userRole)) {
    return false;
  }

  const isOwner = resource.owner_id === userId;

  switch (action) {
    case 'view': {
      return hasPermission(userRole, Permission.DOCUMENT_VIEW);
    }

    case 'edit': {
      if (hasPermission(userRole, Permission.DOCUMENT_EDIT_ANY)) {
        return true;
      }

      return isOwner && hasPermission(userRole, Permission.DOCUMENT_EDIT_OWN);
    }

    case 'delete': {
      if (hasPermission(userRole, Permission.DOCUMENT_DELETE_ANY)) {
        return true;
      }

      return isOwner && hasPermission(userRole, Permission.DOCUMENT_DELETE_OWN);
    }

    case 'share': {
      return hasPermission(userRole, Permission.DOCUMENT_SHARE);
    }

    case 'download': {
      return hasPermission(userRole, Permission.DOCUMENT_DOWNLOAD);
    }

    default: {
      return false;
    }
  }
}

/**
 * Check if a user can manage another user's role
 * - Cannot change own role
 * - Cannot promote to higher role than own
 * - Cannot demote someone with higher or equal role
 *
 * @param {object} params
 * @param {string} params.actorRole - Role of the user making the change
 * @param {string} params.actorId - ID of the user making the change
 * @param {string} params.targetId - ID of the user being changed
 * @param {string} params.targetCurrentRole - Current role of target user
 * @param {string} params.targetNewRole - Proposed new role for target user
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canChangeRole({
  actorRole,
  actorId,
  targetId,
  targetCurrentRole,
  targetNewRole,
}) {
  // Cannot change own role
  if (actorId === targetId) {
    return { allowed: false, reason: 'Cannot change own role' };
  }

  // Must have permission to change roles
  if (!hasPermission(actorRole, Permission.USER_CHANGE_ROLE)) {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  // Cannot promote to higher role than own
  if (compareRoles(targetNewRole, actorRole) > 0) {
    return { allowed: false, reason: 'Cannot promote to higher role than own' };
  }

  // Cannot change role of someone with higher or equal role
  if (compareRoles(targetCurrentRole, actorRole) >= 0) {
    return { allowed: false, reason: 'Cannot modify role of equal or higher ranked user' };
  }

  // Special case: only owner can change someone to owner
  if (targetNewRole === Role.OWNER && actorRole !== Role.OWNER) {
    return { allowed: false, reason: 'Only owner can transfer ownership' };
  }

  return { allowed: true };
}

/**
 * Check if a user can remove another user from workspace
 * @param {object} params
 * @param {string} params.actorRole - Role of the user making the change
 * @param {string} params.actorId - ID of the user making the change
 * @param {string} params.targetId - ID of the user being removed
 * @param {string} params.targetRole - Role of target user
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canRemoveUser({ actorRole, actorId, targetId, targetRole }) {
  // Cannot remove self
  if (actorId === targetId) {
    return { allowed: false, reason: 'Cannot remove self' };
  }

  // Must have permission to remove users
  if (!hasPermission(actorRole, Permission.USER_REMOVE)) {
    return { allowed: false, reason: 'Insufficient permissions' };
  }

  // Cannot remove owner
  if (targetRole === Role.OWNER) {
    return { allowed: false, reason: 'Cannot remove workspace owner' };
  }

  // Cannot remove someone with higher or equal role (except owner can remove anyone)
  if (actorRole !== Role.OWNER && compareRoles(targetRole, actorRole) >= 0) {
    return { allowed: false, reason: 'Cannot remove user of equal or higher rank' };
  }

  return { allowed: true };
}

/**
 * Check if a user can transfer workspace ownership
 * @param {object} params
 * @param {string} params.actorRole - Role of the user making the transfer
 * @param {string} params.actorId - ID of the user making the transfer
 * @param {string} params.newOwnerId - ID of the new owner
 * @param {string} params.newOwnerRole - Current role of new owner
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canTransferOwnership({
  actorRole,
  actorId,
  newOwnerId,
  newOwnerRole,
}) {
  // Only owner can transfer ownership
  if (actorRole !== Role.OWNER) {
    return { allowed: false, reason: 'Only owner can transfer ownership' };
  }

  // Cannot transfer to self
  if (actorId === newOwnerId) {
    return { allowed: false, reason: 'Cannot transfer ownership to self' };
  }

  // New owner must be admin or member (viewer cannot become owner)
  if (newOwnerRole === Role.VIEWER) {
    return { allowed: false, reason: 'Cannot transfer ownership to viewer' };
  }

  return { allowed: true };
}

/**
 * Resolve the effective role for a request given the dev-mode auth shim
 * inputs. Pure function so it's unit-testable independently of Express.
 *
 * Resolution order:
 *   1. `X-User-Role` header (dev convenience: curl/Postman can simulate
 *      any role without standing up an OAuth flow).
 *   2. `WRANNGLE_AUTH_DEFAULT_ROLE` env var (operator-set fallback).
 *   3. Environment-aware default:
 *        - production → 'viewer' (least privilege; mutation routes 403
 *          unless an explicit role is supplied — fail-closed).
 *        - non-production → 'owner' (preserves the current dev DX).
 *
 * The split avoids the prior footgun where production silently
 * defaulted to OWNER, which made every requireRole guard a no-op for
 * any caller that omitted the header.
 *
 * @param {Object} headers - Express req.headers (case-insensitive keys)
 * @param {Object} env - process.env-shaped object (allows test injection)
 * @returns {string} resolved role token (e.g. 'owner', 'viewer', etc.)
 */
// Module-scoped flag so a typo'd env var only logs once per process,
// not once per request. Reset between tests via the exported helper
// so module-reset cycles in vitest don't have to fight it.
let _loggedInvalidAuthDefault = false;

export function _resetAuthEnvWarningForTests() {
  _loggedInvalidAuthDefault = false;
}

export function resolveDevAuthRole(headers, env) {
  const headerRole = headers?.['x-user-role'];
  if (typeof headerRole === 'string' && headerRole) {
    return headerRole;
  }

  const envOverride = env?.WRANNGLE_AUTH_DEFAULT_ROLE;
  if (typeof envOverride === 'string' && envOverride) {
    if (isValidRole(envOverride)) {
      return envOverride;
    }

    // Bad env value: don't propagate a role token that requireRole
    // would 403 on every single request. Fall through to the
    // environment-aware default (viewer in prod, owner in dev) so the
    // API stays functional, and warn once so the operator notices.
    if (!_loggedInvalidAuthDefault) {
      _loggedInvalidAuthDefault = true;
      const validRoles = Object.values(Role).join(', ');
      console.warn(
        `[rbac] WRANNGLE_AUTH_DEFAULT_ROLE="${envOverride}" is not a valid role; ignoring. Valid: ${validRoles}.`,
      );
    }
  }

  return env?.NODE_ENV === 'production' ? Role.VIEWER : Role.OWNER;
}

/**
 * Express middleware factory: require specific roles
 * @param {...string} allowedRoles - Roles that are allowed
 * @returns {Function} Express middleware
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const userRole = req.user_role;

    if (!userRole) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!isValidRole(userRole)) {
      return res.status(403).json({
        error: 'Invalid role',
        code: 'INVALID_ROLE',
        current: userRole,
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: allowedRoles,
        current: userRole,
      });
    }

    next();
  };
}

/**
 * Express middleware factory: require specific permission
 * @param {string} permission - Permission required
 * @returns {Function} Express middleware
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    const userRole = req.user_role;

    if (!userRole) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: permission,
        current: userRole,
      });
    }

    next();
  };
}

/**
 * Express middleware factory: require resource ownership or specific permission
 * @param {string} anyPermission - Permission that bypasses ownership check
 * @param {Function} getOwnerId - Async function to get resource owner_id from request
 * @returns {Function} Express middleware
 */
export function requireOwnership(anyPermission, getOwnerId) {
  return async (req, res, next) => {
    const userRole = req.user_role;
    const userId = req.user_id;

    if (!userRole || !userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    // Admin/Owner bypass with "any" permission
    if (hasPermission(userRole, anyPermission)) {
      return next();
    }

    try {
      const ownerId = await getOwnerId(req);

      if (ownerId === userId) {
        return next();
      }

      return res.status(403).json({
        error: 'Resource ownership required',
        code: 'FORBIDDEN',
        message: 'You can only modify your own resources',
      });
    } catch {
      return res.status(500).json({
        error: 'Failed to verify ownership',
        code: 'INTERNAL_ERROR',
      });
    }
  };
}

/**
 * Get permission summary for a role (useful for debugging/UI)
 * @param {string} role - User's role
 * @returns {object}
 */
export function getPermissionSummary(role) {
  return {
    role,
    privilegeLevel: RoleHierarchy[role] ?? -1,
    permissions: getPermissions(role),
    canManageUsers: hasPermission(role, Permission.USER_INVITE),
    canManageBilling: hasPermission(role, Permission.BILLING_MANAGE),
    canDeleteWorkspace: hasPermission(role, Permission.WORKSPACE_DELETE),
    canEditAnyDocument: hasPermission(role, Permission.DOCUMENT_EDIT_ANY),
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'users.db');

/**
 * User Manager - SQLite-based user storage for workspaces
 */
export class UserManager {
  constructor(dbPath = DEFAULT_DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this._initPromise = this._init();
  }

  async _init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS workspace_users (
            id TEXT PRIMARY KEY,
            workspace_id TEXT NOT NULL,
            email TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            joined_at INTEGER NOT NULL,
            invited_by TEXT,
            status TEXT DEFAULT 'active',
            UNIQUE(workspace_id, email)
          )
        `, (err) => {
          if (err) return reject(err);

          this.db.run(`
            CREATE TABLE IF NOT EXISTS invitations (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              email TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'member',
              invited_by TEXT,
              created_at INTEGER NOT NULL,
              expires_at INTEGER NOT NULL,
              status TEXT DEFAULT 'pending'
            )
          `, (err) => {
            if (err) return reject(err);

            this.db.run(`
              CREATE INDEX IF NOT EXISTS idx_users_workspace ON workspace_users(workspace_id)
            `, (err) => {
              if (err) return reject(err);
              resolve();
            });
          });
        });
      });
    });
  }

  async _ready() {
    await this._initPromise;
  }

  _run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  _get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  _all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  /**
   * Get all users in a workspace
   */
  async getWorkspaceUsers(workspaceId) {
    await this._ready();
    const users = await this._all(
      `SELECT id as user_id, email, role, joined_at, status
       FROM workspace_users
       WHERE workspace_id = ? AND status = 'active'
       ORDER BY joined_at ASC, rowid ASC`,
      [workspaceId]
    );
    return users;
  }

  /**
   * Add a user to a workspace
   */
  async addUser(workspaceId, email, role = Role.MEMBER, invitedBy = null) {
    await this._ready();

    if (!isValidRole(role)) {
      throw new Error('Invalid role');
    }

    const id = `user_${randomBytes(8).toString('hex')}`;
    const now = Date.now();

    await this._run(
      `INSERT INTO workspace_users (id, workspace_id, email, role, joined_at, invited_by, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [id, workspaceId, email, role, now, invitedBy]
    );

    return { user_id: id, email, role, joined_at: now };
  }

  /**
   * Update user role
   */
  async updateUserRole(workspaceId, userId, newRole) {
    await this._ready();

    if (!isValidRole(newRole)) {
      throw new Error('Invalid role');
    }

    await this._run(
      `UPDATE workspace_users SET role = ? WHERE id = ? AND workspace_id = ?`,
      [newRole, userId, workspaceId]
    );
  }

  /**
   * Remove user from workspace
   */
  async removeUser(workspaceId, userId) {
    await this._ready();
    await this._run(
      `UPDATE workspace_users SET status = 'removed' WHERE id = ? AND workspace_id = ?`,
      [userId, workspaceId]
    );
  }

  /**
   * Get user by ID
   */
  async getUser(workspaceId, userId) {
    await this._ready();
    return this._get(
      `SELECT id as user_id, email, role, joined_at, status
       FROM workspace_users
       WHERE id = ? AND workspace_id = ?`,
      [userId, workspaceId]
    );
  }

  /**
   * Get user by email
   */
  async getUserByEmail(workspaceId, email) {
    await this._ready();
    return this._get(
      `SELECT id as user_id, email, role, joined_at, status
       FROM workspace_users
       WHERE email = ? AND workspace_id = ?`,
      [email, workspaceId]
    );
  }

  /**
   * Create invitation
   */
  async createInvitation(workspaceId, email, role = Role.MEMBER, invitedBy = null) {
    await this._ready();

    const existing = await this.getUserByEmail(workspaceId, email);
    if (existing && existing.status === 'active') {
      throw new Error('User already exists in workspace');
    }

    const id = `inv_${randomBytes(8).toString('hex')}`;
    const now = Date.now();
    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days

    await this._run(
      `INSERT INTO invitations (id, workspace_id, email, role, invited_by, created_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [id, workspaceId, email, role, invitedBy, now, expiresAt]
    );

    return { invitation_id: id, email, role, expires_at: expiresAt };
  }

  /**
   * Accept invitation
   */
  async acceptInvitation(invitationId) {
    await this._ready();

    const invitation = await this._get(
      `SELECT * FROM invitations WHERE id = ? AND status = 'pending'`,
      [invitationId]
    );

    if (!invitation) {
      throw new Error('Invitation not found or already used');
    }

    if (Date.now() > invitation.expires_at) {
      await this._run(`UPDATE invitations SET status = 'expired' WHERE id = ?`, [invitationId]);
      throw new Error('Invitation has expired');
    }

    // Add user to workspace
    const user = await this.addUser(
      invitation.workspace_id,
      invitation.email,
      invitation.role,
      invitation.invited_by
    );

    // Mark invitation as accepted
    await this._run(`UPDATE invitations SET status = 'accepted' WHERE id = ?`, [invitationId]);

    return user;
  }

  /**
   * Ensure workspace has an owner (creates default if needed)
   */
  async ensureWorkspaceOwner(workspaceId, ownerEmail = 'owner@localhost') {
    await this._ready();

    const users = await this.getWorkspaceUsers(workspaceId);
    const hasOwner = users.some(u => u.role === Role.OWNER);

    if (!hasOwner) {
      await this.addUser(workspaceId, ownerEmail, Role.OWNER);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Singleton instance
let userManagerInstance = null;

export function getUserManager(dbPath) {
  userManagerInstance ||= new UserManager(dbPath);
  return userManagerInstance;
}
