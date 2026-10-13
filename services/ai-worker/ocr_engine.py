import io
import math
import re
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import cv2
from PIL import Image
import pymupdf  # PyMuPDF
import pdfplumber
from rapidocr_onnxruntime import RapidOCR

ocr_engine = RapidOCR()

class OCRError(Exception):
    pass

class PasswordProtectedPDFError(OCRError):
    pass

class OversizedDocumentError(OCRError):
    pass

class EmptyDocumentError(OCRError):
    pass

def deskew_image(image_cv: np.ndarray) -> np.ndarray:
    """
    Deskews an image using OpenCV contour minimum bounding box angle.
    """
    try:
        gray = cv2.cvtColor(image_cv, cv2.COLOR_BGR2GRAY) if len(image_cv.shape) == 3 else image_cv
        # Threshold to invert
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 50:
            return image_cv

        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

        # Only deskew if mild tilt (-30 to +30 degrees)
        if abs(angle) > 0.5 and abs(angle) < 30.0:
            (h, w) = image_cv.shape[:2]
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            deskewed = cv2.warpAffine(
                image_cv, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
            )
            return deskewed
        return image_cv
    except Exception:
        return image_cv

def enhance_contrast(image_cv: np.ndarray) -> np.ndarray:
    """
    Applies CLAHE (Contrast Limited Adaptive Histogram Equalization) to enhance text clarity.
    """
    try:
        if len(image_cv.shape) == 3:
            lab = cv2.cvtColor(image_cv, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            enhanced_lab = cv2.merge((cl, a, b))
            return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            return clahe.apply(image_cv)
    except Exception:
        return image_cv

def extract_from_pdf(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], str, float, int]:
    """
    Extracts text and word bounding boxes from embedded digital PDF.
    Returns: (lines_with_boxes, full_text, avg_confidence, page_count)
    """
    if len(file_bytes) == 0:
        raise EmptyDocumentError("Document is empty (0 bytes)")

    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as e:
        if "encrypted" in str(e).lower() or "password" in str(e).lower():
            raise PasswordProtectedPDFError("Document is encrypted or password-protected.")
        raise OCRError(f"Failed to open PDF document: {str(e)}")

    if doc.is_encrypted:
        doc.close()
        raise PasswordProtectedPDFError("Document is encrypted or password-protected.")

    page_count = len(doc)
    if page_count > 20:
        doc.close()
        raise OversizedDocumentError(f"Document has {page_count} pages, exceeding the 20-page safety limit.")

    extracted_lines = []
    full_text_parts = []
    total_embedded_chars = 0

    for page_num in range(page_count):
        page = doc[page_num]
        rect = page.rect
        page_width, page_height = rect.width, rect.height

        # Extract blocks and words with bounding box
        # get_text("blocks") returns (x0, y0, x1, y1, text, block_no, block_type)
        blocks = page.get_text("blocks")
        for b in blocks:
            text = b[4].strip()
            if text:
                total_embedded_chars += len(text)
                for line in text.split("\n"):
                    line_clean = line.strip()
                    if line_clean:
                        extracted_lines.append({
                            "text": line_clean,
                            "page": page_num + 1,
                            "box": [round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)],
                            "confidence": 100.0,
                            "source": "EMBEDDED_PDF_TEXT",
                        })
                        full_text_parts.append(line_clean)

    doc.close()

    full_text = "\n".join(full_text_parts)

    # If document has pages but zero text, it's a scanned/image PDF -> render page to image & OCR
    if total_embedded_chars < 15 and page_count > 0:
        return extract_from_scanned_pdf(file_bytes)

    if total_embedded_chars == 0:
        raise EmptyDocumentError("Document contains no readable text or graphic elements.")

    return extracted_lines, full_text, 99.5, page_count

def extract_from_scanned_pdf(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], str, float, int]:
    """
    Renders pages of a scanned PDF to images and executes RapidOCR on each.
    """
    doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    page_count = len(doc)
    if page_count > 20:
        doc.close()
        raise OversizedDocumentError(f"Document has {page_count} pages, exceeding the 20-page safety limit.")

    extracted_lines = []
    full_text_parts = []
    confidences = []

    for page_num in range(page_count):
        page = doc[page_num]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        
        # Load into numpy
        nparr = np.frombuffer(img_bytes, np.uint8)
        img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        deskewed = deskew_image(img_cv)
        enhanced = enhance_contrast(deskewed)

        result, _ = ocr_engine(enhanced)
        if result:
            for item in result:
                box_pts, text, conf = item
                # box_pts is [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
                xs = [p[0] for p in box_pts]
                ys = [p[1] for p in box_pts]
                box = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
                text_clean = text.strip()
                if text_clean:
                    extracted_lines.append({
                        "text": text_clean,
                        "page": page_num + 1,
                        "box": box,
                        "confidence": round(float(conf) * 100, 1),
                        "source": "LOCAL_OCR_SCAN",
                    })
                    full_text_parts.append(text_clean)
                    confidences.append(float(conf) * 100)

    doc.close()
    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
    full_text = "\n".join(full_text_parts)
    return extracted_lines, full_text, avg_conf, page_count

def extract_from_image(file_bytes: bytes) -> Tuple[List[Dict[str, Any]], str, float, int]:
    """
    Extracts text and bounding boxes from a photo or scan (JPEG/PNG).
    Performs OpenCV deskewing, CLAHE contrast enhancement, then RapidOCR.
    """
    if len(file_bytes) == 0:
        raise EmptyDocumentError("Image file is empty (0 bytes)")

    nparr = np.frombuffer(file_bytes, np.uint8)
    img_cv = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img_cv is None:
        raise OCRError("Unable to decode image bytes. Unsupported or corrupted image file.")

    deskewed = deskew_image(img_cv)
    enhanced = enhance_contrast(deskewed)

    result, _ = ocr_engine(enhanced)
    if not result:
        # Check if blank
        return [], "", 0.0, 1

    extracted_lines = []
    full_text_parts = []
    confidences = []

    for item in result:
        box_pts, text, conf = item
        xs = [p[0] for p in box_pts]
        ys = [p[1] for p in box_pts]
        box = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]
        text_clean = text.strip()
        if text_clean:
            extracted_lines.append({
                "text": text_clean,
                "page": 1,
                "box": box,
                "confidence": round(float(conf) * 100, 1),
                "source": "LOCAL_OCR_SCAN",
            })
            full_text_parts.append(text_clean)
            confidences.append(float(conf) * 100)

    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else 0.0
    full_text = "\n".join(full_text_parts)
    return extracted_lines, full_text, avg_conf, 1
