# Medi Connect AI — Comprehensive Screen Inventory & UI Specifications

> **Inventory Status**: Complete (Phase 1 Baseline)  
> **Total Unique Screens**: 15  
> **Roles Supported**: Patient, Doctor, Hospital Staff, Super Admin  
> **Standards**: WCAG 2.1 AA Compliant, Responsive (Desktop, Tablet, Mobile), Platform-Adaptive

---

## Screen Matrix Overview

| Screen ID | Screen Name | Primary Role | Secondary Roles | Platform Support |
| :--- | :--- | :--- | :--- | :--- |
| `SCR-01` | Auth & Onboarding | All Roles | Guest | Web, Mobile |
| `SCR-02` | Patient Dashboard | Patient | — | Web, Mobile |
| `SCR-03` | Report Upload & Ingestion Status | Patient | Hospital Staff | Web, Mobile |
| `SCR-04` | Report Detail & Source-Linked Explanation | Patient | Doctor | Web, Mobile |
| `SCR-05` | Medical Timeline & Trend Charts | Patient | Doctor | Web, Mobile |
| `SCR-06` | AI Health Assistant Chat | Patient | — | Web, Mobile |
| `SCR-07` | Doctor & Hospital Directory Search | Patient | Hospital Staff | Web, Mobile |
| `SCR-08` | Appointment Booking & Consent Flow | Patient | Hospital Staff | Web, Mobile |
| `SCR-09` | Medication Schedule & Reminders | Patient | Doctor (Read) | Web, Mobile |
| `SCR-10` | Doctor Dashboard | Doctor | — | Web, Tablet |
| `SCR-11` | Doctor 60-Second Patient Brief View | Doctor | — | Web, Tablet, Mobile |
| `SCR-12` | Hospital Administration Dashboard | Hospital Staff | — | Web Desktop/Tablet |
| `SCR-13` | Billing Transparency & Review View | Patient | Hospital Staff | Web, Mobile |
| `SCR-14` | Super Admin / Government Oversight | Super Admin | — | Web Desktop |
| `SCR-15` | Settings, Privacy & Consent Center | All Roles | — | Web, Mobile |

---

## Detailed Screen Specifications

### `SCR-01`: Auth & Onboarding
* **Purpose**: Secure credential authentication, mock Aadhaar / ABHA ID SSO option, profile setup, and role selection with appropriate permissions.
* **Roles**: All (Patient, Doctor, Hospital Staff, Super Admin).
* **Components**:
  * Brand Header (`Medi Connect AI` logo, trust badges).
  * Role Switcher Tabs (`Patient`, `Doctor`, `Hospital Staff`, `Super Admin`).
  * Standard Auth Form (Email / Password, remember me, forgot password).
  * Mock National ID / ABHA Login Card (Simulated OTP verification modal with legal sandbox notice).
  * Medical Safety & Consent Disclaimer checkbox.
* **Data Requirements**: Supabase Auth endpoint `auth.signInWithPassword`, mock OTP gateway `auth.verifyOtp`.
* **States**:
  * *Loading*: Animated spinner in primary button, disabled form fields.
  * *Empty*: Clean input state with accessible placeholder hints.
  * *Success*: Redirects directly to role-specific home route (`/patient/dashboard`, `/doctor/dashboard`, etc.).
  * *Validation Warning*: Inline input errors (e.g., "Aadhaar must be 12 digits", "Password requires 8+ characters").
  * *Error*: Banner alert ("Invalid credentials. Please verify your email or password").
* **Responsive Behavior**: Centered 440px glassmorphic card on Desktop/Tablet; full-width edge-to-edge layout on Mobile.
* **Platform Navigation**: Standalone view with top language selector (English / Hindi).

---

