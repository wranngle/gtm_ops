/**
 * Pins the explicit-revision contract between generateProjectIdentity and
 * HistoryManager.startExecution: the identity carries `revision` as a
 * first-class field, and startExecution records it verbatim — slug parsing
 * (…r5 → 5) is only a fallback for legacy callers, never a silent override.
 */
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { generateProjectIdentity } from '../../lib/project-identity.js';
import { HistoryManager } from '../../lib/history.js';

const intake = { client: { name: 'Acme HVAC' }, project: { workflow_name: 'Intake Flow' } };

describe('[P0] generateProjectIdentity revision field', () => {
  it('[P0] exposes the explicit revision and encodes it in the slug', () => {
    const identity = generateProjectIdentity(intake, { documentType: 'unified', revision: 5 });
    expect(identity.revision).toBe(5);
    expect(identity.document_slug).toMatch(/r5$/);
  });

  it('[P0] defaults to revision 1', () => {
    const identity = generateProjectIdentity(intake, { documentType: 'unified' });
    expect(identity.revision).toBe(1);
    expect(identity.document_slug).toMatch(/r1$/);
  });
});

describe('[P0] HistoryManager.startExecution revision recording', () => {
  let history: any;

  afterEach(async () => {
    if (history?.db) {
      await new Promise((resolve) => history.db.close(resolve));
    }
  });

  const freshHistory = () => new HistoryManager(
    path.join(os.tmpdir(), `history_rev_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
  );

  it('[P0] records the explicit identity revision, not the slug parse', async () => {
    history = freshHistory();
    const identity = {
      client_slug: 'acme',
      project_slug: 'intake',
      project_name: 'Intake Flow',
      document_slug: 'WRN-AI-acme-intake-26r5',
      revision: 7,
    };
    const exec = await history.startExecution(identity, '/tmp/input.json', 'hash123');
    expect(exec.revision).toBe(7);
  });

  it('[P1] falls back to the slug suffix for legacy callers without the field', async () => {
    history = freshHistory();
    const exec = await history.startExecution(
      { client_slug: 'acme', project_slug: 'intake', project_name: 'Intake Flow', document_slug: 'WRN-AI-acme-intake-26r5' },
      '/tmp/input.json',
      'hash123'
    );
    expect(exec.revision).toBe(5);
  });

  it('[P1] records revision 1 (with a warning) when nothing encodes a revision', async () => {
    history = freshHistory();
    const exec = await history.startExecution(
      { client_slug: 'acme', project_slug: 'intake', project_name: 'Intake Flow', document_slug: 'WRN-AI-acme-intake' },
      '/tmp/input.json',
      'hash123'
    );
    expect(exec.revision).toBe(1);
  });
});
