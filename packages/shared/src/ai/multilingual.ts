import { ExtractedBiomarker, GroundedSummary } from './types.js';

export const HINDI_MACHINE_TRANSLATION_BADGE =
  '**[नियम-आधारित अनुवाद / RULE-BASED TRANSLATION — किसी भी संदेह की स्थिति में मूल अंग्रेजी रिपोर्ट ही प्रामाणिक मानी जाएगी]**\n\n';

export const HINDI_EMERGENCY_DISCLAIMER =
  '⚠️ **आपातकालीन सूचना**: गंभीर रूप से असामान्य परिणाम पाए गए हैं। यदि आप सीने में दर्द, सांस लेने में कठिनाई, या अत्यधिक चक्कर महसूस कर रहे हैं, तो तुरंत नजदीकी आपातकालीन केंद्र जाएं या 112 / 108 पर कॉल करें।';

/**
 * Translates clinical severity into standard Hindi clinical terminology
 */
export const HINDI_SEVERITY_MAP: Record<string, string> = {
  NORMAL: 'सामान्य (Normal)',
  LOW: 'सामान्य से कम (Low)',
  ELEVATED: 'बढ़ा हुआ (Elevated)',
  CRITICAL: 'गंभीर रूप से असामान्य (Critical)',
};

/**
 * Generates an accurate, number-preserving Hindi explanation directly from
 * validated structured biomarkers and English summary.
 */
export function generateHindiExplanation(
  biomarkers: ExtractedBiomarker[],
  englishSummaryText: string,
  hasCriticalValues: boolean
): string {
  let md = HINDI_MACHINE_TRANSLATION_BADGE;

  if (hasCriticalValues) {
    md += `${HINDI_EMERGENCY_DISCLAIMER}\n\n---\n\n`;
  }

  md += '### नियम-आधारित नैदानिक सारांश (Rule-Based Clinical Explanation)\n\n';

  // Detail each extracted biomarker preserving exact numbers and units
  for (const b of biomarkers) {
    const severityHi = HINDI_SEVERITY_MAP[b.severity] || b.severity;
    const intervalStr = b.referenceIntervalRaw ? ` (सामान्य सीमा: ${b.referenceIntervalRaw})` : '';

    md += `• **${b.name}**: **${b.rawValue || b.numericValue} ${b.unit}** — स्थिति: *${severityHi}*${intervalStr}\n`;
  }

  md += '\n---\n\n';
  md += '### विस्तृत व्याख्या\n\n';

  const abnormalBiomarkers = biomarkers.filter((b) => b.severity !== 'NORMAL');
  if (abnormalBiomarkers.length === 0) {
    md += 'आपकी रिपोर्ट में परीक्षण किए गए सभी बायोमार्कर मानक प्रयोगशाला संदर्भ सीमाओं के भीतर हैं। अपनी स्वास्थ्य स्थिति बनाए रखने के लिए अपने डॉक्टर के नियमित निर्देशों का पालन करें।\n';
  } else {
    md += 'आपकी रिपोर्ट में कुछ मान सामान्य सीमा से भिन्न हैं:\n\n';
    for (const ab of abnormalBiomarkers) {
      if (ab.severity === 'CRITICAL') {
        md += `• **${ab.name}** का स्तर **${ab.rawValue} ${ab.unit}** है, जो बहुत अधिक या असामान्य है। इसके लिए अपने चिकित्सक से तुरंत परामर्श लेना आवश्यक है।\n`;
      } else if (ab.severity === 'ELEVATED') {
        md += `• **${ab.name}** का स्तर **${ab.rawValue} ${ab.unit}** सामान्य सीमा से अधिक है। यह खान-पान, जीवनशैली या विशिष्ट चयापचय परिवर्तनों से संबंधित हो सकता है।\n`;
      } else if (ab.severity === 'LOW') {
        md += `• **${ab.name}** का स्तर **${ab.rawValue} ${ab.unit}** सामान्य सीमा से कम दर्ज किया गया है।\n`;
      }
    }
    md += '\nकृपया किसी भी दवा को शुरू करने या बदलने से पहले अपने डॉक्टर से परामर्श अवश्य लें।\n';
  }

  md += '\n---\n*सूचना: AI केवल सहायता करता है; अंतिम नैदानिक निर्णय केवल डॉक्टर का होता है। आपात स्थिति में 112 या 108 डायल करें।*';

  return md;
}