### `SCR-02`: Patient Dashboard
* **Purpose**: Central patient control center showing health summary snapshot, urgent alerts, upcoming appointments, recent reports, and quick upload CTA.
* **Roles**: Patient.
* **Components**:
  * Greeting Header with Patient Name & ABHA ID chip.
  * Persistent Safety Banner: *"AI ASSISTS, DOCTOR DECIDES"*.
  * Urgent Alert Ticker (Shows if any uploaded report has unreviewed critical biomarkers).
  * Primary Action Card: *"Upload New Medical Report"* (Drag-and-drop or Mobile Camera capture).
  * Active Appointments Widget (Upcoming slot, doctor specialty, clinic address, directions link).
  * Recent Reports Carousel (Report thumbnail, lab name, date, extraction status badge).
  * Quick Health Metrics Sparklines (Latest Fasting Blood Sugar, HbA1c, Blood Pressure).
* **Data Requirements**: `GET /api/patient/overview`, `GET /api/reports/recent`, `GET /api/appointments/upcoming`.
* **States**:
  * *Loading*: Skeleton shimmer cards for metrics, appointments, and report carousel.
  * *Empty*: Welcoming onboarding card: "No medical reports uploaded yet. Upload your first blood test or prescription to unlock your digital health timeline."
  * *Success*: Render populated cards, sparklines, and status badges.
  * *Validation Warning*: Amber banner if profile lacks emergency contact details.
  * *Error*: "Unable to synchronize health records. Tap to retry."
* **Responsive Behavior**: 12-column grid on Desktop (3 columns of metric cards); 2 columns on Tablet; stacked vertical stream on Mobile.
* **Platform Navigation**: Web: Left sidebar navigation. Mobile: Bottom tab bar (`Home`, `Reports`, `Timeline`, `Chat`, `Profile`).

---

### `SCR-03`: Report Upload & Ingestion Status
* **Purpose**: Secure multi-page PDF/image document ingestion with interactive real-time extraction progress and metadata confirmation.
* **Roles**: Patient, Hospital Staff.
* **Components**:
  * Upload Dropzone (File types: PDF, JPG, PNG; max size 15MB).
  * Mobile Camera / Document Scanner Trigger button.
  * Document Metadata Inputs (Report Date, Diagnostic Lab Name, Test Category e.g., Biochemistry, Pathology, Radiology).
  * Multi-Stage Progress Stepper:
    1. *Upload to Encrypted Vault* (100%)
    2. *OCR Text & Coordinate Extraction* (In Progress...)
    3. *Deterministic Range & Unit Validation* (Pending)
    4. *Grounded AI Explanation Synthesis* (Pending)
  * Cancel / Re-upload Controls.
* **Data Requirements**: `POST /storage/v1/object/patient-medical-documents`, `POST /api/worker/process-report`.
* **States**:
  * *Loading*: Real-time progress bar with animated pulsating scanner graphic.
  * *Empty*: Clean dropzone with illustrated document icon and format requirements.
  * *Success*: Checkmark animation; button: *"View Source-Linked Analysis ->"*.
  * *Validation Warning*: "Document appears skewed or low resolution. Processing accuracy may be reduced."
  * *Error*: "OCR Processing failed: Unreadable scan or password-protected PDF. Please upload a clear image."
* **Responsive Behavior**: Side-by-side dropzone and metadata editor on Desktop; single-column stacked wizard on Mobile.
* **Platform Navigation**: Modal overlay on Web; full-screen modal with top "Cancel" button on Mobile.

---

### `SCR-04`: Report Detail & Source-Linked Explanation
* **Purpose**: Core patient-facing report screen displaying interactive source evidence: original laboratory document alongside rule-checked biomarkers and grounded plain-language explanations.
* **Roles**: Patient, Doctor.
* **Components**:
  * Persistent Header: Report Title, Lab Name, Test Date, Verified Status Badge (`AI Draft` vs `Doctor Verified`).
  * Split-Pane View:
    * **Left Pane (Document Viewer)**: Multi-page PDF/image viewer with zoom, pan, and highlighted interactive bounding boxes.
    * **Right Pane (Clinical Intelligence & Explanation)**:
      * Plain-Language Summary Box with Citation Chips (clicking a chip pans and highlights the exact bounding box in the left pane).
      * Biomarker Results Table: Test Name, Extracted Value, Lab Normal Range, Normalized Unit, Status Badge (`NORMAL`, `ELEVATED`, `CRITICAL`).
      * Gaps & Contradictions Card (e.g., "Lipid panel missing HDL value").
  * Action Bar: *[Share with Doctor]*, *[Download Report PDF]*, *[Ask Assistant About This Report]*.
