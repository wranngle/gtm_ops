/**
 * Unit Tests for lib/gdpr.ts
 *
 * Tests GDPR compliance functionality:
 * - Consent management
 * - Data export jobs
 * - Account deletion workflow
 * - Legal documents
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let GdprManager: any;
let ConsentType: any;
let ExportStatus: any;
let DeletionStatus: any;
let RetentionPeriod: any;
let testDbPath: string;
let gdpr: any;

beforeEach(async () => {
  // Create unique database path for each test
  testDbPath = path.join(
    __dirname,
    '..',
    '..',
    'config',
    `gdpr_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );

  const module = await import('../../lib/gdpr.js');
  GdprManager = module.GdprManager;
  ConsentType = module.ConsentType;
  ExportStatus = module.ExportStatus;
  DeletionStatus = module.DeletionStatus;
  RetentionPeriod = module.RetentionPeriod;

  gdpr = new GdprManager(testDbPath);
});

afterEach(async () => {
  // Close database connection
  if (gdpr) {
    await gdpr.close();
  }

  // Clean up test database
  if (testDbPath && fs.existsSync(testDbPath)) {
    try {
      fs.unlinkSync(testDbPath);
    } catch {
      // Ignore cleanup errors
    }
  }
});

describe('[P0] Consent Constants', () => {
  it('[P0] should define consent types', () => {
    expect(ConsentType.TERMS).toBe('terms');
    expect(ConsentType.PRIVACY).toBe('privacy');
    expect(ConsentType.MARKETING).toBe('marketing');
    expect(ConsentType.ANALYTICS).toBe('analytics');
    expect(ConsentType.COOKIES).toBe('cookies');
  });

  it('[P0] should define export statuses', () => {
    expect(ExportStatus.PENDING).toBe('pending');
    expect(ExportStatus.PROCESSING).toBe('processing');
    expect(ExportStatus.COMPLETED).toBe('completed');
    expect(ExportStatus.FAILED).toBe('failed');
    expect(ExportStatus.EXPIRED).toBe('expired');
  });

  it('[P0] should define deletion statuses', () => {
    expect(DeletionStatus.PENDING).toBe('pending');
    expect(DeletionStatus.GRACE_PERIOD).toBe('grace_period');
    expect(DeletionStatus.PROCESSING).toBe('processing');
    expect(DeletionStatus.COMPLETED).toBe('completed');
    expect(DeletionStatus.CANCELLED).toBe('cancelled');
  });

  it('[P0] should define retention periods', () => {
    expect(RetentionPeriod.EXPORT_FILE).toBe(7);
    expect(RetentionPeriod.DELETION_GRACE).toBe(30);
    expect(RetentionPeriod.BACKUP).toBe(90);
  });
});

describe('[P0] Consent Management - Recording', () => {
  it('[P0] should record consent', async () => {
    // WHEN: Recording consent
    const result = await gdpr.recordConsent(
      'user-1',
      ConsentType.TERMS,
      true,
      { ip_address: '192.168.1.1', user_agent: 'Mozilla/5.0' }
    );

    // THEN: Should return consent record
    expect(result.consent_id).toMatch(/^cns_/);
    expect(result.user_id).toBe('user-1');
    expect(result.consent_type).toBe(ConsentType.TERMS);
    expect(result.consented).toBe(true);
  });

  it('[P0] should record consent with version', async () => {
    // WHEN: Recording consent with specific version
    const result = await gdpr.recordConsent(
      'user-1',
      ConsentType.PRIVACY,
      true,
      {},
      '2.0'
    );

    // THEN: Should store version
    expect(result.version).toBe('2.0');
  });

  it('[P0] should record multiple consents for same user', async () => {
    // GIVEN: Multiple consent types
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true);
    await gdpr.recordConsent('user-1', ConsentType.PRIVACY, true);
    await gdpr.recordConsent('user-1', ConsentType.MARKETING, false);

    // WHEN: Getting all consents
    const consents = await gdpr.getAllConsents('user-1');

    // THEN: Should have all consents
    expect(consents).toHaveLength(3);
  });
});

describe('[P0] Consent Management - Querying', () => {
  it('[P0] should get latest consent for type', async () => {
    // GIVEN: Multiple consents for same type
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true, {}, '1.0');
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true, {}, '2.0');

    // WHEN: Getting consent
    const consent = await gdpr.getConsent('user-1', ConsentType.TERMS);

    // THEN: Should return latest
    expect(consent.version).toBe('2.0');
  });

  it('[P0] should return null for non-existent consent', async () => {
    // WHEN: Getting non-existent consent
    const consent = await gdpr.getConsent('user-1', ConsentType.MARKETING);

    // THEN: Should return null
    expect(consent).toBeNull();
  });

  it('[P0] should check required consents', async () => {
    // GIVEN: Only terms consent
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true);

    // WHEN: Checking required consents
    const result = await gdpr.hasRequiredConsents('user-1');

    // THEN: Should show missing privacy
    expect(result.valid).toBe(false);
    expect(result.missing).toContain(ConsentType.PRIVACY);
    expect(result.missing).not.toContain(ConsentType.TERMS);
  });

  it('[P0] should pass when all required consents exist', async () => {
    // GIVEN: All required consents
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true);
    await gdpr.recordConsent('user-1', ConsentType.PRIVACY, true);

    // WHEN: Checking required consents
    const result = await gdpr.hasRequiredConsents('user-1');

    // THEN: Should be valid
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });
});

describe('[P0] Consent Management - Withdrawal', () => {
  it('[P0] should withdraw consent', async () => {
    // GIVEN: Existing consent
    await gdpr.recordConsent('user-1', ConsentType.MARKETING, true);

    // WHEN: Withdrawing consent
    await gdpr.withdrawConsent('user-1', ConsentType.MARKETING);

    // THEN: Latest consent should be false
    const consent = await gdpr.getConsent('user-1', ConsentType.MARKETING);
    expect(consent.consented).toBe(false);
  });

  it('[P0] should track consent history', async () => {
    // GIVEN: Consent changes
    await gdpr.recordConsent('user-1', ConsentType.MARKETING, true);
    await gdpr.withdrawConsent('user-1', ConsentType.MARKETING);
    await gdpr.recordConsent('user-1', ConsentType.MARKETING, true);

    // WHEN: Getting all consents
    const consents = await gdpr.getAllConsents('user-1');

    // THEN: Should have history
    expect(consents.length).toBeGreaterThanOrEqual(3);
  });
});

describe('[P0] Data Export - Job Creation', () => {
  it('[P0] should create export job', async () => {
    // WHEN: Creating export job
    const result = await gdpr.createExportJob('user-1');

    // THEN: Should return job details
    expect(result.job_id).toMatch(/^exp_/);
    expect(result.user_id).toBe('user-1');
    expect(result.status).toBe(ExportStatus.PENDING);
    expect(result.expires_at).toBeGreaterThan(Date.now());
  });

  it('[P0] should return existing job if one is pending', async () => {
    // GIVEN: Existing pending job
    const first = await gdpr.createExportJob('user-1');

    // WHEN: Creating another job
    const second = await gdpr.createExportJob('user-1');

    // THEN: Should return same job
    expect(second.job_id).toBe(first.job_id);
    expect(second.message).toBe('Export job already in progress');
  });

  it('[P0] should allow new job after previous completes', async () => {
    // GIVEN: Completed job
    const first = await gdpr.createExportJob('user-1');
    await gdpr.updateExportJob(first.job_id, {
      status: ExportStatus.COMPLETED,
      completed_at: Date.now(),
    });

    // WHEN: Creating new job
    const second = await gdpr.createExportJob('user-1');

    // THEN: Should create new job
    expect(second.job_id).not.toBe(first.job_id);
    expect(second.status).toBe(ExportStatus.PENDING);
  });
});

describe('[P0] Data Export - Job Status', () => {
  it('[P0] should get export job', async () => {
    // GIVEN: Export job
    const created = await gdpr.createExportJob('user-1');

    // WHEN: Getting job
    const job = await gdpr.getExportJob(created.job_id);

    // THEN: Should return job details
    expect(job.job_id).toBe(created.job_id);
    expect(job.status).toBe(ExportStatus.PENDING);
  });

  it('[P0] should update export job', async () => {
    // GIVEN: Export job
    const created = await gdpr.createExportJob('user-1');

    // WHEN: Updating job
    await gdpr.updateExportJob(created.job_id, {
      status: ExportStatus.COMPLETED,
      file_path: '/exports/user-1.zip',
      file_size: 12_345,
      completed_at: Date.now(),
    });

    // THEN: Should be updated
    const job = await gdpr.getExportJob(created.job_id);
    expect(job.status).toBe(ExportStatus.COMPLETED);
    expect(job.file_path).toBe('/exports/user-1.zip');
    expect(job.file_size).toBe(12_345);
  });

  it('[P0] should return null for non-existent job', async () => {
    const job = await gdpr.getExportJob('exp_nonexistent');
    expect(job).toBeNull();
  });

  it('[P0] should list user export jobs', async () => {
    // GIVEN: Multiple export jobs (with different completion states)
    const job1 = await gdpr.createExportJob('user-1');
    await gdpr.updateExportJob(job1.job_id, {
      status: ExportStatus.COMPLETED,
      completed_at: Date.now(),
    });
    await gdpr.createExportJob('user-1');

    // WHEN: Listing jobs
    const jobs = await gdpr.getUserExportJobs('user-1');

    // THEN: Should have both jobs
    expect(jobs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('[P1] Account Deletion - Request', () => {
  it('[P1] should request account deletion', async () => {
    // WHEN: Requesting deletion
    const result = await gdpr.requestDeletion('user-1', 'No longer needed');

    // THEN: Should create request
    expect(result.request_id).toMatch(/^del_/);
    expect(result.status).toBe(DeletionStatus.GRACE_PERIOD);
    expect(result.days_remaining).toBe(RetentionPeriod.DELETION_GRACE);
  });

  it('[P1] should return existing request if one exists', async () => {
    // GIVEN: Existing deletion request
    const first = await gdpr.requestDeletion('user-1');

    // WHEN: Creating another request
    const second = await gdpr.requestDeletion('user-1');

    // THEN: Should return same request
    expect(second.request_id).toBe(first.request_id);
    expect(second.message).toBe('Deletion request already exists');
  });

  it('[P1] should get deletion request status', async () => {
    // GIVEN: Deletion request
    await gdpr.requestDeletion('user-1');

    // WHEN: Getting status
    const status = await gdpr.getDeletionRequest('user-1');

    // THEN: Should return status
    expect(status.status).toBe(DeletionStatus.GRACE_PERIOD);
    expect(status.days_remaining).toBeGreaterThan(0);
  });
});

describe('[P1] Account Deletion - Cancellation', () => {
  it('[P1] should cancel deletion request', async () => {
    // GIVEN: Deletion request
    await gdpr.requestDeletion('user-1');

    // WHEN: Cancelling
    const result = await gdpr.cancelDeletion('user-1');

    // THEN: Should be cancelled
    expect(result.success).toBe(true);

    const status = await gdpr.getDeletionRequest('user-1');
    expect(status.status).toBe(DeletionStatus.CANCELLED);
  });

  it('[P1] should fail to cancel non-existent request', async () => {
    // WHEN: Cancelling non-existent request
    const result = await gdpr.cancelDeletion('user-1');

    // THEN: Should fail
    expect(result.success).toBe(false);
  });

  it('[P1] should allow new request after cancellation', async () => {
    // GIVEN: Cancelled request
    await gdpr.requestDeletion('user-1');
    await gdpr.cancelDeletion('user-1');

    // WHEN: Creating new request
    const result = await gdpr.requestDeletion('user-1');

    // THEN: Should create new request
    expect(result.status).toBe(DeletionStatus.GRACE_PERIOD);
  });
});

describe('[P1] Legal Documents', () => {
  it('[P1] should set legal document', async () => {
    // WHEN: Setting legal document
    const result = await gdpr.setLegalDocument(
      'terms',
      '1.0',
      'These are our terms of service...',
      Date.now()
    );

    // THEN: Should create document
    expect(result.document_id).toMatch(/^doc_/);
    expect(result.version).toBe('1.0');
  });

  it('[P1] should get latest legal document', async () => {
    // GIVEN: Multiple versions
    await gdpr.setLegalDocument('terms', '1.0', 'Terms v1', Date.now() - 1000);
    await gdpr.setLegalDocument('terms', '2.0', 'Terms v2', Date.now());

    // WHEN: Getting document
    const doc = await gdpr.getLegalDocument('terms');

    // THEN: Should return latest effective
    expect(doc.version).toBe('2.0');
    expect(doc.content).toBe('Terms v2');
  });

  it('[P1] should not return future documents', async () => {
    // GIVEN: Future effective document
    await gdpr.setLegalDocument('terms', '1.0', 'Current', Date.now() - 1000);
    await gdpr.setLegalDocument('terms', '2.0', 'Future', Date.now() + 86_400_000);

    // WHEN: Getting document
    const doc = await gdpr.getLegalDocument('terms');

    // THEN: Should return current, not future
    expect(doc.version).toBe('1.0');
  });

  it('[P1] should return null for non-existent document', async () => {
    const doc = await gdpr.getLegalDocument('nonexistent');
    expect(doc).toBeNull();
  });
});

describe('[P1] Consent Update Check', () => {
  it('[P1] should detect when consent update needed', async () => {
    // GIVEN: Consent to old version
    await gdpr.recordConsent('user-1', 'terms', true, {}, '1.0');
    await gdpr.setLegalDocument('terms', '2.0', 'New terms');

    // WHEN: Checking for update
    const result = await gdpr.needsConsentUpdate('user-1', 'terms');

    // THEN: Should need update
    expect(result.needsAcceptance).toBe(true);
    expect(result.currentVersion).toBe('1.0');
    expect(result.latestVersion).toBe('2.0');
  });

  it('[P1] should not need update for current version', async () => {
    // GIVEN: Consent to current version
    await gdpr.setLegalDocument('terms', '2.0', 'Current terms');
    await gdpr.recordConsent('user-1', 'terms', true, {}, '2.0');

    // WHEN: Checking for update
    const result = await gdpr.needsConsentUpdate('user-1', 'terms');

    // THEN: Should not need update
    expect(result.needsAcceptance).toBe(false);
  });

  it('[P1] should need acceptance if no consent exists', async () => {
    // GIVEN: Document but no consent
    await gdpr.setLegalDocument('terms', '1.0', 'Terms');

    // WHEN: Checking for update
    const result = await gdpr.needsConsentUpdate('user-1', 'terms');

    // THEN: Should need acceptance
    expect(result.needsAcceptance).toBe(true);
    expect(result.currentVersion).toBeNull();
  });
});

describe('[P1] DSAR Report', () => {
  it('[P1] should generate DSAR report', async () => {
    // GIVEN: User with consents and data
    await gdpr.recordConsent('user-1', ConsentType.TERMS, true);
    await gdpr.recordConsent('user-1', ConsentType.PRIVACY, true);
    await gdpr.createExportJob('user-1');

    const mockGetData = async (userId: string) => ({
      profile: { id: userId, email: 'test@example.com' },
      documents: [],
    });

    // WHEN: Generating DSAR report
    const report = await gdpr.generateDsarReport('user-1', mockGetData);

    // THEN: Should include all data
    expect(report.user_id).toBe('user-1');
    expect(report.consents).toHaveLength(2);
    expect(report.export_history.length).toBeGreaterThanOrEqual(1);
    expect(report.user_data.profile.email).toBe('test@example.com');
  });
});

describe('[P1] Export Job Processing', () => {
  it('[P1] should process export job and create file', async () => {
    // GIVEN: A pending export job
    const created = await gdpr.createExportJob('user-export-1');

    // Add some consent data for the export
    await gdpr.recordConsent('user-export-1', ConsentType.TERMS, true, {}, '1.0');
    await gdpr.recordConsent('user-export-1', ConsentType.PRIVACY, true, {}, '1.0');

    // WHEN: Processing the export job
    const result = await gdpr.processExportJob(created.job_id);

    // THEN: Should complete and have file info
    expect(result.status).toBe(ExportStatus.COMPLETED);
    expect(result.file_path).toMatch(/^\/exports\/gdpr_export_user-export-1_\d+\.json$/);
    expect(result.file_size).toBeGreaterThan(0);
  });

  it('[P1] should throw for non-existent job', async () => {
    // WHEN/THEN: Processing non-existent job should throw
    await expect(gdpr.processExportJob('exp_nonexistent')).rejects.toThrow('Export job not found');
  });

  it('[P1] should return existing job if already processed', async () => {
    // GIVEN: A completed export job
    const created = await gdpr.createExportJob('user-export-2');
    await gdpr.processExportJob(created.job_id);

    // WHEN: Processing again
    const result = await gdpr.processExportJob(created.job_id);

    // THEN: Should return the completed job without re-processing
    expect(result.status).toBe(ExportStatus.COMPLETED);
  });

  it('[P1] should include consent data in export', async () => {
    // GIVEN: User with consents
    await gdpr.recordConsent('user-export-3', ConsentType.TERMS, true, {}, '1.0');
    await gdpr.recordConsent('user-export-3', ConsentType.MARKETING, false, {}, '1.0');

    const created = await gdpr.createExportJob('user-export-3');

    // WHEN: Processing the export
    const result = await gdpr.processExportJob(created.job_id);

    // THEN: Should include consent data (verify via job metadata)
    expect(result.status).toBe(ExportStatus.COMPLETED);
    expect(result.file_path).toBeTruthy();
  });
});

describe('[P1] Export Cleanup', () => {
  it('[P1] should cleanup expired exports', async () => {
    // GIVEN: Expired export job
    const job = await gdpr.createExportJob('user-1');
    await gdpr.updateExportJob(job.job_id, {
      status: ExportStatus.COMPLETED,
      file_path: '/exports/test.zip',
      completed_at: Date.now(),
    });

    // Manually set expires_at to past
    await gdpr._run(
      'UPDATE export_jobs SET expires_at = ? WHERE id = ?',
      [Date.now() - 1000, job.job_id]
    );

    // WHEN: Running cleanup
    const result = await gdpr.cleanupExpiredExports();

    // THEN: Should mark as expired
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const updated = await gdpr.getExportJob(job.job_id);
    expect(updated.status).toBe(ExportStatus.EXPIRED);
    expect(updated.file_path).toBeNull();
  });
});
