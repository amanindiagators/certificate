import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import * as XLSX from "xlsx";
import { Upload, FileSpreadsheet, ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";

const CA_STORAGE_KEY = "ca_settings_v1";
const CIN_RE = /CIN\s*[:-]?\s*([A-Z0-9]{10,25})/i;
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/i;
const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/i;
const YEAR_MARCH_RE = /31(?:ST|ND|RD|TH)?\s*MARCH[,]?\s*(20\d{2})/i;

const ENTITY_TYPES = [
  { key: "PERSONAL", label: "Individual (Personal)" },
  { key: "PROPRIETORSHIP", label: "Proprietorship Firm" },
  { key: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { key: "PUBLIC_LIMITED", label: "Public Limited Company" },
  { key: "TRUST", label: "Trust" },
  { key: "NGO", label: "NGO (Society/Trust/Section 8)" },
  { key: "SOCIETY", label: "Society" },
  { key: "GOVERNMENT", label: "Government / PSU / Department" },
];

function getDefaultCASettings()
{
  return {
    place: "Patna",
    firm_name: "P. Jyoti & Co.",
    frn: "010237C",
    default_ca_id: "",
    cas: [],
  };
}

function loadCASettingsLocal()
{
  try {
    const raw = localStorage.getItem(CA_STORAGE_KEY);
    if (!raw) return getDefaultCASettings();
    const parsed = JSON.parse(raw);
    return { ...getDefaultCASettings(), ...parsed };
  } catch {
    return getDefaultCASettings();
  }
}

function todayDDMMYYYY()
{
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function autoFormatDDMMYYYY(value)
{
  // Remove everything except digits
  let v = String(value || "").replace(/\D/g, "");

  if (v.length > 8) v = v.slice(0, 8);

  if (v.length >= 5) {
    return `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`;
  }
  if (v.length >= 3) {
    return `${v.slice(0, 2)}-${v.slice(2)}`;
  }
  return v;
}

function cleanText(value)
{
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.toLowerCase() === "nan") return "";
  return text;
}

function rowText(row = [])
{
  return row.map((v) => cleanText(v)).filter(Boolean).join(" ").trim();
}

function parseAmount(value)
{
  if (value === null || value === undefined || typeof value === "boolean") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return null;
    return value;
  }

  const text0 = cleanText(value);
  if (!text0) return null;
  let text = text0
    .replace(/,/g, "")
    .replace(/Rs\./gi, "")
    .replace(/Rs/gi, "")
    .replace(/INR/gi, "")
    .replace(/[^\d().-]/g, "")
    .trim();

  let negative = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num)) return null;
  return negative ? -num : num;
}

function formatAmount(value)
{
  const out = Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return out.endsWith(".00") ? out.slice(0, -3) : out;
}

function fyFromMarchYear(year)
{
  return `${year - 1}-${String(year).slice(-2)}`;
}

function fySortKey(fy)
{
  const m = String(fy || "").match(/^(\d{4})-(\d{2}|\d{4})$/);
  return m ? Number(m[1]) : 999999;
}

function inferEntityType(companyName)
{
  const name = String(companyName || "").toUpperCase();
  if (name.includes("PRIVATE LIMITED")) return "PRIVATE_LIMITED";
  if (name.includes("LIMITED")) return "PUBLIC_LIMITED";
  if (name.includes("TRUST")) return "TRUST";
  if (name.includes("SOCIETY")) return "SOCIETY";
  if (name.includes("NGO")) return "NGO";
  if (name.includes("GOVERNMENT") || name.includes("DEPARTMENT") || name.includes("MINISTRY")) return "GOVERNMENT";
  return "PROPRIETORSHIP";
}

