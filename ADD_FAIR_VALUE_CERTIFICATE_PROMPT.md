# 🤖 CODING ASSISTANT PROMPT
# Task: Add "Certification of Fair Value of Shares" to CertifyPro

---

## CONTEXT — READ THIS FIRST

You are working inside the **CertifyPro - CA Certificate Management System**.
This is a full-stack app: **FastAPI backend** (`backend/server.py`) + **React frontend** (`frontend-app/`).

The system already handles Net Worth, Turnover, Fund Utilisation, RERA, and NBFC certificates.
Each certificate follows the same pattern:
- A React form page collects data
- Frontend calls `POST /api/certificates/` with a `cert_type` field
- Backend validates, saves to SQLite (`Certificates` table), and returns a generated `.docx` file
- The `.docx` style follows the `LOD CA certificate_.docx` template (letterhead, firm signature block, UDIN line)

---

## OBJECTIVE

Add **ONE new certificate type** called **"Certification of Fair Value of Shares"**.

This is a SINGLE certificate that has a **sub-type dropdown** (called `valuation_purpose`) with these options:
1. Allotment
2. Buy Back
3. Merger / De-merger
4. Resident to Non-Resident Transfer
5. Form 3CEB – Arm's Length Price u/s 92

The sub-type changes only the **purpose paragraph** inside the certificate body.
Everything else — the form fields, validation, DOCX layout, and API endpoint — is shared and identical.

Additionally, the form must include an **MCA Master Data PDF upload button** that auto-extracts and pre-fills company fields when the user uploads an MCA PDF downloaded from the Ministry of Corporate Affairs portal.

---

## STEP 1 — BACKEND: PDF Extractor Module

Create a new file: `backend/pdf_extractor.py`

```python
# backend/pdf_extractor.py
import fitz  # PyMuPDF  — install with: pip install pymupdf
import re

def extract_mca_data(pdf_bytes: bytes) -> dict:
    """
    Parses an MCA Master Data PDF (as downloaded from mca.gov.in)
    and returns a structured dict of company details.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    full_text = ""
    for page in doc:
        full_text += page.get_text()

    def find(pattern, default=""):
        m = re.search(pattern, full_text, re.IGNORECASE | re.DOTALL)
        return m.group(1).strip() if m else default

    # Extract directors table — returns list of dicts
    directors = []
    dir_pattern = re.findall(
        r'(\d+)\s+([\d]{8})\s+([A-Z ]+?)\s+(Director|Managing Director|Whole Time Director|CEO|CFO)\s+(\w+)\s+([\d/]+)',
        full_text
    )
    for row in dir_pattern:
        directors.append({
            "sr_no": row[0],
            "din": row[1],
            "name": row[2].strip(),
            "designation": row[3],
            "category": row[4],
            "date_of_appointment": row[5]
        })

    return {
        "cin":                  find(r'CIN\s+([A-Z0-9]{21})'),
        "company_name":         find(r'Company Name\s+([^\n]+)'),
        "registered_address":   find(r'Registered Address\s+([^\n]+(?:\n(?!\s*[A-Z][a-z])[^\n]+)*)'),
        "date_of_incorporation":find(r'Date of Incorporation\s+([\d/]+)'),
        "authorised_capital":   find(r'Authorised Capital \(Rs\)\s+([\d,]+)'),
        "paid_up_capital":      find(r'Paid up Capital \(Rs\)\s+([\d,]+)'),
        "email":                find(r'Email Id\s+([^\n]+)'),
        "roc":                  find(r'ROC Name\s+([^\n]+)'),
        "company_status":       find(r'Company Status\s+([^\n]+)'),
        "directors":            directors
    }
```

---

## STEP 2 — BACKEND: New API Endpoint in server.py

Add the following two things to `backend/server.py`:

### 2A — PDF Extraction Endpoint

```python
from backend.pdf_extractor import extract_mca_data
from fastapi import UploadFile, File

@app.post("/api/certificates/extract-mca-pdf")
async def extract_mca_pdf(file: UploadFile = File(...)):
    """Accepts an MCA Master Data PDF and returns extracted company data as JSON."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    pdf_bytes = await file.read()
    try:
        data = extract_mca_data(pdf_bytes)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF parsing failed: {str(e)}")
```

