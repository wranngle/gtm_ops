/**
 * Custom Branding Module
 *
 * Provides white-label support for Enterprise workspaces:
 * - Logo management
 * - Color customization with palette generation
 * - Custom domain verification
 * - Document branding
 *
 * Usage:
 *   import { BrandingManager, validateHexColor } from './branding.js';
 *
 *   const branding = new BrandingManager(dbPath);
 *   await branding.setBranding(workspaceId, { primaryColor: '#ff5f00' });
 */
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomBytes } from 'crypto';
import sqlite3 from 'sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, '..', 'config', 'branding.db');

/**
 * Default brand colors (Wranngle theme)
 */
export const DefaultBranding = {
  PRIMARY_COLOR: '#ff5f00', // Sunset Orange
  SECONDARY_COLOR: '#cf3c69', // Violet
  BACKGROUND_COLOR: '#fcfaf5', // Sand
  TEXT_COLOR: '#12111a', // Night
  SUCCESS_COLOR: '#5D8C61', // Cactus Green
};

/**
 * Domain verification status
 */
export const DomainStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  EXPIRED: 'expired',
};

/**
 * Validate hex color format
 * @param {string} color - Color to validate
 * @returns {boolean}
 */
export function validateHexColor(color) {
  if (!color || typeof color !== 'string') return false;
  return /^#([\dA-Fa-f]{3}){1,2}$/.test(color);
}

/**
 * Normalize hex color to 6-digit format
 * @param {string} color - Color to normalize
 * @returns {string}
 */
export function normalizeHexColor(color) {
  if (!validateHexColor(color)) return null;

  // Expand 3-digit to 6-digit
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }

  return color.toLowerCase();
}

/**
 * Convert hex to RGB
 * @param {string} hex - Hex color
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  const result = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(normalized);
  return result
    ? {
      r: Number.parseInt(result[1], 16),
      g: Number.parseInt(result[2], 16),
      b: Number.parseInt(result[3], 16),
    }
    : null;
}

/**
 * Convert RGB to hex
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate color palette from base color
 * @param {string} baseColor - Base hex color
 * @returns {object}
 */
export function generateColorPalette(baseColor) {
  const rgb = hexToRgb(baseColor);
  if (!rgb) return null;

  const { r, g, b } = rgb;

  // Lighter shades (tints)
  const lighten = (amount) =>
    rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);

  // Darker shades
  const darken = (amount) => rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));

  return {
    50: lighten(0.9),
    100: lighten(0.8),
    200: lighten(0.6),
    300: lighten(0.4),
    400: lighten(0.2),
    500: normalizeHexColor(baseColor), // Base color
    600: darken(0.1),
    700: darken(0.25),
    800: darken(0.4),
    900: darken(0.55),
  };
}

/**
 * Calculate contrast ratio between two colors
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @returns {number}
 */
export function getContrastRatio(color1, color2) {
  const getLuminance = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;

    const { r, g, b } = rgb;
    const [rs, gs, bs] = [r / 255, g / 255, b / 255].map((c) =>
      c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055)**2.4
    );
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if color combination meets WCAG AA contrast requirements
 * @param {string} foreground - Text color
 * @param {string} background - Background color
 * @param {string} size - 'normal' or 'large'
 * @returns {boolean}
 */
