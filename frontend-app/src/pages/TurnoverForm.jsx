import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import api from "../lib/api";
import { getApiErrorMessage } from "../lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ClientSelector from "../components/ClientSelector";
import { ArrowLeft, Save, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
const TURNOVER_DRAFT_KEY = "draft:turnover_form_v1";

/** ---------- Universal Entity Setup ---------- */
const ENTITY_TYPES = [
  { key: "PERSONAL", label: "Individual (Personal)" },
  { key: "PROPRIETORSHIP", label: "Proprietorship Firm" },
  { key: "LLP", label: "Limited Liability Partnership (LLP)" },
  { key: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { key: "PUBLIC_LIMITED", label: "Public Limited Company" },
  { key: "TRUST", label: "Trust" },
  { key: "NGO", label: "NGO (Society/Trust/Section 8)" },
  { key: "SOCIETY", label: "Society" },
  { key: "GOVERNMENT", label: "Government / PSU / Department" },
];

const ENTITY_FIELD_RULES = {
  PERSONAL: ["personName", "pan", "address"],
  PROPRIETORSHIP: ["firmName", "proprietorName", "pan", "gstin", "address"],
  LLP: ["companyName", "cin", "pan", "gstin", "address"],
  PRIVATE_LIMITED: ["companyName", "cin", "pan", "gstin", "address"],
  PUBLIC_LIMITED: ["companyName", "cin", "pan", "gstin", "address"],
  TRUST: ["entityName", "trustRegNo", "pan", "reg12a", "reg80g", "address"],
  NGO: ["entityName", "ngoLegalType", "registrationNo", "pan", "fcraRegNo", "gstin", "address"],
  SOCIETY: ["entityName", "societyRegNo", "pan", "address"],
  GOVERNMENT: ["entityName", "department", "govtCode", "gstin", "address"],
};

const FIELD_LABELS = {
  personName: "Individual Name *",
  firmName: "Proprietorship Firm Name *",
  proprietorName: "Proprietor Name",
  companyName: "Company / LLP Name *",
  entityName: "Entity Name *",
  ngoLegalType: "NGO Legal Type (Society/Trust/Section 8)",
  department: "Department / Ministry",
  pan: "PAN",
  cin: "CIN / LLPIN",
  gstin: "GSTIN (Optional)",
  trustRegNo: "Trust Registration No.",
  societyRegNo: "Society Registration No.",
  registrationNo: "Registration No.",
  fcraRegNo: "FCRA Regn No. (Optional)",
  reg12a: "12A Registration (Optional)",
  reg80g: "80G Registration (Optional)",
  govtCode: "Govt ID / Code (Optional)",
  address: "Address (Optional)",
};

function buildEntityIdentity(entityType, form) {
  const parts = [];
  const pushIf = (label, value) => {
    const v = (value || "").trim();
    if (v) parts.push(`${label}: ${v}`);
  };

  if (entityType === "PERSONAL") pushIf("Name", form.personName);
  else if (entityType === "PROPRIETORSHIP") {
    pushIf("Firm", form.firmName);
    pushIf("Proprietor", form.proprietorName);
  } else if (["LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED"].includes(entityType)) {
    pushIf(entityType === "LLP" ? "LLP" : "Company", form.companyName);
  } else {
    pushIf("Entity", form.entityName);
  }

  pushIf("PAN", form.pan);
  pushIf("CIN", form.cin);
  pushIf("GSTIN", form.gstin);
  pushIf("Trust Regn No.", form.trustRegNo);
  pushIf("Society Regn No.", form.societyRegNo);
  pushIf("Registration No.", form.registrationNo);
  pushIf("12A", form.reg12a);
  pushIf("80G", form.reg80g);
  pushIf("FCRA Regn No.", form.fcraRegNo);
  pushIf("Department", form.department);
  pushIf("Govt ID/Code", form.govtCode);
  pushIf("Address", form.address);

  return parts.length ? parts.join(" | ") : "______________________________";
}

/** ---------- Local CA Settings (no backend dependency) ---------- */
const CA_STORAGE_KEY = "ca_settings_v1";

function getDefaultCASettings() {
  return {
    place: "Patna",
    firm_name: "P. Jyoti & Co.",
    frn: "010237C",
    default_ca_id: "",
    cas: [],
  };
}

function loadCASettingsLocal() {
  try {
    const raw = localStorage.getItem(CA_STORAGE_KEY);
    if (!raw) return getDefaultCASettings();
    const parsed = JSON.parse(raw);
    return { ...getDefaultCASettings(), ...parsed };
  } catch {
    return getDefaultCASettings();
  }
}

function autoFormatDDMMYYYY(value) {
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

function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function getLastFinancialYears(count = 4) {
  const now = new Date();
  const currentFyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const firstFyStartYear = currentFyStartYear - (count - 1);

  return Array.from({ length: count }, (_, idx) => {
    const startYear = firstFyStartYear + idx;
    return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  });
}

function getFinancialYearStart(fy) {
  const value = String(fy || "").trim();
  const fullYearMatch = value.match(/(\d{4})/);
  if (fullYearMatch) return Number(fullYearMatch[1]);

  const shortYearMatch = value.match(/(\d{2})\s*-\s*(\d{2})/);
  if (shortYearMatch) {
    const yy = Number(shortYearMatch[1]);
    return yy >= 50 ? 1900 + yy : 2000 + yy;
  }

  return Number.MAX_SAFE_INTEGER;
}

function sortTurnoverRowsByYear(rows = []) {
  return [...rows].sort((a, b) => {
    const yearDiff = getFinancialYearStart(a?.fy) - getFinancialYearStart(b?.fy);
    if (yearDiff !== 0) return yearDiff;
    return String(a?.fy || "").localeCompare(String(b?.fy || ""));
  });
}

/** ---------- Preview (same UI, uses local form) ---------- */
function CertificatePreview({ entityType, form }) {
  const identityLine = buildEntityIdentity(entityType, form);

  const fyRows = sortTurnoverRowsByYear(
    (form.turnoverRows || []).filter((r) => (r.fy || "").trim() || (r.amount || "").trim())
  );
  const purpose = (form.purpose || "").trim() || "______________";

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-center text-lg font-extrabold">TURNOVER CERTIFICATE</div>

      <div className="mt-4 font-bold text-center">To Whomsoever It May Concern</div>

      <p className="mt-3 leading-6">
        This is to certify that, based on the documents, records, and audited financial statements produced before us, in respect of the entity:
      </p>

      <div className="mt-3 rounded-xl border border-dashed p-3">
        <div className="font-bold">Identification</div>
        <div className="mt-2 text-sm">{identityLine}</div>
        <div className="mt-2 text-sm">
          <span className="font-bold">Constitution:</span>{" "}
          {ENTITY_TYPES.find((e) => e.key === entityType)?.label || "______________"}
        </div>
      </div>

      <p className="mb-3">
        We hereby confirm that the <b>Turnover</b> of the said entity for the last{" "}
        <b>{fyRows.length || 1}</b> financial year{(fyRows.length || 1) > 1 ? "s" : ""} is as under:
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="certificate-table compact">
          <thead>
            <tr>
              <th className="text-left">Financial Year</th>
              <th className="turnover-col">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {(fyRows.length ? fyRows : [{ fy: "20XX-XX", amount: "" }]).map((r, idx) => (
              <tr key={idx}>
                <td className="text-left">{r.fy || "__________"}</td>
                <td className="turnover-col">{r.amount || "__________"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 leading-6">
        This certificate is issued at the specific request of the above-mentioned entity for the purpose of <strong>{purpose || "______________"}</strong>
        This certificate should not be used for any other purpose and no responsibility is accepted by us for any use other than the stated purpose.
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="text-sm">
          <div>
            <span className="font-bold">Place:</span> {form.place || "__________"}
          </div>
          <div>
            <span className="font-bold">Date:</span> {form.date || "__________"}
          </div>
        </div>

        <div className="text-sm md:text-right">
          <div>
            <span className="font-bold">For:</span> {form.caFirm || "__________ & Co."}
          </div>
          <div>Chartered Accountants</div>
          <div>FRN: {form.frn || "__________"}</div>
          <div className="mt-8">{form.caName || "__________"}</div>
          <div>Partner</div>
          <div>
            <span className="font-bold">M. No:</span> {form.membershipNo || "__________"}
          </div>
          <div>
            <span className="font-bold">UDIN:</span> {form.udin || "_________________________"}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ---------- Default form (UI state) ---------- */
function defaultForm() {
  return {
    personName: "",
    firmName: "",
    proprietorName: "",
    companyName: "",
    entityName: "",
    ngoLegalType: "",
    department: "",
    pan: "",
    cin: "",
    gstin: "",
    trustRegNo: "",
    societyRegNo: "",
    registrationNo: "",
    fcraRegNo: "",
    reg12a: "",
    reg80g: "",
    govtCode: "",
    address: "",

    purpose: "",
    place: "",
    date: todayDDMMYYYY(),

    caFirm: "",
    frn: "",
    caName: "",
    membershipNo: "",
    udin: "",

    turnoverRows: getLastFinancialYears(5).map((fy) => ({ fy, amount: "" })),
  };
}

/** ---------- Universal mapping helpers ---------- */
function buildUniversalPayload({ entityType, form }) {
  const cleanRows = sortTurnoverRowsByYear(
    (form.turnoverRows || []).filter((r) => (r.fy || "").trim() && String(r.amount || "").trim())
  ).map((r) => [String(r.fy || "").trim(), String(r.amount || "").trim()]);

  // 2 names requirement
  const person_name = entityType === "PERSONAL" ? (form.personName || "").trim() : "";
  const company_name =
    entityType === "PERSONAL"
      ? ""
      : (
        form.companyName ||
        form.firmName ||
        form.entityName ||
        ""
      ).trim();

  return {
    category: "TURNOVER",
    certificate_type: "turnover_certificate",
    entityType,
    identity: {
      person_name,
      company_name,
      legal_type: (form.ngoLegalType || "").trim(),
      reg_no: (form.registrationNo || "").trim(),
      department: (form.department || "").trim(),
      pan: (form.pan || "").trim(),
      cin: (form.cin || "").trim(),
      gstin: (form.gstin || "").trim(),
      address: (form.address || "").trim(),
    },
    meta: {
      purpose: (form.purpose || "").trim(),
      place: (form.place || "").trim(),
      date: (form.date || "").trim(),
    },
    ca: {
      firm: (form.caFirm || "").trim(),
      frn: (form.frn || "").trim(),
      name: (form.caName || "").trim(),
      membership_no: (form.membershipNo || "").trim(),
      udin: (form.udin || "").trim(),
    },
    data: {
      tables: {
        main: {
          columns: ["Financial Year", "Amount"],
          rows: cleanRows,
        },
      },
      // store full old-form so you don't lose extra identity fields
      extras: {
        form: { ...form, turnoverRows: (form.turnoverRows || []).map((r) => ({ ...r })) },
      },
    },
  };
}

function universalCertToForm(cert) {
  // If we stored the original form, restore it (best for edit)
  const savedForm = cert?.data?.extras?.form;
  if (savedForm && typeof savedForm === "object") {
    return { ...defaultForm(), ...savedForm };
  }

  // fallback mapping if no extras present
  const entityType = cert?.entityType || "PROPRIETORSHIP";
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const mainTable = cert?.data?.tables?.main || {};
  const rows = Array.isArray(mainTable.rows) ? mainTable.rows : [];

  return {
    ...defaultForm(),
    personName: identity.person_name || "",
    companyName: identity.company_name || "",
    pan: identity.pan || "",
    cin: identity.cin || "",
    gstin: identity.gstin || "",
    address: identity.address || "",
    purpose: meta.purpose || "",
    place: meta.place || "",
    date: meta.date || "",
    caFirm: ca.firm || "",
    frn: ca.frn || "",
    caName: ca.name || "",
    membershipNo: ca.membership_no || "",
    udin: ca.udin || "",
    turnoverRows: rows.map((r) => ({ fy: String(r?.[0] ?? ""), amount: String(r?.[1] ?? "") })),
    _entityTypeHint: entityType,
  };
}

export default function TurnoverForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("PROPRIETORSHIP");
  const [form, setForm] = useState(defaultForm());
  const [draftReady, setDraftReady] = useState(false);
  const [uploadPrefillApplied, setUploadPrefillApplied] = useState(false);

  const visibleFields = useMemo(() => ENTITY_FIELD_RULES[entityType] || [], [entityType]);
  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const applyClient = (client) => {
    const nextEntityType = client?.entity_type || entityType;
    const clientName = client?.company_name || client?.display_name || "";
    const personName = client?.person_name || client?.display_name || "";
    setEntityType(nextEntityType);
    setForm((prev) => ({
      ...prev,
      personName: nextEntityType === "PERSONAL" ? personName : "",
      firmName: nextEntityType === "PROPRIETORSHIP" ? clientName : "",
      proprietorName: nextEntityType === "PROPRIETORSHIP" ? client?.person_name || "" : "",
      companyName:
        ["LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED"].includes(nextEntityType)
          ? clientName
          : "",
      entityName:
        ["TRUST", "NGO", "SOCIETY", "GOVERNMENT", "COLLEGE"].includes(nextEntityType)
          ? clientName || personName
          : "",
      pan: client?.pan || "",
      cin: client?.cin || "",
      gstin: client?.gstin || "",
      address: client?.address || "",
    }));
  };

  const updateRow = (idx, key, value) => {
    setForm((p) => {
      const next = [...(p.turnoverRows || [])];
      next[idx] = { ...next[idx], [key]: value };
      return { ...p, turnoverRows: next };
    });
  };

  const addRow = () =>
    setForm((p) => ({
      ...p,
      turnoverRows: [...(p.turnoverRows || []), { fy: "", amount: "" }],
    }));

  const removeRow = (idx) =>
    setForm((p) => ({
      ...p,
      turnoverRows: (p.turnoverRows || []).filter((_, i) => i !== idx),
    }));

  /** Prefill CA settings from localStorage (universal-only backend) */
  const [caSettings, setCaSettings] = useState(null);

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(TURNOVER_DRAFT_KEY);
    if (draft) {
      if (draft.entityType) setEntityType(draft.entityType);
      if (draft.form) {
        setForm((prev) => ({ ...prev, ...draft.form }));
      }
      toast.message("Draft restored (saved within last 1 hour).");
    }
    setDraftReady(true);
  }, [isEdit]);

  useEffect(() => {
    if (isEdit || !draftReady) return;
    saveDraftWithTTL(
      TURNOVER_DRAFT_KEY,
      { entityType, form },
      ONE_HOUR_DRAFT_TTL_MS
    );
  }, [entityType, form, isEdit, draftReady]);
  useEffect(() => {
    const s = loadCASettingsLocal();
    setCaSettings(s);
    setForm((prev) => {
      const next = {
        ...prev,
        place: prev.place || s.place || "",
        caFirm: prev.caFirm || s.firm_name || "",
        frn: prev.frn || s.frn || "",
      };
      if (s.default_ca_id && Array.isArray(s.cas)) {
        const def = s.cas.find((c) => c.id === s.default_ca_id);
        if (def) {
          next.caName = prev.caName || def.ca_name || "";
          next.membershipNo = prev.membershipNo || def.membership_no || "";
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Edit mode: load universal certificate */
  useEffect(() => {
    if (!isEdit) return;

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/certificates/${id}`);
        const cert = res.data;

        // Ensure this is a turnover certificate
        const cat = (cert?.category || "").toUpperCase();
        const type = (cert?.certificate_type || "").toLowerCase();
        if (cat !== "TURNOVER" && !type.includes("turnover")) {
          toast.error("This certificate is not a Turnover certificate.");
          navigate(-1);
          return;
        }

        setEntityType(cert?.entityType || "PROPRIETORSHIP");
        setForm(universalCertToForm(cert));
      } catch (e) {
        console.error(e);
        toast.error("Failed to load certificate for editing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, id, navigate]);

  /** Create mode: consume upload-prefill state from UploadCertificates page */
  useEffect(() => {
    if (isEdit || uploadPrefillApplied) return;
    const prefill = location.state?.turnoverPrefill;
    if (!prefill || typeof prefill !== "object") return;

    const nextEntityType = String(prefill.entityType || "").trim();
    if (ENTITY_TYPES.some((t) => t.key === nextEntityType)) {
      setEntityType(nextEntityType);
    }

    setForm((prev) => {
      const next = { ...prev, ...prefill };
      if (Array.isArray(prefill.turnoverRows) && prefill.turnoverRows.length > 0) {
        next.turnoverRows = prefill.turnoverRows.map((r) => ({
          fy: String(r?.fy ?? "").trim(),
          amount: String(r?.amount ?? "").trim(),
        }));
      }
      return next;
    });

    const extractedRows = Number(location.state?.uploadSummary?.rows_extracted || 0);
    if (extractedRows > 0) {
      toast.success(`Auto-filled ${extractedRows} turnover row(s). Please complete remaining details.`);
    }

    setUploadPrefillApplied(true);
  }, [isEdit, uploadPrefillApplied, location.state]);

  /** Local validation (UI) */
  const validate = () => {
    if (entityType === "PERSONAL" && !form.personName.trim()) return "Individual Name is required.";
    if (entityType === "PROPRIETORSHIP" && !form.firmName.trim()) return "Firm Name is required.";
    if (["LLP", "PRIVATE_LIMITED", "PUBLIC_LIMITED"].includes(entityType) && !form.companyName.trim())
      return entityType === "LLP" ? "LLP Name is required." : "Company Name is required.";
    if (["TRUST", "NGO", "SOCIETY", "GOVERNMENT"].includes(entityType) && !form.entityName.trim())
      return "Entity Name is required.";

    if (!form.purpose.trim()) return "Purpose is required.";
    if (!form.place.trim()) return "Place is required.";
    if (!form.date.trim()) return "Date is required.";

    const validRows = (form.turnoverRows || []).filter((r) => (r.fy || "").trim() && String(r.amount || "").trim());
    if (!validRows.length) return "Add at least one Financial Year with Amount.";

    if (!form.caFirm.trim()) return "Firm Name is required.";
    if (!form.frn.trim()) return "FRN is required.";
    if (!form.caName.trim()) return "CA Name is required.";
    if (!form.membershipNo.trim()) return "Membership No is required.";

    return null;
  };

  /** Submit: universal create/update */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);

    setLoading(true);

    try {
      const payload = buildUniversalPayload({ entityType, form });

      if (isEdit) {
        await api.put(`/api/certificates/${id}`, payload);
        clearDraft(TURNOVER_DRAFT_KEY);
        toast.success("Turnover Certificate updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(TURNOVER_DRAFT_KEY);
        toast.success("Turnover Certificate created successfully!");
        navigate(`/certificate/${res.data.id}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        getApiErrorMessage(
          error,
          isEdit ? "Failed to update certificate." : "Failed to create certificate."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    const ok = window.confirm("Are you sure you want to delete this certificate?");
    if (!ok) return;

    try {
      setLoading(true);
      await api.delete(`/api/certificates/${id}`);
      toast.success("Certificate deleted.");
      navigate("/history");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete certificate.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="w-[90%] max-w-none mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {!isEdit && (
              <Button variant="outline" type="button" onClick={() => navigate("/turnover")}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Excel
              </Button>
            )}
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <Button form="turnover-form" type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* FORM */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isEdit ? "Edit Turnover Certificate" : "Turnover Certificate"}
            </h1>
            <p className="text-muted-foreground mb-8">
              {isEdit ? "Update and save on the same certificate ID." : "Fill details and generate certificate."}
            </p>

            <form id="turnover-form" onSubmit={handleSubmit} className="space-y-8">
              {/* Entity Type */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Entity Information
                </h2>

                <div>
                  <Label>Entity Type *</Label>
                  <select
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={entityType}
                    onChange={(e) => setEntityType(e.target.value)}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <ClientSelector entityType={entityType} onSelect={applyClient} />

                <div className="grid md:grid-cols-2 gap-6">
                  {visibleFields.map((fieldKey) => (
                    <div key={fieldKey} className={fieldKey === "address" ? "md:col-span-2" : ""}>
                      <Label htmlFor={fieldKey}>{FIELD_LABELS[fieldKey]}</Label>
                      {fieldKey === "address" ? (
                        <Textarea
                          id={fieldKey}
                          className="mt-2"
                          rows={3}
                          value={form[fieldKey] || ""}
                          onChange={(e) => update(fieldKey, e.target.value)}
                        />
                      ) : (
                        <Input
                          id={fieldKey}
                          className="mt-2"
                          value={form[fieldKey] || ""}
                          onChange={(e) => update(fieldKey, e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Turnover Rows */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Turnover (FY-wise)
                </h2>

                <div className="space-y-3">
                  {(form.turnoverRows || []).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
                      <div>
                        <Label>Financial Year *</Label>
                        <Input
                          className="mt-2"
                          value={row.fy}
                          onChange={(e) => updateRow(idx, "fy", e.target.value)}
                          placeholder="e.g., 2023-24"
                        />
                      </div>

                      <div>
                        <Label>Amount (₹) *</Label>
                        <Input
                          className="mt-2 text-right"
                          value={row.amount}
                          onChange={(e) => updateRow(idx, "amount", e.target.value)}
                          placeholder="e.g., 12,50,000"
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
              </div>

              {/* Meta */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Certificate Meta
                </h2>

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

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Place *</Label>
                    <Input className="mt-2" value={form.place} onChange={(e) => update("place", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input
                      className="mt-2 w-[20ch]"
                      value={form.date}
                      onChange={(e) => update("date", autoFormatDDMMYYYY(e.target.value))}
                      placeholder="DD/MM/YYYY"
                    />
                  </div>
                </div>
              </div>

              {/* CA Details */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  CA Details
                </h2>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>CA Name *</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.caName || ""}
                      onChange={(e) => {
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
                    <Input className="mt-2" value={form.udin} onChange={(e) => update("udin", e.target.value)} />
                  </div>

                  <div>
                    <Label>Firm Name *</Label>
                    <Input className="mt-2" value={form.caFirm} onChange={(e) => update("caFirm", e.target.value)} />
                  </div>

                  <div>
                    <Label>FRN *</Label>
                    <Input className="mt-2" value={form.frn} onChange={(e) => update("frn", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-4 pt-6 border-t">
                <Button type="button" variant="outline" onClick={() => navigate("/history")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4 mr-2" />
                  {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update Certificate" : "Generate Certificate"}
                </Button>
              </div>
            </form>
          </div>

          {/* PREVIEW */}
          <div className="lg:sticky lg:top-6 h-fit">
            <CertificatePreview entityType={entityType} form={form} />
          </div>
        </div>
      </div>
    </div>
  );
}