* **Data Requirements**: `GET /api/reports/:id`, `GET /api/reports/:id/biomarkers`, `GET /api/reports/:id/signed-url`.
* **States**:
  * *Loading*: Dual skeleton panes.
  * *Empty*: "Report not found or has been deleted."
  * *Success*: Fully synchronized interactive split-view.
  * *Validation Warning*: Low confidence chip on biomarkers where OCR score < 85%.
  * *Error*: "Failed to retrieve document signed URL. Access token expired."
* **Responsive Behavior**: 50/50 split pane on Desktop; toggle tabs (`[Original Document] | [AI Explanation]`) on Mobile.
* **Platform Navigation**: Back button to `SCR-02` or `SCR-05`.

---

### `SCR-05`: Medical Timeline & Biomarker Trend Charts
* **Purpose**: Longitudinal health record organizing all patient encounters, lab reports, and prescriptions chronologically with interactive biomarker trend charts.
* **Roles**: Patient, Doctor.
* **Components**:
  * Date Range & Category Filter Bar (Last 3 Months, 1 Year, 5 Years; Labs, Prescriptions, Appointments).
  * Biomarker Trend Visualizer:
    * Dropdown selector: Fasting Blood Sugar, HbA1c, Total Cholesterol, Creatinine, TSH.
    * Line Chart with shaded green standard laboratory normal interval band.
    * Data points linking directly to historical report dates.
  * Chronological Vertical Timeline:
    * Event Nodes with iconography (Lab tube for blood test, Pill for prescription, Stethoscope for doctor visit).
    * Summary cards with verified findings and doctor notes.
* **Data Requirements**: `GET /api/patient/timeline`, `GET /api/patient/biomarkers/trends?biomarker=HbA1c`.
* **States**:
  * *Loading*: Timeline line skeleton with pulsing nodes.
  * *Empty*: "No historical trends available yet. Upload reports from at least 2 different dates to generate trend lines."
  * *Success*: Render dynamic Recharts curve with safe range band and chronological cards.
  * *Validation Warning*: "Units differ between reports (mg/dL vs mmol/L). Values normalized to mg/dL for comparison."
  * *Error*: "Failed to load timeline events."
* **Responsive Behavior**: Chart on top, timeline on bottom for Desktop and Mobile; horizontal filter bar scrolls horizontally on Mobile.
* **Platform Navigation**: Main navigation link on Web sidebar and Mobile bottom navigation.

---

### `SCR-06`: AI Health Assistant Chat
* **Purpose**: Conversational medical inquiry assistant grounded strictly in the patient's uploaded records; accepts voice and text input with multi-language plain-language translation.
* **Roles**: Patient.
* **Components**:
  * Safety Header with prominent persistent disclaimer: *"AI ASSISTS, DOCTOR DECIDES. This chatbot does not diagnose or prescribe."*
  * Language Switcher (`English` / `हिंदी - Hindi`).
  * Chat Conversation Stream:
    * System triage messages with emergency 112/108 advisory.
    * User speech/text query bubbles.
    * AI Assistant Responses featuring **Source Citation Badges** (e.g., `[Report: 12-Oct-2025, Page 1]`).
  * Input Bar: Text box, Voice Recording Microphone button with audio waveform visualizer, Attachment button.
  * Quick Prompt Chips (*"Explain my high cholesterol in simple words"*, *"What questions should I ask my doctor?"*, *"Summary of my last blood test"*).
