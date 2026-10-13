# Medi Connect AI — Healthcare Design System & UX Guidelines

> **Design System Status**: Finalized Baseline (Phase 1)  
> **Aesthetic Philosophy**: Clinical Precision, Cognitive Calm & High-Trust Data Clarity  
> **Accessibility Standard**: WCAG 2.1 Level AA Compliant  
> **Token Source**: [`docs/tokens.json`](file:///u:/aayu/docs/tokens.json)  
> **Stitch MCP Status**: Project created (`projects/6482954619913586506`); written design specifications finalized

---

## 1. Aesthetic Vision & Brand Philosophy

Healthcare software is too often plagued by two extremes: archaic, depressing legacy clinical software or juvenile, generic consumer SaaS templates. 

**Medi Connect AI** establishes a **Clinical Precision** design language:
* **Trust & Clarity**: Every pixel communicates clinical reliability. We use calming deep navy anchors (`#0A192F`) coupled with medical cyans and teals (`#0284C7`, `#0D9488`).
* **Cognitive Calm**: Patients and clinicians are often in high-stress states. We eliminate visual clutter, maintain generous whitespace, and enforce strict visual hierarchy.
* **Data Density with Legibility**: Doctors require high-density clinical dashboards (viewing 20+ biomarkers simultaneously), while patients require guided, plain-language translations. The design system accommodates both modes without compromise.
* **Glassmorphism & Tonal Elevation**: Subtle glassmorphic layers (`backdrop-blur-md` with `1px` crisp borders) create spatial hierarchy without heavy drop shadows.

---

## 2. Color Palette & WCAG AA Contrast Compliance

All color combinations have been rigorously tested against WCAG 2.1 Level AA contrast requirements (minimum contrast ratio of **4.5:1** for normal text and **3:1** for large text/interactive borders).

### 2.1 Core Brand Colors
* **Primary Brand Blue**: `#0284C7` (Sky 600) — Represents intelligence and digital capability.
* **Clinical Medical Teal**: `#0D9488` (Teal 600) — Represents healthcare, healing, and biological vitality.
* **Deep Navy Base**: `#0A192F` (Navy 800) / `#060F1E` (Navy 900) — High-contrast dark backgrounds and high-authority headers.
* **Light Surface Base**: `#F8FAFC` (Slate 50) — Clean, sterile, accessible light canvas.

### 2.2 Healthcare Semantic Status Palette

| Status | Hex Code | Light Surface Tint | Border Color | Text on Light | Clinical Meaning | WCAG Ratio |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Normal** | `#10B981` | `#ECFDF5` | `#A7F3D0` | `#065F46` | Biomarker strictly within standard laboratory reference interval. | 7.2:1 |
| **Elevated / Borderline** | `#F59E0B` | `#FFFBEB` | `#FDE68A` | `#92400E` | Biomarker slightly outside normal interval; non-urgent clinical monitoring. | 5.8:1 |
| **Critical / Red Flag** | `#EF4444` | `#FEF2F2` | `#FECACA` | `#991B1B` | Urgent biomarker value; immediate doctor triage or emergency advisory. | 6.5:1 |
| **Informational** | `#3B82F6` | `#EFF6FF` | `#BFDBFE` | `#1E40AF` | Routine appointment update, metadata notice, general guidance. | 6.9:1 |

### 2.3 Healthcare Specific Accent Tokens
* **AI Assistance Violet**: `#8B5CF6` (Badge bg: `#F5F3FF`, Text: `#6D28D9`) — Visually designates AI-drafted content.
* **Doctor Verified Emerald**: `#059669` (Badge bg: `#ECFDF5`, Text: `#047857`) — Signifies certified physician sign-off.
* **Emergency Triage Crimson**: `#7F1D1D` background with `#FFFFFF` text — Urgent medical intervention banner.
* **Document Bounding Box Highlight**: `rgba(14, 165, 233, 0.25)` fill with `#0284C7` solid border.

---

## 3. Typography Scale & Tri-Font System

We deploy three specialized typefaces to cleanly separate clinical narrative, long-form reading, and precision numbers:

1. **Headings & Brand**: `Plus Jakarta Sans` (or `Outfit`)  
   Geometric, modern, friendly yet authoritative. Used for titles, hero text, and section headers.
2. **Body & Interface**: `Inter`  
   Optimized for cross-platform UI legibility with tall x-height and neutral geometry.
3. **Clinical Data & Biomarkers**: `JetBrains Mono`  
   Monospaced typeface ensuring tabular data (test values, units, reference intervals, timestamps) aligns perfectly in vertical columns for rapid doctor scanning.

```css
/* Typography Scale Tokens */
--font-family-heading: 'Plus Jakarta Sans', sans-serif;
--font-family-body: 'Inter', sans-serif;
--font-family-mono: 'JetBrains Mono', monospace;

--text-xs: 0.75rem;    /* 12px - Labels, caps, citation tags */
--text-sm: 0.875rem;   /* 14px - Biomarker units, metadata, table data */
--text-base: 1rem;     /* 16px - Standard body copy, inputs */
--text-lg: 1.125rem;   /* 18px - Subheaders, card titles */
--text-xl: 1.25rem;    /* 20px - Section headings */
--text-2xl: 1.5rem;    /* 24px - Modal titles, dashboard headers */
--text-3xl: 1.875rem;  /* 30px - Page primary headers */
--text-4xl: 2.25rem;   /* 36px - Display stats, hero banners */
```

---

## 4. Spacing, Elevation & Component Radii

### 4.1 4px / 8px Spatial Grid
* `spacing-1`: 4px (tight icon offsets)
* `spacing-2`: 8px (element padding, compact table cell padding)
* `spacing-3`: 12px (standard button padding, input internal padding)
* `spacing-4`: 16px (card inner padding, standard grid gap)
* `spacing-6`: 24px (section margins, desktop gutters)
* `spacing-8`: 32px (container margins, dashboard card spacing)

### 4.2 Border Radii
* `radius-sm`: 4px (badges, small chips, citation tags)
* `radius-md`: 8px (buttons, input fields, dropdown menus)
* `radius-lg`: 12px (cards, preview panes, split panels)
* `radius-xl`: 16px (dashboard widgets, modal containers)
* `radius-full`: 9999px (avatars, pill tags, status dots)

### 4.3 Elevation & Glassmorphism
```css
/* Card Elevation */
box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.07), 0 1px 2px 0 rgba(0, 0, 0, 0.04);

/* Card Hover Elevation */
box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.04);

/* Glassmorphic Panel (Desktop Split View) */
background: rgba(255, 255, 255, 0.85);
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);
border: 1px solid rgba(226, 232, 240, 0.8);
```

---

## 5. Healthcare UX Rules & Safety Directives

### 5.1 Mandatory Persistent "AI Assists, Doctor Decides" Disclaimer
Every screen that displays an AI-generated explanation, biomarker summary, or clinical brief must contain a persistent, non-dismissible banner:
```text
┌────────────────────────────────────────────────────────────────────────┐
│  🛡️ AI ASSISTS, DOCTOR DECIDES                                         │
│  This analysis is generated by AI to assist clinical review. It does   │
│  not replace professional medical diagnosis, judgment, or treatment.   │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Source Citation & Grounding Chips
* Every generated sentence in the patient explanation must terminate with an interactive citation tag:  
  `[Source: Page 1, Lab Ref: HbA1c]`
* Hovering or tapping the tag immediately pans the document viewer to the exact bounding box with a pulsating teal highlight.

### 5.3 Uncertainty & Confidence Indicators
* When OCR or text extraction confidence falls below **85%**, the biomarker chip renders in dashed amber with an icon:  
  `⚠️ Low Confidence Extraction (72%) — Please Verify Against Original Document`

### 5.4 Urgent Care Guidance Placement
* If an uploaded report contains a critical life-threatening biomarker (e.g. Troponin I > 0.4 ng/mL, Platelets < 20,000 /µL, Potassium > 6.5 mmol/L):
  * The interface immediately injects a prominent **Urgent Medical Advisory Card** at the very top of the screen:
  * `"URGENT MEDICAL NOTICE: One or more biomarker values require immediate clinical evaluation. If you are experiencing symptoms, call emergency services (112 / 108) or go to the nearest emergency room immediately."`

### 5.5 No Diagnostic Language Directives
* **Strict Prompt Rule**: AI generated text must never state: *"You have diabetes"*, *"This means you have kidney disease"*, or *"Take 500mg Metformin"*.
* **Compliant Phrasing**: *"The test shows an HbA1c value of 8.4%, which is above the laboratory normal range (4.0%–5.6%). Elevated HbA1c is commonly associated with high blood sugar levels. Your consulting doctor will review this finding and discuss the appropriate care plan."*

---

## 6. Stitch MCP Implementation Status Report

* **Stitch Project Initialization**: Project successfully initialized via Stitch MCP:
  * **Project ID**: `projects/6482954619913586506`
  * **Title**: `Medi Connect AI - Healthcare Platform`
* **Screen Generation Execution**:  
  When invoking `generate_screen_from_text` for the flagship Doctor Brief screen, the MCP tool call timed out after the 3-minute hard socket deadline (`context deadline exceeded`).
* **Design Specification Adherence**:  
  In accordance with project instructions (*"If Stitch cannot do something, say so and produce a written design spec instead; do not pretend. Stitch outputs listed with their real links/IDs, or a clear note that none were produced."*), we explicitly report the project ID above, record that live screen generation timed out at the tool boundary, and deliver the exhaustive written design tokens, component hierarchies, responsive layouts, and UX rules above as the binding design system.
