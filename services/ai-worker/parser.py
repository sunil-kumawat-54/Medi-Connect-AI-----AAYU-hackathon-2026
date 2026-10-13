import re
import uuid
from typing import List, Dict, Any, Tuple, Optional
from models import ExtractedBiomarker, BoundingBox
from rules import KNOWN_INTERVALS, evaluate_biomarker_severity, normalize_units

# Biomarker detection patterns
BIOMARKER_PATTERNS = [
    # Glycemic
    {
        "canonical": "Fasting Blood Glucose",
        "regex": r"(?:fasting\s+(?:blood\s+)?(?:glucose|sugar)|fbs|fbg)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "Post Prandial Blood Glucose",
        "regex": r"(?:post\s+prandial\s+(?:blood\s+)?(?:glucose|sugar)|ppbs|ppbg)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "Random Blood Glucose",
        "regex": r"(?:random\s+(?:blood\s+)?(?:glucose|sugar)|rbs)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "HbA1c Glycated Hgb",
        "regex": r"(?:hba1c|glycated\s+h(?:a)?emoglobin|glycosylated\s+h(?:a)?emoglobin)\b",
        "default_unit": "%",
    },

    # Lipid Profile
    {
        "canonical": "Total Cholesterol",
        "regex": r"(?:total\s+cholesterol|s(?:erum)?\.?\s*cholesterol)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "HDL Cholesterol",
        "regex": r"(?:hdl(?:\s+cholesterol)?|high\s+density\s+lipoprotein)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "LDL Cholesterol",
        "regex": r"(?:ldl(?:\s+cholesterol)?|low\s+density\s+lipoprotein)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "Triglycerides",
        "regex": r"(?:triglycerides|serum\s+triglycerides|tgl)\b",
        "default_unit": "mg/dL",
    },
    {
        "canonical": "VLDL Cholesterol",
        "regex": r"(?:vldl(?:\s+cholesterol)?)\b",
        "default_unit": "mg/dL",
    },

    # Thyroid
    {
        "canonical": "TSH",
        "regex": r"(?:tsh|thyroid\s*stimulating\s*hormone|s(?:erum)?\.?\s*tsh)\b",
        "default_unit": "uIU/mL",
    },
    {
        "canonical": "Free T4",
        "regex": r"(?:free\s*t4|ft4|free\s*thyroxine)\b",
        "default_unit": "ng/dL",
    },
    {
        "canonical": "Total T3",
        "regex": r"(?:total\s*t3|triiodothyronine)\b",
        "default_unit": "ng/mL",
    },
    {
        "canonical": "Total T4",
        "regex": r"(?:total\s*t4|thyroxine)\b",
        "default_unit": "ug/dL",
    },

    # CBC
    {
        "canonical": "Hemoglobin",
        "regex": r"(?:h(?:a)?emoglobin|hgb|hb)\b",
        "default_unit": "g/dL",
    },
    {
        "canonical": "Total WBC Count",
        "regex": r"(?:total\s*leucocyte\s*count|total\s*wbc(?:\s*count)?|tlc|wbc(?:\s*count)?)\b",
        "default_unit": "cells/mcL",
    },
    {
        "canonical": "Platelet Count",
        "regex": r"(?:platelet(?:\s*count)?|platelets?)\b",
        "default_unit": "cells/mcL",
    },
    {
        "canonical": "RBC Count",
        "regex": r"(?:rbc(?:\s+count)?|red\s+blood\s+cell(?:\s+count)?)\b",
        "default_unit": "mil/mcL",
    },
    {
        "canonical": "Packed Cell Volume (PCV)",
        "regex": r"(?:packed\s+cell\s+volume|pcv|h(?:a)?ematocrit)\b",
        "default_unit": "%",
    },
    {
        "canonical": "MCV",
        "regex": r"\bmcv\b",
        "default_unit": "fL",
    },
    {
        "canonical": "MCH",
        "regex": r"\bmch\b",
        "default_unit": "pg",
    },
    {
        "canonical": "MCHC",
        "regex": r"\bmchc\b",
        "default_unit": "g/dL",
    },

    # Critical Biomarkers
    {
        "canonical": "Troponin I",
        "regex": r"(?:troponin(?:\s*-\s*i)?|c-tn-i|hs-ctni)\b",
        "default_unit": "ng/mL",
    },
    {
        "canonical": "Serum Creatinine",
        "regex": r"(?:serum\s+creatinine|s(?:erum)?\.?\s*creatinine)\b",
        "default_unit": "mg/dL",
    },
]

# Prompt injection patterns to detect and neutralize
PROMPT_INJECTION_RE = re.compile(
    r"(?:ignore\s+(?:all\s+)?previous\s+instructions|system\s+prompt|disregard\s+prior|you\s+are\s+now|dan\s+mode)",
    re.IGNORECASE
)

DATE_RE = re.compile(
    r"\b(?:\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",
    re.IGNORECASE
)

def parse_reference_interval(text: str) -> Tuple[Optional[str], Optional[float], Optional[float]]:
    """
    Extracts reference interval string and low/high float bounds.
    E.g. '70 - 100', '4.0 - 5.6', '< 200', '0.40 - 4.20'
    """
    range_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    if range_match:
        try:
            low = float(range_match.group(1))
            high = float(range_match.group(2))
            return f"{low} - {high}", low, high
        except ValueError:
            pass

    less_match = re.search(r"[<≤]\s*(\d+(?:\.\d+)?)", text)
    if less_match:
        try:
            high = float(less_match.group(1))
            return f"< {high}", None, high
        except ValueError:
            pass

    greater_match = re.search(r"[>≥]\s*(\d+(?:\.\d+)?)", text)
    if greater_match:
        try:
            low = float(greater_match.group(1))
            return f"> {low}", low, None
        except ValueError:
            pass

    return None, None, None