### 2B — New CertCategory Enum Value

In the existing `CertCategory` enum (or wherever cert types are defined), add:

```python
FAIR_VALUE_SHARES = "fair_value_shares"
```

### 2C — Validation Logic

In the existing `validate_certificate_data()` function (or equivalent), add a new case:

```python
elif cert_type == "fair_value_shares":
    required_fields = [
        "company_name", "cin", "registered_address",
        "valuation_purpose",      # sub-type: allotment / buyback / merger / rtor / form3ceb
        "valuation_date",         # "As on" date for valuation
        "number_of_shares",       # total shares being valued
        "face_value_per_share",   # face value (Rs.)
        "fair_value_per_share",   # computed/determined fair value (Rs.)
        "valuation_method",       # DCF / NAV / Market Price / Rule 11UA etc.
        "ca_name", "ca_membership_no", "firm_name", "firm_frn", "udin",
        "certificate_date", "certificate_place"
    ]
    for field in required_fields:
        if not data.get(field):
            raise ValueError(f"Missing required field: {field}")
```

### 2D — DOCX Generation Function

Add a new function to the DOCX generation section of `server.py` (or a separate `generators/fair_value.py`):

```python
from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import copy
from datetime import datetime

PURPOSE_TEXT = {
    "allotment": (
        "allotment of shares under Section 56(2)(x) of the Income Tax Act, 1961 read with "
        "Rule 11UA of the Income Tax Rules, 1962, and as required under applicable provisions "
        "of the Companies Act, 2013"
    ),
    "buyback": (
        "buy-back of shares under Section 68 of the Companies Act, 2013 and the Companies "
        "(Share Capital and Debentures) Rules, 2014"
    ),
    "merger": (
        "Merger / De-merger under Sections 230-232 of the Companies Act, 2013 and as may be "
        "required by the National Company Law Tribunal (NCLT)"
    ),
    "rtor": (
        "transfer of shares from a Resident to a Non-Resident under the Foreign Exchange "
        "Management Act, 1999 (FEMA) and the Foreign Exchange Management (Non-Debt Instruments) "
        "Rules, 2019, as per the pricing guidelines of the Reserve Bank of India"
    ),
    "form3ceb": (
        "reporting of international transactions at Arm's Length Price under Section 92 of the "
        "Income Tax Act, 1961, as required to be certified in Form 3CEB"
    ),
}

def generate_fair_value_docx(data: dict) -> bytes:
    """
    Generates a Fair Value of Shares certificate DOCX.
    Styled to match the LOD CA certificate template.
    """
    from docx import Document
    from docx.shared import Pt, Inches
    from io import BytesIO

    doc = Document()

    # ── Page margins (match LOD template: 1 inch all sides) ──
    section = doc.sections[0]
    section.top_margin    = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin   = Inches(1.25)
    section.right_margin  = Inches(1.25)

    def add_para(text="", bold=False, size=11, align=WD_ALIGN_PARAGRAPH.LEFT,
                 underline=False, space_before=0, space_after=6, color=None):
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_before = Pt(space_before)
        p.paragraph_format.space_after  = Pt(space_after)
        if text:
            run = p.add_run(text)
            run.bold      = bold
            run.underline = underline
            run.font.size = Pt(size)
            if color:
                run.font.color.rgb = RGBColor(*color)
        return p

    def add_mixed(parts, size=11, align=WD_ALIGN_PARAGRAPH.LEFT, space_after=6):
        """parts = list of (text, bold) tuples"""
        p = doc.add_paragraph()
        p.alignment = align
        p.paragraph_format.space_after = Pt(space_after)
        for text, bold in parts:
            run = p.add_run(text)
            run.bold = bold
            run.font.size = Pt(size)
        return p

    # ── Firm Header (bold, centered) ──
    add_para(data.get("firm_name", "").upper(), bold=True, size=13,
             align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_para(f"(Chartered Accountants)", bold=False, size=11,
             align=WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    add_para(f"F. R. No. {data.get('firm_frn', '')}", bold=True, size=11,
             align=WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    # ── Horizontal Rule ──
    p = doc.add_paragraph()
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '6')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '000000')
    pBdr.append(bottom)
    pPr.append(pBdr)
    p.paragraph_format.space_after = Pt(10)

    # ── Subject ──
    add_para("TO WHOM SO EVER IT MAY CONCERN", bold=True, underline=True,
             align=WD_ALIGN_PARAGRAPH.CENTER, size=12, space_after=12)

    # ── Subject line ──
    purpose_label = {
        "allotment": "Allotment of Shares",
        "buyback":   "Buy Back of Shares",
        "merger":    "Merger / De-merger",
        "rtor":      "Transfer of Shares – Resident to Non-Resident",
        "form3ceb":  "Form 3CEB – Arm's Length Price u/s 92",
    }.get(data.get("valuation_purpose", ""), "Share Valuation")

    add_mixed([
        ("Sub: Certification of Fair Value of Shares – ", False),
        (purpose_label, True)
    ], size=11, space_after=12)

    # ── Opening paragraph ──
    purpose_desc = PURPOSE_TEXT.get(data.get("valuation_purpose", ""), "")
    opening = (
        f"This is to certify that we have examined the books of accounts, financial statements, "
        f"and other relevant documents of M/s {data['company_name']} "
        f"(CIN: {data['cin']}), having its registered office at {data['registered_address']}, "
        f"incorporated on {data.get('date_of_incorporation', '')} under the Companies Act."
    )
    add_para(opening, size=11, space_after=8)

    add_para(
        f"The certificate is being issued for the purpose of {purpose_desc}.",
        size=11, space_after=8
    )

    # ── Valuation Details Table ──
    add_para("VALUATION DETAILS", bold=True, size=11, space_after=4)

    table = doc.add_table(rows=1, cols=2)
    table.style = 'Table Grid'
    table.columns[0].width = Inches(3.5)
    table.columns[1].width = Inches(2.5)

    hdr = table.rows[0].cells
    hdr[0].text = "Particulars"
    hdr[1].text = "Details"
    for cell in hdr:
        for run in cell.paragraphs[0].runs:
            run.bold = True
            run.font.size = Pt(10)

    rows_data = [
        ("Company Name",          data.get("company_name", "")),
        ("CIN",                   data.get("cin", "")),
        ("Date of Incorporation", data.get("date_of_incorporation", "")),
        ("Authorised Capital",    f"Rs. {data.get('authorised_capital', '')}"),
        ("Paid-up Capital",       f"Rs. {data.get('paid_up_capital', '')}"),
        ("Valuation Date",        data.get("valuation_date", "")),
        ("Number of Shares",      data.get("number_of_shares", "")),
        ("Face Value per Share",  f"Rs. {data.get('face_value_per_share', '')}"),
        ("Fair Value per Share",  f"Rs. {data.get('fair_value_per_share', '')}"),
        ("Valuation Method",      data.get("valuation_method", "")),
    ]
    for label, value in rows_data:
        row = table.add_row().cells
        row[0].text = label
        row[1].text = str(value)
        for cell in row:
            cell.paragraphs[0].runs[0].font.size = Pt(10)

    doc.add_paragraph()  # spacing after table

    # ── Director Details Table ──
    directors = data.get("directors", [])
    if directors:
        add_para("LIST OF DIRECTORS (as per MCA records)", bold=True, size=11, space_after=4)
        dtable = doc.add_table(rows=1, cols=4)
        dtable.style = 'Table Grid'
        dhdrs = ["Sr. No", "Name of Director", "DIN", "Date of Appointment"]
        for i, h in enumerate(dhdrs):
            dtable.rows[0].cells[i].text = h
            dtable.rows[0].cells[i].paragraphs[0].runs[0].bold = True
            dtable.rows[0].cells[i].paragraphs[0].runs[0].font.size = Pt(10)
        for d in directors:
            dr = dtable.add_row().cells
            dr[0].text = str(d.get("sr_no", ""))
            dr[1].text = d.get("name", "")
            dr[2].text = d.get("din", "")
            dr[3].text = d.get("date_of_appointment", "")
            for cell in dr:
                cell.paragraphs[0].runs[0].font.size = Pt(10)
        doc.add_paragraph()

    # ── Certification paragraph ──
    add_para(
        "Based on our examination and analysis, and in accordance with the applicable provisions "
        "of the Income Tax Act, 1961 / Companies Act, 2013 / FEMA, 1999 (as applicable), "
        "we hereby certify that the Fair Value of each equity share of the Company as on "
        f"{data.get('valuation_date', '__________')} is Rs. {data.get('fair_value_per_share', '__________')} "
        f"(Rupees {data.get('fair_value_in_words', '________________')} only) "
        f"as determined by the {data.get('valuation_method', '__________')} Method.",
        size=11, space_after=8
    )

    # ── Disclaimer ──
    add_para(
        "This certificate is issued on the basis of the records, documents, and representations "
        "made to us and the information available on the MCA portal. This certificate is issued "
        "at the specific request of the Company for the above-mentioned purpose only and shall "
        "not be used for any other purpose without our prior written consent.",
        size=11, space_after=16
    )

    # ── Signature Block ──
    add_para(f"For {data.get('firm_name', '')}", bold=True, size=11, space_after=2)
    add_para("(Chartered Accountants)", bold=False, size=11, space_after=2)
    add_para(f"F. R. No. {data.get('firm_frn', '')}", bold=True, size=11, space_after=24)

    add_para(f"({data.get('ca_name', '')})", bold=True, size=11, space_after=2)
    add_para("(Partner)", bold=False, size=11, space_after=2)
    add_para(f"Membership No: {data.get('ca_membership_no', '')}", bold=True, size=11, space_after=2)
    add_para(f"UDIN: {data.get('udin', '')}", bold=True, size=11, space_after=2)
    add_para(f"Date: {data.get('certificate_date', '')}", bold=True, size=11, space_after=2)
    add_para(f"Place: {data.get('certificate_place', '')}", bold=True, size=11, space_after=0)

    # ── Save to bytes ──
    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()
```