* **Data Requirements**: `POST /api/chat/message`, `POST /api/chat/voice-transcribe`.
* **States**:
  * *Loading*: Three-dot pulsing typing indicator with "Grounding response in your lab records...".
  * *Empty*: Suggested conversation starters and clinical safety notice.
  * *Success*: Fluid message streaming with interactive citation popovers.
  * *Validation Warning*: Amber banner if user asks diagnostic question: "I cannot provide a medical diagnosis. Here is what your laboratory results indicate according to medical guidelines: ...".
  * *Error*: "Network disconnected. Tap to resend."
* **Responsive Behavior**: Fixed sidebar drawer on Web; full-screen chat interface on Mobile.
* **Platform Navigation**: Mobile bottom bar item; Web accessible via top bar icon or floating action widget.

---

### `SCR-07`: Doctor & Hospital Directory Search
* **Purpose**: Search and discover verified medical specialists and accredited hospital departments with location, specialty, and availability filters.
* **Roles**: Patient, Hospital Staff.
* **Components**:
  * Search Bar (Doctor name, specialty e.g., Cardiologist, hospital name, symptom keyword).
  * Filter Chips: Specialty, Consultation Type (In-Clinic vs Video), Next Available Slot (Today, Tomorrow), Distance / City.
  * Doctor Profile Cards: Photo, Name, Degree, Medical Council License Number, Affiliated Hospital, Experience, Consultation Fee, Rating.
  * Primary Action: *[Book Appointment]* button.
* **Data Requirements**: `GET /api/doctors/search?specialty=...&location=...`.
* **States**:
  * *Loading*: Grid of doctor card skeleton shimmers.
  * *Empty*: "No doctors found matching your criteria. Try expanding your search distance or selecting another specialty."
  * *Success*: Populated card list with available appointment badges.
  * *Validation Warning*: Notice if geolocation permission is denied.
  * *Error*: "Unable to fetch doctor directory."
* **Responsive Behavior**: Multi-column grid on Desktop (3 columns); single vertical card stream on Mobile.
* **Platform Navigation**: Top bar or sidebar navigation link.

---

### `SCR-08`: Appointment Booking & Consent Flow
* **Purpose**: Schedule a clinical consultation with slot selection, optional symptom audio/text attachment, and explicit granular consent to share medical reports.
* **Roles**: Patient, Hospital Staff.
* **Components**:
  * Doctor Summary Card (Name, Clinic location, Consultation mode).
  * Date & Slot Picker (Morning, Afternoon, Evening time chips).
  * Reason for Visit / Current Symptoms input (Text box + Voice note recorder).
  * **Patient Consent Authorization Card**:
    * Checkbox list: *Share last 12 months lab reports*, *Share longitudinal medical timeline*, *Share AI-generated draft summary*.
    * Expiration selector (Valid for 24 hours, 7 days, or single consultation).
    * Revocation notice: *"You may revoke access at any time in Settings"*.
  * Confirmation CTA: *[Confirm Appointment & Authorize Access]*.
* **Data Requirements**: `GET /api/doctors/:id/slots`, `POST /api/appointments/book`.
* **States**:
  * *Loading*: Spinner while reserving temporary slot lock.
  * *Empty*: Slot picker shows "No available slots on this date. Select next date."
  * *Success*: Booking confirmed modal with Calendar Add (`.ics`) and SMS/WhatsApp confirmation banner.
  * *Validation Warning*: Disabled submit button if consent checkbox is unchecked with message: "Consent is required to share your medical history with the consulting doctor."
  * *Error*: "This slot was just booked by another patient. Please select another time."
* **Responsive Behavior**: 2-column modal on Desktop; multi-step bottom-sheet flow on Mobile.
* **Platform Navigation**: Sub-view triggered from `SCR-07` or `SCR-02`.

---