function inferPurpose(text)
{
  const t = String(text || "").toLowerCase();
  if (t.includes("statement of profit") || t.includes("profit & loss") || t.includes("profit and loss")) {
    return "Financial Statement Filing";
  }
  if (t.includes("audit report") || t.includes("statutory audit")) return "Statutory Audit";
  if (t.includes(" itr ") || t.includes("income tax")) return "Income Tax Filing";
  return "Not specified";
}

function findClosestYearForCol(col, colYearMap)
{
  if (Object.prototype.hasOwnProperty.call(colYearMap, col)) return colYearMap[col];
  const entries = Object.entries(colYearMap);
  if (!entries.length) return null;
  let best = null;
  for (const [k, y] of entries) {
    const kk = Number(k);
    const dist = Math.abs(kk - col);
    if (!best || dist < best.dist) best = { year: y, dist };
  }
  return best && best.dist <= 3 ? best.year : null;
}

function extractFromMatrix(matrix, fileName)
{
  const rows = Array.isArray(matrix) ? matrix : [];
  const rowCount = rows.length;
  const firstSix = rows.slice(0, 6);
  const firstSixTexts = firstSix.map((r) => rowText(r));

  let cin = "";
  let cinRow = -1;
  for (let i = 0; i < firstSixTexts.length; i += 1) {
    const m = firstSixTexts[i].match(CIN_RE);
    if (m) {
      cin = m[1].toUpperCase();
      cinRow = i;
      break;
    }
  }

  let companyName = "";
  if (cinRow > 0) {
    for (let i = cinRow - 1; i >= 0; i -= 1) {
      const txt = firstSixTexts[i];
      if (txt) {
        companyName = txt;
        break;
      }
    }
  }
  if (!companyName) {
    for (const txt of firstSixTexts) {
      if (!txt || /CIN/i.test(txt)) continue;
      companyName = txt;
      break;
    }
  }

  const mergedDocText = rows.map((r) => rowText(r)).filter(Boolean).join("\n");
  const fileText = String(fileName || "");
  const panMatch = (mergedDocText.match(PAN_RE) || fileText.match(PAN_RE) || [null])[0];
  const gstinMatch = (mergedDocText.match(GSTIN_RE) || fileText.match(GSTIN_RE) || [null])[0];

  const colYearMap = {};
  const headerScanEnd = Math.min(rowCount - 1, 14); // rows 1-15
  let maxCols = 0;
  for (const r of rows) maxCols = Math.max(maxCols, Array.isArray(r) ? r.length : 0);

  for (let r = 0; r <= headerScanEnd; r += 1) {
    const row = rows[r] || [];
    for (let c = 0; c < maxCols; c += 1) {
      const text = cleanText(row[c]);
      if (!text) continue;
      const m = text.match(YEAR_MARCH_RE);
      if (m) colYearMap[c] = Number(m[1]);
    }
  }

  const noteCols = new Set();
  for (let c = 0; c < maxCols; c += 1) {
    for (let r = 0; r <= headerScanEnd; r += 1) {
      const text = cleanText((rows[r] || [])[c]).toLowerCase();
      if (!text) continue;
      if (text.includes("note") && (text.includes("no") || text.includes("number"))) {
        noteCols.add(c);
        break;
      }
    }
  }

  let turnoverRow = -1;
  for (let r = 5; r <= Math.min(rowCount - 1, 14); r += 1) {
    const text = rowText(rows[r] || []).toLowerCase();
    if (text.includes("revenue from operations")) {
      turnoverRow = r;
      break;
    }
  }
  if (turnoverRow < 0) {
    for (let r = 0; r < rowCount; r += 1) {
      const text = rowText(rows[r] || []).toLowerCase();
      if (text.includes("revenue from operations")) {
        turnoverRow = r;
        break;
      }
    }
  }

  if (turnoverRow < 0) {
    return { ok: false, error: `Revenue from operations row not found in '${fileName}'.` };
  }

  const turnoverByFy = {};
  const row = rows[turnoverRow] || [];
  for (let c = 0; c < maxCols; c += 1) {
    if (noteCols.has(c)) continue;
    const amount = parseAmount(row[c]);
    if (amount === null) continue;
    const year = findClosestYearForCol(c, colYearMap);
    if (!year) continue;
    const fy = fyFromMarchYear(year);
    if (!(fy in turnoverByFy) || Math.abs(amount) > Math.abs(turnoverByFy[fy])) {
      turnoverByFy[fy] = amount;
    }
  }

  const turnoverRows = Object.entries(turnoverByFy)
    .map(([fy, amount]) => ({ fy, amount: formatAmount(amount) }))
    .sort((a, b) => fySortKey(a.fy) - fySortKey(b.fy));

  if (!turnoverRows.length) {
    return { ok: false, error: `Turnover values not found under year columns in '${fileName}'.` };
  }

  return {
    ok: true,
    filename: fileName,
    company_name: companyName || "",
    cin: cin || "",
    pan: panMatch,
    gstin: gstinMatch,
    entityType: inferEntityType(companyName),
    purpose: inferPurpose(mergedDocText),
    turnover_rows: turnoverRows,
    turnover_row_line: turnoverRow + 1,
    matched_row: rowText(row),
  };
}