export function meetsContrastRequirement(foreground, background, size = 'normal') {
  const ratio = getContrastRatio(foreground, background);
  // WCAG AA: 4.5:1 for normal text, 3:1 for large text
  return size === 'large' ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Generate domain verification token
 * @param {string} domain - Domain to verify
 * @returns {string}
 */
export function generateVerificationToken(domain) {
  const hash = createHash('sha256')
    .update(`${domain}-${randomBytes(16).toString('hex')}-${Date.now()}`)
    .digest('hex')
    .slice(0, 32);
  return `wrn-verify-${hash}`;
}

/**
 * Branding Manager
 */
export class BrandingManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || DEFAULT_DB_PATH;
    this.db = new sqlite3.Database(this.dbPath);
    this._initialized = false;
    this._initPromise = null;
  }

  async _ensureInit() {
    if (this._initialized) return;
    if (this._initPromise) {
      await this._initPromise;
      return;
    }

    this._initPromise = this._init();
    await this._initPromise;
  }

  async _init() {
    if (this._initialized) return;

    // Workspace branding settings
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS workspace_branding (
        workspace_id TEXT PRIMARY KEY,
        logo_url TEXT,
        logo_width INTEGER,
        logo_height INTEGER,
        primary_color TEXT DEFAULT '#ff5f00',
        secondary_color TEXT DEFAULT '#cf3c69',
        background_color TEXT DEFAULT '#fcfaf5',
        text_color TEXT DEFAULT '#12111a',
        success_color TEXT DEFAULT '#5D8C61',
        font_family TEXT,
        white_label INTEGER DEFAULT 0,
        powered_by_visible INTEGER DEFAULT 1,
        custom_footer TEXT,
        updated_at INTEGER NOT NULL
      )
    `);

    // Custom domain records
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS custom_domains (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        domain TEXT UNIQUE NOT NULL,
        verification_token TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        ssl_issued INTEGER DEFAULT 0,
        ssl_expires_at INTEGER,
        verified_at INTEGER,
        created_at INTEGER NOT NULL,
        last_check_at INTEGER
      )
    `);

    // Domain verification logs
    await this._runRaw(`
      CREATE TABLE IF NOT EXISTS domain_verification_logs (
        id TEXT PRIMARY KEY,
        domain_id TEXT NOT NULL,
        check_type TEXT NOT NULL,
        success INTEGER NOT NULL,
        error TEXT,
        created_at INTEGER NOT NULL
      )
    `);

    // Indexes
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_domains_workspace ON custom_domains(workspace_id)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_domains_status ON custom_domains(status)'
    );
    await this._runRaw(
      'CREATE INDEX IF NOT EXISTS idx_verification_domain ON domain_verification_logs(domain_id)'
    );

    this._initialized = true;
  }

  async _runRaw(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async _run(sql, params = []) {
    await this._ensureInit();
    return this._runRaw(sql, params);
  }

  async _get(sql, params = []) {
    await this._ensureInit();
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      });
    });
  }

  async _all(sql, params = []) {
    await this._ensureInit();
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  // ========== BRANDING MANAGEMENT ==========

  /**
   * Get branding for a workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<object>}
   */
  async getBranding(workspaceId) {
    const row = await this._get(
      'SELECT * FROM workspace_branding WHERE workspace_id = ?',
      [workspaceId]
    );

    if (!row) {
      return {
        workspace_id: workspaceId,
        logo_url: null,
        primary_color: DefaultBranding.PRIMARY_COLOR,
        secondary_color: DefaultBranding.SECONDARY_COLOR,
        background_color: DefaultBranding.BACKGROUND_COLOR,
        text_color: DefaultBranding.TEXT_COLOR,
        success_color: DefaultBranding.SUCCESS_COLOR,
        white_label: false,
        powered_by_visible: true,
        custom_footer: null,
        palette: {
          primary: generateColorPalette(DefaultBranding.PRIMARY_COLOR),
          secondary: generateColorPalette(DefaultBranding.SECONDARY_COLOR),
        },
      };
    }

    return {
      workspace_id: row.workspace_id,
      logo_url: row.logo_url,
      logo_width: row.logo_width,
      logo_height: row.logo_height,
      primary_color: row.primary_color,
      secondary_color: row.secondary_color,
      background_color: row.background_color,
      text_color: row.text_color,
      success_color: row.success_color,
      font_family: row.font_family,
      white_label: row.white_label === 1,
      powered_by_visible: row.powered_by_visible === 1,
      custom_footer: row.custom_footer,
      updated_at: row.updated_at,
      palette: {
        primary: generateColorPalette(row.primary_color),
        secondary: generateColorPalette(row.secondary_color),
      },
    };
  }

  /**
   * Update branding for a workspace
   * @param {string} workspaceId - Workspace ID
   * @param {object} updates - Branding updates
   * @returns {Promise<object>}
   */
  async setBranding(workspaceId, updates) {
    const errors = [];

    // Validate colors
    if (updates.primaryColor && !validateHexColor(updates.primaryColor)) {
      errors.push('Invalid primary color format');
    }

    if (updates.secondaryColor && !validateHexColor(updates.secondaryColor)) {
      errors.push('Invalid secondary color format');
    }

    if (updates.backgroundColor && !validateHexColor(updates.backgroundColor)) {
      errors.push('Invalid background color format');
    }

    if (updates.textColor && !validateHexColor(updates.textColor)) {
      errors.push('Invalid text color format');
    }

    // Check contrast
    if (updates.textColor && updates.backgroundColor && !meetsContrastRequirement(updates.textColor, updates.backgroundColor)) {
      errors.push('Text/background colors do not meet accessibility contrast requirements');
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    const now = Date.now();
    const existing = await this._get(
      'SELECT * FROM workspace_branding WHERE workspace_id = ?',
      [workspaceId]
    );

    if (existing) {
      const sets = ['updated_at = ?'];
      const params = [now];

      if (updates.logoUrl !== undefined) {
        sets.push('logo_url = ?');
        params.push(updates.logoUrl);
      }

      if (updates.logoWidth !== undefined) {
        sets.push('logo_width = ?');
        params.push(updates.logoWidth);
      }

      if (updates.logoHeight !== undefined) {
        sets.push('logo_height = ?');
        params.push(updates.logoHeight);
      }

      if (updates.primaryColor !== undefined) {
        sets.push('primary_color = ?');
        params.push(normalizeHexColor(updates.primaryColor));
      }

      if (updates.secondaryColor !== undefined) {
        sets.push('secondary_color = ?');
        params.push(normalizeHexColor(updates.secondaryColor));
      }

      if (updates.backgroundColor !== undefined) {
        sets.push('background_color = ?');
        params.push(normalizeHexColor(updates.backgroundColor));
      }

      if (updates.textColor !== undefined) {
        sets.push('text_color = ?');
        params.push(normalizeHexColor(updates.textColor));
      }

      if (updates.successColor !== undefined) {
        sets.push('success_color = ?');
        params.push(normalizeHexColor(updates.successColor));
      }

      if (updates.fontFamily !== undefined) {
        sets.push('font_family = ?');
        params.push(updates.fontFamily);
      }

      if (updates.whiteLabel !== undefined) {
        sets.push('white_label = ?');
        params.push(updates.whiteLabel ? 1 : 0);
      }

      if (updates.poweredByVisible !== undefined) {
        sets.push('powered_by_visible = ?');
        params.push(updates.poweredByVisible ? 1 : 0);
      }

      if (updates.customFooter !== undefined) {
        sets.push('custom_footer = ?');
        params.push(updates.customFooter);
      }

      params.push(workspaceId);
      await this._run(`UPDATE workspace_branding SET ${sets.join(', ')} WHERE workspace_id = ?`, params);
    } else {
      await this._run(
        `INSERT INTO workspace_branding
         (workspace_id, logo_url, logo_width, logo_height, primary_color, secondary_color, background_color, text_color, success_color, white_label, powered_by_visible, custom_footer, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          workspaceId,
          updates.logoUrl || null,
          updates.logoWidth || null,
          updates.logoHeight || null,
          normalizeHexColor(updates.primaryColor) || DefaultBranding.PRIMARY_COLOR,
          normalizeHexColor(updates.secondaryColor) || DefaultBranding.SECONDARY_COLOR,
          normalizeHexColor(updates.backgroundColor) || DefaultBranding.BACKGROUND_COLOR,
          normalizeHexColor(updates.textColor) || DefaultBranding.TEXT_COLOR,
          normalizeHexColor(updates.successColor) || DefaultBranding.SUCCESS_COLOR,
          updates.whiteLabel ? 1 : 0,
          updates.poweredByVisible === false ? 0 : 1,
          updates.customFooter || null,
          now,
        ]
      );
    }

    return { success: true, branding: await this.getBranding(workspaceId) };
  }

  /**
   * Remove logo from workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<void>}
   */
  async removeLogo(workspaceId) {
    await this._run(
      'UPDATE workspace_branding SET logo_url = NULL, logo_width = NULL, logo_height = NULL, updated_at = ? WHERE workspace_id = ?',
      [Date.now(), workspaceId]
    );
  }

  /**
   * Reset branding to defaults
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<void>}
   */
  async resetBranding(workspaceId) {
    await this._run('DELETE FROM workspace_branding WHERE workspace_id = ?', [workspaceId]);
  }

  // ========== CUSTOM DOMAINS ==========

  /**
   * Add custom domain
   * @param {string} workspaceId - Workspace ID
   * @param {string} domain - Domain name
   * @returns {Promise<object>}
   */
  async addCustomDomain(workspaceId, domain) {
    // Normalize domain
    const normalizedDomain = domain.toLowerCase().trim();

    // Basic validation
    if (!/^[a-z\d]([a-z\d-]*[a-z\d])?(\.[a-z\d]([a-z\d-]*[a-z\d])?)+$/.test(normalizedDomain)) {
      return { success: false, error: 'Invalid domain format' };
    }

    // Check if domain already exists
    const existing = await this._get(
      'SELECT * FROM custom_domains WHERE domain = ?',
      [normalizedDomain]
    );

    if (existing) {
      if (existing.workspace_id === workspaceId) {
        return {
          success: true,
          domain_id: existing.id,
          verification_token: existing.verification_token,
          status: existing.status,
          message: 'Domain already registered',
        };
      }

      return { success: false, error: 'Domain already registered to another workspace' };
    }

    const id = `dom_${Date.now()}_${randomBytes(4).toString('hex')}`;
    const token = generateVerificationToken(normalizedDomain);
    const now = Date.now();

    await this._run(
      `INSERT INTO custom_domains
       (id, workspace_id, domain, verification_token, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, normalizedDomain, token, DomainStatus.PENDING, now]
    );

    return {
      success: true,
      domain_id: id,
      domain: normalizedDomain,
      verification_token: token,
      status: DomainStatus.PENDING,
      dns_instructions: {
        type: 'TXT',
        name: '_wranngle-verify',
        value: token,
        ttl: 3600,
      },
      cname_instructions: {
        type: 'CNAME',
        name: normalizedDomain,
        value: 'app.wranngle.com',
        ttl: 3600,
      },
    };
  }

  /**
   * Get custom domain for workspace
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<object|null>}
   */
  async getCustomDomain(workspaceId) {
    const row = await this._get(
      'SELECT * FROM custom_domains WHERE workspace_id = ?',
      [workspaceId]
    );

    if (!row) return null;

    return {
      domain_id: row.id,
      workspace_id: row.workspace_id,
      domain: row.domain,
      verification_token: row.verification_token,
      status: row.status,
      ssl_issued: row.ssl_issued === 1,
      ssl_expires_at: row.ssl_expires_at,
      verified_at: row.verified_at,
      created_at: row.created_at,
      last_check_at: row.last_check_at,
    };
  }

  /**
   * Get workspace by custom domain
   * @param {string} domain - Domain name
   * @returns {Promise<object|null>}
   */
  async getWorkspaceByDomain(domain) {
    const row = await this._get(
      `SELECT * FROM custom_domains
       WHERE domain = ? AND status = ?`,
      [domain.toLowerCase(), DomainStatus.VERIFIED]
    );

    return row
      ? {
        workspace_id: row.workspace_id,
        domain: row.domain,
        ssl_issued: row.ssl_issued === 1,
      }
      : null;
  }

  /**
   * Update domain verification status
   * @param {string} domainId - Domain ID
   * @param {string} status - New status
   * @param {object} details - Additional details
   * @returns {Promise<void>}
   */
  async updateDomainStatus(domainId, status, details = {}) {
    const now = Date.now();
    const sets = ['status = ?', 'last_check_at = ?'];
    const params = [status, now];

    if (status === DomainStatus.VERIFIED) {
      sets.push('verified_at = ?');
      params.push(now);
    }

    if (details.ssl_issued !== undefined) {
      sets.push('ssl_issued = ?');
      params.push(details.ssl_issued ? 1 : 0);
    }

    if (details.ssl_expires_at !== undefined) {
      sets.push('ssl_expires_at = ?');
      params.push(details.ssl_expires_at);
    }

    params.push(domainId);
    await this._run(`UPDATE custom_domains SET ${sets.join(', ')} WHERE id = ?`, params);

    // Log verification attempt
    await this._run(
      `INSERT INTO domain_verification_logs (id, domain_id, check_type, success, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `log_${now}_${randomBytes(4).toString('hex')}`,
        domainId,
        'status_update',
        status === DomainStatus.VERIFIED ? 1 : 0,
        details.error || null,
        now,
      ]
    );
  }

  /**
   * Remove custom domain
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<void>}
   */
  async removeCustomDomain(workspaceId) {
    await this._run('DELETE FROM custom_domains WHERE workspace_id = ?', [workspaceId]);
  }

  /**
   * Get pending domains for verification
   * @returns {Promise<Array>}
   */
  async getPendingDomains() {
    const rows = await this._all(
      `SELECT * FROM custom_domains WHERE status = ?`,
      [DomainStatus.PENDING]
    );

    return rows.map((row) => ({
      domain_id: row.id,
      workspace_id: row.workspace_id,
      domain: row.domain,
      verification_token: row.verification_token,
      created_at: row.created_at,
    }));
  }

  // ========== DOCUMENT BRANDING ==========

  /**
   * Apply branding to HTML template
   * @param {string} workspaceId - Workspace ID
   * @param {string} html - HTML template
   * @param {object} options - Options
   * @returns {Promise<string>}
   */
  async applyBranding(workspaceId, html, options = {}) {
    const branding = await this.getBranding(workspaceId);

    let result = html;

    // Replace color variables
    result = result.replaceAll('{{primary_color}}', branding.primary_color);
    result = result.replaceAll('{{secondary_color}}', branding.secondary_color);
    result = result.replaceAll('{{background_color}}', branding.background_color);
    result = result.replaceAll('{{text_color}}', branding.text_color);
    result = result.replaceAll('{{success_color}}', branding.success_color);

    // Replace logo
    if (branding.logo_url) {
      result = result.replaceAll('{{logo_url}}', branding.logo_url);
    }

    // Handle powered by
    result = !branding.powered_by_visible || branding.white_label ? result.replaceAll('{{powered_by}}', '') : result.replaceAll('{{powered_by}}', 'Powered by Wranngle');

    // Custom footer
    if (branding.custom_footer) {
      result = result.replaceAll('{{custom_footer}}', branding.custom_footer);
    }

    return result;
  }

  /**
   * Generate CSS variables for branding
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<string>}
   */
  async generateCssVariables(workspaceId) {
    const branding = await this.getBranding(workspaceId);

    const css = `
:root {
  --brand-primary: ${branding.primary_color};
  --brand-primary-50: ${branding.palette.primary[50]};
  --brand-primary-100: ${branding.palette.primary[100]};
  --brand-primary-200: ${branding.palette.primary[200]};
  --brand-primary-300: ${branding.palette.primary[300]};
  --brand-primary-400: ${branding.palette.primary[400]};
  --brand-primary-500: ${branding.palette.primary[500]};
  --brand-primary-600: ${branding.palette.primary[600]};
  --brand-primary-700: ${branding.palette.primary[700]};
  --brand-primary-800: ${branding.palette.primary[800]};
  --brand-primary-900: ${branding.palette.primary[900]};

  --brand-secondary: ${branding.secondary_color};
  --brand-secondary-50: ${branding.palette.secondary[50]};
  --brand-secondary-100: ${branding.palette.secondary[100]};
  --brand-secondary-200: ${branding.palette.secondary[200]};
  --brand-secondary-300: ${branding.palette.secondary[300]};
  --brand-secondary-400: ${branding.palette.secondary[400]};
  --brand-secondary-500: ${branding.palette.secondary[500]};
  --brand-secondary-600: ${branding.palette.secondary[600]};
  --brand-secondary-700: ${branding.palette.secondary[700]};
  --brand-secondary-800: ${branding.palette.secondary[800]};
  --brand-secondary-900: ${branding.palette.secondary[900]};

  --brand-background: ${branding.background_color};
  --brand-text: ${branding.text_color};
  --brand-success: ${branding.success_color};
}
    `.trim();

    return css;
  }

  /**
   * Close database connection
   */
  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}
