/**
 * Unit Tests for lib/webhooks.ts
 *
 * Tests webhook functionality:
 * - CRUD operations
 * - Signature generation and verification
 * - Event filtering
 * - Delivery tracking
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '..', '..', 'config', 'webhooks_test.db');

let WebhookManager: any;
let WebhookEvent: any;
let ALL_WEBHOOK_EVENTS: any;

beforeEach(async () => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const module = await import('../../lib/webhooks.js');
  WebhookManager = module.WebhookManager;
  WebhookEvent = module.WebhookEvent;
  ALL_WEBHOOK_EVENTS = module.ALL_WEBHOOK_EVENTS;
});

afterEach(async () => {
  // Clean up test database
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] WebhookManager - CRUD Operations', () => {
  it('[P0] should create a webhook with generated secret', async () => {
    // GIVEN: A webhook manager
    const manager = new WebhookManager(TEST_DB_PATH);

    // WHEN: Creating a webhook
    const webhook = await manager.createWebhook({
      name: 'Test Webhook',
      url: 'https://example.com/webhook'
    });

    // THEN: Webhook should be created with secret
    expect(webhook.id).toBeGreaterThan(0);
    expect(webhook.name).toBe('Test Webhook');
    expect(webhook.url).toBe('https://example.com/webhook');
    expect(webhook.secret).toHaveLength(64); // 32 bytes hex
    expect(webhook.events).toEqual(ALL_WEBHOOK_EVENTS);
    expect(webhook.enabled).toBe(true);

    await manager.close();
  });

  it('[P0] should reject invalid URLs', async () => {
    // GIVEN: A webhook manager
    const manager = new WebhookManager(TEST_DB_PATH);

    // WHEN/THEN: Creating with invalid URL should throw
    await expect(manager.createWebhook({
      name: 'Bad Webhook',
      url: 'http://example.com/webhook' // Not HTTPS
    })).rejects.toThrow('Invalid webhook URL');

    await manager.close();
  });

  it('[P0] should allow localhost for testing', async () => {
    // GIVEN: A webhook manager
    const manager = new WebhookManager(TEST_DB_PATH);

    // WHEN: Creating with localhost URL
    const webhook = await manager.createWebhook({
      name: 'Local Webhook',
      url: 'http://localhost:3000/webhook'
    });

    // THEN: Should succeed
    expect(webhook.id).toBeGreaterThan(0);

    await manager.close();
  });

  it('[P0] should get webhook by ID', async () => {
    // GIVEN: A created webhook
    const manager = new WebhookManager(TEST_DB_PATH);
    const created = await manager.createWebhook({
      name: 'Test Webhook',
      url: 'https://example.com/webhook'
    });

    // WHEN: Getting by ID
    const webhook = await manager.getWebhook(created.id);

    // THEN: Should return webhook
    expect(webhook).not.toBeNull();
    expect(webhook.name).toBe('Test Webhook');

    await manager.close();
  });

  it('[P0] should list webhooks for workspace', async () => {
    // GIVEN: Multiple webhooks
    const manager = new WebhookManager(TEST_DB_PATH);

    await manager.createWebhook({
      name: 'Webhook 1',
      url: 'https://example.com/1',
      workspace_id: 'ws-1'
    });
    await manager.createWebhook({
      name: 'Webhook 2',
      url: 'https://example.com/2',
      workspace_id: 'ws-1'
    });
    await manager.createWebhook({
      name: 'Webhook 3',
      url: 'https://example.com/3',
      workspace_id: 'ws-2'
    });

    // WHEN: Listing for workspace
    const webhooks = await manager.listWebhooks('ws-1');

    // THEN: Should return only ws-1 webhooks
    expect(webhooks).toHaveLength(2);
    expect(webhooks.every((w: { workspace_id: string }) => w.workspace_id === 'ws-1')).toBe(true);

    await manager.close();
  });

  it('[P0] should update webhook', async () => {
    // GIVEN: A created webhook
    const manager = new WebhookManager(TEST_DB_PATH);
    const created = await manager.createWebhook({
      name: 'Original Name',
      url: 'https://example.com/webhook'
    });

    // WHEN: Updating
    const updated = await manager.updateWebhook(created.id, {
      name: 'Updated Name',
      enabled: false
    });

    // THEN: Should be updated
    expect(updated.name).toBe('Updated Name');
    expect(updated.enabled).toBe(false);
    expect(updated.url).toBe('https://example.com/webhook'); // Unchanged

    await manager.close();
  });

  it('[P0] should delete webhook', async () => {
    // GIVEN: A created webhook
    const manager = new WebhookManager(TEST_DB_PATH);
    const created = await manager.createWebhook({
      name: 'To Delete',
      url: 'https://example.com/webhook'
    });

    // WHEN: Deleting
    const deleted = await manager.deleteWebhook(created.id);

    // THEN: Should be deleted
    expect(deleted).toBe(true);
    expect(await manager.getWebhook(created.id)).toBeNull();

    await manager.close();
  });
});

describe('[P0] WebhookManager - Signature Verification', () => {
  it('[P0] should verify correct signature', () => {
    // GIVEN: A payload and secret
    const payload = JSON.stringify({ event: 'test', data: { foo: 'bar' } });
    const secret = 'test-secret-key';

    // Generate signature
    const signature = `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;

    // WHEN: Verifying signature
    const isValid = WebhookManager.verifySignature(payload, signature, secret);

    // THEN: Should be valid
    expect(isValid).toBe(true);
  });

  it('[P0] should reject incorrect signature', () => {
    // GIVEN: A payload with wrong signature
    const payload = JSON.stringify({ event: 'test' });
    const secret = 'test-secret-key';
    const wrongSignature = 'sha256=incorrect';

    // WHEN: Verifying signature
    const isValid = WebhookManager.verifySignature(payload, wrongSignature, secret);

    // THEN: Should be invalid
    expect(isValid).toBe(false);
  });
});

describe('[P0] WebhookManager - Event Subscription', () => {
  it('[P0] should filter events by subscription', async () => {
    // GIVEN: Webhooks with different event subscriptions
    const manager = new WebhookManager(TEST_DB_PATH);

    await manager.createWebhook({
      name: 'All Events',
      url: 'https://example.com/all',
      events: ALL_WEBHOOK_EVENTS
    });

    await manager.createWebhook({
      name: 'Completed Only',
      url: 'https://example.com/completed',
      events: [WebhookEvent.PIPELINE_COMPLETED]
    });

    // WHEN: Getting webhooks for specific event
    const webhooks = await manager._getWebhooksForEvent(WebhookEvent.PIPELINE_STARTED, 'default');

    // THEN: Should only return subscribed webhooks
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].name).toBe('All Events');

    await manager.close();
  });

  it('[P0] should reject invalid event types', async () => {
    // GIVEN: A webhook manager
    const manager = new WebhookManager(TEST_DB_PATH);

    // WHEN/THEN: Creating with invalid events should throw
    await expect(manager.createWebhook({
      name: 'Bad Events',
      url: 'https://example.com/webhook',
      events: ['invalid.event']
    })).rejects.toThrow('Invalid event types');

    await manager.close();
  });
});

describe('[P1] WebhookManager - Delivery History', () => {
  it('[P1] should track delivery attempts', async () => {
    // GIVEN: A webhook with delivery record
    const manager = new WebhookManager(TEST_DB_PATH);

    const webhook = await manager.createWebhook({
      name: 'Test Webhook',
      url: 'https://example.com/webhook'
    });

    // Create a manual delivery record for testing
    await new Promise<void>((resolve, reject) => {
      manager.db.run(
        `INSERT INTO webhook_deliveries
         (webhook_id, delivery_id, event_type, payload, status, attempts)
         VALUES (?, ?, ?, ?, 'success', 1)`,
        [webhook.id, 'test-delivery-id', 'pipeline.completed', '{}'],
        (err: Error | undefined) => {
          if (err) { reject(err); return; }
          resolve();
        }
      );
    });

    // WHEN: Getting delivery history
    const history = await manager.getDeliveryHistory(webhook.id);

    // THEN: Should have delivery record
    expect(history.total).toBe(1);
    expect(history.deliveries[0].delivery_id).toBe('test-delivery-id');
    expect(history.deliveries[0].status).toBe('success');

    await manager.close();
  });

  it('[P1] should paginate delivery history', async () => {
    // GIVEN: Multiple delivery records
    const manager = new WebhookManager(TEST_DB_PATH);

    const webhook = await manager.createWebhook({
      name: 'Test Webhook',
      url: 'https://example.com/webhook'
    });

    // Create multiple delivery records
    for (let i = 0; i < 10; i++) {
      await new Promise<void>((resolve, reject) => {
        manager.db.run(
          `INSERT INTO webhook_deliveries
           (webhook_id, delivery_id, event_type, payload, status, attempts)
           VALUES (?, ?, ?, ?, 'success', 1)`,
          [webhook.id, `delivery-${i}`, 'pipeline.completed', '{}'],
          (err: Error | undefined) => {
            if (err) { reject(err); return; }
            resolve();
          }
        );
      });
    }

    // WHEN: Getting first page
    const page1 = await manager.getDeliveryHistory(webhook.id, { limit: 5, offset: 0 });

    // THEN: Should paginate correctly
    expect(page1.deliveries).toHaveLength(5);
    expect(page1.total).toBe(10);
    expect(page1.has_more).toBe(true);

    await manager.close();
  });
});

describe('[P1] WebhookEvent Constants', () => {
  it('[P1] should have all required event types', () => {
    expect(WebhookEvent.PIPELINE_STARTED).toBe('pipeline.started');
    expect(WebhookEvent.PIPELINE_COMPLETED).toBe('pipeline.completed');
    expect(WebhookEvent.PIPELINE_FAILED).toBe('pipeline.failed');
  });

  it('[P1] should export all events array', () => {
    expect(ALL_WEBHOOK_EVENTS).toContain('pipeline.started');
    expect(ALL_WEBHOOK_EVENTS).toContain('pipeline.completed');
    expect(ALL_WEBHOOK_EVENTS).toContain('pipeline.failed');
    expect(ALL_WEBHOOK_EVENTS).toHaveLength(3);
  });
});
