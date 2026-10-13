from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel, Field

class BoundingBox(BaseModel):
    page: int = 1
    x_min: float
    y_min: float
    x_max: float
    y_max: float

class ExtractedBiomarker(BaseModel):
    id: str
    name: str
    raw_value: str
    numeric_value: Optional[float] = None
    unit: str
    normalized_unit: Optional[str] = None
    reference_interval_raw: Optional[str] = None
    interval_low: Optional[float] = None
    interval_high: Optional[float] = None
    severity: str = "NORMAL"  # NORMAL, LOW, ELEVATED, CRITICAL
    bounding_box: Optional[BoundingBox] = None
    ocr_confidence: float = 100.0

class GroundedCitation(BaseModel):
    claim: str
    source_biomarker_id: str
    biomarker_name: str
    observed_value: str
    reference_interval: Optional[str] = None
    page: int = 1
    box: Optional[List[float]] = None

class GroundingAudit(BaseModel):
    is_grounded: bool
    extracted_numbers_count: int
    matched_numbers_count: int
    unmatched_tokens: List[str]

class RuleBasedSummary(BaseModel):
    content_markdown: str
    content_hindi_markdown: Optional[str] = None
    citations: List[GroundedCitation]
    red_flags: List[str]
    gaps: List[str]
    urgent_care_notice: Optional[str] = None
    disclaimer: str
    is_grounded_verified: bool
    grounding_audit: GroundingAudit

class ReportProcessResponse(BaseModel):
    report_id: str
    status: str  # READY, NEEDS_REVIEW, FAILED
    ocr_confidence: float
    extraction_source: str  # EMBEDDED_PDF_TEXT, LOCAL_OCR_SCAN
    extracted_biomarkers: List[ExtractedBiomarker]
    unparsed_lines: List[str] = []
    summary: RuleBasedSummary
    raw_text_excerpt: str
    processing_time_ms: float
    error_message: Optional[str] = None

class ChatQueryRequest(BaseModel):
    query: str
    patient_name: str
    recent_biomarkers: List[Dict[str, Any]] = []

class ChatQueryResponse(BaseModel):
    text: str
    is_refusal: bool
    refusal_reason: Optional[str] = None
    citations: List[Dict[str, str]] = []