### `SCR-09`: Medication Schedule & Reminders
* **Purpose**: Organize daily medicine timetable, dosage instructions, food timing rules, adherence check-offs, and refill alerts.
* **Roles**: Patient, Doctor (Read-only).
* **Components**:
  * Daily Date Strip Selector (Monday, Tuesday, Wednesday...).
  * Adherence Score Ring (e.g. `85% On Track This Week`).
  * Time-Segmented Medication Cards:
    * **Morning (8:00 AM)**: Metformin 500mg (1 tablet after breakfast) - *[Taken]* button.
    * **Afternoon (1:00 PM)**: Multivitamin (1 capsule after lunch) - *[Taken]* button.
    * **Night (9:00 PM)**: Atorvastatin 20mg (1 tablet before bed) - *[Taken]* button.
  * Refill Warning Pill (e.g. "Metformin: 4 days remaining. Reorder now").
  * Add Custom Medication button.
* **Data Requirements**: `GET /api/medications/schedule`, `POST /api/medications/log-dose`.
* **States**:
  * *Loading*: Medicine card skeleton shimmers.
  * *Empty*: "No active prescriptions found. Tap + to add your daily medications."
  * *Success*: Interactive checkboxes with satisfying sound/vibration feedback on Mobile.
  * *Validation Warning*: Pill interaction alert if doctor flagged contradictory medicines.
  * *Error*: "Failed to record medication status."
* **Responsive Behavior**: Grid of time blocks on Desktop; vertical chronological timeline on Mobile.
* **Platform Navigation**: Bottom tab item on Mobile; left navigation link on Web.

---

### `SCR-10`: Doctor Dashboard
* **Purpose**: High-density clinical cockpit for consulting physicians displaying today's appointment queue, pending report reviews, and urgent critical biomarker alert stream.
* **Roles**: Doctor.
* **Components**:
  * Doctor Header: Dr. Alex Morgan, MD, Department of Cardiology, License #MCI-84920.
  * KPI Counter Cards: Today's Appointments (14), Pending Reviews (5), Critical Red Flags (2).
  * Critical Red-Flag Stream (Immediate priority cards with patient name, critical biomarker e.g., Troponin I 0.8 ng/mL, time received).
  * Today's Patient Appointment Table:
    * Time Slot, Patient Name, Age/Gender, Chief Complaint, Consent Status (`Active Consent - 7 Days`), Action: *[Open 60-Second Brief]*.
  * Search Bar for historical consented patients.
* **Data Requirements**: `GET /api/doctor/dashboard-stats`, `GET /api/doctor/appointments/today`, `GET /api/doctor/critical-alerts`.
* **States**:
  * *Loading*: Table skeleton shimmer.
  * *Empty*: "No appointments scheduled for today. Consultation queue is clear."
  * *Success*: Populated priority stream and patient table.
  * *Validation Warning*: "Patient consented to only the latest report; historical access restricted."
  * *Error*: "Failed to synchronize appointment queue."
* **Responsive Behavior**: Full 12-column table on Desktop; card-based queue on Tablet/Mobile.
* **Platform Navigation**: Doctor primary home route (`/doctor/dashboard`).

---

### `SCR-11`: Doctor 60-Second Patient Brief View (Flagship Screen)
* **Purpose**: The core clinical innovation screen providing a synthesized 1-page clinical brief, red flags, longitudinal biomarker trends, side-by-side original source verification, and explicit physician sign-off controls.
* **Roles**: Doctor.
* **Components**:
  * Patient Clinical Banner: Name (Aarav Sharma), Age (44M), UHID/ABHA, Blood Group, Active Allergies (Penicillin).
  * Persistent Prominent Header: *"AI ASSISTS, DOCTOR DECIDES — Clinical Verification Required"*.
  * **60-Second Synthesis Panel**:
    * Chief Complaint & Triage Summary.
    * Red-Flag Biomarkers (e.g. `HbA1c 8.4% HIGH`, `LDL 168 mg/dL ELEVATED` with rule-checked delta vs last visit).
    * Clinical Gaps Detected (e.g., `Missing Renal Profile: Serum Creatinine overdue by 14 months`).
    * Contradiction Warning (e.g., `Discordant Glucose: Fasting Glucose dropped 40% while HbA1c climbed 0.6%`).
  * **Interactive Source Verification Pane**:
    * Tabbed viewer showing original laboratory PDF with bounding box highlights matching each extracted biomarker.
    * Click-to-verify toggle on each extracted value.
  * **Doctor Decision & Action Bar**:
    * Action Controls: **[Approve AI Brief]**, **[Edit / Correct Findings]**, **[Reject Brief]**.
    * Clinical Notes & Prescription Editor (Diagnosis field, Add e-Prescription, Follow-up date).
    * Digital Signature & Finalize Consultation CTA.
