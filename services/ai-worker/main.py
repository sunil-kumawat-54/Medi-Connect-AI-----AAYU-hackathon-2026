import time
import uuid
import logging
from typing import Dict, Any, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import ReportProcessResponse, ChatQueryRequest, ChatQueryResponse
from ocr_engine import (
    extract_from_pdf,
    extract_from_image,
    EmptyDocumentError,
    PasswordProtectedPDFError,
    OversizedDocumentError,
    OCRError,
)
from parser import parse_report_lines
from templates import (
    generate_rule_based_summary,
    FIXED_CHAT_MENU,
    MANDATORY_DISCLAIMER,
    URGENT_CARE_NOTICE,
)

# Privacy-conscious logging: Zero PHI
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [AI-WORKER] %(message)s"
)
logger = logging.getLogger("ai_worker")

app = FastAPI(
    title="Medi Connect Local AI Worker",
    description="Free, local rule-based OCR and report extraction service. Zero external keys, zero LLMs.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "healthy",
        "service": "medi-connect-ai-worker",
        "engines": {
            "pdf": "PyMuPDF / pdfplumber",
            "ocr": "OpenCV deskew + RapidOCR (PaddleOCR ONNX)",
            "pipeline": "Deterministic Rules & Layout Parser",
            "llm_used": False,
        }
    }

@app.get("/chat-menu")
def get_chat_menu() -> List[Dict[str, str]]:
    return FIXED_CHAT_MENU

@app.post("/process-report", response_model=ReportProcessResponse)
async def process_report(
    file: UploadFile = File(...),
    report_id: str = Form(default=None),
    patient_id: str = Form(default=None)
):
    start_time = time.time()
    rep_id = report_id or f"rep-{uuid.uuid4().hex[:12]}"
    file_bytes = await file.read()
    file_size = len(file_bytes)
    file_name = file.filename or "uploaded_file"
    content_type = file.content_type or ""

    # Privacy-conscious log (zero PHI)
    logger.info(f"Processing report_id={rep_id} filename_len={len(file_name)} size_bytes={file_size}")

    # File validation checks
    if file_size == 0:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="NONE",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message="Uploaded file is empty (0 bytes)."
        )

    if file_size > 15 * 1024 * 1024:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="NONE",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message="File exceeds maximum size limit of 15 MB."
        )

    is_pdf = file_name.lower().endswith(".pdf") or "pdf" in content_type.lower()

    try:
        if is_pdf:
            lines, raw_text, ocr_conf, page_count = extract_from_pdf(file_bytes)
            extraction_source = "EMBEDDED_PDF_TEXT"
        else:
            lines, raw_text, ocr_conf, page_count = extract_from_image(file_bytes)
            extraction_source = "LOCAL_OCR_SCAN"

    except PasswordProtectedPDFError as e:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="PDF_ENCRYPTED",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message=str(e)
        )
    except OversizedDocumentError as e:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="PDF_OVERSIZED",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message=str(e)
        )
    except EmptyDocumentError as e:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="EMPTY_DOCUMENT",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message=str(e)
        )
    except Exception as e:
        elapsed = (time.time() - start_time) * 1000
        logger.error(f"OCR failure: {str(e)}")
        return ReportProcessResponse(
            report_id=rep_id,
            status="FAILED",
            ocr_confidence=0.0,
            extraction_source="CORRUPTED",
            extracted_biomarkers=[],
            unparsed_lines=[],
            summary=generate_rule_based_summary([], 0),
            raw_text_excerpt="",
            processing_time_ms=elapsed,
            error_message=f"Failed to process document: {str(e)}"
        )

    # Deterministic Parsing
    extracted_biomarkers, unparsed_lines, report_date = parse_report_lines(lines, rep_id)

    # Check if completely non-medical (no biomarkers found)
    if len(extracted_biomarkers) == 0:
        elapsed = (time.time() - start_time) * 1000
        return ReportProcessResponse(
            report_id=rep_id,
            status="NEEDS_REVIEW",
            ocr_confidence=ocr_conf,
            extraction_source=extraction_source,
            extracted_biomarkers=[],
            unparsed_lines=unparsed_lines,
            summary=generate_rule_based_summary([], len(unparsed_lines)),
            raw_text_excerpt=raw_text[:500],
            processing_time_ms=elapsed,
            error_message="No recognized medical biomarkers detected. Please confirm this is a diagnostic pathology report."
        )

    # Generate Rule-Based Explanation
    summary = generate_rule_based_summary(extracted_biomarkers, len(unparsed_lines))

    # Determine Review Status
    has_critical = any(b.severity == "CRITICAL" for b in extracted_biomarkers)
    has_abnormal = any(b.severity != "NORMAL" for b in extracted_biomarkers)
    
    # Needs doctor review if abnormal values, critical values, unparsed lines, or low OCR confidence
    if has_critical or has_abnormal or len(unparsed_lines) > 0 or ocr_conf < 85.0:
        status_val = "NEEDS_REVIEW"
    else:
        status_val = "READY"

    elapsed = (time.time() - start_time) * 1000
    return ReportProcessResponse(
        report_id=rep_id,
        status=status_val,
        ocr_confidence=ocr_conf,
        extraction_source=extraction_source,
        extracted_biomarkers=extracted_biomarkers,
        unparsed_lines=unparsed_lines,
        summary=summary,
        raw_text_excerpt=raw_text[:500],
        processing_time_ms=elapsed
    )

