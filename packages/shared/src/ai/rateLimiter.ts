export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedName?: string;
  fileSizeBytes: number;
  mimeType: string;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const MAX_UPLOAD_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MAX_ALLOWED_PAGES = 5;
export const MAX_DAILY_EXTRACTIONS_PER_PATIENT = 5;
export const MAX_HOURLY_CHAT_MESSAGES_PER_USER = 30;

/**
 * Validates file upload before processing
 */
export function validateUploadFile(params: {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  pageCount?: number;
}): FileValidationResult {
  const { fileName, fileSizeBytes, mimeType, pageCount = 1 } = params;

  // 1. File size check
  if (fileSizeBytes <= 0) {
    return {
      isValid: false,
      error: 'File is empty (0 bytes). Please upload a valid laboratory report.',
      fileSizeBytes,
      mimeType,
    };
  }

  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return {
      isValid: false,
      error: `File size exceeds the 15 MB limit (Uploaded: ${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MB).`,
      fileSizeBytes,
      mimeType,
    };
  }

  // 2. MIME type check
  if (!ALLOWED_MIME_TYPES.includes(mimeType.toLowerCase())) {
    return {
      isValid: false,
      error: `Unsupported file type (${mimeType}). Only PDF documents and JPG/PNG/WebP images are accepted.`,
      fileSizeBytes,
      mimeType,
    };
  }

  // 3. Page count check
  if (pageCount > MAX_ALLOWED_PAGES) {
    return {
      isValid: false,
      error: `Document exceeds maximum allowed limit of ${MAX_ALLOWED_PAGES} pages (Uploaded: ${pageCount} pages).`,
      fileSizeBytes,
      mimeType,
    };
  }

  // Sanitize file name
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');

  return {
    isValid: true,
    sanitizedName,
    fileSizeBytes,
    mimeType,
  };
}

/**
 * In-memory / cache rate limiter state for budget and extraction quotas
 */
interface RateLimitBucket {
  patientId: string;
  extractionsToday: number;
  lastExtractionResetTimestamp: number;
  chatMessagesThisHour: number;
  lastChatResetTimestamp: number;
  tokensConsumedThisMonth: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

export function checkAndIncrementRateLimit(
  userId: string,
  type: 'EXTRACTION' | 'CHAT',
  nowMs: number = Date.now()
): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
  error?: string;
} {
  let bucket = rateLimitBuckets.get(userId);
  if (!bucket) {
    bucket = {
      patientId: userId,
      extractionsToday: 0,
      lastExtractionResetTimestamp: nowMs,
      chatMessagesThisHour: 0,
      lastChatResetTimestamp: nowMs,
      tokensConsumedThisMonth: 0,
    };
    rateLimitBuckets.set(userId, bucket);
  }

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const ONE_HOUR_MS = 60 * 60 * 1000;

  if (type === 'EXTRACTION') {
    if (nowMs - bucket.lastExtractionResetTimestamp >= ONE_DAY_MS) {
      bucket.extractionsToday = 0;
      bucket.lastExtractionResetTimestamp = nowMs;
    }

    if (bucket.extractionsToday >= MAX_DAILY_EXTRACTIONS_PER_PATIENT) {
      const resetInSeconds = Math.ceil(
        (bucket.lastExtractionResetTimestamp + ONE_DAY_MS - nowMs) / 1000
      );
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds,
        error: `Daily processing quota exceeded (${MAX_DAILY_EXTRACTIONS_PER_PATIENT} reports/day). Resets in ${Math.round(resetInSeconds / 60)} minutes.`,
      };
    }

    bucket.extractionsToday++;
    return {
      allowed: true,
      remaining: MAX_DAILY_EXTRACTIONS_PER_PATIENT - bucket.extractionsToday,
      resetInSeconds: Math.ceil(
        (bucket.lastExtractionResetTimestamp + ONE_DAY_MS - nowMs) / 1000
      ),
    };
  }

  // CHAT
  if (nowMs - bucket.lastChatResetTimestamp >= ONE_HOUR_MS) {
    bucket.chatMessagesThisHour = 0;
    bucket.lastChatResetTimestamp = nowMs;
  }

  if (bucket.chatMessagesThisHour >= MAX_HOURLY_CHAT_MESSAGES_PER_USER) {
    const resetInSeconds = Math.ceil(
      (bucket.lastChatResetTimestamp + ONE_HOUR_MS - nowMs) / 1000
    );
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds,
      error: `Hourly chat limit reached (${MAX_HOURLY_CHAT_MESSAGES_PER_USER} messages/hr). Resets in ${Math.round(resetInSeconds / 60)} minutes.`,
    };
  }

  bucket.chatMessagesThisHour++;
  return {
    allowed: true,
    remaining: MAX_HOURLY_CHAT_MESSAGES_PER_USER - bucket.chatMessagesThisHour,
    resetInSeconds: Math.ceil(
      (bucket.lastChatResetTimestamp + ONE_HOUR_MS - nowMs) / 1000
    ),
  };
}
