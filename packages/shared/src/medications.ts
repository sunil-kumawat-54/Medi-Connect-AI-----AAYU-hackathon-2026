export type MedicationSlot = 'morning' | 'afternoon' | 'evening' | 'bedtime';

export type SlotStatus = 'TAKEN' | 'PENDING' | 'MISSED' | 'UPCOMING';

export interface MedicationReminderInfo {
  id: string;
  medication_id: string;
  slot: MedicationSlot;
  reminder_time: string; // HH:mm:ss
  days_of_week?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  label?: string;
  is_enabled: boolean;
}

export interface MedicationDoseLogInfo {
  id: string;
  medication_id: string;
  scheduled_date: string; // YYYY-MM-DD
  slot: MedicationSlot;
  taken_at: string; // ISO timestamp
  undone_at?: string | null;
}

export interface MedicationSlotState {
  slot: MedicationSlot;
  reminderTime: string;
  label?: string;
  status: SlotStatus;
  takenAtFormatted?: string;
  doseLogId?: string;
  canUndo: boolean;
}

export interface EvaluatedMedication {
  medicationId: string;
  name: string;
  dosage: string;
  frequency: string;
  foodTiming: string;
  isDueToday: boolean;
  nextDueText?: string;
  slots: MedicationSlotState[];
  allSlotsCompleted: boolean;
}

/**
 * Returns current date and time components in Asia/Kolkata (IST = UTC+05:30)
 */
export function getKolkataDateTime(date: Date = new Date()): {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  hours: number;
  minutes: number;
  dateString: string; // YYYY-MM-DD
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  let year = 1970;
  let month = 1;
  let day = 1;
  let hours = 0;
  let minutes = 0;

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    if (part.type === 'month') month = parseInt(part.value, 10);
    if (part.type === 'day') day = parseInt(part.value, 10);
    if (part.type === 'hour') hours = parseInt(part.value, 10);
    if (part.type === 'minute') minutes = parseInt(part.value, 10);
  }

  // Calculate dayOfWeek in Asia/Kolkata
  // Convert UTC timestamp to IST epoch
  const utcEpoch = date.getTime();
  const istEpoch = utcEpoch + (5 * 60 + 30) * 60 * 1000;
  const istDate = new Date(istEpoch);
  const dayOfWeek = istDate.getUTCDay();

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');

  return {
    year,
    month,
    day,
    dayOfWeek,
    hours,
    minutes,
    dateString: `${year}-${mm}-${dd}`,
  };
}

/**
 * Slot time windows in hours (24h) for Asia/Kolkata:
 * - morning: window ends at 12:00
 * - afternoon: window ends at 17:00
 * - evening: window ends at 21:00
 * - bedtime: window ends at 04:00 next day
 */
export const SLOT_WINDOW_END_HOURS: Record<MedicationSlot, number> = {
  morning: 12,
  afternoon: 17,
  evening: 21,
  bedtime: 28, // 04:00 next day (24 + 4)
};

