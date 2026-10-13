import { MANDATORY_CLINICAL_DISCLAIMER } from './safetyAndGrounding.js';

export interface PatientLabContext {
  patientName: string;
  recentBiomarkers?: Array<{
    name: string;
    value: string;
    unit: string;
    severity: string;
  }>;
}

export interface AssistantChatReply {
  text: string;
  isRefusal: boolean;
  refusalReason?: 'DIAGNOSIS_REQUEST' | 'PRESCRIPTION_REQUEST' | 'EMERGENCY_ESCALATION' | 'UNSUPPORTED_FREEFORM';
  citations?: Array<{ label: string; value: string }>;
}

export const FIXED_CHAT_MENU_PROMPTS = [
  { id: 'explain_glucose', prompt: 'Explain my glucose and HbA1c levels' },
  { id: 'explain_lipids', prompt: 'Explain my lipid profile (Cholesterol, HDL, LDL, Triglycerides)' },
  { id: 'explain_thyroid', prompt: 'Explain my thyroid markers (TSH, Free T4)' },
  { id: 'explain_cbc', prompt: 'Explain my Complete Blood Count (CBC, Hemoglobin, Platelets)' },
  { id: 'prepare_doctor_visit', prompt: 'What questions should I ask my doctor about these results?' },
  { id: 'emergency_guidance', prompt: 'What should I do if I feel severe symptoms?' },
];

/**
 * Healthcare-safety-minded rule-based chatbot handler.
 * Strictly answers from grounded deterministic templates; NO LLM used.
 * Enforces refusal of diagnostic and prescribing queries and provides 112/108 emergency escalation.
 */
