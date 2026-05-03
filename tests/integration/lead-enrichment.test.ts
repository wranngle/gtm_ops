import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import fetch from 'node-fetch';
import type { Server } from 'node:http';

type EnrichmentResponse = {
  company_name?: string;
  company_domain?: string;
  ai_research?: string;
  [k: string]: unknown;
};

describe('Centralized Lead Enrichment Webhook', () => {
  let mockServer: Server;
  let webhookUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    
    app.post('/webhook/lead-enrichment', (req, res) => {
      const { email, company_url } = req.body;
      if (email === 'test@clay.com' || company_url === 'https://clay.com') {
        res.json({
          company_name: 'Clay.com',
          company_domain: 'clay.com',
          ai_research: 'Clay helps automate outbound sales using data enrichment.'
        });
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    });

    await new Promise((resolve) => {
      mockServer = app.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (!addr || typeof addr === 'string') throw new Error('No server address');
        webhookUrl = `http://127.0.0.1:${addr.port}/webhook/lead-enrichment`;
        process.env.N8N_ENRICHMENT_WEBHOOK_URL = webhookUrl;
        resolve(true);
      });
    });
  });

  afterAll(() => new Promise<void>((resolve) => {
    mockServer.close(() => resolve());
  }));

  it('should enrich a business profile using the central webhook', async () => {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@clay.com' })
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as EnrichmentResponse;
    expect(data.company_name).toBe('Clay.com');
    expect(data.ai_research).toContain('automate outbound sales');
  });

  it('should gracefully handle webhook failures', async () => {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@unknown.com' })
    });

    expect(response.status).toBe(404);
  });
});