Then wire it into the main `generate_certificate()` dispatcher:

```python
elif cert_data.cert_type == "fair_value_shares":
    docx_bytes = generate_fair_value_docx(cert_data.data)
    filename = f"FairValue_{cert_data.data.get('company_name','').replace(' ','_')}_{cert_data.data.get('valuation_date','')}.docx"
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
```

---

## STEP 3 — FRONTEND: New Form Page

Create `frontend-app/src/pages/FairValueCertificatePage.js` (or `.jsx`).

This page must follow the EXACT same structure as your existing form pages (e.g., `NetWorthForm.js`).

### Form Sections

**Section 1 — MCA PDF Upload (NEW)**
```
[ 📎 Upload MCA Master Data PDF ]   ← calls POST /api/certificates/extract-mca-pdf
                                        on file select, auto-fills Section 2 fields
```

**Section 2 — Company Details** *(auto-filled from PDF, all fields remain editable)*
- Company Name
- CIN
- Registered Address
- Date of Incorporation
- Authorised Capital (Rs.)
- Paid-up Capital (Rs.)
- Directors Table (editable rows: Sr. No, Name, DIN, Designation, Date of Appointment)

**Section 3 — Valuation Details** *(manual entry)*
- Valuation Purpose ← `<select>` dropdown:
  - Allotment
  - Buy Back
  - Merger / De-merger
  - Resident to Non-Resident Transfer
  - Form 3CEB – Arm's Length Price u/s 92
