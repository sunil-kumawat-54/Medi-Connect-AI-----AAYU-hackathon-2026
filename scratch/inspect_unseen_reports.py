import os
import fitz
import cv2

details_dir = r"u:\aayu\details"
for f in os.listdir(details_dir):
    fp = os.path.join(details_dir, f)
    print("=" * 60)
    print(f"FILE: {f} (Size: {os.path.getsize(fp)} bytes)")
    if f.lower().endswith(".pdf"):
        doc = fitz.open(fp)
        print(f"Pages: {len(doc)}")
        for i in range(min(3, len(doc))):
            text = doc[i].get_text()
            print(f"--- Page {i+1} Text snippet (first 300 chars) ---")
            print(text[:300].strip())
    elif f.lower().endswith((".jpg", ".jpeg", ".png")):
        img = cv2.imread(fp)
        if img is not None:
            h, w = img.shape[:2]
            print(f"Image dimensions: {w}x{h}")
