import re
from typing import Optional, Tuple, Dict, Any, List
from models import ExtractedBiomarker, GroundingAudit

# Standard Indian Diagnostic Reference Intervals
KNOWN_INTERVALS = {
    # Glucose & Glycemic
    "fasting blood glucose": {"low": 70.0, "high": 100.0, "unit": "mg/dL"},
    "fasting blood sugar": {"low": 70.0, "high": 100.0, "unit": "mg/dL"},
    "post prandial blood sugar": {"low": 70.0, "high": 140.0, "unit": "mg/dL"},
    "random blood glucose": {"low": 70.0, "high": 140.0, "unit": "mg/dL"},
    "hba1c": {"low": 4.0, "high": 5.6, "unit": "%"},
    "glycated hemoglobin": {"low": 4.0, "high": 5.6, "unit": "%"},
    
    # Lipid Profile
    "total cholesterol": {"low": 125.0, "high": 200.0, "unit": "mg/dL"},
    "hdl cholesterol": {"low": 40.0, "high": 60.0, "unit": "mg/dL"},
    "ldl cholesterol": {"low": 50.0, "high": 100.0, "unit": "mg/dL"},
    "triglycerides": {"low": 50.0, "high": 150.0, "unit": "mg/dL"},
    "vldl cholesterol": {"low": 5.0, "high": 30.0, "unit": "mg/dL"},
    
    # Thyroid Profile
    "tsh": {"low": 0.40, "high": 4.20, "unit": "uIU/mL"},
    "thyroid stimulating hormone": {"low": 0.40, "high": 4.20, "unit": "uIU/mL"},
    "total t3": {"low": 0.80, "high": 2.00, "unit": "ng/mL"},
    "total t4": {"low": 5.1, "high": 14.1, "unit": "ug/dL"},
    "free t3": {"low": 2.0, "high": 4.4, "unit": "pg/mL"},
    "free t4": {"low": 0.80, "high": 1.80, "unit": "ng/dL"},

    # CBC
    "hemoglobin": {"low": 13.0, "high": 17.0, "unit": "g/dL"},
    "rbc count": {"low": 4.5, "high": 5.9, "unit": "mil/mcL"},
    "total wbc count": {"low": 4000.0, "high": 11000.0, "unit": "cells/mcL"},
    "wbc count": {"low": 4000.0, "high": 11000.0, "unit": "cells/mcL"},
    "platelet count": {"low": 150000.0, "high": 450000.0, "unit": "cells/mcL"},
    "packed cell volume": {"low": 40.0, "high": 50.0, "unit": "%"},
    "hematocrit": {"low": 40.0, "high": 50.0, "unit": "%"},
    "mcv": {"low": 80.0, "high": 100.0, "unit": "fL"},
    "mch": {"low": 27.0, "high": 32.0, "unit": "pg"},
    "mchc": {"low": 32.0, "high": 36.0, "unit": "g/dL"},

    # Critical Alerts
    "troponin i": {"low": 0.0, "high": 0.04, "unit": "ng/mL"},
    "serum creatinine": {"low": 0.7, "high": 1.3, "unit": "mg/dL"},
}

def evaluate_biomarker_severity(
    val: float,
    low: Optional[float],
    high: Optional[float],
    critical_low_mult: float = 0.5,
    critical_high_mult: float = 1.75
) -> str:
    """
    Deterministically computes biomarker severity: NORMAL, LOW, ELEVATED, CRITICAL.
    """
    if low is None and high is None:
        return "NORMAL"

    if low is not None and high is not None:
        if low <= val <= high:
            return "NORMAL"
        if val > high:
            return "CRITICAL" if val >= high * critical_high_mult else "ELEVATED"
        if val < low:
            return "CRITICAL" if val <= low * critical_low_mult else "LOW"

    if low is not None and high is None:
        if val >= low:
            return "NORMAL"
        return "CRITICAL" if val <= low * critical_low_mult else "LOW"

    if low is None and high is not None:
        if val <= high:
            return "NORMAL"
        return "CRITICAL" if val >= high * critical_high_mult else "ELEVATED"

    return "NORMAL"

def normalize_units(name: str, val: float, unit: str) -> Tuple[float, str]:
    """
    Normalizes units deterministically (e.g. glucose mmol/L -> mg/dL).
    """
    clean_unit = unit.strip().lower()
    clean_name = name.strip().lower()

    if "glucose" in clean_name or "sugar" in clean_name:
        if clean_unit in ["mmol/l", "mmol/litre"]:
            std_val = round(val * 18.0182, 1)
            return std_val, "mg/dL"

    if "cholesterol" in clean_name or "triglyceride" in clean_name:
        if clean_unit in ["mmol/l", "mmol/litre"]:
            std_val = round(val * 38.67, 1)
            return std_val, "mg/dL"

    return val, unit

def verify_grounding(markdown_text: str, biomarkers: List[ExtractedBiomarker]) -> GroundingAudit:
    """
    Automated Grounding Verifier: ensures all numeric values in generated text
    exist within extracted biomarkers. Zero hallucinations permitted.
    """
    valid_numbers = set()
    for b in biomarkers:
        if b.numeric_value is not None:
            valid_numbers.add(str(b.numeric_value))
            valid_numbers.add(f"{b.numeric_value:.1f}")
            valid_numbers.add(f"{b.numeric_value:.2f}")
            valid_numbers.add(str(round(b.numeric_value)))
        if b.raw_value:
            for num in re.findall(r"\b\d+(?:\.\d+)?\b", b.raw_value):
                valid_numbers.add(num)
        if b.reference_interval_raw:
            for num in re.findall(r"\b\d+(?:\.\d+)?\b", b.reference_interval_raw):
                valid_numbers.add(num)

    # Standard benign formatting constants (e.g. emergency helpline 112, 108, 90 days, 24 hours, page 1)
    allowed_system_numbers = {"112", "108", "90", "24", "1", "2", "3", "4", "5", "10", "60"}
    valid_numbers.update(allowed_system_numbers)

    found_numbers = re.findall(r"\b\d+(?:\.\d+)?\b", markdown_text)
    unmatched = [num for num in found_numbers if num not in valid_numbers]

    return GroundingAudit(
        is_grounded=len(unmatched) == 0,
        extracted_numbers_count=len(found_numbers),
        matched_numbers_count=len(found_numbers) - len(unmatched),
        unmatched_tokens=unmatched
    )