- Valuation Date (date picker)
- Number of Shares
- Face Value per Share (Rs.)
- Fair Value per Share (Rs.) ← key output field
- Fair Value in Words
- Valuation Method ← `<select>`: DCF / NAV / Book Value / Market Price / Rule 11UA / Comparable Company

**Section 4 — CA / Firm Details** *(same fields as all other certificates)*
- Firm Name
- Firm Registration No. (FRN)
- CA Name
- Membership No.
- UDIN
- Certificate Date
- Certificate Place

**Submit Button:** `Generate Fair Value Certificate (.docx)`
- On click: call `POST /api/certificates/` with `cert_type: "fair_value_shares"` and all form data
- On success: trigger browser download of the returned `.docx` file
- On error: show error toast (same pattern as other forms)

### PDF Upload Logic (JavaScript)

```javascript
const handleMcaPdfUpload = async (e) => {
  const file = e.target.files[0];
  if (!file || !file.name.endsWith('.pdf')) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    setIsExtracting(true);
    const response = await api.post('/api/certificates/extract-mca-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    const extracted = response.data.data;

    // Auto-fill form state
    setFormData(prev => ({
      ...prev,
      company_name:          extracted.company_name      || '',
      cin:                   extracted.cin               || '',
      registered_address:    extracted.registered_address || '',
      date_of_incorporation: extracted.date_of_incorporation || '',
      authorised_capital:    extracted.authorised_capital || '',
      paid_up_capital:       extracted.paid_up_capital   || '',
      directors:             extracted.directors         || [],
    }));
    showToast('✅ Company details extracted successfully!', 'success');
  } catch (err) {
    showToast('❌ Could not extract PDF. Please fill in manually.', 'error');
  } finally {
    setIsExtracting(false);
  }
};
```

