import os
import fitz
import cv2
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()
details_dir = r"u:\aayu\details"
out_path = r"u:\aayu\scratch\ocr_unseen_results.txt"

with open(out_path, "w", encoding="utf-8") as out:
    def log(msg):
        out.write(msg + "\n")

    def inspect_file(fname):
        fp = os.path.join(details_dir, fname)
        log("=" * 60)
        log(f"EXTRACTING: {fname}")
        if fname.lower().endswith(".pdf"):
            doc = fitz.open(fp)
            log(f"Total Pages: {len(doc)}")
            for page_idx in range(len(doc)):
                page = doc[page_idx]
                pix = page.get_pixmap(dpi=150)
                img_path = f"u:/aayu/scratch/{fname}_p{page_idx}.png"
                pix.save(img_path)
                res, _ = ocr(img_path)
                lines = [r[1] for r in res] if res else []
                log(f"--- Page {page_idx+1} ({len(lines)} OCR lines) ---")
                for l in lines:
                    log(f"  {l}")
        else:
            res, _ = ocr(fp)
            lines = [r[1] for r in res] if res else []
            log(f"--- Image ({len(lines)} OCR lines) ---")
            for l in lines:
                log(f"  {l}")

    for f in os.listdir(details_dir):
        if not f.endswith(".txt") and not "Project_Report" in f:
            inspect_file(f)

print("Inspection complete. Saved to", out_path)
