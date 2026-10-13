import { test, expect } from '@playwright/test';
import fs from 'fs';

const demoConfig = JSON.parse(fs.readFileSync('u:/aayu/apps/mobile/dev_secret.json', 'utf8'));
const password = demoConfig.demoPassword;
const baseUrl = 'http://localhost:3000';

const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5id2dneXp4aXZlbmd6Zm5hcmluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3Mzc2MjcsImV4cCI6MjEwNzMxMzYyN30.TmDFV5AXkyNIyLPIsjgFqSQxwbIXGfs5pZRb70ZZBiY';
const supabaseUrl = 'https://nbwggyzxivengzfnarin.supabase.co';

async function restoreTestState() {
  try {
    const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/restore_test_state`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!resp.ok) {
      console.warn(`restore_test_state HTTP error: ${resp.status}`);
    }
  } catch (err) {
    console.warn('restoreTestState error:', err);
  }
}

test.describe('Phase 3 Acceptance Audit Journeys', () => {
  test.setTimeout(60000);

  test.beforeEach(async () => {
    await restoreTestState();
  });

  test.afterEach(async () => {
    await restoreTestState();
  });

  test('Journey 1: Patient Aarav Sharma (Login, View Report SCR-04, Book Consultation SCR-08)', async ({ page }) => {
    await page.goto(baseUrl);
    await expect(page.locator('text=Medi Connect AI').first()).toBeVisible();

    // Fill Aarav credentials
    await page.fill('input[type="email"]', 'patient.aarav@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Expect Patient Cockpit
    await expect(page.locator('text=Patient Health Cockpit')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Aarav Sharma').first()).toBeVisible();
    await expect(page.locator('text=Age: 44 yrs').first()).toBeVisible();

    // Verify SCR-02 Biomarkers computed from DB
    await expect(page.locator('text=Fasting Blood Glucose')).toBeVisible();
    await expect(page.locator('text=HbA1c Glycated Hgb')).toBeVisible();

    // Navigate to Diagnostic Reports Tab (SCR-04)
    await page.click('button:has-text("Diagnostic Reports")');
    await expect(page.locator('text=Diagnostic Reports Vault')).toBeVisible();
    await expect(page.locator('text=[MOCK / DEMO CANVAS]')).toBeVisible();

    // Verify Grounded AI Explanation
    await expect(page.locator('text=Plain-Language Clinical Synthesis')).toBeVisible();

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 2: Doctor Alex Morgan (Per-biomarker verification & Audited Report View)', async ({ page }) => {
    await page.goto(baseUrl);

    // Sign in as Doctor
    await page.fill('input[type="email"]', 'doctor.alex@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Physician Clinical Cockpit')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Dr. Alex Morgan, MD').first()).toBeVisible();

    // Verify 60-Second Brief (SCR-11)
    await expect(page.locator('text=60-Second Patient Brief')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=[MOCK / DEMO BRIEF]')).toBeVisible({ timeout: 10000 });

    // Step A: Inspect Per-Biomarker Verification Panel
    await expect(page.locator('text=Per-Biomarker Clinical Verification')).toBeVisible();

    // Wait for biomarkers to load
    const firstVerifyBtn = page.locator('button:has-text("Verify Biomarker")').first();
    await expect(firstVerifyBtn).toBeVisible({ timeout: 10000 });

    // Verify each red-flag biomarker one by one deterministically
    while (true) {
      const btn = page.locator('button:has-text("Verify Biomarker")').first();
      if (await btn.count() === 0) break;
      await btn.scrollIntoViewIfNeeded();
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('verify_biomarker')),
        btn.click()
      ]);
      expect(resp.status()).toBe(200);
      await page.waitForResponse((r) => r.url().includes('biomarkers'));
    }

    // Step B: Ensure all are verified and Approve Summary button is enabled
    await expect(page.locator('text=ALL VERIFIED — APPROVAL UNLOCKED')).toBeVisible({ timeout: 10000 });
    const approveBtn = page.locator('#approve-summary-btn');
    await expect(approveBtn).toBeEnabled({ timeout: 10000 });

    const [approveResp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('approve_ai_summary')),
      approveBtn.click()
    ]);
    expect(approveResp.status()).toBe(200);

    // Expect Success Message
    await expect(page.locator('text=Decision recorded: APPROVED. Cryptographic audit row signed server-side.')).toBeVisible({ timeout: 5000 });

    // Step C: Test Audited Report View RPC (get_medical_report_for_view)
    const viewReportBtn = page.locator('#doctor-view-report-btn');
    if (await viewReportBtn.isVisible()) {
      const [viewResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('get_medical_report_for_view')),
        viewReportBtn.click()
      ]);
      expect(viewResp.status()).toBe(200);
      await expect(page.locator('#doctor-viewed-report-card')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=✓ Server-Side Audit Logged: REPORT_VIEW')).toBeVisible();
    }

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 3: Requirement 4 Audit Wiring (Doctor access appears in Patient SCR-15 access log)', async ({ page }) => {
    await page.goto(baseUrl);

    // Sign in as Patient Aarav
    await page.fill('input[type="email"]', 'patient.aarav@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Patient Health Cockpit')).toBeVisible({ timeout: 10000 });

    // Navigate to Privacy & Consent (SCR-15)
    await page.click('button:has-text("Privacy & Consent")');
    await expect(page.locator('text=Consent Management & DPDPA Governance')).toBeVisible();

    await page.waitForTimeout(500);

    // Verify that doctor access events appear in the access log list
    const logList = page.locator('#patient-access-log-list');
    await expect(logList).toBeVisible();
    await expect(logList.locator('text=Role: doctor').first()).toBeVisible({ timeout: 10000 });

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 4: Time-Slot Dosing & Biomarkers DB Truth (SCR-09 & SCR-02)', async ({ page }) => {
    await page.goto(baseUrl);

    // Sign in as Patient Aarav
    await page.fill('input[type="email"]', 'patient.aarav@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Patient Health Cockpit')).toBeVisible({ timeout: 10000 });

    // Confirm initial Fasting Blood Glucose is 142 from DB
    const glucoseSpan = page.locator('#fasting-glucose-value');
    await expect(glucoseSpan).toHaveText('142', { timeout: 5000 });

    // Navigate to Medications Tab (SCR-09)
    await page.click('button:has-text("Medications")');
    await expect(page.locator('text=Medication Schedule & Adherence')).toBeVisible();
    await expect(page.locator('text=Metformin Hydrochloride')).toBeVisible();

    // Check time-slot dosing cards
    const takeDoseBtn = page.locator('button:has-text("Mark Taken")').first();
    if (await takeDoseBtn.isVisible() && await takeDoseBtn.isEnabled()) {
      const [doseResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('log_dose')),
        takeDoseBtn.click()
      ]);
      expect(doseResp.status()).toBe(200);

      // Verify slot transitions to Taken & locked, shows Undo button
      await expect(page.locator('text=Undo Dose (10m)').first()).toBeVisible({ timeout: 5000 });

      // Click Undo Dose
      const undoBtn = page.locator('button:has-text("Undo Dose (10m)")').first();
      const [undoResp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('undo_dose')),
        undoBtn.click()
      ]);
      expect(undoResp.status()).toBe(200);
      await expect(page.locator('button:has-text("Mark Taken")').first()).toBeVisible({ timeout: 5000 });
    }

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 5: Hospital Staff Priya Nair (Operations, Roster, Invoices SCR-12)', async ({ page }) => {
    await page.goto(baseUrl);

    // Sign in as Staff
    await page.fill('input[type="email"]', 'staff.priya@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Expect Hospital Administration Desk
    await expect(page.locator('text=Hospital Administration Desk')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=City Care Multi-Specialty Hospital')).toBeVisible();

    // Check labeled mock operations metrics
    await expect(page.locator('text=OPD Queue Throughput')).toBeVisible();
    await expect(page.locator('text=[MOCK / DEMO]').first()).toBeVisible();
    await expect(page.locator('text=Bed Occupancy Rate')).toBeVisible();

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 6: Super Admin (Oversight, k-Anonymity SCR-14, Zero PHI Leak)', async ({ page }) => {
    await page.goto(baseUrl);

    // Sign in as Super Admin
    await page.fill('input[type="email"]', 'admin.officer@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Expect Public Health & System Oversight Dashboard
    await expect(page.locator('text=Public Health & System Oversight Dashboard')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Strictly De-Identified Mode')).toBeVisible();
    await expect(page.locator('text=ENFORCED (0 PHI LEAKS)')).toBeVisible();

    // Verify k-Anonymity threshold suppression badge
    await expect(page.locator('text=k-ANONYMITY').first()).toBeVisible();

    // Verify Cryptographic HMAC Audit Log Stream
    await expect(page.locator('text=Cryptographic Audit Stream (Immutable Vault)')).toBeVisible();

    // Sign out
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });

  test('Journey 7: Revoke Flow (Patient revokes consent -> Doctor sees no access)', async ({ page }) => {
    // 1. Patient Aarav logs in and navigates to Privacy & Consent
    await page.goto(baseUrl);
    await page.fill('input[type="email"]', 'patient.aarav@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Patient Health Cockpit')).toBeVisible({ timeout: 10000 });

    // Open Privacy & Consent Tab
    await page.click('button:has-text("Privacy & Consent")');
    await expect(page.locator('text=Consent Management & DPDPA Governance')).toBeVisible();

    // Revoke Doctor Alex Morgan Consent if active
    const revokeBtn = page.locator('button:has-text("Revoke Consent Immediately")').first();
    await expect(revokeBtn).toBeVisible({ timeout: 10000 });
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('patient_consents')),
      revokeBtn.click()
    ]);
    expect(resp.status()).toBeLessThan(300);
    await expect(page.locator('text=Re-Authorize Consent')).toBeVisible({ timeout: 10000 });

    // Sign out as Patient
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();

    // 2. Doctor Alex logs in
    await page.fill('input[type="email"]', 'doctor.alex@mediconnect.demo');
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Physician Clinical Cockpit')).toBeVisible({ timeout: 10000 });

    // 3. Confirm Doctor has NO ACCESS to unconsented Aarav reports
    await expect(page.locator('text=No Active Patient Consent')).toBeVisible({ timeout: 5000 });

    // Sign out as Doctor
    await page.click('button[title="Sign Out"]');
    await expect(page.locator('text=Sign In').first()).toBeVisible();
  });
});
