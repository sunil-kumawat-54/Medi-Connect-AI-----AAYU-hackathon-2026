import os
import sys
import json
import time

# Add ai-worker to sys.path
sys.path.insert(0, os.path.abspath("services/ai-worker"))
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

from ocr_engine import (
    extract_from_pdf,
    extract_from_image,
    EmptyDocumentError,
    PasswordProtectedPDFError,
    OversizedDocumentError,
    OCRError,
)
from parser import parse_report_lines
from templates import generate_rule_based_summary

def run_benchmark():
    ground_truth_path = "tests/synthetic_data/ground_truth.json"
    with open(ground_truth_path, "r") as f:
        gt = json.load(f)

    print("================================================================================")
    print("MEDI-CONNECT LOCAL AI WORKER — ACCURACY & BENCHMARK EVALUATION")
    print("Zero Paid Services | Pure Local Python Pipeline (PyMuPDF + OpenCV + RapidOCR)")
    print("================================================================================\n")

    per_file_results = {}
    total_fields_expected = 0
    total_fields_correct = 0

    print(">>> 1. EVALUATION ON SYNTHETIC CLINICAL REPORTS (PDF & PHOTOS):\n")

    for filename, expected in gt["files"].items():
        filepath = os.path.join("tests/synthetic_data", filename)
        file_bytes = open(filepath, "rb").read()
        is_pdf = filename.endswith(".pdf")
        
        t0 = time.time()
        try:
            if is_pdf:
                lines, raw_text, ocr_conf, page_count = extract_from_pdf(file_bytes)
                source = "EMBEDDED_PDF_TEXT"
            else:
                lines, raw_text, ocr_conf, page_count = extract_from_image(file_bytes)
                source = "LOCAL_OCR_SCAN"
            
            biomarkers, unparsed, r_date = parse_report_lines(lines, f"rep-{filename}")
            summary = generate_rule_based_summary(biomarkers, len(unparsed))
            elapsed = (time.time() - t0) * 1000
            
            # Per-field score
            expected_bio = expected["expected_biomarkers"]
            file_fields_total = len(expected_bio) * 3  # name, value, severity
            file_fields_matched = 0
            field_details = []

            for exp_name, exp_data in expected_bio.items():
                found = next((b for b in biomarkers if b.name.lower() == exp_name.lower()), None)
                if found:
                    # Name matched
                    file_fields_matched += 1
                    # Value matched
                    val_ok = (found.numeric_value == exp_data["value"])
                    if val_ok:
                        file_fields_matched += 1
                    # Severity matched
                    sev_ok = (found.severity == exp_data["severity"])
                    if sev_ok:
                        file_fields_matched += 1

                    field_details.append({
                        "field": exp_name,
                        "expected_val": exp_data["value"],
                        "actual_val": found.numeric_value,
                        "val_match": val_ok,
                        "expected_sev": exp_data["severity"],
                        "actual_sev": found.severity,
                        "sev_match": sev_ok
                    })
                else:
                    field_details.append({
                        "field": exp_name,
                        "found": False
                    })

            file_acc = round((file_fields_matched / file_fields_total) * 100, 1) if file_fields_total else 0
            total_fields_expected += file_fields_total
            total_fields_correct += file_fields_matched

            # Injection check
            injection_neutralized = True
            if expected.get("injection_attempt"):
                # Must not alter severity
                trop = next((b for b in biomarkers if "troponin" in b.name.lower()), None)
                injection_neutralized = (trop is not None and trop.severity == "CRITICAL" and summary.urgent_care_notice is not None)

            per_file_results[filename] = {
                "type": expected["type"],
                "accuracy": file_acc,
                "fields_matched": f"{file_fields_matched}/{file_fields_total}",
                "ocr_confidence": ocr_conf,
                "time_ms": round(elapsed, 1),
                "biomarkers_extracted": len(biomarkers),
                "unparsed_count": len(unparsed),
                "grounding_verified": summary.is_grounded_verified,
                "injection_neutralized": injection_neutralized,
                "field_details": field_details
            }

            print(f"[FILE]: {filename} ({expected['type']})")
            print(f"   * Extraction Source: {source} | OCR Confidence: {ocr_conf}% | Time: {round(elapsed, 1)}ms")
            print(f"   * Field Accuracy: {file_acc}% ({file_fields_matched}/{file_fields_total} correct)")
            print(f"   * Extracted Biomarkers ({len(biomarkers)}): {[b.name + ': ' + str(b.numeric_value) + ' ' + b.unit + ' (' + b.severity + ')' for b in biomarkers]}")
            if expected.get("injection_attempt"):
                print(f"   * Prompt Injection Attack: {'NEUTRALIZED (Inert text; critical red flag preserved)' if injection_neutralized else 'FAILED'}")
            print(f"   * Grounding Verified: {'YES (0 unmatched tokens)' if summary.is_grounded_verified else 'NO'}")
            print()

        except Exception as e:
            print(f"[ERROR]: File {filename} crashed with error: {str(e)}\n")
            per_file_results[filename] = {"error": str(e), "accuracy": 0.0}

    overall_acc = round((total_fields_correct / total_fields_expected) * 100, 1) if total_fields_expected else 0.0

    print(">>> 2. EVALUATION ON ADVERSARIAL & BAD INPUTS:\n")
    bad_results = {}

    for bad_file, bad_spec in gt["bad_inputs"].items():
        filepath = os.path.join("tests/synthetic_data", bad_file)
        file_bytes = open(filepath, "rb").read()
        is_pdf = bad_file.endswith(".pdf")

        status_result = "UNKNOWN"
        error_msg = None
        t0 = time.time()

        try:
            if is_pdf:
                lines, raw_text, ocr_conf, page_count = extract_from_pdf(file_bytes)
            else:
                lines, raw_text, ocr_conf, page_count = extract_from_image(file_bytes)

            biomarkers, unparsed, r_date = parse_report_lines(lines, f"rep-{bad_file}")
            if len(biomarkers) == 0:
                status_result = "NEEDS_REVIEW (No medical tokens detected)"
            else:
                status_result = "READY"
        except EmptyDocumentError as e:
            status_result = f"FAILED (Clean rejection: {str(e)})"
            error_msg = str(e)
        except PasswordProtectedPDFError as e:
            status_result = f"FAILED (Clean rejection: {str(e)})"
            error_msg = str(e)
        except OversizedDocumentError as e:
            status_result = f"FAILED (Clean rejection: {str(e)})"
            error_msg = str(e)
        except Exception as e:
            status_result = f"FAILED ({str(e)})"
            error_msg = str(e)

        bad_results[bad_file] = {
            "expected": bad_spec["expected_result"],
            "actual": status_result,
            "non_crashing": True
        }
        print(f"[BAD INPUT]: {bad_file} (Goal: {bad_spec['reason']})")
        print(f"   * Result: {status_result}")
        print(f"   * Non-crashing graceful state: YES")
        print()

    print("================================================================================")
    print("ACCURACY SUMMARY TABLE:")
    print("================================================================================")
    for fn, res in per_file_results.items():
        if "accuracy" in res:
            print(f"- {fn:32}: {res['accuracy']:5.1f}% accuracy ({res['fields_matched']} fields, {res['time_ms']}ms)")
    print(f"\nOVERALL EXTRACTION ACCURACY: {overall_acc}% ({total_fields_correct}/{total_fields_expected} fields)")
    print("================================================================================\n")

    # Save summary report to JSON
    summary_out = {
        "overall_accuracy_percent": overall_acc,
        "total_fields_evaluated": total_fields_expected,
        "total_fields_correct": total_fields_correct,
        "per_file": per_file_results,
        "bad_inputs": bad_results
    }
    with open("tests/synthetic_data/benchmark_results.json", "w") as f:
        json.dump(summary_out, f, indent=2)

    return summary_out

if __name__ == "__main__":
    run_benchmark()
