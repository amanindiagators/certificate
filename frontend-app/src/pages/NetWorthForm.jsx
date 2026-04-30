
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ClientSelector from "../components/ClientSelector";
import { ArrowLeft, Save, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
const NETWORTH_DRAFT_KEY = "draft:networth_form_v1";

/** ---------- Entity Types ---------- */
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

/** ---------- Local CA Settings ---------- */
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

/* ================= VISA + FX HELPERS ================= */

function isVisaPurpose(purpose = "") {
  return purpose.toLowerCase().includes("visa");
}

async function fetchCurrencyByCountry(country) {
  if (!country) return null;

  try {
    const res = await fetch(
      `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fullText=true`
    );
    const data = await res.json();
    const currencies = data?.[0]?.currencies;
    if (!currencies) return null;
    return Object.keys(currencies)[0]; // e.g. AUD, USD
  } catch {
    return null;
  }
}

function CountrySelect({ value, onSelect }) {
  const [list, setList] = useState([]);

  const search = async (q) => {
    if (!q) return setList([]);
    try {
      const res = await fetch(
        `https://restcountries.com/v3.1/name/${q}`
      );
      const data = await res.json();
      setList(data.slice(0, 6).map(c => c.name.common));
    } catch {
      setList([]);
    }
  };

  return (
    <div className="relative">
      <Input
        value={value}
        placeholder="Country"
        onChange={(e) => {
          onSelect(e.target.value);
          search(e.target.value);
        }}
      />

      {list.length > 0 && (
        <div className="absolute z-30 bg-white border w-full rounded shadow">
          {list.map(c => (
            <div
              key={c}
              className="px-3 py-2 cursor-pointer hover:bg-muted"
              onClick={() => {
                onSelect(c);
                setList([]);
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** ---------- Default form ---------- */
function defaultForm() {
  return {
    // identity
    personName: "",
    companyName: "",

    // PERSONAL ONLY
    titlePrefix: "Mr.", // Mr. / Ms.
    relationType: "S/o", // S/o / W/o / D/o
    relationName: "",

    // IDs
    pan: "",
    cin: "",
    gstin: "",
    address: "",

    // meta
    purpose: "",
    place: "",
    date: new Date().toLocaleDateString("en-IN"),
    asOnDate: new Date().toLocaleDateString("en-IN"),

    // CA
    caFirm: "",
    frn: "",
    caName: "",
    membershipNo: "",
    udin: "",
    visaCountry: "",
    visaCurrency: "",

    // Schedules
    scheduleARows: [{ particulars: "", amount: "" }],
    scheduleBRows: [{ particulars: "", amount: "" }],
    scheduleCRows: [{ particulars: "", amount: "" }],

    // (future)
    customSchedules: [],
  };
}

/** ---------- helpers ---------- */
function isBlank(v) {
  return !v || String(v).trim() === "";
}
function toNumberSafe(v) {
  const s = (v || "").toString().replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function formatINR(n) {
  if (n === null || n === undefined) return "";
  try {
    return n.toLocaleString("en-IN");
  } catch {
    return String(n);
  }
}
function sumRows(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((acc, r) => {
    const n = toNumberSafe(r?.amount);
    return acc + (n ?? 0);
  }, 0);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    return [{ particulars: "", amount: "", country: "", currency: "" }];

  return rows.map((r) => ({
    particulars: (r?.particulars ?? "").toString(),
    amount: (r?.amount ?? "").toString(),
  }));
}

function entityLabel(entityType) {
  return ENTITY_TYPES.find((x) => x.key === entityType)?.label || "______________";
}

/** ---------- payload builders ---------- */
function buildUniversalPayload({ entityType, form, isVisa, fxRates }) {
  const person_name = entityType === "PERSONAL" ? (form.personName || "").trim() : "";
  const company_name = (form.companyName || "").trim();

  const aTotal = sumRows(form.scheduleARows);
  const bTotal = sumRows(form.scheduleBRows);
  const cTotal = sumRows(form.scheduleCRows);
  const netWorth = aTotal + bTotal - cTotal;

  const visaRate =
    isVisa && form.visaCurrency && fxRates?.[form.visaCurrency]
      ? fxRates[form.visaCurrency]
      : null;

  const convert = (n) =>
    visaRate ? Number(String(n).replace(/,/g, "")) * visaRate : null;

  return {
    category: "NET_WORTH",
    certificate_type: "net_worth_certificate",
    entityType,

    identity: {
      person_name,
      company_name,
      pan: (form.pan || "").trim(),
      cin: (form.cin || "").trim(),
      gstin: (form.gstin || "").trim(),
      address: (form.address || "").trim(),
    },

    meta: {
      purpose: (form.purpose || "").trim(),
      place: (form.place || "").trim(),
      date: (form.date || "").trim(),
      as_on_date: (form.asOnDate || "").trim(),
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
        summary: {
          columns: isVisa
            ? ["Sr. No.", "Particulars", "Amount (₹)", `Amount (${form.visaCurrency})`]
            : ["Sr. No.", "Particulars", "Amount (₹)"],

          rows: [
            [
              "1",
              "Schedule A – Movable / Current Assets",
              formatINR(aTotal),
              isVisa ? convert(aTotal)?.toFixed(2) : undefined,
            ],
            [
              "2",
              "Schedule B – Immovable / Non-Current Assets",
              formatINR(bTotal),
              isVisa ? convert(bTotal)?.toFixed(2) : undefined,
            ],
            [
              "3",
              "Schedule C – Liabilities",
              formatINR(cTotal),
              isVisa ? convert(cTotal)?.toFixed(2) : undefined,
            ],
            [
              "",
              "NET WORTH (A + B − C)",
              formatINR(netWorth),
              isVisa ? convert(netWorth)?.toFixed(2) : undefined,
            ],
          ],
        },

        scheduleA: {
          title: "SCHEDULE A – MOVABLE / CURRENT ASSETS",
          columns: isVisa
            ? ["Sr. No.", "Particulars", "Amount (₹)", `Amount (${form.visaCurrency})`]
            : ["Sr. No.", "Particulars", "Amount (₹)"],

          rows: normalizeRows(form.scheduleARows).map((r, idx) => [
            String(idx + 1),
            r.particulars,
            r.amount,
            isVisa ? convert(r.amount)?.toFixed(2) : undefined,
          ]),
        },

        scheduleB: {
          title: "SCHEDULE B – IMMOVABLE / NON-CURRENT ASSETS",
          columns: isVisa
            ? ["Sr. No.", "Particulars", "Amount (₹)", `Amount (${form.visaCurrency})`]
            : ["Sr. No.", "Particulars", "Amount (₹)"],

          rows: normalizeRows(form.scheduleBRows).map((r, idx) => [
            String(idx + 1),
            r.particulars,
            r.amount,
            isVisa ? convert(r.amount)?.toFixed(2) : undefined,
          ]),
        },

        scheduleC: {
          title: "SCHEDULE C – LIABILITIES",
          columns: isVisa
            ? ["Sr. No.", "Particulars", "Amount (₹)", `Amount (${form.visaCurrency})`]
            : ["Sr. No.", "Particulars", "Amount (₹)"],

          rows: normalizeRows(form.scheduleCRows).map((r, idx) => [
            String(idx + 1),
            r.particulars,
            r.amount,
            isVisa ? convert(r.amount)?.toFixed(2) : undefined,
          ]),
        },
      },

      extras: {
        form: { ...form },

        personal: {
          titlePrefix: form.titlePrefix,
          relationType: form.relationType,
          relationName: form.relationName,
        },

        visa: isVisa
          ? {
              country: form.visaCountry,
              currency: form.visaCurrency,
              rate: visaRate,
              rate_base: "INR",
              note:
                "Foreign currency equivalents are computed at prevailing exchange rates and are indicative.",
            }
          : null,
      },
    },
  };
}

function universalCertToForm(cert) {
  const savedForm = cert?.data?.extras?.form;
  if (savedForm && typeof savedForm === "object") {
    const merged = { ...defaultForm(), ...savedForm };
    merged.scheduleARows = normalizeRows(merged.scheduleARows);
    merged.scheduleBRows = normalizeRows(merged.scheduleBRows);
    merged.scheduleCRows = normalizeRows(merged.scheduleCRows);
    return merged;
  }

  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const extraPersonal = cert?.data?.extras?.personal || {};
  const tables = cert?.data?.tables || {};

  const fromTable = (tkey) => {
    const t = tables?.[tkey];
    const rows = Array.isArray(t?.rows) ? t.rows : [];
    const mapped = rows.map((r) => ({
      particulars: (r?.[1] ?? "").toString(),
      amount: (r?.[2] ?? "").toString(),
    }));
    return normalizeRows(mapped);
  };

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
    asOnDate: meta.as_on_date || "",
    titlePrefix: extraPersonal.titlePrefix || "Mr.",
    relationType: extraPersonal.relationType || "S/o",
    relationName: extraPersonal.relationName || "",
    caFirm: ca.firm || "",
    frn: ca.frn || "",
    caName: ca.name || "",
    membershipNo: ca.membership_no || "",
    udin: ca.udin || "",
    scheduleARows: fromTable("scheduleA"),
    scheduleBRows: fromTable("scheduleB"),
    scheduleCRows: fromTable("scheduleC"),
  };
}

/** ---------- Preview pieces ---------- */
function ScheduleTable({
  title,
  rows,
  isVisa,
  fxRates,
  currency,
}) {
  const safe = normalizeRows(rows);

  const convert = (amt) => {
    const n = Number(amt);
    if (!n || !currency || !fxRates?.[currency]) return "";
    return (n * fxRates[currency]).toFixed(2);
  };


  return (
    <div>
      <div className="certificate-title">{title}</div>

      <table className="certificate-table">
        <thead>
          <tr>
            <th style={{ width: "10%" }}>SR. NO.</th>
            <th>PARTICULARS</th>
            <th style={{ width: "25%" }}>AMOUNT (₹)</th>

            {isVisa && (
              <th style={{ width: "25%" }}>
                AMOUNT ({currency})
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {safe.map((r, idx) => (
            <tr key={idx}>
              <td className="text-center">{idx + 1}</td>
              <td>{r.particulars || "__________"}</td>
              <td className="text-right">{r.amount || "__________"}</td>

              {isVisa && (
                <td className="text-right">
                  {r.amount ? convert(r.amount) : "__________"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Page-1 preview ONLY (no schedules below).
 * (We keep it separate so pager can show only main page.)
 */
function NetWorthMainPage({
  entityType,
  form,
  isVisa,
  fxRates,
  currency,
}) {

  const isPersonal = entityType === "PERSONAL";

  const displayName = isPersonal
    ? (form.personName || "__________________")
    : (form.companyName || "__________________");

  const aTotal = sumRows(form.scheduleARows);
  const bTotal = sumRows(form.scheduleBRows);
  const cTotal = sumRows(form.scheduleCRows);
  const netWorth = aTotal + bTotal - cTotal;

  const asOn = (form.asOnDate || "").trim() || "__________";
  const purpose = (form.purpose || "").trim() || "______________";
  const convertTotal = (amt) => {
    const n = Number(amt);
    if (!n || !currency || !fxRates?.[currency]) return "";

    // INR → TARGET (direct)
    return (n * fxRates[currency]).toFixed(2);
  };

  const personalLine =
    `${form.titlePrefix || "Mr./Ms."} ${displayName}, ` +
    `${form.relationType || "S/o"} ${form.relationName || "__________"}, ` +
    `PAN ${form.pan || "__________"}, residing at ${form.address || "__________"}`;

  const identityLine = [
    displayName,
    !isBlank(form.pan) ? `PAN: ${form.pan}` : "",
    !isBlank(form.cin) ? `CIN: ${form.cin}` : "",
    !isBlank(form.gstin) ? `GSTIN: ${form.gstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="certificate-wrapper compact-page">
      <div className="certificate-container">
        <div className="certificate-title">NET WORTH CERTIFICATE</div>

        <div className="text-center mb-2">
          <p className="certificate-subtitle">TO WHOM IT MAY CONCERN</p>
        </div>

        <div className="certificate-body">
          {isPersonal ? (
            <p className="leading-6">
              This is to certify that, based on the documents, records, and information produced before us for
              verification, we have computed the <b>net worth</b> of <b>{personalLine}</b> as on <b>{asOn}</b>, as under.
            </p>
          ) : (
            <>
              <p className="leading-6">
                This is to certify that, based on the documents, records, and audited financial statements produced
                before us for verification, in respect of the entity:
              </p>

              <div className="mt-3 rounded-xl border border-dashed p-3">
                <div className="font-bold">Identification</div>
                <div className="mt-2 text-sm">{identityLine || "__________"}</div>
                {!isBlank(form.address) && <div className="mt-1 text-sm">Address: {form.address}</div>}
                <div className="mt-2 text-sm">
                  <span className="font-bold">Constitution:</span> {entityLabel(entityType)}
                </div>
              </div>

              <p className="mt-3 leading-6">
                We have computed the <b>net worth</b> of the above entity as on <b>{asOn}</b>, as under.
              </p>
            </>
          )}

          {/* SUMMARY TABLE (3 columns) */}
          <div className="mt-3 overflow-x-auto">
            <table className="certificate-table compact">
              <thead>
                <tr>
                  <th className="text-center" style={{ width: "10%" }}>SR. NO.</th>
                  <th className="text-center">PARTICULARS</th>
                  <th className="text-center" style={{ width: "35%" }}>AMOUNT (₹)</th>
                  {isVisa && (
                    <th className="text-center" style={{ width: "35%" }}>
                      AMOUNT ({currency})
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-center">1</td>
                  <td>Schedule A – Movable / Current Assets</td>
                  <td className="text-right">{formatINR(aTotal)}</td>
                  {isVisa && (
                    <td className="text-right">
                      {convertTotal(aTotal)}
                    </td>
                  )}

                </tr>
                <tr>
                  <td className="text-center">2</td>
                  <td>Schedule B – Immovable / Non-Current Assets</td>
                  <td className="text-right">{formatINR(bTotal)}</td>
                  {isVisa && (
                    <td className="text-right">
                      {convertTotal(bTotal)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td className="text-center">3</td>
                  <td>Schedule C – Liabilities</td>
                  <td className="text-right">{formatINR(cTotal)}</td>
                  {isVisa && (
                    <td className="text-right">
                      {convertTotal(cTotal)}
                    </td>
                  )}
                </tr>
                <tr>
                  <td />
                  <td className="font-bold">NET WORTH (A + B − C)</td>
                  <td className="text-right font-bold">{formatINR(netWorth)}</td>
                  {isVisa && (
                    <td className="text-right">
                      {convertTotal(netWorth)}
                    </td>
                  )}

                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 leading-6">
            This certificate is issued at the specific request of the assessee/entity for the purpose of{" "}
            <strong>{purpose}</strong> only.
          </p>
        </div>

        <div className="mt-3 certificate-signature font-bold">
          <div className="signature-left">
            <p>
              <strong>Place:</strong> {form.place || "__________"}
            </p>
            <p>
              <strong>Date:</strong> {form.date || "__________"}
            </p>
          </div>

          <div className="signature-right">
            <p>For {form.caFirm || "__________ & Co."}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {form.frn || "__________"}</p>
            <p className="mt-8">({form.caName || "__________"})</p>
            <p>Partner</p>
            <p>M.No. {form.membershipNo || "__________"}</p>
            <p>UDIN: {form.udin || "_________________________"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleOnlyPage({
  title,
  rows,
  isVisa,
  fxRates,
  currency,
}) {
  return (
    <div className="certificate-wrapper">
      <div className="certificate-container">
        <ScheduleTable
          title={title}
          rows={rows}
          isVisa={isVisa}
          fxRates={fxRates}
          currency={currency}
        />
      </div>
    </div>
  );
}

/** ✅ PAGER: Preview ONE page at a time (Prev/Next) */
function NetWorthPreviewPager({ entityType, form, fxRates }) {
  const pages = useMemo(
    () => [
      { key: "p1", label: "Page 1", type: "MAIN" },
      { key: "a", label: "Schedule A", type: "A" },
      { key: "b", label: "Schedule B", type: "B" },
      { key: "c", label: "Schedule C", type: "C" },
    ],
    []
  );

  const [pageIndex, setPageIndex] = useState(0);

  // If entityType changes, keep current page (optional)
  // If you prefer reset to Page 1, uncomment next line:
  // useEffect(() => setPageIndex(0), [entityType]);

  const current = pages[pageIndex];
  const canPrev = pageIndex > 0;
  const canNext = pageIndex < pages.length - 1;

  const goPrev = () => canPrev && setPageIndex((p) => p - 1);
  const goNext = () => canNext && setPageIndex((p) => p + 1);

  // keyboard support (optional)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPrev, canNext]);

  return (
    <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3 bg-muted/20">
        <div className="font-semibold">
          {current.label}{" "}
          <span className="text-sm text-muted-foreground">
            ({pageIndex + 1}/{pages.length})
          </span>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={goPrev} disabled={!canPrev}>
            Prev
          </Button>
          <Button type="button" variant="outline" onClick={goNext} disabled={!canNext}>
            Next
          </Button>
        </div>
      </div>

      {/* Page area */}
      <div className="preview-stage">
        <div className="preview-canvas">
          <div className="preview-scale">
            {current.type === "MAIN" ? (
              <NetWorthMainPage
                entityType={entityType}
                form={form}
                isVisa={/visa/i.test(form.purpose)}
                fxRates={fxRates}
                currency={form.visaCurrency}
              />
            ) : current.type === "A" ? (
              <ScheduleOnlyPage
                title="Movable / Current Assets (Schedule A)"
                rows={form.scheduleARows}
                isVisa={/visa/i.test(form.purpose)}
                fxRates={fxRates}
                currency={form.visaCurrency}
              />
            ) : current.type === "B" ? (
              <ScheduleOnlyPage
                title="Immovable / Non-Current Assets (Schedule B)"
                rows={form.scheduleBRows}
                isVisa={/visa/i.test(form.purpose)}
                fxRates={fxRates}
                currency={form.visaCurrency}
              />
            ) : (
              <ScheduleOnlyPage
                title="Liabilities (Schedule C)"
                rows={form.scheduleCRows}
                isVisa={/visa/i.test(form.purpose)}
                fxRates={fxRates}
                currency={form.visaCurrency}
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

/** ---------- Main Page ---------- */
export default function NetWorthForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("PERSONAL");
  const [form, setForm] = useState(defaultForm());
  const [draftReady, setDraftReady] = useState(false);
  const isVisa = isVisaPurpose(form.purpose);
  const [fxRates, setFxRates] = useState({});
  useEffect(() => {
    if (!isVisa) {
      setFxRates({});
      return;
    }

    fetch("https://open.er-api.com/v6/latest/INR")
      .then((r) => r.json())
      .then((d) => {
        if (d?.result !== "success" || !d?.rates) {
          setFxRates({});
        } else {
          setFxRates(d.rates);
        }
      })
      .catch(() => setFxRates({}));
  }, [isVisa]);

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const applyClient = (client) => {
    const nextEntityType = client?.entity_type || entityType;
    setEntityType(nextEntityType);
    setForm((prev) => ({
      ...prev,
      personName:
        nextEntityType === "PERSONAL"
          ? client?.person_name || client?.display_name || ""
          : "",
      companyName:
        nextEntityType === "PERSONAL"
          ? ""
          : client?.company_name || client?.display_name || "",
      pan: client?.pan || "",
      cin: client?.cin || "",
      gstin: client?.gstin || "",
      address: client?.address || "",
    }));
  };

  // row helpers
  const updateRow = async (key, idx, field, value) => {
    setForm((p) => {
      const arr = normalizeRows(p[key]);
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...p, [key]: arr };
    });

    if (field === "country") {
      const currency = await fetchCurrencyByCountry(value);
      setForm((p) => {
        const arr = normalizeRows(p[key]);
        arr[idx].currency = currency || "";
        return { ...p, [key]: arr };
      });
    }
  };

  const addRow = (key) => {
    setForm((p) => {
      const arr = normalizeRows(p[key]);
      return { ...p, [key]: [...arr, { particulars: "", amount: "" }] };
    });
  };

  const removeRow = (key, idx) => {
    setForm((p) => {
      const arr = normalizeRows(p[key]);
      const next = arr.filter((_, i) => i !== idx);
      return { ...p, [key]: next.length ? next : [{ particulars: "", amount: "" }] };
    });
  };

  const [caSettings, setCaSettings] = useState(null);

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(NETWORTH_DRAFT_KEY);
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
      NETWORTH_DRAFT_KEY,
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

  /** Edit mode: load certificate */
  useEffect(() => {
    if (!isEdit) return;

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/certificates/${id}`);
        const cert = res.data;

        const cat = (cert?.category || "").toUpperCase();
        if (cat !== "NET_WORTH") {
          toast.error("This certificate is not a Net Worth certificate.");
          navigate(-1);
          return;
        }

        setEntityType(cert?.entityType || "PERSONAL");
        setForm(universalCertToForm(cert));
      } catch (e) {
        console.error(e);
        toast.error("Failed to load certificate for editing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, id, navigate]);

  const validate = () => {
    if (entityType === "PERSONAL") {
      if (!form.personName.trim()) return "Individual Name is required.";
      if (!form.relationName.trim()) return "Father/Husband name is required.";
      if (!form.pan.trim()) return "PAN is required for personal net worth.";
    } else {
      if (!form.companyName.trim()) return "Company/Entity Name is required.";
      if (!form.pan.trim()) return "PAN is required.";
    }

    if (!form.asOnDate.trim()) return "As on date is required.";
    if (!form.purpose.trim()) return "Purpose is required.";
    if (!form.place.trim()) return "Place is required.";
    if (!form.date.trim()) return "Date is required.";

    if (!form.caFirm.trim()) return "Firm Name is required.";
    if (!form.frn.trim()) return "FRN is required.";
    if (!form.caName.trim()) return "CA Name is required.";
    if (!form.membershipNo.trim()) return "Membership No is required.";

    const checkRows = (rows, label) => {
      for (let i = 0; i < rows.length; i++) {
        const amt = (rows[i]?.amount || "").trim();
        if (amt && toNumberSafe(amt) === null) return `${label}: Row ${i + 1} Amount must be a number`;
      }
      return null;
    };

    const aErr = checkRows(normalizeRows(form.scheduleARows), "Schedule A");
    if (aErr) return aErr;
    const bErr = checkRows(normalizeRows(form.scheduleBRows), "Schedule B");
    if (bErr) return bErr;
    const cErr = checkRows(normalizeRows(form.scheduleCRows), "Schedule C");
    if (cErr) return cErr;

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);

    setLoading(true);
    try {
      const payload = buildUniversalPayload({entityType, form, isVisa, fxRates });

      if (isEdit) {
        await api.put(`/api/certificates/${id}`, payload);
        clearDraft(NETWORTH_DRAFT_KEY);
        toast.success("Net Worth Certificate updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(NETWORTH_DRAFT_KEY);
        toast.success("Net Worth Certificate created successfully!");
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

  const isPersonal = entityType === "PERSONAL";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="w-[90%] max-w-none mx-auto px-4 sm:px-6 lg:px-8">
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
            <Button form="networth-form" type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[55%_45%]">
          {/* FORM */}
          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isEdit ? "Edit Net Worth Certificate" : "Net Worth Certificate"}
            </h1>
            <p className="text-muted-foreground mb-8">
              {isEdit ? "Update and save on the same certificate ID." : "Fill details and generate certificate."}
            </p>

            <form id="networth-form" onSubmit={handleSubmit} className="space-y-8">
              {/* Entity */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Entity / Person Information
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

                {isPersonal ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <Label>Individual Name *</Label>
                      <Input className="mt-2" value={form.personName} onChange={(e) => update("personName", e.target.value)} />
                    </div>

                    <div>
                      <Label>Title *</Label>
                      <select
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={form.titlePrefix}
                        onChange={(e) => update("titlePrefix", e.target.value)}
                      >
                        <option value="Mr.">Mr.</option>
                        <option value="Ms.">Ms.</option>
                      </select>
                    </div>

                    <div>
                      <Label>Relationship *</Label>
                      <select
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={form.relationType}
                        onChange={(e) => update("relationType", e.target.value)}
                      >
                        <option value="S/o">S/o</option>
                        <option value="W/o">W/o</option>
                        <option value="D/o">D/o</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <Label>Father/Husband Name *</Label>
                      <Input className="mt-2" value={form.relationName} onChange={(e) => update("relationName", e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <Label>Entity / Company Name *</Label>
                    <Input className="mt-2" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
                  </div>
                )}

                {/* Common IDs */}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>PAN *</Label>
                    <Input className="mt-2" value={form.pan} onChange={(e) => update("pan", e.target.value)} />
                  </div>
                  <div>
                    <Label>GSTIN (Optional)</Label>
                    <Input className="mt-2" value={form.gstin} onChange={(e) => update("gstin", e.target.value)} />
                  </div>
                  <div>
                    <Label>CIN (If applicable)</Label>
                    <Input className="mt-2" value={form.cin} onChange={(e) => update("cin", e.target.value)} />
                  </div>
                  <div>
                    <Label>As on Date *</Label>
                    <Input className="mt-2" value={form.asOnDate} onChange={(e) => update("asOnDate", e.target.value)} placeholder="DD/MM/YYYY" />
                  </div>

                  <div className="md:col-span-2">
                    <Label>Address</Label>
                    <Textarea className="mt-2" rows={3} value={form.address} onChange={(e) => update("address", e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Summary (auto-calculated) */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Net Worth Summary (Auto from Schedules)
                </h2>

                <div className="grid md:grid-cols-3 gap-6">
                  <div>
                    <Label>Schedule A Total (₹)</Label>
                    <Input className="mt-2 text-right" value={formatINR(sumRows(form.scheduleARows))} readOnly />
                  </div>
                  <div>
                    <Label>Schedule B Total (₹)</Label>
                    <Input className="mt-2 text-right" value={formatINR(sumRows(form.scheduleBRows))} readOnly />
                  </div>
                  <div>
                    <Label>Schedule C Total (₹)</Label>
                    <Input className="mt-2 text-right" value={formatINR(sumRows(form.scheduleCRows))} readOnly />
                  </div>
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
                    placeholder="e.g., Bank finance / Visa purpose / Education loan"
                  />
                </div>
                {isVisa && (
                  <div>
                    <Label>Country (For Visa)</Label>
                    <CountrySelect
                      value={form.visaCountry}
                      onSelect={async (c) => {
                        const cur = await fetchCurrencyByCountry(c);
                        update("visaCountry", c);
                        update("visaCurrency", cur || "");
                      }}
                    />
                  </div>
                )}


                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Place *</Label>
                    <Input className="mt-2" value={form.place} onChange={(e) => update("place", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input className="mt-2 w-[20ch]"    value={form.date} onChange={(e) => update("date", e.target.value)} placeholder="DD/MM/YYYY" />
                  </div>
                </div>
              </div>

              {/* CA */}
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
                        {!caSettings || (caSettings?.cas || []).length === 0 ? "No CA found in Settings" : "Select CA"}
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

              {/* Schedule A */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Movable / Current Assets (Schedule A)
                </h2>

                <div className="space-y-3">
                  {normalizeRows(form.scheduleARows).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_auto]">
                      <div>
                        <Label>Particulars *</Label>
                        <Input
                          className="mt-2"
                          value={row.particulars}
                          onChange={(e) => updateRow("scheduleARows", idx, "particulars", e.target.value)}
                          placeholder="e.g., Bank Balance - SBI"
                        />
                      </div>

                      <div>
                        <Label>Amount (₹) *</Label>
                        <Input
                          className="mt-2 text-right"
                          value={row.amount}
                          onChange={(e) => updateRow("scheduleARows", idx, "amount", e.target.value)}
                          placeholder="e.g., 2,50,000"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="icon" onClick={() => removeRow("scheduleARows", idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={() => addRow("scheduleARows")} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Row (Schedule A)
                  </Button>
                </div>
              </div>

              {/* Schedule B */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Immovable / Non-Current Assets (Schedule B)
                </h2>

                <div className="space-y-3">
                  {normalizeRows(form.scheduleBRows).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_auto]">
                      <div>
                        <Label>Particulars *</Label>
                        <Input
                          className="mt-2"
                          value={row.particulars}
                          onChange={(e) => updateRow("scheduleBRows", idx, "particulars", e.target.value)}
                          placeholder="e.g., Residential Flat - Patna"
                        />
                      </div>

                      <div>
                        <Label>Amount (₹) *</Label>
                        <Input
                          className="mt-2 text-right"
                          value={row.amount}
                          onChange={(e) => updateRow("scheduleBRows", idx, "amount", e.target.value)}
                          placeholder="e.g., 25,00,000"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="icon" onClick={() => removeRow("scheduleBRows", idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={() => addRow("scheduleBRows")} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Row (Schedule B)
                  </Button>
                </div>
              </div>

              {/* Schedule C */}
              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Liabilities (Schedule C)
                </h2>

                <div className="space-y-3">
                  {normalizeRows(form.scheduleCRows).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_auto]">
                      <div>
                        <Label>Particulars *</Label>
                        <Input
                          className="mt-2"
                          value={row.particulars}
                          onChange={(e) => updateRow("scheduleCRows", idx, "particulars", e.target.value)}
                          placeholder="e.g., Home Loan - HDFC"
                        />
                      </div>

                      <div>
                        <Label>Amount (₹) *</Label>
                        <Input
                          className="mt-2 text-right"
                          value={row.amount}
                          onChange={(e) => updateRow("scheduleCRows", idx, "amount", e.target.value)}
                          placeholder="e.g., 7,50,000"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="icon" onClick={() => removeRow("scheduleCRows", idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" onClick={() => addRow("scheduleCRows")} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Row (Schedule C)
                  </Button>
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

          {/* ✅ PREVIEW (Pager) */}
          <div className="lg:sticky lg:top-6 h-fit">
            <NetWorthPreviewPager entityType={entityType} form={form} fxRates={fxRates} />
          </div>
        </div>
      </div>
    </div>
  );
}

