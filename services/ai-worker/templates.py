from typing import List, Dict, Any, Optional
from models import ExtractedBiomarker, RuleBasedSummary, GroundedCitation
from rules import verify_grounding

MANDATORY_DISCLAIMER = (
    "Rule-based deterministic explanation for patient education only; not medical advice. "
    "A doctor decides. In an emergency, seek urgent medical care or call 112 / 108."
)

URGENT_CARE_NOTICE = (
    "⚠️ URGENT CLINICAL NOTICE: One or more life-critical abnormal biomarker values were detected. "
    "This requires prompt evaluation by a licensed physician. If you are experiencing acute chest pain, "
    "shortness of breath, severe dizziness, or loss of consciousness, call 112 / 108 immediately."
)

HINDI_MACHINE_BADGE = (
    "**[नियम-आधारित अनुवाद / RULE-BASED TRANSLATION — किसी भी संदेह की स्थिति में मूल प्रयोगशाला रिपोर्ट ही प्रामाणिक मानी जाएगी]**\n\n"
)

HINDI_SEVERITY_MAP = {
    "NORMAL": "सामान्य (Normal)",
    "LOW": "सामान्य से कम (Low)",
    "ELEVATED": "बढ़ा हुआ (Elevated)",
    "CRITICAL": "गंभीर रूप से असामान्य (Critical)",
}

def generate_rule_based_summary(
    biomarkers: List[ExtractedBiomarker],
    unparsed_count: int = 0
) -> RuleBasedSummary:
    """
    Assembles a deterministic, grounded clinical explanation using templates.
    Labeled explicitly as 'rule-based explanation', not AI. No LLM used.
    """
    citations: List[GroundedCitation] = []
    has_critical = any(b.severity == "CRITICAL" for b in biomarkers)
    critical_biomarkers = [b for b in biomarkers if b.severity == "CRITICAL"]

    red_flags = [f"{b.name}: {b.raw_value} {b.unit} (CRITICAL ALERT)" for b in critical_biomarkers]
    gaps = []
    if unparsed_count > 0:
        gaps.append(f"{unparsed_count} unclassified line(s) detected requiring doctor review.")

    lines = [
        "### Rule-Based Clinical Explanation\n",
        "*Note: This summary is generated entirely by deterministic rules without language models.*",
        ""
    ]

    if has_critical:
        lines.append(f"{URGENT_CARE_NOTICE}\n\n---\n")

    lines.append(f"Analyzed {len(biomarkers)} laboratory parameters against standard reference intervals:\n")

    for b in biomarkers:
        val_str = b.raw_value or str(b.numeric_value)
        ref_str = f" [Standard range: {b.reference_interval_raw} {b.unit}]" if b.reference_interval_raw else ""

        if b.severity == "NORMAL":
            lines.append(f"• **{b.name}**: Measured at **{val_str} {b.unit}**, within the standard reference range{ref_str}.")
        elif b.severity == "CRITICAL":
            lines.append(f"• **{b.name}**: Measured at **{val_str} {b.unit}**, critically outside reference limits{ref_str}. Immediate physician review is advised.")
        elif b.severity == "ELEVATED":
            lines.append(f"• **{b.name}**: Measured at **{val_str} {b.unit}**, above the reference interval{ref_str}.")
        else:
            lines.append(f"• **{b.name}**: Measured at **{val_str} {b.unit}**, below the expected reference limit{ref_str}.")

        box_coords = None
        if b.bounding_box:
            box_coords = [b.bounding_box.x_min, b.bounding_box.y_min, b.bounding_box.x_max, b.bounding_box.y_max]

        citations.append(GroundedCitation(
            claim=f"{b.name} is {val_str} {b.unit}",
            source_biomarker_id=b.id,
            biomarker_name=b.name,
            observed_value=val_str,
            reference_interval=b.reference_interval_raw,
            page=b.bounding_box.page if b.bounding_box else 1,
            box=box_coords
        ))

    content_markdown = "\n".join(lines)

    # Automated grounding audit
    grounding_audit = verify_grounding(content_markdown, biomarkers)

    # Generate Hindi explanation
    hindi_markdown = generate_hindi_rule_based(biomarkers, has_critical)

    return RuleBasedSummary(
        content_markdown=content_markdown,
        content_hindi_markdown=hindi_markdown,
        citations=citations,
        red_flags=red_flags,
        gaps=gaps,
        urgent_care_notice=URGENT_CARE_NOTICE if has_critical else None,
        disclaimer=MANDATORY_DISCLAIMER,
        is_grounded_verified=grounding_audit.is_grounded,
        grounding_audit=grounding_audit
    )