@app.post("/chat-query", response_model=ChatQueryResponse)
def handle_chat_query(req: ChatQueryRequest):
    """
    Fixed-menu grounded chat handler.
    Strictly refuses diagnosis and prescription, escalates acute emergencies to 112/108,
    and answers known preparation/parameter queries from templates. No LLM used.
    """
    q_lower = req.query.lower().strip()

    # 1. Emergency Acute Symptoms Escalation
    emergency_keywords = [
        "chest pain", "heart attack", "cannot breathe", "shortness of breath",
        "passed out", "unconscious", "severe bleeding", "coughing blood"
    ]
    if any(k in q_lower for k in emergency_keywords):
        return ChatQueryResponse(
            text=(
                f"🚨 **EMERGENCY WARNING**: Your message describes symptoms that may indicate a life-threatening medical emergency.\n\n"
                f"Please **call 112 or 108 immediately** or go to the nearest emergency room. Do not delay.\n\n"
                f"{MANDATORY_DISCLAIMER}"
            ),
            is_refusal=True,
            refusal_reason="EMERGENCY_ESCALATION"
        )

    # 2. Prescription / Medication Refusal
    prescription_keywords = [
        "what medicine", "prescribe", "which tablet", "what dose", "dosage",
        "should i take", "can i take", "change my medicine", "stop taking"
    ]
    if any(k in q_lower for k in prescription_keywords):
        return ChatQueryResponse(
            text=(
                "⚠️ **Prescription & Medication Safety Refusal**:\n\n"
                "As a deterministic healthcare assistant, I am **strictly prohibited from prescribing medications, "
                "suggesting drug dosages, or altering prescriptions**. Medication decisions require a licensed physician consultation.\n\n"
                f"{MANDATORY_DISCLAIMER}"
            ),
            is_refusal=True,
            refusal_reason="PRESCRIPTION_REQUEST"
        )

    # 3. Diagnosis Refusal
    diagnosis_keywords = [
        "diagnose me", "do i have diabetes", "am i sick", "what disease",
        "do i have cancer", "do i have hypothyroidism"
    ]
    if any(k in q_lower for k in diagnosis_keywords):
        return ChatQueryResponse(
            text=(
                "⚠️ **Diagnostic Evaluation Policy**:\n\n"
                "I cannot provide a medical diagnosis. Only a licensed physician can interpret laboratory test results "
                "in combination with your clinical symptoms and physical examination.\n\n"
                f"{MANDATORY_DISCLAIMER}"
            ),
            is_refusal=True,
            refusal_reason="DIAGNOSIS_REQUEST"
        )

    # 4. Match against Fixed Menu Questions
    for item in FIXED_CHAT_MENU:
        # Check if user query matches key topic
        if item["id"] == "fasting_prep" and any(w in q_lower for w in ["fasting", "prepare", "fbs"]):
            return ChatQueryResponse(
                text=f"📋 **{item['question']}**\n\n{item['answer']}\n\n*{MANDATORY_DISCLAIMER}*",
                is_refusal=False
            )
        if item["id"] == "hba1c_meaning" and any(w in q_lower for w in ["hba1c", "difference", "glucose vs"]):
            return ChatQueryResponse(
                text=f"📋 **{item['question']}**\n\n{item['answer']}\n\n*{MANDATORY_DISCLAIMER}*",
                is_refusal=False
            )
        if item["id"] == "lipid_fasting" and any(w in q_lower for w in ["lipid", "cholesterol", "fast"]):
            return ChatQueryResponse(
                text=f"📋 **{item['question']}**\n\n{item['answer']}\n\n*{MANDATORY_DISCLAIMER}*",
                is_refusal=False
            )
        if item["id"] == "thyroid_timing" and any(w in q_lower for w in ["thyroid", "tsh", "time", "timing"]):
            return ChatQueryResponse(
                text=f"📋 **{item['question']}**\n\n{item['answer']}\n\n*{MANDATORY_DISCLAIMER}*",
                is_refusal=False
            )
        if item["id"] == "cbc_parameters" and any(w in q_lower for w in ["cbc", "hemoglobin", "wbc", "platelet"]):
            return ChatQueryResponse(
                text=f"📋 **{item['question']}**\n\n{item['answer']}\n\n*{MANDATORY_DISCLAIMER}*",
                is_refusal=False
            )

    # Default fallback: Suggest fixed menu topics
    menu_bullets = "\n".join([f"• {m['question']}" for m in FIXED_CHAT_MENU])
    return ChatQueryResponse(
        text=(
            "I can answer standard laboratory preparation and test parameter questions from my verified reference guide:\n\n"
            f"{menu_bullets}\n\n"
            "Please select or ask one of the questions above. For medical diagnosis or prescriptions, please consult your doctor.\n\n"
            f"{MANDATORY_DISCLAIMER}"
        ),
        is_refusal=False
    )