export function processAssistantChatQuery(
  userQuery: string,
  context: PatientLabContext
): AssistantChatReply {
  const queryLower = userQuery.toLowerCase().trim();

  // 1. Emergency Acute Symptoms Escalation
  const emergencyKeywords = [
    'chest pain',
    'heart attack',
    'cannot breathe',
    'shortness of breath',
    'passed out',
    'unconscious',
    'severe bleeding',
    'coughing blood',
    'severe symptoms',
  ];
  if (emergencyKeywords.some((kw) => queryLower.includes(kw))) {
    return {
      text: `🚨 **EMERGENCY WARNING**: Your message mentions symptoms that may indicate a medical emergency. 

Please **call 112 or 108 immediately**, or go to the nearest hospital emergency department. Do not wait for an online response.

${MANDATORY_CLINICAL_DISCLAIMER}`,
      isRefusal: true,
      refusalReason: 'EMERGENCY_ESCALATION',
    };
  }

  // 2. Prescription / Drug Dosage Refusal
  const prescriptionKeywords = [
    'what medicine',
    'prescribe',
    'which tablet',
    'what dose',
    'dosage',
    'should i take',
    'can i take',
    'change my medicine',
    'stop taking',
    'start taking',
  ];
  if (prescriptionKeywords.some((kw) => queryLower.includes(kw))) {
    return {
      text: `⚠️ **Prescription & Medication Safety Refusal**:

As a rule-based health assistant, I am **strictly prohibited from prescribing medications, altering dosages, or recommending specific drugs**. Prescribing requires clinical examination and licensed medical judgment.

Please contact your treating physician or consult during your next OPD appointment to discuss your medication schedule safely.

${MANDATORY_CLINICAL_DISCLAIMER}`,
      isRefusal: true,
      refusalReason: 'PRESCRIPTION_REQUEST',
    };
  }

  // 3. Diagnosis Request Refusal
  const diagnosisKeywords = [
    'do i have',
    'diagnose me',
    'what disease',
    'is it cancer',
    'do i suffer from',
    'am i diabetic',
    'tell me my diagnosis',
  ];
  if (diagnosisKeywords.some((kw) => queryLower.includes(kw))) {
    let labNote = '';
    if (context.recentBiomarkers && context.recentBiomarkers.length > 0) {
      const abnormal = context.recentBiomarkers.filter((b) => b.severity !== 'NORMAL');
      if (abnormal.length > 0) {
        labNote = `\n\nFor educational context, your recent report showed: ${abnormal.map((b) => `${b.name} (${b.value} ${b.unit})`).join(', ')}. These laboratory markers require a doctor's clinical correlation.`;
      }
    }

    return {
      text: `⚠️ **Diagnostic Evaluation Policy**:

I cannot provide a medical diagnosis. Diagnostic determinations require clinical history, physical examination, and holistic clinical evaluation by a qualified doctor.${labNote}

I can help explain the meaning of your laboratory reference ranges using rule-based templates or prepare questions for your upcoming doctor consultation.

${MANDATORY_CLINICAL_DISCLAIMER}`,
      isRefusal: true,
      refusalReason: 'DIAGNOSIS_REQUEST',
    };
  }

  // 4. Grounded Template Menu Responses (No LLM, strictly deterministic)
  const citations: Array<{ label: string; value: string }> = [];
  let responseBody = '';

  if (queryLower.includes('glucose') || queryLower.includes('sugar') || queryLower.includes('hba1c')) {
    const glucose = context.recentBiomarkers?.find((b) => b.name.toLowerCase().includes('glucose'));
    const hba1c = context.recentBiomarkers?.find((b) => b.name.toLowerCase().includes('hba1c'));

    responseBody = `Hello ${context.patientName}. Here is the rule-based explanation for your glycemic markers:\n\n`;
    if (glucose) {
      responseBody += `• **Fasting Blood Glucose**: Documented at **${glucose.value} ${glucose.unit}** (Normal fasting interval: 70–100 mg/dL; Severity: ${glucose.severity}).\n`;
      citations.push({ label: 'Fasting Blood Glucose', value: `${glucose.value} ${glucose.unit}` });
    }
    if (hba1c) {
      responseBody += `• **HbA1c**: Documented at **${hba1c.value} ${hba1c.unit}** (Screening reference: < 5.7%; Glycemic target: < 7.0%; Severity: ${hba1c.severity}).\n`;
      citations.push({ label: 'HbA1c', value: `${hba1c.value} ${hba1c.unit}` });
    }
    if (!glucose && !hba1c) {
      responseBody += `No recent Glucose or HbA1c markers were identified in your active record.\n`;
    }
    responseBody += `\n*Note: This is a rule-based explanation derived from laboratory reference ranges. No language model was used.*`;
  } else if (queryLower.includes('lipid') || queryLower.includes('cholesterol') || queryLower.includes('triglyceride')) {
    const lipids = context.recentBiomarkers?.filter((b) =>
      ['cholesterol', 'triglycerides', 'hdl', 'ldl'].some((k) => b.name.toLowerCase().includes(k))
    ) || [];

    responseBody = `Hello ${context.patientName}. Here is the rule-based explanation for your lipid markers:\n\n`;
    if (lipids.length > 0) {
      lipids.forEach((l) => {
        responseBody += `• **${l.name}**: **${l.value} ${l.unit}** (Status: ${l.severity})\n`;
        citations.push({ label: l.name, value: `${l.value} ${l.unit}` });
      });
    } else {
      responseBody += `No recent lipid parameters were identified in your active record.\n`;
    }
    responseBody += `\n*Note: This is a rule-based explanation derived from laboratory reference ranges. No language model was used.*`;
  } else if (queryLower.includes('thyroid') || queryLower.includes('tsh') || queryLower.includes('t4')) {
    const thyroids = context.recentBiomarkers?.filter((b) =>
      ['tsh', 'thyroid', 't4'].some((k) => b.name.toLowerCase().includes(k))
    ) || [];

    responseBody = `Hello ${context.patientName}. Here is the rule-based explanation for your thyroid markers:\n\n`;
    if (thyroids.length > 0) {
      thyroids.forEach((t) => {
        responseBody += `• **${t.name}**: **${t.value} ${t.unit}** (Status: ${t.severity})\n`;
        citations.push({ label: t.name, value: `${t.value} ${t.unit}` });
      });
    } else {
      responseBody += `No recent thyroid parameters were identified in your active record.\n`;
    }
    responseBody += `\n*Note: This is a rule-based explanation derived from laboratory reference ranges. No language model was used.*`;
  } else if (queryLower.includes('cbc') || queryLower.includes('hemoglobin') || queryLower.includes('platelet')) {
    const cbcs = context.recentBiomarkers?.filter((b) =>
      ['hemoglobin', 'platelet', 'wbc', 'rbc'].some((k) => b.name.toLowerCase().includes(k))
    ) || [];

    responseBody = `Hello ${context.patientName}. Here is the rule-based explanation for your Complete Blood Count:\n\n`;
    if (cbcs.length > 0) {
      cbcs.forEach((c) => {
        responseBody += `• **${c.name}**: **${c.value} ${c.unit}** (Status: ${c.severity})\n`;
        citations.push({ label: c.name, value: `${c.value} ${c.unit}` });
      });
    } else {
      responseBody += `No recent CBC parameters were identified in your active record.\n`;
    }
    responseBody += `\n*Note: This is a rule-based explanation derived from laboratory reference ranges. No language model was used.*`;
  } else if (queryLower.includes('question') || queryLower.includes('doctor') || queryLower.includes('ask')) {
    responseBody = `Hello ${context.patientName}. Here is a suggested checklist of questions for your doctor consultation:\n\n` +
      `1. Are any of my flagged values concerning or in need of re-testing?\n` +
      `2. Do I need to adjust any lifestyle factors (diet, hydration, exercise) based on these numbers?\n` +
      `3. Do these lab results warrant any modification to my current medication regimen?\n` +
      `4. When should I schedule my next follow-up blood work?\n\n` +
      `*Note: Generated from standard clinical question templates. No language model was used.*`;
  } else {
    // Fixed menu guidance for any unknown or freeform queries
    responseBody = `Hello ${context.patientName}. To protect clinical safety and prevent inaccuracies without a doctor present, this assistant operates strictly on a **fixed menu of grounded questions answered from templates** (no LLMs used).\n\nPlease select one of the menu questions below:\n` +
      FIXED_CHAT_MENU_PROMPTS.map((m) => `• ${m.prompt}`).join('\n') +
      `\n\nFor emergencies, dial 112 or 108 immediately.`;
  }

  return {
    text: `${responseBody}\n\n---\n${MANDATORY_CLINICAL_DISCLAIMER}`,
    isRefusal: false,
    citations: citations.length > 0 ? citations : undefined,
  };
}