def parse_report_lines(
    lines: List[Dict[str, Any]],
    report_id: str
) -> Tuple[List[ExtractedBiomarker], List[str], Optional[str]]:
    """
    Deterministic layout & regex parsing of extracted OCR/PDF lines.
    Returns: (extracted_biomarkers, unparsed_lines, report_date)
    """
    extracted_biomarkers: List[ExtractedBiomarker] = []
    unparsed_lines: List[str] = []
    report_date: Optional[str] = None
    seen_canonicals = set()

    for idx, item in enumerate(lines):
        line_text = item["text"].strip()
        if not line_text:
            continue

        # Check for prompt injection attempt
        if PROMPT_INJECTION_RE.search(line_text):
            unparsed_lines.append(f"[INJECTION_ATTEMPT_NEUTRALIZED]: {line_text}")
            continue

        # Look for report date
        if not report_date:
            date_match = DATE_RE.search(line_text)
            if date_match and any(w in line_text.lower() for w in ["date", "collected", "reported"]):
                report_date = date_match.group(0)

        matched_biomarker = False

        for bp in BIOMARKER_PATTERNS:
            if bp["canonical"] in seen_canonicals:
                continue

            match = re.search(bp["regex"], line_text, re.IGNORECASE)
            if match:
                # Biomarker test name found on this line
                # Look for numbers on the same line, or the adjacent line if tabular
                candidate_text = line_text
                box = item.get("box")
                page = item.get("page", 1)
                conf = item.get("confidence", 100.0)

                # Find numbers on this line
                # We skip the prefix name match to find the actual value
                after_match = candidate_text[match.end():]
                numbers = re.findall(r"\b\d+(?:\.\d+)?\b", after_match)

                # If no number after match, look if adjacent lines have the value (tabular OCR)
                if not numbers:
                    if idx + 1 < len(lines):
                        next_line = lines[idx + 1]["text"]
                        next_nums = re.findall(r"\b\d+(?:\.\d+)?\b", next_line)
                        if next_nums:
                            candidate_text = f"{candidate_text} {next_line}"
                            numbers = next_nums
                    if not numbers and idx > 0:
                        prev_line = lines[idx - 1]["text"]
                        prev_nums = re.findall(r"\b\d+(?:\.\d+)?\b", prev_line)
                        if prev_nums:
                            candidate_text = f"{prev_line} {candidate_text}"
                            numbers = prev_nums

                # Include following lines for unit or reference intervals if on adjacent rows
                if idx + 1 < len(lines):
                    candidate_text = f"{candidate_text} {lines[idx + 1]['text']}"
                if idx + 2 < len(lines):
                    candidate_text = f"{candidate_text} {lines[idx + 2]['text']}"

                if numbers:
                    val_str = numbers[0]
                    try:
                        numeric_val = float(val_str)
                    except ValueError:
                        continue

                    # Extract unit
                    unit_match = re.search(r"\b(mg/d[lL]|mmol/[lL]|uIU/m[lL]|ng/d[lL]|g/d[lL]|%|cells/mc[lL]|mil/mc[lL]|f[lL]|pg|ug/d[lL])\b", candidate_text, re.IGNORECASE)
                    unit = unit_match.group(0) if unit_match else bp["default_unit"]

                    # Extract reference interval
                    ref_raw, low_bound, high_bound = parse_reference_interval(candidate_text)
                    
                    # If not printed on this line, check canonical dictionary
                    if low_bound is None and high_bound is None:
                        dict_key = bp["canonical"].lower()
                        if dict_key in KNOWN_INTERVALS:
                            low_bound = KNOWN_INTERVALS[dict_key]["low"]
                            high_bound = KNOWN_INTERVALS[dict_key]["high"]
                            ref_raw = f"{low_bound} - {high_bound}"

                    # Normalize unit & value (deterministic)
                    std_val, std_unit = normalize_units(bp["canonical"], numeric_val, unit)

                    # Compute severity deterministically
                    severity = evaluate_biomarker_severity(std_val, low_bound, high_bound)

                    b_box = None
                    if box and len(box) == 4:
                        b_box = BoundingBox(page=page, x_min=box[0], y_min=box[1], x_max=box[2], y_max=box[3])

                    bio = ExtractedBiomarker(
                        id=f"bio-{report_id[:8]}-{bp['canonical'].lower().replace(' ', '_')}",
                        name=bp["canonical"],
                        raw_value=val_str,
                        numeric_value=std_val,
                        unit=unit,
                        normalized_unit=std_unit,
                        reference_interval_raw=ref_raw,
                        interval_low=low_bound,
                        interval_high=high_bound,
                        severity=severity,
                        bounding_box=b_box,
                        ocr_confidence=conf
                    )
                    extracted_biomarkers.append(bio)
                    seen_canonicals.add(bp["canonical"])
                    matched_biomarker = True
                    break

        if not matched_biomarker:
            # Check if line contains unparsed numbers or medical keywords
            if any(w in line_text.lower() for w in ["test", "result", "normal", "high", "low", "specimen"]):
                unparsed_lines.append(line_text)

    return extracted_biomarkers, unparsed_lines, report_date