export const SLOT_WINDOW_START_HOURS: Record<MedicationSlot, number> = {
  morning: 5,
  afternoon: 12,
  evening: 17,
  bedtime: 21,
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Evaluates the status of medication reminders and dose logs for a given local time in Asia/Kolkata.
 */
export function evaluateMedicationSlots(params: {
  medication: {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    food_timing?: string;
    is_active?: boolean;
  };
  reminders: MedicationReminderInfo[];
  doseLogs: MedicationDoseLogInfo[];
  currentDate?: Date; // Defaults to now
}): EvaluatedMedication {
  const { medication, reminders, doseLogs, currentDate = new Date() } = params;
  const kolkata = getKolkataDateTime(currentDate);
  const nowMs = currentDate.getTime();

  // Active reminders for this medication
  const medReminders = reminders.filter((r) => r.medication_id === medication.id && r.is_enabled);

  // Check if medication is due today based on days_of_week
  let isDueToday = true;
  let nextDueText: string | undefined;

  const weeklyReminder = medReminders.find((r) => r.days_of_week && r.days_of_week.length > 0 && r.days_of_week.length < 7);
  if (weeklyReminder && weeklyReminder.days_of_week) {
    isDueToday = weeklyReminder.days_of_week.includes(kolkata.dayOfWeek);
    if (!isDueToday) {
      // Find the next upcoming due day
      const dueDay = weeklyReminder.days_of_week[0];
      nextDueText = `Next due ${DAY_NAMES[dueDay]}`;
    }
  }

  if (!isDueToday) {
    return {
      medicationId: medication.id,
      name: medication.name,
      dosage: medication.dosage,
      frequency: medication.frequency,
      foodTiming: medication.food_timing || '',
      isDueToday: false,
      nextDueText,
      slots: [],
      allSlotsCompleted: false,
    };
  }

  // Order of slots
  const slotOrder: MedicationSlot[] = ['morning', 'afternoon', 'evening', 'bedtime'];
  const sortedReminders = [...medReminders].sort((a, b) => {
    return slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot);
  });

  const slots: MedicationSlotState[] = [];
  let foundPending = false;

  for (const rem of sortedReminders) {
    // Check if logged for today in Asia/Kolkata
    const activeLog = doseLogs.find(
      (log) =>
        log.medication_id === medication.id &&
        log.slot === rem.slot &&
        log.scheduled_date === kolkata.dateString &&
        !log.undone_at
    );

    if (activeLog) {
      // Taken! Check 10-minute undo window
      const takenMs = new Date(activeLog.taken_at).getTime();
      const canUndo = nowMs - takenMs <= 10 * 60 * 1000;

      const takenDate = new Date(activeLog.taken_at);
      const takenFormatted = takenDate.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
      });

      slots.push({
        slot: rem.slot,
        reminderTime: rem.reminder_time,
        label: rem.label,
        status: 'TAKEN',
        takenAtFormatted: takenFormatted,
        doseLogId: activeLog.id,
        canUndo,
      });
      continue;
    }

    // Not logged. Determine if Missed, Pending, or Upcoming
    const slotEnd = SLOT_WINDOW_END_HOURS[rem.slot];
    const slotStart = SLOT_WINDOW_START_HOURS[rem.slot];
    const currentHour = kolkata.hours;

    if (currentHour >= slotEnd) {
      // Window has passed without log -> MISSED
      slots.push({
        slot: rem.slot,
        reminderTime: rem.reminder_time,
        label: rem.label,
        status: 'MISSED',
        canUndo: false,
      });
    } else if (currentHour >= slotStart || !foundPending) {
      // Current slot is pending
      slots.push({
        slot: rem.slot,
        reminderTime: rem.reminder_time,
        label: rem.label,
        status: 'PENDING',
        canUndo: false,
      });
      foundPending = true;
    } else {
      // Future slot later today
      slots.push({
        slot: rem.slot,
        reminderTime: rem.reminder_time,
        label: rem.label,
        status: 'UPCOMING',
        canUndo: false,
      });
    }
  }

  const allSlotsCompleted = slots.length > 0 && slots.every((s) => s.status === 'TAKEN');

  return {
    medicationId: medication.id,
    name: medication.name,
    dosage: medication.dosage,
    frequency: medication.frequency,
    foodTiming: medication.food_timing || '',
    isDueToday: true,
    slots,
    allSlotsCompleted,
  };
}

/**
 * Computes patient age from date of birth (YYYY-MM-DD)
 */
export function computeAge(dateOfBirth: string | Date | null | undefined, referenceDate: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = typeof dateOfBirth === 'string' ? new Date(dateOfBirth) : dateOfBirth;
  if (isNaN(dob.getTime())) return null;

  let age = referenceDate.getFullYear() - dob.getFullYear();
  const m = referenceDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && referenceDate.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}