function pickWorksheet(workbook)
{
  const names = workbook.SheetNames || [];
  if (!names.length) return null;
  const preferred = names.find((n) =>
  {
    const low = String(n || "").toLowerCase();
    return low.includes("pl") || low.includes("p&l") || low.includes("profit");
  });
  return preferred || names[0];
}

export default function UploadCertificates()
{
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [hasAttemptedExtract, setHasAttemptedExtract] = useState(false);
  const [caSettings, setCaSettings] = useState(null);
  const [uploadSummary, setUploadSummary] = useState(null);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [form, setForm] = useState({
    entityType: "PROPRIETORSHIP",
    displayName: "",
    cin: "",
    pan: "",
    gstin: "",
    address: "",
    purpose: "",
    place: "",
    date: todayDDMMYYYY(),
    caName: "",
    membershipNo: "",
    udin: "",
    caFirm: "",
    frn: "",
    turnoverRows: [],
  });

  useEffect(() =>
  {
    const settings = loadCASettingsLocal();
    setCaSettings(settings);
    setForm((prev) =>
    {
      const next = {
        ...prev,
        place: settings.place || prev.place || "",
        caFirm: settings.firm_name || prev.caFirm || "",
        frn: settings.frn || prev.frn || "",
      };
      if (settings.default_ca_id && Array.isArray(settings.cas)) {
        const selected = settings.cas.find((c) => c.id === settings.default_ca_id);
        if (selected) {
          next.caName = selected.ca_name || next.caName;
          next.membershipNo = selected.membership_no || next.membershipNo;
        }
      }
      return next;
    });
  }, []);

  const onPickFiles = (e) =>
  {
    setFiles(Array.from(e.target.files || []));
  };

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const updateRow = (idx, key, value) =>
  {
    setForm((prev) =>
    {
      const nextRows = [...(prev.turnoverRows || [])];
      nextRows[idx] = { ...nextRows[idx], [key]: value };
      return { ...prev, turnoverRows: nextRows };
    });
  };

  const addRow = () =>
  {
    setForm((prev) => ({
      ...prev,
      turnoverRows: [...(prev.turnoverRows || []), { fy: "", amount: "" }],
    }));
  };

  const removeRow = (idx) =>
  {
    setForm((prev) => ({
      ...prev,
      turnoverRows: (prev.turnoverRows || []).filter((_, i) => i !== idx),
    }));
  };

  const handleExtract = async () =>
  {
    if (!files.length) {
      toast.error("Please select at least 1 Excel file (.xlsx/.xls)");
      return;
    }

    try {
      setExtracting(true);
      setHasAttemptedExtract(true);
      const details = [];
      const warnings = [];
      const rowsByFy = {};
      let pickedCompany = "";
      let pickedCin = "";
      let pickedPan = "";
      let pickedGstin = "";
      let pickedEntityType = "";
      let pickedPurpose = "";

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: "array" });
          const sheetName = pickWorksheet(workbook);
          if (!sheetName) {
            warnings.push(`No worksheet found in '${file.name}'.`);
            continue;
          }
          const worksheet = workbook.Sheets[sheetName];
          const matrix = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: true,
            defval: "",
            blankrows: false,
          });
          const extracted = extractFromMatrix(matrix, file.name);
          if (!extracted.ok) {
            warnings.push(extracted.error || `Could not parse '${file.name}'.`);
            continue;
          }

          details.push({
            filename: extracted.filename,
            sheet: sheetName,
            selected_fy: extracted.turnover_rows?.[0]?.fy || "",
            selected_amount: extracted.turnover_rows?.[0]?.amount || "",
            turnover_row_line: extracted.turnover_row_line,
            matched_row: extracted.matched_row,
          });

          if (!pickedCompany && extracted.company_name) pickedCompany = extracted.company_name;
          if (!pickedCin && extracted.cin) pickedCin = extracted.cin;
          if (!pickedPan && extracted.pan) pickedPan = extracted.pan;
          if (!pickedGstin && extracted.gstin) pickedGstin = extracted.gstin;
          if (!pickedEntityType && extracted.entityType) pickedEntityType = extracted.entityType;
          if (!pickedPurpose && extracted.purpose && extracted.purpose !== "Not specified") pickedPurpose = extracted.purpose;

          for (const tr of extracted.turnover_rows || []) {
            if (!tr?.fy || !tr?.amount) continue;
            rowsByFy[tr.fy] = tr.amount;
          }
        } catch (e) {
          warnings.push(`Failed to parse '${file.name}'.`);
        }
      }

      const turnoverRows = Object.entries(rowsByFy)
        .map(([fy, amount]) => ({ fy, amount }))
        .sort((a, b) => fySortKey(a.fy) - fySortKey(b.fy));

      setForm((prev) => ({
        ...prev,
        entityType: pickedEntityType || prev.entityType,
        displayName: pickedCompany || prev.displayName,
        cin: pickedCin || prev.cin,
        pan: pickedPan || prev.pan,
        gstin: pickedGstin || prev.gstin,
        purpose: pickedPurpose || prev.purpose,
        turnoverRows: turnoverRows.length ? turnoverRows : prev.turnoverRows,
      }));

      setUploadSummary({
        files_received: files.length,
        files_parsed: details.length,
        rows_extracted: turnoverRows.length,
        warnings,
      });
      setUploadFiles(details);

      if (turnoverRows.length > 0) {
        if (warnings.length > 0) {
          toast.warning(`Excel parsed with ${warnings.length} warning(s). Please verify values.`);
        } else {
          toast.success("Excel parsed. Review values and continue to full turnover form.");
        }
      } else {
        toast.error("No turnover data extracted. You can still fill rows manually below.");
      }
    } catch (err) {
      console.error(err);
      const msg = err?.message || "Upload failed. Please check files and try again.";
      toast.error(msg);
    } finally {
      setExtracting(false);
    }
  };

  const buildTurnoverPrefill = () =>
  {
    const entityType = form.entityType || "PROPRIETORSHIP";
    const displayName = String(form.displayName || "").trim();
    const base = {
      entityType,
      pan: String(form.pan || "").trim(),
      cin: String(form.cin || "").trim(),
      gstin: String(form.gstin || "").trim(),
      address: String(form.address || "").trim(),
      purpose: String(form.purpose || "").trim(),
      place: String(form.place || "").trim(),
      date: String(form.date || "").trim(),
      caName: String(form.caName || "").trim(),
      membershipNo: String(form.membershipNo || "").trim(),
      udin: String(form.udin || "").trim(),
      caFirm: String(form.caFirm || "").trim(),
      frn: String(form.frn || "").trim(),
      turnoverRows: (form.turnoverRows || []).map((r) => ({
        fy: String(r?.fy ?? "").trim(),
        amount: String(r?.amount ?? "").trim(),
      })),
    };

    if (entityType === "PERSONAL") return { ...base, personName: displayName };
    if (entityType === "PROPRIETORSHIP") return { ...base, firmName: displayName };
    if (entityType === "PRIVATE_LIMITED" || entityType === "PUBLIC_LIMITED") {
      return { ...base, companyName: displayName };
    }
    return { ...base, entityName: displayName };
  };

  const handleContinueToFullForm = () =>
  {
    navigate("/turnover/new", {
      state: {
        turnoverPrefill: buildTurnoverPrefill(),
        uploadSummary: uploadSummary || {},
      },
    });
  };

  const entityDisplayLabelByType = {
    PERSONAL: "Individual Name *",
    PROPRIETORSHIP: "Proprietorship Firm Name *",
    PRIVATE_LIMITED: "Company Name *",
    PUBLIC_LIMITED: "Company Name *",
    TRUST: "Trust Name *",
    NGO: "NGO / Entity Name *",
    SOCIETY: "Society Name *",
    GOVERNMENT: "Department / Entity Name *",
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-10">
      <div className="w-[70%] max-w-none mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-display font-bold text-foreground">
          Upload Excel & Continue to Turnover Form
        </h1>
        <p className="text-muted-foreground mt-2">
          Upload Excel, auto-extract turnover, then open the full turnover form with CA details and preview.
        </p>

        <div className="mt-8 bg-card border border-border rounded-xl p-6 space-y-6">
          {/* Certificate type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Certificate Type
            </label>
            <div className="inline-flex items-center rounded-lg border border-secondary bg-secondary/10 px-4 py-2 text-secondary">
              Turnover (PL sheet)
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This page supports Turnover only. Excel extraction reads the <b>PL</b> sheet.
            </p>
          </div>

          {/* File upload */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Upload Excel files (.xlsx / .xls)
            </label>

            <div className="flex items-center gap-3">
              <input
                type="file"
                multiple
                accept=".xlsx,.xls"
                onChange={onPickFiles}
                className="block w-full text-sm text-muted-foreground"
              />
              <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
            </div>

            {files.length > 0 && (
              <div className="mt-3 text-sm">
                <p className="font-medium text-foreground mb-2">Selected files:</p>
                <ul className="list-disc pl-5 text-muted-foreground space-y-1">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleExtract} disabled={extracting}>
              {extracting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Extract
                </>
              )}
            </Button>

            <Button variant="outline" onClick={() => navigate("/history")}>
              View History
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>

            <Button variant="outline" onClick={() => navigate("/turnover/new")}>
              Fill Manually
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>

          {hasAttemptedExtract && (
            <>
              {uploadSummary && (
                <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  Files parsed: {uploadSummary.files_parsed || 0} / {uploadSummary.files_received || 0} | Rows extracted: {uploadSummary.rows_extracted || 0}
                  {(uploadSummary.warnings || []).length > 0 && (
                    <div className="mt-2 text-destructive">
                      {(uploadSummary.warnings || []).map((w, i) => (
                        <div key={`${w}-${i}`}>{w}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {uploadFiles.length > 0 && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium text-foreground mb-2">Parsed Files</div>
                  <div className="space-y-1 text-muted-foreground">
                    {uploadFiles.map((f, i) => (
                      <div key={`${f.filename || "file"}-${i}`}>
                        {f.filename}: FY {f.selected_fy || "-"} | Turnover {f.selected_amount || "-"}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4 border-t pt-6">
                <h2 className="text-xl font-display font-semibold text-foreground">Turnover Rows (Editable)</h2>
                {(form.turnoverRows || []).map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <Label>Financial Year *</Label>
                      <Input
                        className="mt-2"
                        value={row.fy || ""}
                        onChange={(e) => updateRow(idx, "fy", e.target.value)}
                        placeholder="e.g., 2023-24"
                      />
                    </div>
                    <div>
                      <Label>Turnover Amount *</Label>
                      <Input
                        className="mt-2"
                        value={row.amount || ""}
                        onChange={(e) => updateRow(idx, "amount", e.target.value)}
                        placeholder="e.g., 24,54,29,222.13"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button type="button" variant="outline" size="icon" onClick={() => removeRow(idx)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" onClick={addRow} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Financial Year
                </Button>
              </div>

              <div className="space-y-4 border-t pt-6">
                <h2 className="text-xl font-display font-semibold text-foreground">Entity Details</h2>
                <div>
                  <Label>Entity Type *</Label>
                  <select
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={form.entityType}
                    onChange={(e) => update("entityType", e.target.value)}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>{entityDisplayLabelByType[form.entityType] || "Entity / Company Name *"}</Label>
                    <Input
                      className="mt-2"
                      value={form.displayName}
                      onChange={(e) => update("displayName", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>CIN</Label>
                    <Input className="mt-2" value={form.cin} onChange={(e) => update("cin", e.target.value)} />
                  </div>
                  <div>
                    <Label>PAN</Label>
                    <Input className="mt-2" value={form.pan} onChange={(e) => update("pan", e.target.value)} />
                  </div>
                  <div>
                    <Label>GSTIN (Optional)</Label>
                    <Input className="mt-2" value={form.gstin} onChange={(e) => update("gstin", e.target.value)} />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Address (Optional)</Label>
                    <Textarea
                      className="mt-2"
                      rows={3}
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-6">
                <h2 className="text-xl font-display font-semibold text-foreground">Certificate Meta</h2>
                <div>
                  <Label>Purpose *</Label>
                  <Textarea
                    className="mt-2"
                    rows={3}
                    value={form.purpose}
                    onChange={(e) => update("purpose", e.target.value)}
                    placeholder="e.g., Bank finance / Tender submission / Loan processing"
                  />
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Place *</Label>
                    <Input className="mt-2" value={form.place} onChange={(e) => update("place", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input
                      className="mt-2"
                      value={form.date}
                      onChange={(e) => update("date", autoFormatDDMMYYYY(e.target.value))}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 border-t pt-6">
                <h2 className="text-xl font-display font-semibold text-foreground">CA Details</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>CA Name *</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.caName || ""}
                      onChange={(e) =>
                      {
                        const name = e.target.value;
                        const selected = (caSettings?.cas || []).find((c) => c.ca_name === name);
                        update("caName", selected?.ca_name || "");
                        update("membershipNo", selected?.membership_no || "");
                      }}
                      disabled={!caSettings || (caSettings?.cas || []).length === 0}
                      required
                    >
                      <option value="">
                        {(!caSettings || (caSettings?.cas || []).length === 0)
                          ? "No CA found in Settings"
                          : "Select CA"}
                      </option>
                      {(caSettings?.cas || []).map((ca) => (
                        <option key={ca.id} value={ca.ca_name}>
                          {ca.ca_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Membership Number *</Label>
                    <Input className="mt-2" value={form.membershipNo || ""} readOnly />
                  </div>
                  <div>
                    <Label>UDIN</Label>
                    <Input
                      className="mt-2"
                      value={form.udin || ""}
                      onChange={(e) => update("udin", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Firm Name *</Label>
                    <Input
                      className="mt-2"
                      value={form.caFirm || ""}
                      onChange={(e) => update("caFirm", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>FRN *</Label>
                    <Input
                      className="mt-2"
                      value={form.frn || ""}
                      onChange={(e) => update("frn", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button onClick={handleContinueToFullForm}>
                  Continue to Full Turnover Form
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