* **Data Requirements**: `GET /api/doctor/patient-brief/:patientId`, `POST /api/doctor/brief/action`, `POST /api/doctor/consultation/finalize`.
* **States**:
  * *Loading*: High-density skeleton cockpit.
  * *Empty*: "No authorized patient records found. Patient consent may have expired."
  * *Success*: Integrated split cockpit with active action bar.
  * *Validation Warning*: Red-border alert if doctor attempts to approve without reviewing unverified red-flag biomarkers.
  * *Error*: "Failed to record clinical approval. Please try again."
* **Responsive Behavior**: Desktop (1440px): 3-column cockpit (Left: Patient profile & history, Center: 60-second brief & decision, Right: Source document viewer). Tablet (1024px): 2-column cockpit. Mobile (390px): Stacked view with bottom sticky decision bar.
* **Platform Navigation**: Direct navigation from Doctor Dashboard (`SCR-10`).

---

### `SCR-12`: Hospital Administration Dashboard
* **Purpose**: Hospital desk and department management center for allocating doctor appointment rosters, managing clinic schedules, and reviewing hospital accreditation data.
* **Roles**: Hospital Staff.
* **Components**:
  * Hospital Profile Header (City Care Multi-Specialty Hospital, NABH Accredited #H-2024-918).
  * Department Schedule Manager (Cardiology, Endocrinology, General Medicine).
  * Doctor Duty Roster with active on-call status toggles.
  * Appointment Allocation Queue: Unassigned incoming patient booking requests with *[Assign Doctor]* dropdown.
  * Patient Inflow Analytics (Today's check-ins, average OPD wait time).
* **Data Requirements**: `GET /api/hospital/overview`, `GET /api/hospital/doctors`, `POST /api/hospital/appointments/assign`.
* **States**:
  * *Loading*: Table skeletons.
  * *Empty*: "All department appointment requests have been allocated."
  * *Success*: Live schedule view.
  * *Validation Warning*: Alert if doctor roster has overlapping shift assignments.
  * *Error*: "Failed to update hospital roster."
* **Responsive Behavior**: Desktop/Tablet optimized (12-column layout); read-only mobile view.
* **Platform Navigation**: Hospital primary home route (`/hospital/dashboard`).

---

### `SCR-13`: Billing Transparency & Review View
* **Purpose**: Transparent itemized medical bill auditor that uses rule-based parsers to verify arithmetic totals, detect duplicate line items, and flag unbundled charges for human review.
* **Roles**: Patient, Hospital Staff.
* **Components**:
  * Bill Summary Card: Hospital Name, Invoice #, Date of Admission/Discharge, Total Billed Amount.
  * **Objective Audit Summary Banner**:
    * Status: *"Audit Complete — 2 Possible Discrepancies Flagged for Human Review"*.
    * Framing Rule: Objective, non-accusatory language (zero allegations of fraud).
  * Itemized Line-Item Comparison Table:
    * Description, Code, Quantity, Rate, Billed Amount, Verification Status.
    * Discrepancy Badges: `Arithmetic Delta (₹350)`, `Repeated Charge on Same Date (Complete Blood Count billed twice on 14-Oct)`.
  * Supporting Document Cross-Check (Matches billed items against uploaded doctor treatment notes).
  * Action Buttons: *[Submit for Hospital Billing Review]*, *[Download Audit Report PDF]*.
* **Data Requirements**: `POST /api/billing/audit`, `GET /api/billing/audit/:id`.
* **States**:
  * *Loading*: Progress bar: "Auditing line items, checking arithmetic sums, cross-referencing supporting documents...".
  * *Empty*: Dropzone: "Upload an itemized hospital bill (PDF or image) to check arithmetic and itemized entries."
  * *Success*: Render itemized table with discrepancy highlights and total reconciliation.
  * *Validation Warning*: "Total on bill does not match sum of individual line items by ₹450."
  * *Error*: "Unable to parse bill layout. Please upload a clear itemized tax invoice."
* **Responsive Behavior**: Full table on Desktop; card-based line-item review on Mobile.
* **Platform Navigation**: Available under Services menu on Web and Mobile.

---

### `SCR-14`: Super Admin / Government Oversight Dashboard
* **Purpose**: Strictly read-only, de-identified public health analytics and system integrity dashboard; allows broadcasting public health scheme awareness banners without accessing individual PHI.
* **Roles**: Super Admin / Government Oversight Officer.
* **Components**:
  * Oversight Header: Ministry / Public Health Oversight View (Read-Only Mode).
  * System Integrity Metrics: Total De-Identified Reports Processed, System Extraction Accuracy (98.4%), Average Doctor Review Time (58s), Security Audit Events (Zero breaches).
  * Aggregated Public Health Epidemiology Map (Anonymized geographic prevalence of elevated biomarkers e.g. HbA1c > 8% by district).
  * Public Health Scheme Broadcast Manager:
    * Active Schemes: *Ayushman Bharat / PM-JAY*, *Mukhyamantri Chiranjeevi Yojana*.
    * Broadcast eligibility banners to matching patient demographics.
  * Platform Security Audit Log Table (Timestamp, Action, Role, IP hash, Status).
* **Data Requirements**: `GET /api/admin/deidentified-stats`, `GET /api/admin/audit-logs`, `POST /api/admin/schemes/broadcast`.
* **States**:
  * *Loading*: Metric card skeleton shimmers.
  * *Empty*: "No security incidents or audit warnings."
  * *Success*: Populated epidemiological charts and de-identified metric gauges.
  * *Validation Warning*: Notice if aggregate cohort sample size is < 10 (k-anonymity enforcement).
  * *Error*: "Failed to load administrative logs."
* **Responsive Behavior**: Desktop 1440px wide-screen cockpit.
* **Platform Navigation**: Super Admin primary home route (`/admin/oversight`).

---

### `SCR-15`: Settings, Privacy & Consent Center
* **Purpose**: Transparent privacy dashboard allowing patients to inspect active data access consents, revoke doctor/hospital permissions with one click, export records, and configure security.
* **Roles**: All Roles.
* **Components**:
  * User Profile Card (Name, Contact, Role, Verification status).
  * **Active Consents Manager**:
    * List of Doctors & Hospitals currently authorized to view records.
    * Expiration timer (e.g. "Expires in 3 days").
    * Primary Action: **[Revoke Access Immediately]** button.
  * Data Sovereignty & Portability:
    * *[Export All Health Records (FHIR / JSON / PDF)]*.
    * *[Delete Account & Purge Stored Reports]*.
  * Audit Access Log (Shows exact timestamp and doctor name every time a patient's report was viewed).
  * Notification Preferences (WhatsApp alerts, SMS reminders, Email notifications).
* **Data Requirements**: `GET /api/privacy/consents`, `DELETE /api/privacy/consents/:id`, `GET /api/privacy/access-logs`.
* **States**:
  * *Loading*: Skeleton list of consent cards.
  * *Empty*: "No external doctors or hospitals currently have access to your health records."
  * *Success*: Live list of active authorizations with toggle controls.
  * *Validation Warning*: Confirmation modal when revoking access during an active consultation.
  * *Error*: "Failed to revoke consent. Please try again."
* **Responsive Behavior**: Multi-tab settings on Desktop; stacked accordion list on Mobile.
* **Platform Navigation**: Available from user avatar dropdown on Web; bottom profile tab on Mobile.