---

## STEP 4 — FRONTEND: Register the New Route

In your main router file (likely `App.js` or `routes.js`), add:

```javascript
import FairValueCertificatePage from './pages/FairValueCertificatePage';

// Inside your <Routes> or router config:
<Route path="/certificates/fair-value" element={<FairValueCertificatePage />} />
```

In your sidebar/navigation menu, add the new item under the existing certificate links:

```javascript
{
  label: "Fair Value of Shares",
  path: "/certificates/fair-value",
  icon: "📊"   // or whichever icon component you use
}
```

---

## STEP 5 — INSTALL NEW DEPENDENCY

Run this in your backend environment:

```bash
pip install pymupdf
# OR
pip install PyMuPDF
```

Add to `requirements.txt`:
```
PyMuPDF>=1.23.0
```

---

## WHAT NOT TO CHANGE

- Do NOT touch any existing certificate types (Net Worth, Turnover, RERA, NBFC, Fund Utilisation)
- Do NOT change the authentication flow, JWT logic, or RBAC checks
- Do NOT change the `Certificates` or `History` table schema — the new cert saves as JSON like all others
- Do NOT change `lib/api.js` — just use the existing `api.post()` / `api.get()` calls

---

## TEST DATA (use this to verify it works)

Upload this PDF to test the MCA extractor: **`LICHHAVI HOMES PRIVATE LIMITED.pdf`**

Expected extracted values:
```json
{
  "cin":                  "U32111BR2013PTC021672",
  "company_name":         "LICHHAVI HOMES PRIVATE LIMITED",
  "registered_address":   "C.T. MARG, GANNIPUR P.S: KAZI MAHMADPUR, Muzaffarpur, Bihar, 842001",
  "date_of_incorporation":"18/12/2013",
  "authorised_capital":   "2,50,00,000",
  "paid_up_capital":      "1,00,000",
  "directors": [
    { "sr_no": "1", "din": "00640508", "name": "SHAKTI SWARUP SHARMA",
      "designation": "Director", "date_of_appointment": "18/12/2013" },
    { "sr_no": "2", "din": "03361344", "name": "SHWETABBH SWAARUP",
      "designation": "Director", "date_of_appointment": "27/01/2015" }
  ]
}
```

---

## DONE ✅

When complete, the user should be able to:
1. Go to `/certificates/fair-value` in the app
2. Upload an MCA PDF → company fields auto-fill instantly
3. Edit any field if needed
4. Select the valuation purpose from the dropdown
5. Fill in valuation figures and CA details
6. Click Generate → download a professional `.docx` certificate
   styled exactly like `LOD CA certificate_.docx`
