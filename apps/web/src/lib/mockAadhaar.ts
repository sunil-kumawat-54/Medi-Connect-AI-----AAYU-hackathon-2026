/**
 * Medi Connect AI — Mock Aadhaar / ABHA Sandbox Authentication Provider
 * 
 * STRICT DISCLAIMER:
 * This is an experimental simulated sandbox adapter designed for hackathon prototype 
 * validation. It does NOT interface with UIDAI or official ABDM production servers.
 * Never supply authentic government identity numbers.
 */

export interface MockAadhaarAuthResult {
  success: boolean;
  mockAbhaId: string;
  fullName: string;
  maskedPhone: string;
  error?: string;
}

const MOCK_IDENTITIES: Record<string, { fullName: string; phone: string; email: string }> = {
  // Test Mock Aadhaar: 123412341234
  '123412341234': {
    fullName: 'Aarav Sharma (Demo Sandbox)',
    phone: 'XXXXXX3210',
    email: 'patient.aarav@mediconnect.demo',
  },
  // Test Mock Aadhaar: 987698769876
  '987698769876': {
    fullName: 'Sunita Verma (Demo Sandbox)',
    phone: 'XXXXXX3211',
    email: 'patient.sunita@mediconnect.demo',
  },
};

export async function requestMockOtp(aadhaarNumber: string): Promise<{ success: boolean; message: string }> {
  // Simulate network latency
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (aadhaarNumber.length !== 12 || !/^\d+$/.test(aadhaarNumber)) {
    return { success: false, message: 'Mock Aadhaar must consist of exactly 12 numeric digits.' };
  }

  return {
    success: true,
    message: `[SANDBOX NOTICE] Simulated OTP sent. For demonstration, use OTP: 123456`,
  };
}

export async function verifyMockOtp(aadhaarNumber: string, otp: string): Promise<MockAadhaarAuthResult> {
  await new Promise((resolve) => setTimeout(resolve, 600));

  if (otp !== '123456') {
    return {
      success: false,
      mockAbhaId: '',
      fullName: '',
      maskedPhone: '',
      error: 'Invalid simulated OTP. Enter demo OTP: 123456',
    };
  }

  const identity = MOCK_IDENTITIES[aadhaarNumber] || {
    fullName: 'Sandbox Demo Patient',
    phone: 'XXXXXX9999',
    email: `patient.${aadhaarNumber.slice(-4)}@mediconnect.demo`,
  };

  return {
    success: true,
    mockAbhaId: `${identity.fullName.toLowerCase().replace(/[^a-z]/g, '')}@abdm-sandbox`,
    fullName: identity.fullName,
    maskedPhone: identity.phone,
  };
}
