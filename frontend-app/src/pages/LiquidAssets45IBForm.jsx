import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
const CA_STORAGE_KEY = "ca_settings_v1";
const LIQUID_ASSETS_DRAFT_KEY = "draft:rbi_liquid_assets_45ib_v1";
const NBFC_CERT_TYPE = "rbi_statutory_auditor_certificate_for_nbfcs";
const LIQUID_VARIANT = "liquid_assets_45_ib";
const AMOUNT_INPUT_UNITS = {
  RUPEES: { label: "Rupees", divisorToCrore: 10000000 },
};

const ENTITY_TYPES = [
  { key: "PROPRIETORSHIP", label: "Proprietorship Firm" },
  { key: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { key: "PUBLIC_LIMITED", label: "Public Limited Company" },
  { key: "TRUST", label: "Trust" },
  { key: "NGO", label: "NGO (Society/Trust/Section 8)" },
  { key: "SOCIETY", label: "Society" },
  { key: "GOVERNMENT", label: "Government / PSU / Department" },
];

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
    return { ...getDefaultCASettings(), ...(JSON.parse(raw) || {}) };
  } catch {
    return getDefaultCASettings();
  }
}

function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function formatFinancialYearEnd(year) {
  const y = String(year || "").trim();
  return y ? `March 31, ${y}` : "";
}

function extractFinancialYearEndYear(value) {
  const s = String(value || "");
  const m = s.match(/(19|20)\d{2}(?!.*\d)/);
  return m ? m[0] : "";
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const dmy = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    const dd = digits.slice(0, 2);
    const mm = digits.slice(2, 4);
    const yyyy = digits.slice(4, 8);
    const d = Number(dd);
    const m = Number(mm);
    const y = Number(yyyy);
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      return `${dd}-${mm}-${yyyy}`;
    }
  }

  return raw;
}