def generate_hindi_rule_based(biomarkers: List[ExtractedBiomarker], has_critical: bool) -> str:
    """
    Translates structured findings to Hindi using a fixed dictionary and template.
    Strictly preserves numeric values and units.
    """
    h_lines = [HINDI_MACHINE_BADGE]

    if has_critical:
        h_lines.append(
            "⚠️ **आपातकालीन सूचना**: गंभीर रूप से असामान्य परिणाम पाए गए हैं। "
            "यदि आप सीने में दर्द, सांस लेने में कठिनाई या चक्कर महसूस कर रहे हैं, तो तुरंत 112 / 108 पर संपर्क करें।\n\n---\n"
        )

    h_lines.append("### नियम-आधारित नैदानिक सारांश (Rule-Based Clinical Summary)\n")

    for b in biomarkers:
        val_str = b.raw_value or str(b.numeric_value)
        status_hi = HINDI_SEVERITY_MAP.get(b.severity, b.severity)
        ref_hi = f" (मानक सीमा: {b.reference_interval_raw})" if b.reference_interval_raw else ""
        h_lines.append(f"• **{b.name}**: **{val_str} {b.unit}** — स्थिति: *{status_hi}*{ref_hi}")

    h_lines.append("\n---\n*नियम-आधारित व्याख्या केवल सूचना के लिए है। किसी भी दवा में बदलाव करने से पहले अपने चिकित्सक से परामर्श लें।*")
    return "\n".join(h_lines)

# Fixed Menu Template Questions for Chat (No LLM)
FIXED_CHAT_MENU = [
    {
        "id": "fasting_prep",
        "question": "How should I prepare for a fasting blood sugar test?",
        "answer": "For a Fasting Blood Glucose (FBS) test, maintain an overnight fast of 8 to 10 hours before blood collection. Water is allowed, but do not consume tea, coffee, or food. Consult your doctor regarding morning medications."
    },
    {
        "id": "hba1c_meaning",
        "question": "What is the difference between Glucose and HbA1c?",
        "answer": "Fasting blood sugar measures your blood glucose level at that exact point in time. HbA1c measures the percentage of glycated hemoglobin, reflecting your average blood sugar over the previous 60 to 90 days."
    },
    {
        "id": "lipid_fasting",
        "question": "Do I need to fast before a lipid profile test?",
        "answer": "Yes, standard Indian laboratory guidelines recommend 10 to 12 hours of overnight fasting before a lipid profile to ensure accurate triglyceride measurements. Water is permitted."
    },
    {
        "id": "thyroid_timing",
        "question": "When should thyroid blood tests be taken?",
        "answer": "Thyroid stimulating hormone (TSH) is typically measured in the morning as TSH levels exhibit natural circadian variation. If you take thyroid medication, check with your physician whether to take it before or after the blood draw."
    },
    {
        "id": "cbc_parameters",
        "question": "What are the key parameters in a Complete Blood Count (CBC)?",
        "answer": "A CBC analyzes Hemoglobin (oxygen transport), Total Leucocyte Count / WBC (immune defense), and Platelet Count (blood clotting), along with red cell indices (MCV, MCH, PCV)."
    }
]
