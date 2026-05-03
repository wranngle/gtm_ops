/**
 * Unit Tests for lib/branding.js
 *
 * Tests branding and white-label functionality:
 * - Color validation and palette generation
 * - Branding management
 * - Custom domain handling
 * - Document branding
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let BrandingManager: any;
let DefaultBranding: any;
let DomainStatus: any;
let validateHexColor: any;
let normalizeHexColor: any;
let hexToRgb: any;
let rgbToHex: any;
let generateColorPalette: any;
let getContrastRatio: any;
let meetsContrastRequirement: any;
let generateVerificationToken: any;
let testDbPath: string;
let branding: any;

beforeEach(async () => {
  testDbPath = path.join(
    __dirname,
    '..',
    '..',
    'config',
    `branding_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );

  const module = await import('../../lib/branding.js');
  BrandingManager = module.BrandingManager;
  DefaultBranding = module.DefaultBranding;
  DomainStatus = module.DomainStatus;
  validateHexColor = module.validateHexColor;
  normalizeHexColor = module.normalizeHexColor;
  hexToRgb = module.hexToRgb;
  rgbToHex = module.rgbToHex;
  generateColorPalette = module.generateColorPalette;
  getContrastRatio = module.getContrastRatio;
  meetsContrastRequirement = module.meetsContrastRequirement;
  generateVerificationToken = module.generateVerificationToken;

  branding = new BrandingManager(testDbPath);
});

afterEach(async () => {
  if (branding) {
    await branding.close();
  }

  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] Color Validation', () => {
  it('[P0] should validate correct hex colors', () => {
    expect(validateHexColor('#ff5f00')).toBe(true);
    expect(validateHexColor('#FFF')).toBe(true);
    expect(validateHexColor('#000000')).toBe(true);
    expect(validateHexColor('#abc')).toBe(true);
  });

  it('[P0] should reject invalid hex colors', () => {
    expect(validateHexColor('ff5f00')).toBe(false); // Missing #
    expect(validateHexColor('#gg0000')).toBe(false); // Invalid chars
    expect(validateHexColor('#12345')).toBe(false); // Wrong length
    expect(validateHexColor('')).toBe(false);
    expect(validateHexColor(null)).toBe(false);
    expect(validateHexColor(undefined)).toBe(false);
  });

  it('[P0] should normalize 3-digit to 6-digit', () => {
    expect(normalizeHexColor('#fff')).toBe('#ffffff');
    expect(normalizeHexColor('#abc')).toBe('#aabbcc');
    expect(normalizeHexColor('#000')).toBe('#000000');
  });

  it('[P0] should lowercase colors', () => {
    expect(normalizeHexColor('#FF5F00')).toBe('#ff5f00');
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
  });

  it('[P0] should return null for invalid colors', () => {
    expect(normalizeHexColor('invalid')).toBeNull();
  });
});

describe('[P0] Color Conversion', () => {
  it('[P0] should convert hex to RGB', () => {
    expect(hexToRgb('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
    expect(hexToRgb('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('[P0] should convert RGB to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
    expect(rgbToHex(0, 255, 0)).toBe('#00ff00');
    expect(rgbToHex(0, 0, 255)).toBe('#0000ff');
    expect(rgbToHex(255, 95, 0)).toBe('#ff5f00');
  });

  it('[P0] should clamp RGB values', () => {
    expect(rgbToHex(300, -10, 128)).toBe('#ff0080');
  });
});

describe('[P0] Color Palette Generation', () => {
  it('[P0] should generate palette with 10 shades', () => {
    const palette = generateColorPalette('#ff5f00');

    expect(palette).toHaveProperty('50');
    expect(palette).toHaveProperty('100');
    expect(palette).toHaveProperty('200');
    expect(palette).toHaveProperty('300');
    expect(palette).toHaveProperty('400');
    expect(palette).toHaveProperty('500');
    expect(palette).toHaveProperty('600');
    expect(palette).toHaveProperty('700');
    expect(palette).toHaveProperty('800');
    expect(palette).toHaveProperty('900');
  });

  it('[P0] should have base color at 500', () => {
    const palette = generateColorPalette('#ff5f00');
    expect(palette[500]).toBe('#ff5f00');
  });

  it('[P0] should have lighter shades for lower numbers', () => {
    const palette = generateColorPalette('#808080');

    // 50 should be lighter (higher RGB values) than 500
    const shade50 = hexToRgb(palette[50]);
    const shade500 = hexToRgb(palette[500]);

    expect(shade50.r).toBeGreaterThan(shade500.r);
    expect(shade50.g).toBeGreaterThan(shade500.g);
    expect(shade50.b).toBeGreaterThan(shade500.b);
  });

  it('[P0] should have darker shades for higher numbers', () => {
    const palette = generateColorPalette('#808080');

    // 900 should be darker (lower RGB values) than 500
    const shade900 = hexToRgb(palette[900]);
    const shade500 = hexToRgb(palette[500]);

    expect(shade900.r).toBeLessThan(shade500.r);
    expect(shade900.g).toBeLessThan(shade500.g);
    expect(shade900.b).toBeLessThan(shade500.b);
  });
});

describe('[P0] Contrast Checking', () => {
  it('[P0] should calculate contrast ratio', () => {
    // Black on white should be ~21:1
    const ratio = getContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('[P0] should pass contrast for black on white', () => {
    expect(meetsContrastRequirement('#000000', '#ffffff')).toBe(true);
  });

  it('[P0] should fail contrast for similar colors', () => {
    expect(meetsContrastRequirement('#777777', '#888888')).toBe(false);
  });

  it('[P0] should have lower requirement for large text', () => {
    // Medium contrast that passes large but not normal
    const fg = '#777777';
    const bg = '#ffffff';
    const ratio = getContrastRatio(fg, bg);

    // This should pass large text (3:1) but may or may not pass normal (4.5:1)
    expect(meetsContrastRequirement(fg, bg, 'large')).toBe(true);
  });
});

describe('[P0] Branding Management', () => {
  it('[P0] should return defaults for new workspace', async () => {
    const result = await branding.getBranding('ws-new');

    expect(result.workspace_id).toBe('ws-new');
    expect(result.primary_color).toBe(DefaultBranding.PRIMARY_COLOR);
    expect(result.secondary_color).toBe(DefaultBranding.SECONDARY_COLOR);
    expect(result.white_label).toBe(false);
    expect(result.powered_by_visible).toBe(true);
  });

  it('[P0] should set branding colors', async () => {
    const { success, branding: updated } = await branding.setBranding('ws-1', {
      primaryColor: '#0066cc',
      secondaryColor: '#cc6600',
    });

    expect(success).toBe(true);
    expect(updated.primary_color).toBe('#0066cc');
    expect(updated.secondary_color).toBe('#cc6600');
  });

  it('[P0] should reject invalid colors', async () => {
    const result = await branding.setBranding('ws-1', {
      primaryColor: 'not-a-color',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('Invalid primary color format');
  });

  it('[P0] should update existing branding', async () => {
    await branding.setBranding('ws-1', { primaryColor: '#111111' });
    await branding.setBranding('ws-1', { secondaryColor: '#222222' });

    const result = await branding.getBranding('ws-1');
    expect(result.primary_color).toBe('#111111');
    expect(result.secondary_color).toBe('#222222');
  });

  it('[P0] should set white label mode', async () => {
    await branding.setBranding('ws-1', {
      whiteLabel: true,
      poweredByVisible: false,
    });

    const result = await branding.getBranding('ws-1');
    expect(result.white_label).toBe(true);
    expect(result.powered_by_visible).toBe(false);
  });

  it('[P0] should reset branding to defaults', async () => {
    await branding.setBranding('ws-1', { primaryColor: '#123456' });
    await branding.resetBranding('ws-1');

    const result = await branding.getBranding('ws-1');
    expect(result.primary_color).toBe(DefaultBranding.PRIMARY_COLOR);
  });
});

describe('[P0] Logo Management', () => {
  it('[P0] should set logo URL', async () => {
    await branding.setBranding('ws-1', {
      logoUrl: 'https://example.com/logo.png',
      logoWidth: 200,
      logoHeight: 100,
    });

    const result = await branding.getBranding('ws-1');
    expect(result.logo_url).toBe('https://example.com/logo.png');
    expect(result.logo_width).toBe(200);
    expect(result.logo_height).toBe(100);
  });

  it('[P0] should remove logo', async () => {
    await branding.setBranding('ws-1', { logoUrl: 'https://example.com/logo.png' });
    await branding.removeLogo('ws-1');

    const result = await branding.getBranding('ws-1');
    expect(result.logo_url).toBeNull();
  });
});

describe('[P1] Custom Domains', () => {
  it('[P1] should add custom domain', async () => {
    const result = await branding.addCustomDomain('ws-1', 'app.example.com');

    expect(result.success).toBe(true);
    expect(result.domain).toBe('app.example.com');
    expect(result.status).toBe(DomainStatus.PENDING);
    expect(result.verification_token).toMatch(/^wrn-verify-/);
    expect(result.dns_instructions).toBeDefined();
  });

  it('[P1] should reject invalid domains', async () => {
    const result = await branding.addCustomDomain('ws-1', 'not a domain');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid domain format');
  });

  it('[P1] should normalize domain to lowercase', async () => {
    const result = await branding.addCustomDomain('ws-1', 'APP.EXAMPLE.COM');
    expect(result.domain).toBe('app.example.com');
  });

  it('[P1] should prevent duplicate domains', async () => {
    await branding.addCustomDomain('ws-1', 'app.example.com');
    const result = await branding.addCustomDomain('ws-2', 'app.example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Domain already registered to another workspace');
  });

  it('[P1] should return existing domain for same workspace', async () => {
    const first = await branding.addCustomDomain('ws-1', 'app.example.com');
    const second = await branding.addCustomDomain('ws-1', 'app.example.com');

    expect(second.success).toBe(true);
    expect(second.domain_id).toBe(first.domain_id);
    expect(second.message).toBe('Domain already registered');
  });

  it('[P1] should get custom domain', async () => {
    await branding.addCustomDomain('ws-1', 'app.example.com');

    const domain = await branding.getCustomDomain('ws-1');
    expect(domain.domain).toBe('app.example.com');
    expect(domain.status).toBe(DomainStatus.PENDING);
  });

  it('[P1] should return null for no domain', async () => {
    const domain = await branding.getCustomDomain('ws-none');
    expect(domain).toBeNull();
  });

  it('[P1] should update domain status', async () => {
    const { domain_id } = await branding.addCustomDomain('ws-1', 'app.example.com');
    await branding.updateDomainStatus(domain_id, DomainStatus.VERIFIED);

    const domain = await branding.getCustomDomain('ws-1');
    expect(domain.status).toBe(DomainStatus.VERIFIED);
    expect(domain.verified_at).toBeDefined();
  });

  it('[P1] should get workspace by verified domain', async () => {
    const { domain_id } = await branding.addCustomDomain('ws-1', 'app.example.com');
    await branding.updateDomainStatus(domain_id, DomainStatus.VERIFIED);

    const workspace = await branding.getWorkspaceByDomain('app.example.com');
    expect(workspace.workspace_id).toBe('ws-1');
  });

  it('[P1] should not return pending domain for lookup', async () => {
    await branding.addCustomDomain('ws-1', 'app.example.com');

    const workspace = await branding.getWorkspaceByDomain('app.example.com');
    expect(workspace).toBeNull();
  });

  it('[P1] should remove custom domain', async () => {
    await branding.addCustomDomain('ws-1', 'app.example.com');
    await branding.removeCustomDomain('ws-1');

    const domain = await branding.getCustomDomain('ws-1');
    expect(domain).toBeNull();
  });

  it('[P1] should list pending domains', async () => {
    await branding.addCustomDomain('ws-1', 'one.example.com');
    await branding.addCustomDomain('ws-2', 'two.example.com');

    const pending = await branding.getPendingDomains();
    expect(pending).toHaveLength(2);
  });
});

describe('[P1] Document Branding', () => {
  it('[P1] should apply branding to HTML', async () => {
    await branding.setBranding('ws-1', {
      primaryColor: '#123456',
      secondaryColor: '#654321',
    });

    const html = '<div style="color: {{primary_color}}">Test</div>';
    const result = await branding.applyBranding('ws-1', html);

    expect(result).toContain('#123456');
  });

  it('[P1] should hide powered by in white label', async () => {
    await branding.setBranding('ws-1', {
      whiteLabel: true,
    });

    const html = 'Footer: {{powered_by}}';
    const result = await branding.applyBranding('ws-1', html);

    expect(result).toBe('Footer: ');
  });

  it('[P1] should show powered by by default', async () => {
    const html = 'Footer: {{powered_by}}';
    const result = await branding.applyBranding('ws-1', html);

    expect(result).toContain('Powered by Wranngle');
  });
});

describe('[P1] CSS Variables Generation', () => {
  it('[P1] should generate CSS variables', async () => {
    await branding.setBranding('ws-1', {
      primaryColor: '#ff5f00',
    });

    const css = await branding.generateCssVariables('ws-1');

    expect(css).toContain('--brand-primary: #ff5f00');
    expect(css).toContain('--brand-primary-50:');
    expect(css).toContain('--brand-primary-900:');
  });
});

describe('[P1] Verification Token', () => {
  it('[P1] should generate unique tokens', () => {
    const token1 = generateVerificationToken('example.com');
    const token2 = generateVerificationToken('example.com');

    expect(token1).toMatch(/^wrn-verify-/);
    expect(token1).not.toBe(token2);
  });
});

describe('[P1] Domain Verification Workflow', () => {
  it('[P1] should provide DNS instructions with verification token', async () => {
    // WHEN: Adding a custom domain
    const result = await branding.addCustomDomain('ws-verify-1', 'app.mycompany.com');

    // THEN: Should include DNS instructions (TXT record format)
    expect(result.dns_instructions).toBeDefined();
    expect(result.dns_instructions.type).toBe('TXT');
    expect(result.dns_instructions.name).toBe('_wranngle-verify');
    expect(result.dns_instructions.value).toBeDefined();
    expect(result.verification_token).toMatch(/^wrn-verify-/);
  });

  it('[P1] should verify domain and update status', async () => {
    // GIVEN: A pending domain
    const { domain_id } = await branding.addCustomDomain('ws-verify-2', 'verified.example.com');

    // WHEN: Verifying the domain
    await branding.updateDomainStatus(domain_id, DomainStatus.VERIFIED);

    // THEN: Domain should be verified
    const domain = await branding.getCustomDomain('ws-verify-2');
    expect(domain.status).toBe(DomainStatus.VERIFIED);
    expect(domain.verified_at).toBeDefined();
    expect(domain.verified_at).toBeGreaterThan(0);
  });

  it('[P1] should allow lookup by verified domain only', async () => {
    // GIVEN: One pending and one verified domain
    await branding.addCustomDomain('ws-verify-3', 'pending.example.com');
    const { domain_id: verifiedId } = await branding.addCustomDomain('ws-verify-4', 'active.example.com');
    await branding.updateDomainStatus(verifiedId, DomainStatus.VERIFIED);

    // WHEN: Looking up domains
    const pendingLookup = await branding.getWorkspaceByDomain('pending.example.com');
    const verifiedLookup = await branding.getWorkspaceByDomain('active.example.com');

    // THEN: Only verified domain should resolve
    expect(pendingLookup).toBeNull();
    expect(verifiedLookup).not.toBeNull();
    expect(verifiedLookup.workspace_id).toBe('ws-verify-4');
  });
});