function formatDateInputLive(value) {
  const raw = String(value || "");
  if (!raw.trim()) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;

  const dmy = raw.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;

  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

function parseAmountSafe(value) {
  const s = String(value || "").replace(/,/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseNumberOrNull(value) {
  const s = String(value || "").replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function getAmountInputUnit(form) {
  return "RUPEES";
}

function toCroreAmount(value, unit) {
  const divisor = AMOUNT_INPUT_UNITS[unit]?.divisorToCrore || 1;
  return parseAmountSafe(value) / divisor;
}

function fromCroreAmount(croreValue, unit) {
  const divisor = AMOUNT_INPUT_UNITS[unit]?.divisorToCrore || 1;
  return croreValue * divisor;
}

function formatNumericOnly(value) {
  const n = parseNumberOrNull(value);
  if (n === null) return "__________";
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function computeRequiredLiquidAssetsCrore(form) {
  const unit = getAmountInputUnit(form);
  const deposits = toCroreAmount(form.publicDepositsOutstanding, unit);
  const pct = parseAmountSafe(form.requiredPercentage);
  if (!deposits || !pct) return 0;
  return (deposits * pct) / 100;
}

function computeRequiredLiquidAssets(form) {
  const unit = getAmountInputUnit(form);
  const requiredCrore = computeRequiredLiquidAssetsCrore(form);
  if (!requiredCrore) return "";
  return formatAmount(fromCroreAmount(requiredCrore, unit));
}

function computeActualLiquidAssetsCrore(form) {
  const unit = getAmountInputUnit(form);
  const totalCrore =
    toCroreAmount(form.cashInHand, unit) +
    toCroreAmount(form.bankBalancesScheduled, unit) +
    toCroreAmount(form.unencumberedApprovedSecurities, unit) +
    toCroreAmount(form.otherEligibleLiquidAssets, unit);
  return totalCrore;
}

function computeActualLiquidAssets(form) {
  const unit = getAmountInputUnit(form);
  const totalCrore = computeActualLiquidAssetsCrore(form);
  if (!totalCrore) return "";
  return formatAmount(fromCroreAmount(totalCrore, unit));
}

function computeComplianceStatus(form) {
  const requiredCrore = computeRequiredLiquidAssetsCrore(form);
  if (!requiredCrore) return "Required";
  const actualCrore = computeActualLiquidAssetsCrore(form);
  return actualCrore >= requiredCrore ? "Complied" : "Not Complied";
}

function defaultForm() {
  return {
    companyName: "",
    certificateOfRegistrationNo: "",
    cin: "",
    pan: "",
    gstin: "",
    registeredOfficeAddress: "",
    financialYearEnd: "",
    secondPrecedingQuarterDate: "",
    asOnDate: "",
    amountInputUnit: "RUPEES",

    publicDepositsOutstanding: "",
    requiredPercentage: "15",
    cashInHand: "",
    bankBalancesScheduled: "",
    unencumberedApprovedSecurities: "",
    otherEligibleLiquidAssets: "",

    purpose: "Submission to RBI under Section 45-IB of RBI Act, 1934",
    place: "",
    date: todayDDMMYYYY(),

    caFirm: "",
    frn: "",
    caName: "",
    membershipNo: "",
    udin: "",
  };
}

function buildMainRows(form) {
  const unit = getAmountInputUnit(form);
  const unitLabel = AMOUNT_INPUT_UNITS[unit].label;
  const required = computeRequiredLiquidAssets(form);
  const actual = computeActualLiquidAssets(form);
  const status = computeComplianceStatus(form);
  const secondPrecedingDate =
    normalizeDateInput(form.secondPrecedingQuarterDate) ||
    normalizeDateInput(form.date) ||
    "Date";
  const asOnDate =
    normalizeDateInput(form.asOnDate) ||
    normalizeDateInput(form.secondPrecedingQuarterDate) ||
    normalizeDateInput(form.date) ||
    "Date";

  return [
    [
      "1",
      `Public deposits outstanding on last working day of second preceding quarter (${secondPrecedingDate})`,
      form.publicDepositsOutstanding ? `${form.publicDepositsOutstanding} (${unitLabel})` : "NA",
    ],
    [
      "2",
      `Minimum liquid assets required (${form.requiredPercentage || "0"}% of public deposits)`,
      required ? `${required} (${unitLabel})` : "NA",
    ],
    [
      "3",
      `Actual liquid assets maintained as on ${asOnDate}`,
      actual ? `${actual} (${unitLabel})` : "NA",
    ],
    [
      "4",
      "Compliance status under Section 45-IB of RBI Act, 1934",
      status,
    ],
    [
      "5",
      "Break-up: Cash in hand / Balance with scheduled banks / Unencumbered approved securities / Other eligible liquid assets",
      [
        `Cash in hand: ${form.cashInHand || "0"} (${unitLabel})`,
        `Balances with scheduled banks: ${form.bankBalancesScheduled || "0"} (${unitLabel})`,
        `Unencumbered approved securities: ${form.unencumberedApprovedSecurities || "0"} (${unitLabel})`,
        `Other eligible liquid assets: ${form.otherEligibleLiquidAssets || "0"} (${unitLabel})`,
      ].join("\n"),
    ],
  ];
}

function buildUniversalPayload({ entityType, form }) {
  const rows = buildMainRows(form);
  const required = computeRequiredLiquidAssets(form);
  const actual = computeActualLiquidAssets(form);
  const complianceStatus = computeComplianceStatus(form);

  return {
    category: "NBFC",
    certificate_type: NBFC_CERT_TYPE,
    entityType,
    identity: {
      person_name: "",
      company_name: String(form.companyName || "").trim(),
      legal_type: "",
      reg_no: String(form.certificateOfRegistrationNo || "").trim(),
      department: "",
      pan: String(form.pan || "").trim(),
      cin: String(form.cin || "").trim(),
      gstin: String(form.gstin || "").trim(),
      address: String(form.registeredOfficeAddress || "").trim(),
    },
    meta: {
      purpose: String(form.purpose || "").trim(),
      place: String(form.place || "").trim(),
      date: String(form.date || "").trim(),
    },
    ca: {
      firm: String(form.caFirm || "").trim(),
      frn: String(form.frn || "").trim(),
      name: String(form.caName || "").trim(),
      membership_no: String(form.membershipNo || "").trim(),
      udin: String(form.udin || "").trim(),
    },
    data: {
      tables: {
        main: {
          columns: ["Sl. No.", "Particulars", "Details"],
          rows,
        },
      },
      extras: {
        formData: {
          ...form,
          certificateVariant: LIQUID_VARIANT,
          requiredLiquidAssets: required,
          totalLiquidAssets: actual,
          complianceStatus,
          financialYearEnd: String(form.financialYearEnd || "").trim(),
        },
      },
    },
  };
}

function universalCertToForm(cert) {
  const saved = cert?.data?.extras?.formData;
  if (saved && typeof saved === "object") {
    return { ...defaultForm(), ...saved };
  }

  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};

  return {
    ...defaultForm(),
    companyName: identity?.company_name || "",
    certificateOfRegistrationNo: identity?.reg_no || "",
    cin: identity?.cin || "",
    pan: identity?.pan || "",
    gstin: identity?.gstin || "",
    registeredOfficeAddress: identity?.address || "",
    purpose: meta?.purpose || "",
    place: meta?.place || "",
    date: meta?.date || "",
    caFirm: ca?.firm || "",
    frn: ca?.frn || "",
    caName: ca?.name || "",
    membershipNo: ca?.membership_no || "",
    udin: ca?.udin || "",
  };
}

function LiquidAssetsQuickPreview({ form, entityType }) {
  const amountInputUnit = getAmountInputUnit(form);
  const amountUnitLabel = AMOUNT_INPUT_UNITS[amountInputUnit].label;
  const required = computeRequiredLiquidAssets(form);
  const actual = computeActualLiquidAssets(form);
  const complianceStatus = computeComplianceStatus(form);
  const hasMaintained = complianceStatus === "Complied";
  const companyName = String(form.companyName || "").trim() || "[Name of the NBFC]";
  const constitution =
    ENTITY_TYPES.find((t) => t.key === entityType)?.label || "__________________";
  const registrationNo =
    String(form.certificateOfRegistrationNo || "").trim() || "[Registration Number]";
  const cin = String(form.cin || "").trim();
  const pan = String(form.pan || "").trim();
  const gstin = String(form.gstin || "").trim();
  const registeredOffice = String(form.registeredOfficeAddress || "").trim();
  const quarterEnded =
    normalizeDateInput(form.asOnDate) ||
    normalizeDateInput(form.secondPrecedingQuarterDate) ||
    normalizeDateInput(form.date) ||
    String(form.financialYearEnd || "").trim() ||
    "[Date]";
  const secondPrecedingDate =
    normalizeDateInput(form.secondPrecedingQuarterDate) ||
    normalizeDateInput(form.date) ||
    "[Date]";
  const requiredPercentage = String(form.requiredPercentage || "").trim() || "___";
  const purpose =
    String(form.purpose || "").trim() ||
    "submission to the Reserve Bank of India";
  const place = String(form.place || "").trim() || "__________";
  const date = String(form.date || "").trim() || "__________";
  const caFirm = String(form.caFirm || "").trim() || "[Name of CA Firm]";
  const frn = String(form.frn || "").trim() || "_________";
  const caName = String(form.caName || "").trim() || "__________";
  const membershipNo = String(form.membershipNo || "").trim() || "__________";
  const udin = String(form.udin || "").trim() || "__________";

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="certificate-title">
        CERTIFICATE OF MAINTENANCE OF LIQUID ASSETS
      </div>
      <div className="mt-1 text-center">
        <p className="certificate-subtitle" style={{ fontSize: "11pt", marginBottom: "4mm" }}>
          (Pursuant to Section 45-IB of the Reserve Bank of India Act, 1934)
        </p>
      </div>

      <div className="certificate-body">
        <div className="rounded-xl border border-dashed p-3 mb-3">
          <div className="font-bold">Identification</div>
          <div className="mt-2 text-sm">
            {companyName}
            {cin ? <span>, CIN: {cin}</span> : null}
            {pan ? <span>, PAN: {pan}</span> : null}
            {gstin ? <span>, GSTIN: {gstin}</span> : null}
          </div>
          {registeredOffice ? <div className="mt-1 text-sm">Address: {registeredOffice}</div> : null}
          <div className="mt-1 text-sm">
            <span className="font-bold">Constitution:</span> {constitution}
          </div>
        </div>

        <p className="mt-3">
          We have examined the books of account, records and other relevant documents of{" "}
          <strong>{companyName}</strong>, having RBI Registration No.{" "}
          <strong>{registrationNo}</strong>, for the purpose of certifying compliance with the
          provisions of Section 45-IB of the Reserve Bank of India Act, 1934 and the applicable
          directions issued by the Reserve Bank of India.
        </p>

        <p>
          Based on our examination and according to the information and explanations given to us,
          we hereby certify that:
        </p>
        <p className="mt-3"><strong>Public Deposits Outstanding ({amountUnitLabel})</strong></p>
        <p>
          The total amount of public deposits outstanding as at the close of business on the last
          working day of the second preceding quarter, i.e., as on {secondPrecedingDate}, was:
        </p>
        <p><strong>Rs. {formatNumericOnly(form.publicDepositsOutstanding)}</strong></p>

        <p className="mt-3"><strong>Minimum Liquid Assets Required ({amountUnitLabel})</strong></p>
        <p>
          The minimum liquid assets required to be maintained (being {requiredPercentage}% of
          public deposits as applicable) amounted to:
        </p>
        <p><strong>Rs. {formatNumericOnly(required)}</strong></p>

        <p className="mt-3"><strong>Liquid Assets Actually Maintained as on {quarterEnded}</strong></p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="certificate-table compact">
          <thead>
            <tr>
              <th style={{ width: "65%", textAlign: "left" }}>Particulars</th>
              <th style={{ textAlign: "left" }}>Amount ({amountUnitLabel})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "left" }}>Cash in Hand</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(form.cashInHand)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Balance in Current Account with Scheduled Banks</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(form.bankBalancesScheduled)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Unencumbered Approved Securities</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(form.unencumberedApprovedSecurities)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Other Eligible Liquid Assets (if any)</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(form.otherEligibleLiquidAssets)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}><strong>Total Liquid Assets Maintained</strong></td>
              <td style={{ textAlign: "left" }}><strong>Rs. {formatNumericOnly(actual)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="certificate-body">
        <p className="mt-3">
          The above liquid assets were unencumbered and maintained in accordance with the
          provisions of Section 45-IB of the Reserve Bank of India Act, 1934.
        </p>

        <p className="mt-2">
          The Company {hasMaintained ? "has" : "has not"} maintained the required percentage of
          liquid assets as prescribed under the Act as at {quarterEnded}.
        </p>

        <p className="mt-3"><strong>Restriction on Use</strong></p>
        <p>
          This certificate is issued at the request of the Company for {purpose} and should
          not be used for any other purpose without our prior written consent.
        </p>
      </div>

      <div className="certificate-signature mt-3">
        <div className="signature-left">
          <p><strong>Place:</strong> {place}</p>
          <p><strong>Date:</strong> {date}</p>
        </div>

        <div className="signature-right">
          <p>For {caFirm}</p>
          <p>Chartered Accountants</p>
          <p>Firm Registration No.: {frn}</p>
          <p className="mt-6"></p>
          <p>{caName}</p>
          <p>Membership No.: {membershipNo}</p>
          <p>UDIN: {udin}</p>
        </div>
      </div>
    </div>
  );
}

export default function LiquidAssets45IBForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("PRIVATE_LIMITED");
  const [form, setForm] = useState(defaultForm());
  const [draftReady, setDraftReady] = useState(false);
  const [caSettings, setCaSettings] = useState(null);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const selectedFinancialYear = useMemo(
    () => extractFinancialYearEndYear(form.financialYearEnd),
    [form.financialYearEnd]
  );

  const requiredLiquidAssets = useMemo(
    () => computeRequiredLiquidAssets(form),
    [form]
  );
  const totalLiquidAssets = useMemo(
    () => computeActualLiquidAssets(form),
    [form]
  );
  const amountUnitLabel = "Rupees";
  const amountPlaceholder = "e.g. 112345678998745";

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(LIQUID_ASSETS_DRAFT_KEY);
    if (draft) {
      if (draft.entityType) setEntityType(draft.entityType);
      if (draft.form) setForm((prev) => ({ ...prev, ...draft.form }));
      toast.message("Draft restored (saved recently).");
    }
    setDraftReady(true);
  }, [isEdit]);

  useEffect(() => {
    if (isEdit || !draftReady) return;
    saveDraftWithTTL(
      LIQUID_ASSETS_DRAFT_KEY,
      { entityType, form },
      ONE_HOUR_DRAFT_TTL_MS
    );
  }, [entityType, form, isEdit, draftReady]);

  const financialYearEndOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = Array.from({ length: 21 }, (_, idx) =>
      String(currentYear + 5 - idx)
    );
    if (selectedFinancialYear && !baseYears.includes(selectedFinancialYear)) {
      return [selectedFinancialYear, ...baseYears];
    }
    return baseYears;
  }, [selectedFinancialYear]);

  useEffect(() => {
    const settings = loadCASettingsLocal();
    setCaSettings(settings);
    setForm((prev) => {
      const next = {
        ...prev,
        place: prev.place || settings.place || "",
        caFirm: prev.caFirm || settings.firm_name || "",
        frn: prev.frn || settings.frn || "",
      };
      if (settings.default_ca_id && Array.isArray(settings.cas)) {
        const selected = settings.cas.find((c) => c.id === settings.default_ca_id);
        if (selected) {
          next.caName = prev.caName || selected.ca_name || "";
          next.membershipNo = prev.membershipNo || selected.membership_no || "";
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/certificates/${id}`);
        const cert = res.data;
        const type = (cert?.certificate_type || "").toLowerCase();
        const variant = cert?.data?.extras?.formData?.certificateVariant;

        if (type !== NBFC_CERT_TYPE) {
          toast.error("This is not an RBI NBFC certificate.");
          navigate(-1);
          return;
        }
        if (variant && variant !== LIQUID_VARIANT) {
          toast.error("This certificate belongs to RBI SAC format.");
          navigate(`/rbi-statutory-auditor/${id}`);
          return;
        }

        setEntityType(cert?.entityType || "PRIVATE_LIMITED");
        setForm(universalCertToForm(cert));
      } catch (e) {
        console.error(e);
        toast.error("Failed to load certificate for editing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, navigate]);

  const validate = () => {
    if (!String(form.companyName || "").trim()) return "Company name is required.";
    if (!String(form.financialYearEnd || "").trim()) return "Financial year ending is required.";
    if (!String(form.secondPrecedingQuarterDate || "").trim()) return "Second preceding quarter date is required.";
    if (!String(form.asOnDate || "").trim()) return "As on date is required.";
    if (!String(form.publicDepositsOutstanding || "").trim()) return "Public deposits outstanding is required.";
    if (!String(form.requiredPercentage || "").trim()) return "Required percentage is required.";
    if (!String(form.place || "").trim()) return "Place is required.";
    if (!String(form.date || "").trim()) return "Date is required.";
    if (!String(form.caFirm || "").trim()) return "CA firm is required.";
    if (!String(form.frn || "").trim()) return "FRN is required.";
    if (!String(form.caName || "").trim()) return "CA name is required.";
    if (!String(form.membershipNo || "").trim()) return "Membership number is required.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);

    try {
      setLoading(true);
      const payload = buildUniversalPayload({ entityType, form });
      if (isEdit) {
        await api.put(`/api/certificates/${id}`, payload);
        clearDraft(LIQUID_ASSETS_DRAFT_KEY);
        toast.success("Liquid assets certificate updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(LIQUID_ASSETS_DRAFT_KEY);
        toast.success("Liquid assets certificate created successfully!");
        navigate(`/certificate/${res.data.id}`);
      }
    } catch (error) {
      console.error(error);
      toast.error(isEdit ? "Failed to update certificate." : "Failed to create certificate.");
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
      <div className="w-[92%] max-w-none mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {isEdit && (
              <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
            <Button form="liquid-assets-form" type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isEdit
                ? "Edit Certificate of Liquid Assets u/s 45-IB"
                : "Certificate of Liquid Assets u/s 45-IB"}
            </h1>
            <p className="text-muted-foreground mb-8">
              Fill details for maintenance of liquid assets under Section 45-IB of RBI Act, 1934.
            </p>

            <form id="liquid-assets-form" onSubmit={handleSubmit} className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Company Information
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

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Company Name *</Label>
                    <Input className="mt-2" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
                  </div>
                  <div>
                    <Label>RBI Registration No.</Label>
                    <Input className="mt-2" value={form.certificateOfRegistrationNo} onChange={(e) => update("certificateOfRegistrationNo", e.target.value)} />
                  </div>
                  <div>
                    <Label>CIN (if required)</Label>
                    <Input className="mt-2" value={form.cin} onChange={(e) => update("cin", e.target.value)} />
                  </div>
                  <div>
                    <Label>PAN (if required)</Label>
                    <Input className="mt-2" value={form.pan} onChange={(e) => update("pan", e.target.value)} />
                  </div>
                  <div>
                    <Label>GSTIN (if required)</Label>
                    <Input className="mt-2" value={form.gstin} onChange={(e) => update("gstin", e.target.value)} />
                  </div>
                  <div>
                    <Label>Financial Year Ending *</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={selectedFinancialYear}
                      onChange={(e) => update("financialYearEnd", formatFinancialYearEnd(e.target.value))}
                    >
                      <option value="">Select year</option>
                      {financialYearEndOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">Auto-format: March 31, YYYY</p>
                  </div>
                  <div>
                    <Label>Last working day of second preceding quarter *</Label>
                    <Input
                      className="mt-2"
                      value={form.secondPrecedingQuarterDate}
                      onChange={(e) => update("secondPrecedingQuarterDate", formatDateInputLive(e.target.value))}
                      onBlur={(e) => update("secondPrecedingQuarterDate", normalizeDateInput(e.target.value))}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                  <div>
                    <Label>As on Date (actual assets) *</Label>
                    <Input
                      className="mt-2"
                      value={form.asOnDate}
                      onChange={(e) => update("asOnDate", formatDateInputLive(e.target.value))}
                      onBlur={(e) => update("asOnDate", normalizeDateInput(e.target.value))}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Registered Office Address</Label>
                    <Textarea className="mt-2" rows={2} value={form.registeredOfficeAddress} onChange={(e) => update("registeredOfficeAddress", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Section 45-IB Computation
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Public Deposits Outstanding ({amountUnitLabel}) *</Label>
                    <Input
                      className="mt-2"
                      value={form.publicDepositsOutstanding}
                      onChange={(e) => update("publicDepositsOutstanding", e.target.value)}
                      placeholder={amountPlaceholder}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label>Required Percentage (%) *</Label>
                    <Input className="mt-2" value={form.requiredPercentage} onChange={(e) => update("requiredPercentage", e.target.value)} />
                  </div>
                  <div>
                    <Label>Minimum Liquid Assets Required (Auto, {amountUnitLabel})</Label>
                    <Input className="mt-2" value={requiredLiquidAssets} readOnly />
                  </div>
                  <div>
                    <Label>Cash in Hand ({amountUnitLabel})</Label>
                    <Input
                      className="mt-2"
                      value={form.cashInHand}
                      onChange={(e) => update("cashInHand", e.target.value)}
                      placeholder={amountPlaceholder}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label>Balances with Scheduled Banks ({amountUnitLabel})</Label>
                    <Input
                      className="mt-2"
                      value={form.bankBalancesScheduled}
                      onChange={(e) => update("bankBalancesScheduled", e.target.value)}
                      placeholder={amountPlaceholder}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label>Unencumbered Approved Securities ({amountUnitLabel})</Label>
                    <Input
                      className="mt-2"
                      value={form.unencumberedApprovedSecurities}
                      onChange={(e) => update("unencumberedApprovedSecurities", e.target.value)}
                      placeholder={amountPlaceholder}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label>Other Eligible Liquid Assets ({amountUnitLabel})</Label>
                    <Input
                      className="mt-2"
                      value={form.otherEligibleLiquidAssets}
                      onChange={(e) => update("otherEligibleLiquidAssets", e.target.value)}
                      placeholder={amountPlaceholder}
                      inputMode="decimal"
                    />
                  </div>
                  <div>
                    <Label>Total Liquid Assets Maintained (Auto, {amountUnitLabel})</Label>
                    <Input className="mt-2" value={totalLiquidAssets} readOnly />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Purpose</Label>
                    <Textarea className="mt-2" rows={2} value={form.purpose} onChange={(e) => update("purpose", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Certificate Meta
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Place *</Label>
                    <Input className="mt-2" value={form.place} onChange={(e) => update("place", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input
                      className="mt-2"
                      value={form.date}
                      onChange={(e) => update("date", formatDateInputLive(e.target.value))}
                      onBlur={(e) => update("date", normalizeDateInput(e.target.value))}
                      placeholder="DD-MM-YYYY"
                    />
                  </div>
                </div>
              </div>

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

              <div className="pt-2 border-t border-border">
                <div className="flex justify-center">
                  <Button type="submit" disabled={loading}>
                    <Save className="h-4 w-4 mr-2" />
                    {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
                  </Button>
                </div>
              </div>
            </form>
          </div>

          <div>
            <LiquidAssetsQuickPreview form={form} entityType={entityType} />
          </div>
        </div>
      </div>
    </div>
  );
}

