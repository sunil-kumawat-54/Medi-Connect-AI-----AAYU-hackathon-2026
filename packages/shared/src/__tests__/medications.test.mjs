import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateMedicationSlots,
  computeAge,
  getKolkataDateTime,
} from '../../dist/medications.js';

describe('Medications Due-Slot Computation & Age Utilities', () => {
  // Test patient age computation
  describe('computeAge', () => {
    it('computes correct age for Aarav Sharma (DOB: 1982-05-14) in Oct 2026 -> 44', () => {
      const refDate = new Date('2026-10-12T12:00:00Z');
      assert.equal(computeAge('1982-05-14', refDate), 44);
    });

    it('computes correct age on day before birthday', () => {
      // Born 1982-05-14, reference is 2026-05-13 (day before 44th birthday) -> 43
      const refDate = new Date('2026-05-13T12:00:00Z');
      assert.equal(computeAge('1982-05-14', refDate), 43);
    });

    it('computes correct age on day of birthday', () => {
      // Born 1982-05-14, reference is 2026-05-14 (day of 44th birthday) -> 44
      const refDate = new Date('2026-05-14T12:00:00Z');
      assert.equal(computeAge('1982-05-14', refDate), 44);
    });

    it('computes correct age on day after birthday', () => {
      // Born 1982-05-14, reference is 2026-05-15 (day after 44th birthday) -> 44
      const refDate = new Date('2026-05-15T12:00:00Z');
      assert.equal(computeAge('1982-05-14', refDate), 44);
    });

    it('computes correct age for leap-day birth (2000-02-29)', () => {
      // Leap year birthday: 2024-02-29 -> 24
      assert.equal(computeAge('2000-02-29', new Date('2024-02-29T12:00:00Z')), 24);
      // Non-leap year before March 1: 2025-02-28 -> 24
      assert.equal(computeAge('2000-02-29', new Date('2025-02-28T12:00:00Z')), 24);
      // Non-leap year on March 1: 2025-03-01 -> 25
      assert.equal(computeAge('2000-02-29', new Date('2025-03-01T12:00:00Z')), 25);
    });

    it('computes correct age for Sunita Verma (DOB: 1974-08-20) in Oct 2026 -> 52', () => {
      const refDate = new Date('2026-10-12T12:00:00Z');
      assert.equal(computeAge('1974-08-20', refDate), 52);
    });

    it('returns null on missing or invalid DOB', () => {
      assert.equal(computeAge(null), null);
      assert.equal(computeAge('invalid-date'), null);
    });
  });

  // Test Asia/Kolkata timezone handling
  describe('getKolkataDateTime', () => {
    it('converts UTC to Asia/Kolkata (+05:30) correctly across midnight boundary', () => {
      // 2026-10-12 19:00:00 UTC is 2026-10-13 00:30:00 IST (Next day!)
      const utcDate = new Date('2026-10-12T19:00:00Z');
      const kolkata = getKolkataDateTime(utcDate);
      assert.equal(kolkata.dateString, '2026-10-13');
      assert.equal(kolkata.hours, 0);
      assert.equal(kolkata.minutes, 30);
    });

    it('remains same day when UTC is early afternoon', () => {
      // 2026-10-12 04:00:00 UTC is 2026-10-12 09:30:00 IST
      const utcDate = new Date('2026-10-12T04:00:00Z');
      const kolkata = getKolkataDateTime(utcDate);
      assert.equal(kolkata.dateString, '2026-10-12');
      assert.equal(kolkata.hours, 9);
      assert.equal(kolkata.minutes, 30);
    });
  });

  // Test Twice-daily medication (Metformin)
  describe('Twice-daily medication (Metformin 500mg)', () => {
    const metformin = {
      id: 'f8000000-0000-0000-0000-000000000001',
      name: 'Metformin Hydrochloride',
      dosage: '500 mg',
      frequency: 'Twice daily',
      food_timing: 'WITH_FOOD',
    };

    const reminders = [
      {
        id: 'rem-morn',
        medication_id: metformin.id,
        slot: 'morning',
        reminder_time: '08:00:00',
        label: 'Morning with breakfast',
        is_enabled: true,
      },
      {
        id: 'rem-eve',
        medication_id: metformin.id,
        slot: 'evening',
        reminder_time: '20:00:00',
        label: 'Evening with dinner',
        is_enabled: true,
      },
    ];

    it('shows morning pending at 08:30 IST when not taken yet', () => {
      // 2026-10-12 03:00 UTC = 08:30 IST
      const current = new Date('2026-10-12T03:00:00Z');
      const res = evaluateMedicationSlots({
        medication: metformin,
        reminders,
        doseLogs: [],
        currentDate: current,
      });

      assert.equal(res.isDueToday, true);
      assert.equal(res.slots.length, 2);
      assert.equal(res.slots[0].slot, 'morning');
      assert.equal(res.slots[0].status, 'PENDING');
      assert.equal(res.slots[1].slot, 'evening');
      assert.equal(res.slots[1].status, 'UPCOMING');
      assert.equal(res.allSlotsCompleted, false);
    });

    it('locks morning as TAKEN after log and sets evening as pending', () => {
      // 2026-10-12 03:05 UTC = 08:35 IST
      const current = new Date('2026-10-12T03:05:00Z');
      const logs = [
        {
          id: 'log-1',
          medication_id: metformin.id,
          scheduled_date: '2026-10-12',
          slot: 'morning',
          taken_at: '2026-10-12T03:02:00Z',
        },
      ];

      const res = evaluateMedicationSlots({
        medication: metformin,
        reminders,
        doseLogs: logs,
        currentDate: current,
      });

      assert.equal(res.slots[0].status, 'TAKEN');
      assert.equal(res.slots[0].canUndo, true); // Within 10 min
      assert.equal(res.slots[1].status, 'PENDING');
      assert.equal(res.allSlotsCompleted, false);
    });

    it('disables undo after 10 minutes from taken_at', () => {
      // Current is 15 minutes after taken_at
      const current = new Date('2026-10-12T03:20:00Z');
      const logs = [
        {
          id: 'log-1',
          medication_id: metformin.id,
          scheduled_date: '2026-10-12',
          slot: 'morning',
          taken_at: '2026-10-12T03:02:00Z', // 18 mins ago
        },
      ];

      const res = evaluateMedicationSlots({
        medication: metformin,
        reminders,
        doseLogs: logs,
        currentDate: current,
      });

      assert.equal(res.slots[0].status, 'TAKEN');
      assert.equal(res.slots[0].canUndo, false);
    });

    it('marks morning slot as MISSED if window passed (e.g. at 14:00 IST)', () => {
      // 2026-10-12 08:30 UTC = 14:00 IST
      const current = new Date('2026-10-12T08:30:00Z');
      const res = evaluateMedicationSlots({
        medication: metformin,
        reminders,
        doseLogs: [],
        currentDate: current,
      });

      assert.equal(res.slots[0].slot, 'morning');
      assert.equal(res.slots[0].status, 'MISSED');
      assert.equal(res.slots[1].slot, 'evening');
      assert.equal(res.slots[1].status, 'PENDING');
    });
  });

  // Test Weekly Medication (Vitamin D3)
  describe('Weekly medication (Vitamin D3 on Sunday)', () => {
    const vitaminD3 = {
      id: 'f8000000-0000-0000-0000-000000000004',
      name: 'Vitamin D3 (Cholecalciferol)',
      dosage: '60,000 IU',
      frequency: 'Weekly (Sunday)',
      food_timing: 'AFTER_FOOD',
    };

    const reminders = [
      {
        id: 'rem-vitd',
        medication_id: vitaminD3.id,
        slot: 'morning',
        reminder_time: '09:00:00',
        days_of_week: [0], // 0 = Sunday
        label: 'Sunday morning after breakfast',
        is_enabled: true,
      },
    ];

    it('shows next due Sunday when evaluated on Monday (2026-10-12)', () => {
      // 2026-10-12 is Monday in IST
      const monday = new Date('2026-10-12T06:00:00Z');
      const res = evaluateMedicationSlots({
        medication: vitaminD3,
        reminders,
        doseLogs: [],
        currentDate: monday,
      });

      assert.equal(res.isDueToday, false);
      assert.equal(res.nextDueText, 'Next due Sunday');
      assert.equal(res.slots.length, 0);
    });

    it('appears with morning slot when evaluated on Sunday (2026-10-18)', () => {
      // 2026-10-18 is Sunday
      const sunday = new Date('2026-10-18T04:00:00Z'); // 09:30 IST
      const res = evaluateMedicationSlots({
        medication: vitaminD3,
        reminders,
        doseLogs: [],
        currentDate: sunday,
      });

      assert.equal(res.isDueToday, true);
      assert.equal(res.slots.length, 1);
      assert.equal(res.slots[0].slot, 'morning');
      assert.equal(res.slots[0].status, 'PENDING');
    });
  });

  // Test Midnight boundary rotation
  describe('Midnight boundary rotation in Asia/Kolkata', () => {
    const atorvastatin = {
      id: 'f8000000-0000-0000-0000-000000000003',
      name: 'Atorvastatin',
      dosage: '10 mg',
      frequency: 'Once daily (Bedtime)',
      food_timing: 'BEFORE_FOOD',
    };

    const reminders = [
      {
        id: 'rem-bed',
        medication_id: atorvastatin.id,
        slot: 'bedtime',
        reminder_time: '22:00:00',
        label: 'Bedtime with water',
        is_enabled: true,
      },
    ];

    it('resets today slots when date turns midnight in Asia/Kolkata', () => {
      // Yesterday logged
      const logs = [
        {
          id: 'log-yesterday',
          medication_id: atorvastatin.id,
          scheduled_date: '2026-10-12',
          slot: 'bedtime',
          taken_at: '2026-10-12T16:30:00Z', // 22:00 IST on 12th
        },
      ];

      // Current time is 2026-10-13 00:05 IST (2026-10-12 18:35 UTC)
      const justPastMidnight = new Date('2026-10-12T18:35:00Z');
      const res = evaluateMedicationSlots({
        medication: atorvastatin,
        reminders,
        doseLogs: logs,
        currentDate: justPastMidnight,
      });

      // Today is 2026-10-13: yesterday's log does NOT satisfy today's slot!
      assert.equal(res.slots[0].status, 'PENDING');
      assert.equal(res.allSlotsCompleted, false);
    });
  });
});
