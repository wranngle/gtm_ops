/**
 * Unit Tests: Sales Strategy Config Loading
 *
 * ATDD: Tests written BEFORE verifying full implementation.
 * Validates that sales_strategy.json is properly loaded and structured.
 *
 * AC5: Sales strategy config is loaded and injected
 */
import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect, beforeEach } from 'vitest';

// Path to the sales strategy config
const CONFIG_PATH = path.join(process.cwd(), 'config', 'sales_strategy.json');

describe('[P0] Sales Strategy Config - File Structure', () => {
  let config: any;

  beforeEach(() => {
    // Load config fresh for each test
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[P0] should exist at config/sales_strategy.json', () => {
    // GIVEN: Expected config path
    // WHEN: Checking file existence
    const exists = fs.existsSync(CONFIG_PATH);

    // THEN: File should exist
    expect(exists).toBe(true);
  });

  it('[P0] should be valid JSON', () => {
    // GIVEN: Config file contents
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');

    // WHEN: Parsing as JSON
    // THEN: Should not throw
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('[P0] should have required top-level fields', () => {
    // GIVEN: Loaded config
    // WHEN: Checking structure
    // THEN: Should have all required fields
    expect(config).toHaveProperty('$schema');
    expect(config).toHaveProperty('version');
    expect(config).toHaveProperty('industry');
    expect(config).toHaveProperty('industry_label');
    expect(config).toHaveProperty('market_context');
    expect(config).toHaveProperty('pricing_strategy');
    expect(config).toHaveProperty('compensation');
    expect(config).toHaveProperty('scripts');
    expect(config).toHaveProperty('objections');
    expect(config).toHaveProperty('compliance');
  });

  it('[P0] should have valid version string', () => {
    // GIVEN: Config version
    const {version} = config;

    // WHEN: Checking format
    // THEN: Should be semver format
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('[P1] Sales Strategy Config - Market Context', () => {
  let config: any;

  beforeEach(() => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[AC6] should have market_context with core_problem', () => {
    // GIVEN: Market context
    const market = config.market_context;

    // WHEN: Checking core_problem
    // THEN: Should have headline and description
    expect(market).toHaveProperty('core_problem');
    expect(market.core_problem).toHaveProperty('headline');
    expect(market.core_problem).toHaveProperty('description');
    expect(market.core_problem.headline.length).toBeGreaterThan(0);
  });

  it('[AC6] should have missed_call_value with numeric range', () => {
    // GIVEN: Market context
    const market = config.market_context;

    // WHEN: Checking missed_call_value
    // THEN: Should have range_low, range_high, and display
    expect(market).toHaveProperty('missed_call_value');
    expect(market.missed_call_value.range_low).toBeTypeOf('number');
    expect(market.missed_call_value.range_high).toBeTypeOf('number');
    expect(market.missed_call_value.display).toMatch(/\$[\d,]+ – \$[\d,]+/);
  });

  it('[AC6] should have voicemail_abandonment percentage', () => {
    // GIVEN: Market context
    const market = config.market_context;

    // WHEN: Checking voicemail_abandonment
    // THEN: Should have percent and display
    expect(market).toHaveProperty('voicemail_abandonment');
    expect(market.voicemail_abandonment.percent).toBeTypeOf('number');
    expect(market.voicemail_abandonment.percent).toBeGreaterThan(0);
    expect(market.voicemail_abandonment.percent).toBeLessThanOrEqual(100);
    expect(market.voicemail_abandonment.display).toMatch(/\d+%/);
  });

  it('[AC6] should have annual_loss_estimates array', () => {
    // GIVEN: Market context
    const market = config.market_context;

    // WHEN: Checking annual_loss_estimates
    // THEN: Should be array with at least 2 segments
    expect(market).toHaveProperty('annual_loss_estimates');
    expect(Array.isArray(market.annual_loss_estimates)).toBe(true);
    expect(market.annual_loss_estimates.length).toBeGreaterThanOrEqual(2);

    // Each estimate should have segment, amount, display
    market.annual_loss_estimates.forEach((est: any) => {
      expect(est).toHaveProperty('segment');
      expect(est).toHaveProperty('amount');
      expect(est).toHaveProperty('display');
      expect(est.amount).toBeTypeOf('number');
    });
  });
});

describe('[P1] Sales Strategy Config - Pricing Strategy', () => {
  let config: any;

  beforeEach(() => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[AC7] should have pricing_strategy with packages array', () => {
    // GIVEN: Pricing strategy
    const pricing = config.pricing_strategy;

    // WHEN: Checking structure
    // THEN: Should have approach and packages
    expect(pricing).toHaveProperty('approach');
    expect(pricing).toHaveProperty('packages');
    expect(Array.isArray(pricing.packages)).toBe(true);
  });

  it('[AC7] should have at least 3 packages (Full Bundle, Core, Setup)', () => {
    // GIVEN: Packages
    const {packages} = config.pricing_strategy;

    // WHEN: Checking count
    // THEN: Should have 3+ packages
    expect(packages.length).toBeGreaterThanOrEqual(3);
  });

  it('[AC7] each package should have required fields', () => {
    // GIVEN: Packages
    const {packages} = config.pricing_strategy;

    // WHEN: Checking each package
    // THEN: All should have name, price, display, includes
    packages.forEach((pkg: any) => {
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('price');
      expect(pkg).toHaveProperty('display');
      expect(pkg).toHaveProperty('includes');
      expect(pkg.price).toBeTypeOf('number');
      expect(pkg.display).toMatch(/\$[\d,]+/);
    });
  });

  it('[AC7] should have anchor package marked', () => {
    // GIVEN: Packages
    const {packages} = config.pricing_strategy;

    // WHEN: Finding anchor
    const anchor = packages.find((p: any) => p.is_anchor);

    // THEN: Should have exactly one anchor
    expect(anchor).toBeDefined();
    expect(anchor.name).toBe('Growth Bundle');
  });

  it('[AC7] should have target close package marked', () => {
    // GIVEN: Packages
    const {packages} = config.pricing_strategy;

    // WHEN: Finding target
    const target = packages.find((p: any) => p.is_target);

    // THEN: Should have exactly one target
    expect(target).toBeDefined();
    expect(target.name).toBe('Core Protection');
  });
});

describe('[P1] Sales Strategy Config - Cold Call Scripts', () => {
  let config: any;

  beforeEach(() => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[AC8] should have scripts.cold_call with goal', () => {
    // GIVEN: Scripts
    const {scripts} = config;

    // WHEN: Checking cold_call
    // THEN: Should have goal and segments
    expect(scripts).toHaveProperty('cold_call');
    expect(scripts.cold_call).toHaveProperty('goal');
    expect(scripts.cold_call.goal.length).toBeGreaterThan(0);
  });

  it('[AC8] should have at least 3 script segments', () => {
    // GIVEN: Cold call scripts
    const coldCall = config.scripts.cold_call;

    // WHEN: Checking segments
    // THEN: Should have segments array with 3+ items
    expect(coldCall).toHaveProperty('segments');
    expect(Array.isArray(coldCall.segments)).toBe(true);
    expect(coldCall.segments.length).toBeGreaterThanOrEqual(3);
  });

  it('[AC8] each segment should have label and script', () => {
    // GIVEN: Segments
    const {segments} = config.scripts.cold_call;

    // WHEN: Checking each segment
    // THEN: All should have label and script
    segments.forEach((seg: any) => {
      expect(seg).toHaveProperty('label');
      expect(seg).toHaveProperty('script');
      expect(seg.label.length).toBeGreaterThan(0);
      expect(seg.script.length).toBeGreaterThan(0);
    });
  });
});

describe('[P1] Sales Strategy Config - Objection Handlers', () => {
  let config: any;

  beforeEach(() => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[AC9] should have objections array', () => {
    // GIVEN: Config
    // WHEN: Checking objections
    // THEN: Should be array
    expect(config).toHaveProperty('objections');
    expect(Array.isArray(config.objections)).toBe(true);
  });

  it('[AC9] should have at least 4 objection handlers', () => {
    // GIVEN: Objections
    const {objections} = config;

    // WHEN: Checking count
    // THEN: Should have 4+ handlers
    expect(objections.length).toBeGreaterThanOrEqual(4);
  });

  it('[AC9] each objection should have trigger and response', () => {
    // GIVEN: Objections
    const {objections} = config;

    // WHEN: Checking each objection
    // THEN: All should have trigger and response
    objections.forEach((obj: any) => {
      expect(obj).toHaveProperty('trigger');
      expect(obj).toHaveProperty('response');
      expect(obj.trigger.length).toBeGreaterThan(0);
      expect(obj.response.length).toBeGreaterThan(0);
    });
  });
});

describe('[P1] Sales Strategy Config - Compliance Notes', () => {
  let config: any;

  beforeEach(() => {
    const content = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(content);
  });

  it('[AC10] should have compliance array', () => {
    // GIVEN: Config
    // WHEN: Checking compliance
    // THEN: Should be array
    expect(config).toHaveProperty('compliance');
    expect(Array.isArray(config.compliance)).toBe(true);
  });

  it('[AC10] should have at least 2 compliance notes', () => {
    // GIVEN: Compliance
    const {compliance} = config;

    // WHEN: Checking count
    // THEN: Should have 2+ notes
    expect(compliance.length).toBeGreaterThanOrEqual(2);
  });

  it('[AC10] each note should have title, content, and style flags', () => {
    // GIVEN: Compliance notes
    const {compliance} = config;

    // WHEN: Checking each note
    // THEN: All should have required fields (style_warning and style_healthy booleans)
    compliance.forEach((note: any) => {
      expect(note).toHaveProperty('title');
      expect(note).toHaveProperty('content');
      expect(note).toHaveProperty('style_warning');
      expect(note).toHaveProperty('style_healthy');
      expect(typeof note.style_warning).toBe('boolean');
      expect(typeof note.style_healthy).toBe('boolean');
    });
  });

  it('[AC10] should have Inbound Safe Harbor note with healthy style', () => {
    // GIVEN: Compliance notes
    const {compliance} = config;

    // WHEN: Finding inbound calls note (case-insensitive)
    const inbound = compliance.find((n: any) =>
      n.title.toLowerCase().includes('inbound') || n.content.toLowerCase().includes('inbound')
    );

    // THEN: Should exist with healthy style (style_healthy: true)
    expect(inbound).toBeDefined();
    expect(inbound.style_healthy).toBe(true);
    expect(inbound.style_warning).toBe(false);
  });

  it('[AC10] should have AI Disclosure note with warning style', () => {
    // GIVEN: Compliance notes
    const {compliance} = config;

    // WHEN: Finding disclosure note (case-insensitive)
    const disclosure = compliance.find((n: any) =>
      n.title.toLowerCase().includes('disclosure') || n.content.toLowerCase().includes('disclosure')
    );

    // THEN: Should exist with warning style (style_warning: true)
    expect(disclosure).toBeDefined();
    expect(disclosure.style_warning).toBe(true);
    expect(disclosure.style_healthy).toBe(false);
  });
});
