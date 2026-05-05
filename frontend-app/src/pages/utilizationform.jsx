import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { getApiErrorMessage } from "../lib/apiError";
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
const UTILISATION_DRAFT_KEY = "draft:utilisation_form_v1";

/** ---------- Entity Types ---------- */
const ENTITY_TYPES = [
  { key: "COLLEGE", label: "College / Educational Institution" },
  { key: "TRUST", label: "Trust" },
  { key: "NGO", label: "NGO (Society/Trust/Section 8)" },
  { key: "SOCIETY", label: "Society" },
  { key: "GOVERNMENT", label: "Government / PSU / Statutory Authority" },
  { key: "LLP", label: "Limited Liability Partnership (LLP)" },
  { key: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { key: "PUBLIC_LIMITED", label: "Public Limited Company" },
];

const GRANT_TYPES = [
  { key: "PURPOSE_RESTRICTED", label: "Purpose Restricted" },
  { key: "GENERAL", label: "General" },
];

const BALANCE_TREATMENT = [
  { key: "CARRIED_FORWARD", label: "Carried Forward" },
  { key: "REFUNDABLE", label: "Refundable" },
  { key: "RETAINED", label: "Retained for Approved Purpose" },
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

/** ---------- Default form ---------- */
function defaultForm() {
  return {
    // Organization identity
    organizationName: "",
    natureOfOrg: "TRUST",
    registrationNo: "",
    pan: "",
    cin: "",
    gstin: "",
    address: "",

    // Grant/Fund details
    grantName: "",
    grantingAuthority: "",
    sanctionRefNo: "",
    sanctionDate: new Date().toLocaleDateString("en-IN"),
    grantType: "PURPOSE_RESTRICTED",
    amountSanctioned: "",

    // Payment details (multiple receipts)
    paymentRows: [{ date: "", mode: "", bankDetails: "", amount: "" }],

    // Period
    periodFrom: "",
    periodTo: "",

    // Utilization
    purposeRows: [{ purpose: "", amount: "" }],
    totalUtilised: "",
    closingBalance: "",
    balanceTreatment: "CARRIED_FORWARD",
    balanceTreatmentDate: new Date().toLocaleDateString("en-IN"),

    // Meta
    purpose: "",
    place: "",
    date: new Date().toLocaleDateString("en-IN"),

    // CA/Signatory
    caFirm: "",
    frn: "",
    caName: "",
    membershipNo: "",
    udin: "",
    signatoryDesignation: "Partner",

    observations: {
      cashBook: false,
      vouchers: false,
      guidelines: false,
      bankStatement: false,
      receipt: false,
      other: false,
      otherText: "",
    },
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
    return [{ purpose: "", amount: "" }];

  return rows.map((r) => ({
    purpose: (r?.purpose ?? "").toString(),
    amount: (r?.amount ?? "").toString(),
  }));
}

function normalizePaymentRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0)
    return [{ date: "", mode: "", bankDetails: "", amount: "" }];

  return rows.map((r) => ({
    date: (r?.date ?? "").toString(),
    mode: (r?.mode ?? "").toString(),
    bankDetails: (r?.bankDetails ?? "").toString(),
    amount: (r?.amount ?? "").toString(),
  }));
}

function entityLabel(entityType) {
  return ENTITY_TYPES.find((x) => x.key === entityType)?.label || entityType;
}

function balanceTreatmentLabel(type) {
  return BALANCE_TREATMENT.find((x) => x.key === type)?.label || type;
}

/** ---------- payload builders ---------- */
function buildUniversalPayload({ entityType, form }) {
  const totalUtilised =
    form.grantType === "PURPOSE_RESTRICTED"
      ? sumRows(form.purposeRows)
      : toNumberSafe(form.totalUtilised);
  const sanctioned = toNumberSafe(form.amountSanctioned) || 0;
  const totalReceived = sumRows(form.paymentRows);
  const closing = toNumberSafe(form.closingBalance) || 0;

  return {
    category: "UTILISATION",
    certificate_type: "utilisation_certificate",
    entityType,

    identity: {
      company_name: (form.organizationName || "").trim(),
      legal_type: entityLabel(form.natureOfOrg),
      reg_no: (form.registrationNo || "").trim(),
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
        paymentDetails: {
          title: "Payment/Receipt Details",
          columns: ["Date", "Mode of Receipt", "Bank/Transaction Details", "Amount (₹)"],
          rows: normalizePaymentRows(form.paymentRows).map((r) => [
            r.date,
            r.mode,
            r.bankDetails,
            r.amount,
          ]),
        },

        period: {
          columns: ["From Date", "To Date"],
          rows: [[form.periodFrom || "", form.periodTo || ""]],
        },

        purposeWise: {
          title: "Purpose-wise Utilisation",
          columns: ["Sr. No.", "Purpose / Activity", "Amount Utilised (₹)"],
          rows: normalizeRows(form.purposeRows).map((r, idx) => [
            String(idx + 1),
            r.purpose,
            r.amount,
          ]),
        },

        summary: {
          title: "Summary of Funds",
          columns: ["Particulars", "Amount (₹)"],
          rows: [
            ["Funds Received during the period", formatINR(totalReceived)],
            ["Funds Utilised", formatINR(totalUtilised)],
            ["Closing / Unutilised Balance", formatINR(closing)],
          ],
        },
      },

      extras: {
        form: { ...form },
        grantDetails: {
          grantName: form.grantName,
          grantingAuthority: form.grantingAuthority,
          sanctionRefNo: form.sanctionRefNo,
          sanctionDate: form.sanctionDate,
          amountSanctioned: sanctioned,
        },
        grantType: form.grantType,
        balanceTreatment: {
          type: form.balanceTreatment,
          amount: closing,
          date: form.balanceTreatmentDate,
          label: balanceTreatmentLabel(form.balanceTreatment),
        },
        period: {
          from: form.periodFrom,
          to: form.periodTo,
        },
        signatoryDesignation: form.signatoryDesignation,
      },
    },
  };
}

function amountToWords(num) {
  if (!num || isNaN(num)) return "";

  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen",
    "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];

  const b = [
    "", "", "Twenty", "Thirty", "Forty", "Fifty",
    "Sixty", "Seventy", "Eighty", "Ninety"
  ];

  const twoDigits = (n) => {
    if (n < 20) return a[n];
    return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
  };

  const threeDigits = (n) => {
    if (n < 100) return twoDigits(n);
    return (
      a[Math.floor(n / 100)] +
      " Hundred" +
      (n % 100 ? " " + twoDigits(n % 100) : "")
    );
  };

  let result = "";
  let crore = Math.floor(num / 10000000);
  let lakh = Math.floor((num / 100000) % 100);
  let thousand = Math.floor((num / 1000) % 100);
  let rest = num % 1000;

  if (crore) result += threeDigits(crore) + " Crore ";
  if (lakh) result += threeDigits(lakh) + " Lakh ";
  if (thousand) result += threeDigits(thousand) + " Thousand ";
  if (rest) result += threeDigits(rest);

  return result.trim();
}
function autoFormatDDMMYYYY(value) {
  // Remove everything except digits
  let v = value.replace(/\D/g, "");

  if (v.length > 8) v = v.slice(0, 8);

  if (v.length >= 5) {
    return `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`;
  }
  if (v.length >= 3) {
    return `${v.slice(0, 2)}-${v.slice(2)}`;
  }
  return v;
}

function universalCertToForm(cert) {
  const savedForm = cert?.data?.extras?.form;
  if (savedForm && typeof savedForm === "object") {
    const merged = { ...defaultForm(), ...savedForm };
    merged.purposeRows = normalizeRows(merged.purposeRows);
    merged.paymentRows = normalizePaymentRows(merged.paymentRows);
    return merged;
  }

  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const extras = cert?.data?.extras || {};
  const tables = cert?.data?.tables || {};

  const fromPurposeTable = () => {
    const t = tables?.purposeWise;
    const rows = Array.isArray(t?.rows) ? t.rows : [];
    const mapped = rows.map((r) => ({
      purpose: (r?.[1] ?? "").toString(),
      amount: (r?.[2] ?? "").toString(),
    }));
    return normalizeRows(mapped);
  };

  const fromPaymentTable = () => {
    const t = tables?.paymentDetails;
    const rows = Array.isArray(t?.rows) ? t.rows : [];
    const mapped = rows.map((r) => ({
      date: (r?.[0] ?? "").toString(),
      mode: (r?.[1] ?? "").toString(),
      bankDetails: (r?.[2] ?? "").toString(),
      amount: (r?.[3] ?? "").toString(),
    }));
    return normalizePaymentRows(mapped);
  };

  const grantDetails = extras.grantDetails || {};

  return {
    ...defaultForm(),
    organizationName: identity.company_name || "",
    natureOfOrg: cert?.entityType || "TRUST",
    registrationNo: identity.reg_no || "",
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
    purposeRows: fromPurposeTable(),
    paymentRows: fromPaymentTable(),
    grantName: grantDetails.grantName || "",
    grantingAuthority: grantDetails.grantingAuthority || "",
    sanctionRefNo: grantDetails.sanctionRefNo || "",
    sanctionDate: grantDetails.sanctionDate || "",
    amountSanctioned: grantDetails.amountSanctioned || "",
    grantType: extras.grantType || "PURPOSE_RESTRICTED",
    balanceTreatment: extras.balanceTreatment?.type || "CARRIED_FORWARD",
    balanceTreatmentDate: extras.balanceTreatment?.date || "",
    periodFrom: extras.period?.from || "",
    periodTo: extras.period?.to || "",
    signatoryDesignation: extras.signatoryDesignation || "Partner",
  };
}

/** ---------- Preview Component ---------- */
function UtilizationPreview({ entityType, form }) {
  // 1. DETERMINE ENTITY TYPE
  const isCollege = entityType === "COLLEGE";

  // 2. SHARED CALCULATIONS (Used by both layouts)
  const totalUtilised =
    form.grantType === "PURPOSE_RESTRICTED"
      ? sumRows(form.purposeRows)
      : toNumberSafe(form.totalUtilised) || 0;

  const totalReceived = sumRows(form.paymentRows);
  const sanctioned = toNumberSafe(form.amountSanctioned) || 0;
  const closing = toNumberSafe(form.closingBalance) || 0;

  // 3. SHARED OBSERVATIONS LOGIC (Safe with optional chaining)
  const observationList = [];
  if (form.observations?.cashBook) observationList.push("Cash Book");
  if (form.observations?.vouchers) observationList.push("Vouchers Checking");
  if (form.observations?.guidelines) observationList.push("Guidelines issued by the Funding Agency");
  if (form.observations?.bankStatement) observationList.push("Bank Statement");
  if (form.observations?.receipt) observationList.push("Receipt");
  if (form.observations?.other && form.observations.otherText?.trim()) {
    observationList.push(form.observations.otherText.trim());
  }

  // Create a comma-separated string for text flows
  const observationText =
    observationList.length > 0
      ? observationList.join(", ")
      : "relevant books of accounts and records";

  if (isCollege) {
    return (
      <div className="certificate-wrapper">

        {/* ===================== PAGE 1 ===================== */}
        <div className="certificate-container">

          {/* ---------- HEADER ---------- */}
          <div className="text-center mb-4">
            <div className="certificate-title text-lg font-bold">
              {form.organizationName || "__________"}
            </div>

            <div className="text-sm">
              {form.address || "__________"}
            </div>

            {form.cin && (
              <div className="text-sm font-semibold mt-1">
                College Code : {form.cin}
              </div>
            )}

            <div className="certificate-title mt-4">
              UTILISATION CERTIFICATE
            </div>
          </div>

          {/* ---------- BODY ---------- */}
          <div className="certificate-body text-sm leading-7">

            {/* INTRO PARAGRAPH */}
            <p>
              This is to certify that an amount of{" "}
              <strong>₹ {formatINR(sanctioned)}</strong>{" "}
              (Rupees <b>{amountToWords(sanctioned)}</b> Only) was duly sanctioned and
              released in favour of{" "}
              <strong>{form.organizationName}</strong> by{" "}
              <strong>{form.grantingAuthority || "__________"}</strong>
              {form.sanctionRefNo && (
                <> vide sanction letter bearing reference no. <strong>{form.sanctionRefNo}</strong></>
              )}
              {form.sanctionDate && (
                <> dated <strong>{form.sanctionDate}</strong></>
              )}, for the period from{" "}
              <strong>{form.periodFrom}</strong> to{" "}
              <strong>{form.periodTo}</strong>, towards{" "}
              <strong>{form.purpose || "__________"}</strong>.
            </p>

            {/* PAYMENT TABLE */}
            <div className="certificate-section">
              <div className="font-bold mt-2 mb-2">
                PAYMENT / RECEIPT DETAILS
              </div>

              <table className="certificate-table compact">
                <thead>
                  <tr>
                    <th style={{ width: "12%" }}>Date</th>
                    <th style={{ width: "15%" }}>Mode</th>
                    <th style={{ width: "48%" }}>Bank / Transaction Details</th>
                    <th style={{ width: "25%" }} className="text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {normalizePaymentRows(form.paymentRows).map((r, idx) => (
                    <tr key={idx}>
                      <td className="text-center text-xs">{r.date || "__________"}</td>
                      <td className="text-xs">{r.mode || "__________"}</td>
                      <td className="text-xs">{r.bankDetails || "__________"}</td>
                      <td className="text-right">{r.amount || "__________"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="text-right font-bold">
                      Total Amount Received
                    </td>
                    <td className="text-right font-bold">
                      {formatINR(totalReceived)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* UTILISATION + BALANCE */}
            <p className="mt-4">
              The grant amount received through authorised banking channels has been
              duly accounted for and utilised for{" "}
              <strong>{form.purpose || "__________"}</strong>. The utilisation of the
              grant amounting to{" "}
              <strong>₹ {formatINR(totalUtilised)}</strong> has been verified by us
              with reference to the books of accounts, vouchers and other supporting
              records produced before us.
              {closing > 0 && (
                <>
                  {" "}The unutilised balance of{" "}
                  <strong>₹ {formatINR(closing)}</strong> as on{" "}
                  <strong>{form.balanceTreatmentDate}</strong> has been{" "}
                  <strong>
                    {balanceTreatmentLabel(form.balanceTreatment).toLowerCase()}
                  </strong>.
                </>
              )}
            </p>

            {/* COMPLIANCE */}
            <p className="mt-2">
              We further certify that the conditions subject to which the
              grant-in-aid was sanctioned have been duly complied with and adequate
              checks were exercised to ensure that the funds were utilised strictly
              for the sanctioned purpose.
            </p>

            {/* CHECKS */}
            <div className="mt-2">
              <strong>Checks and Verifications Undertaken:</strong>
              <div> {observationText}</div>
            </div>
          </div>

          {/* ---------- SIGNATURE (PAGE 1) ---------- */}
          <div className="certificate-signature mt-8 flex justify-between text-sm">
            <div>
              <p><strong>Place:</strong> {form.place || "__________"}</p>
              <p><strong>Date:</strong> {form.date || "__________"}</p>
            </div>

            <div className="text-right">
              <p>For {form.caFirm || "__________"}</p>
              <p>Chartered Accountants</p>
              <p>FRN: {form.frn || "__________"}</p>
              <p className="mt-8">{form.caName || "__________"}</p>
              <p>{form.signatoryDesignation || "Partner"}</p>
              {form.membershipNo && <p>M. No. {form.membershipNo}</p>}
              {form.udin && <p>UDIN: {form.udin}</p>}
            </div>
          </div>
        </div>

        {/* ===================== PAGE 2 ===================== */}
        <div className="certificate-container page-break">

          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="certificate-title text-lg font-bold">
              {form.organizationName || "__________"}
            </div>

            <div className="text-sm">
              {form.address || "__________"}
            </div>

            {form.cin && (
              <div className="text-sm font-semibold mt-1">
                College Code : {form.cin}
              </div>
            )}

            <div className="certificate-title mt-4">
              UTILISATION CERTIFICATE
            </div>
          </div>

          {/* SUMMARY */}
          <div className="certificate-body text-sm leading-7">
            <p>
              This is to certify that the grant amount of{" "}
              <strong>
                ₹ {formatINR(sanctioned)} (Rupees {amountToWords(sanctioned)} Only)
              </strong>{" "}
              sanctioned and released to <strong>{form.organizationName}</strong> by{" "}
              <strong>{form.grantingAuthority || "__________"}</strong>
              {form.sanctionRefNo && (
                <> vide sanction letter bearing reference no. <strong>{form.sanctionRefNo}</strong></>
              )}
              {form.sanctionDate && (
                <> dated <strong>{form.sanctionDate}</strong></>
              )}, for the period from{" "}
              <strong>{form.periodFrom}</strong> to{" "}
              <strong>{form.periodTo}</strong>, has been fully and properly utilised
              for <strong>{form.purpose || "__________"}</strong>, being the purpose
              for which the grant was sanctioned, as verified from{" "}
              <strong> {observationText}</strong> and other relevant records produced
              before us.
            </p>
          </div>

          {/* PAGE 2 SIGNATURES */}
          <div className="mt-24 flex justify-between text-sm text-center">
            <div className="font-semibold">Secretary / Principal</div>
            <div className="font-semibold">Senior Teacher</div>
            <div className="font-semibold">Chartered Accountant</div>
          </div>
        </div>
      </div>
    );
  }


  // Specific Logic for Generic View
  const isPurposeRestricted = form.grantType === "PURPOSE_RESTRICTED";
  const identityLine = [
    form.organizationName || "__________",
    !isBlank(form.pan) ? `PAN: ${form.pan}` : "",
    !isBlank(form.cin) ? `CIN: ${form.cin}` : "",
    !isBlank(form.gstin) ? `GSTIN: ${form.gstin}` : "",
    !isBlank(form.registrationNo) ? `Reg. No: ${form.registrationNo}` : "",
  ].filter(Boolean).join(" | ");

  return (
    <div className="certificate-wrapper">
      <div className="certificate-container">
        <div className="certificate-title">CERTIFICATE OF UTILISATION OF FUNDS / GRANT</div>

        <div className="certificate-body">
          <p className="leading-6 mt-4 mb-4">
            This is to certify that, based on verification of the following documents:
            <strong> {observationText}</strong>, in respect of the entity:
          </p>

          <div className="mt-3 rounded-xl border border-dashed p-3 mb-4">
            <div className="font-bold">Organisation Identification</div>
            <div className="mt-2 text-sm">{identityLine}</div>
            {!isBlank(form.address) && (
              <div className="mt-1 text-sm">Address: {form.address}</div>
            )}
            <div className="mt-2 text-sm">
              <span className="font-bold">Constitution:</span>{" "}
              {entityLabel(form.natureOfOrg)}
            </div>
          </div>

          {/* GRANT DETAILS SECTION */}
          <div className="certificate-section">
            <div className="font-bold mb-2">GRANT / FUND DETAILS</div>
            <p className="leading-6">
              The above entity has received{" "}
              {!isBlank(form.grantName) && (
                <>grant/fund <b>{form.grantName}</b></>
              )}{" "}
              from <b>{form.grantingAuthority || "__________"}</b>
              {!isBlank(form.sanctionRefNo) && (
                <>, vide sanction/approval reference <b>{form.sanctionRefNo}</b></>
              )}
              {!isBlank(form.sanctionDate) && (
                <> dated <b>{form.sanctionDate}</b></>
              )}
              , for a sanctioned amount of <b>₹ {formatINR(sanctioned)}</b>, during
              the period from <b>{form.periodFrom || "__________"}</b> to{" "}
              <b>{form.periodTo || "__________"}</b>.
            </p>
          </div>

          {/* TABLE: RECEIPTS */}
          <div className="certificate-section">
            <div className="font-bold mb-2">PAYMENT / RECEIPT DETAILS</div>
            <table className="certificate-table compact">
              <thead>
                <tr>
                  <th style={{ width: "12%" }}>Date</th>
                  <th style={{ width: "15%" }}>Mode</th>
                  <th style={{ width: "48%" }}>Bank / Transaction Details</th>
                  <th style={{ width: "25%" }} className="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {normalizePaymentRows(form.paymentRows).map((r, idx) => (
                  <tr key={idx}>
                    <td className="text-center text-xs">{r.date || "__________"}</td>
                    <td className="text-xs">{r.mode || "__________"}</td>
                    <td className="text-xs">{r.bankDetails || "__________"}</td>
                    <td className="text-right">{r.amount || "__________"}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={3} className="text-right font-bold">Total Amount Received</td>
                  <td className="text-right font-bold">{formatINR(totalReceived)}</td>
                </tr>
              </tbody>
            </table>
            {Math.abs(totalReceived - sanctioned) > 0.01 && (
              <p className="text-xs text-red-600 mt-2">
                ⚠️ Note: Total received (₹ {formatINR(totalReceived)}) does not match sanctioned amount (₹ {formatINR(sanctioned)})
              </p>
            )}
          </div>

          {/* TABLE: UTILIZATION */}
          <div className="certificate-section">
            <div className="font-bold mb-2">UTILISATION DETAILS</div>
            {isPurposeRestricted && normalizeRows(form.purposeRows).some((r) => r.purpose.trim() || r.amount.trim()) && (
              <>
                <div className="font-semibold mb-2 text-sm">A. Purpose-wise Utilisation</div>
                <table className="certificate-table compact">
                  <thead>
                    <tr>
                      <th style={{ width: "8%" }}>Sr. No.</th>
                      <th>Purpose / Activity</th>
                      <th style={{ width: "25%" }} className="text-right">Amount Utilised (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalizeRows(form.purposeRows)
                      .filter((r) => r.purpose.trim() || r.amount.trim())
                      .map((r, idx) => (
                        <tr key={idx}>
                          <td className="text-center">{idx + 1}</td>
                          <td className="text-xs">{r.purpose || "__________"}</td>
                          <td className="text-right">{r.amount || "__________"}</td>
                        </tr>
                      ))}
                    <tr>
                      <td colSpan={2} className="text-right font-bold">Total Utilised</td>
                      <td className="text-right font-bold">{formatINR(totalUtilised)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mb-3"></div>
              </>
            )}

            {/* SUMMARY TABLE */}
            <div className="font-semibold mb-2 text-sm">
              {isPurposeRestricted && normalizeRows(form.purposeRows).some((r) => r.purpose.trim() || r.amount.trim()) ? "B. " : ""}Summary of Funds
            </div>
            <table className="certificate-table compact">
              <thead>
                <tr>
                  <th style={{ width: "60%" }}>Particulars</th>
                  <th className="text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-xs">Funds Received during the period</td>
                  <td className="text-right">{formatINR(totalReceived)}</td>
                </tr>
                <tr>
                  <td className="text-xs">Funds Utilised</td>
                  <td className="text-right">{formatINR(totalUtilised)}</td>
                </tr>
                <tr>
                  <td className="font-bold text-xs">Closing / Unutilised Balance</td>
                  <td className="text-right font-bold">{formatINR(closing)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* DISCLAIMER / CLOSING TEXT */}
          <div className="certificate-section">
            <p className="leading-6">
              The total amount utilised during the period is{" "}
              <b>₹ {formatINR(totalUtilised)}</b>
              {closing > 0 && (
                <>
                  , leaving an unutilised balance of <b>₹ {formatINR(closing)}</b> as on{" "}
                  <b>{form.balanceTreatmentDate || "__________"}</b>, which is{" "}
                  <b>{balanceTreatmentLabel(form.balanceTreatment).toLowerCase()}</b>
                </>
              )}.
            </p>
          </div>
          <p className="mt-3 leading-6">
            This certificate is issued at the specific request of the organisation
            for the purpose of <strong>{form.purpose || "__________"}</strong> only.
          </p>
        </div>

        {/* GENERIC SIGNATURE */}
        <div className="mt-6 certificate-signature font-bold">
          <div className="signature-left">
            <p><strong>Place:</strong> {form.place || "__________"}</p>
            <p><strong>Date:</strong> {form.date || "__________"}</p>
            <div className="mt-4 text-sm font-normal">
              <p className="font-bold">Kinds of Checks Exercised:</p>
              <ol className="list-decimal ml-5 space-y-0.5">
                {observationList.length > 0 ? (
                  observationList.map((obs, i) => <li key={i}>{obs}</li>)
                ) : (
                  <>
                    <li>Cash Book</li>
                    <li>Vouchers Checking</li>
                    <li>Bank Statement</li>
                  </>
                )}
              </ol>
            </div>
          </div>

          <div className="signature-right">
            <p>For {form.caFirm || "__________"}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {form.frn || "__________"}</p>
            <p className="mt-8">{form.caName || "__________"}</p>
            <p>{form.signatoryDesignation || "Partner"}</p>
            {form.membershipNo && <p>M.No. {form.membershipNo}</p>}
            {form.udin && <p>UDIN: {form.udin}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ---------- Main Page ---------- */
export default function UtilizationForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("TRUST");
  const [form, setForm] = useState(defaultForm());
  const [draftReady, setDraftReady] = useState(false);

  const totalUtilised =
    form.grantType === "PURPOSE_RESTRICTED"
      ? sumRows(form.purposeRows)
      : toNumberSafe(form.totalUtilised) || 0;

  const update = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  const applyClient = (client) => {
    const nextEntityType = client?.entity_type || entityType;
    setEntityType(nextEntityType);
    setForm((prev) => ({
      ...prev,
      natureOfOrg: nextEntityType,
      organizationName: client?.company_name || client?.display_name || client?.person_name || "",
      pan: client?.pan || "",
      cin: client?.cin || "",
      gstin: client?.gstin || "",
      address: client?.address || "",
    }));
  };

  const updateRow = (key, idx, field, value) => {
    setForm((p) => {
      const arr = key === "paymentRows" ? normalizePaymentRows(p[key]) : normalizeRows(p[key]);
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...p, [key]: arr };
    });
  };

  const addRow = (key) => {
    setForm((p) => {
      if (key === "paymentRows") {
        const arr = normalizePaymentRows(p[key]);
        return { ...p, [key]: [...arr, { date: "", mode: "", bankDetails: "", amount: "" }] };
      } else {
        const arr = normalizeRows(p[key]);
        return { ...p, [key]: [...arr, { purpose: "", amount: "" }] };
      }
    });
  };

  const removeRow = (key, idx) => {
    setForm((p) => {
      if (key === "paymentRows") {
        const arr = normalizePaymentRows(p[key]);
        const next = arr.filter((_, i) => i !== idx);
        return { ...p, [key]: next.length ? next : [{ date: "", mode: "", bankDetails: "", amount: "" }] };
      } else {
        const arr = normalizeRows(p[key]);
        const next = arr.filter((_, i) => i !== idx);
        return { ...p, [key]: next.length ? next : [{ purpose: "", amount: "" }] };
      }
    });
  };

  const [caSettings, setCaSettings] = useState(null);

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(UTILISATION_DRAFT_KEY);
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
      UTILISATION_DRAFT_KEY,
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

  useEffect(() => {
    if (!isEdit) return;

    (async () => {
      try {
        setLoading(true);
        const res = await api.get(`/api/certificates/${id}`);
        const cert = res.data;

        const cat = (cert?.category || "").toUpperCase();
        if (cat !== "UTILISATION") {
          toast.error("This certificate is not a Utilisation certificate.");
          navigate(-1);
          return;
        }

        setEntityType(cert?.entityType || "TRUST");
        setForm(universalCertToForm(cert));
      } catch (e) {
        console.error(e);
        toast.error("Failed to load certificate for editing.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isEdit, id, navigate]);

  useEffect(() => {
    const received = sumRows(form.paymentRows);

    let utilised = 0;

    if (form.grantType === "PURPOSE_RESTRICTED") {
      utilised = sumRows(form.purposeRows);

      // keep totalUtilised in sync ONLY here
      if (String(form.totalUtilised) !== String(utilised)) {
        update("totalUtilised", String(utilised));
      }
    } else {
      utilised = toNumberSafe(form.totalUtilised) || 0;
    }

    const closing = received - utilised;

    if (String(form.closingBalance) !== String(closing)) {
      update("closingBalance", String(closing));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.paymentRows,
    form.purposeRows,
    form.totalUtilised,
    form.grantType,
  ]);

  const validate = () => {
    if (isBlank(form.organizationName)) return "Organisation Name is required.";
    if (isBlank(form.address)) return "Address is required.";

    const sanctioned = toNumberSafe(form.amountSanctioned);
    if (sanctioned === null || sanctioned <= 0) {
      return "Amount Sanctioned is required and must be a valid number.";
    }

    if (isBlank(form.purpose)) {
      return "Purpose of certificate is required.";
    }

    const payments = normalizePaymentRows(form.paymentRows);
    if (payments.length === 0 || !payments.some(p => !isBlank(p.amount))) {
      return "At least one payment receipt is required.";
    }

    for (let i = 0; i < payments.length; i++) {
      const p = payments[i];
      if (!isBlank(p.amount)) {
        if (isBlank(p.date)) return `Payment ${i + 1}: Date is required.`;
        if (isBlank(p.mode)) return `Payment ${i + 1}: Mode is required.`;
        if (toNumberSafe(p.amount) === null)
          return `Payment ${i + 1}: Amount must be a number.`;
      }
    }

    if (isBlank(form.periodFrom)) return "Period From date is required.";
    if (isBlank(form.periodTo)) return "Period To date is required.";
    if (isBlank(form.place)) return "Place is required.";
    if (isBlank(form.date)) return "Date is required.";
    if (isBlank(form.caName)) return "CA/Signatory Name is required.";

    if (form.grantType === "PURPOSE_RESTRICTED") {
      const rows = normalizeRows(form.purposeRows);
      for (let i = 0; i < rows.length; i++) {
        if (!isBlank(rows[i].amount) && toNumberSafe(rows[i].amount) === null) {
          return `Purpose Row ${i + 1}: Amount must be a number`;
        }
      }
    }

    return null;
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) return toast.error(err);

    setLoading(true);
    try {
      const payload = buildUniversalPayload({ entityType, form });

      if (isEdit) {
        await api.put(`/api/certificates/${id}`, payload);
        clearDraft(UTILISATION_DRAFT_KEY);
        toast.success("Utilisation Certificate updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(UTILISATION_DRAFT_KEY);
        toast.success("Utilisation Certificate created successfully!");
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

  const isUtilisedEditable = form.grantType === "GENERAL";
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8">
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
            <Button form="utilization-form" type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] xl:grid-cols-[1.3fr_0.7fr]">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 lg:p-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isEdit ? "Edit Utilisation Certificate" : "Utilisation Certificate"}
            </h1>
            <p className="text-muted-foreground mb-6">
              {isEdit ? "Update and save on the same certificate ID." : "Fill details and generate certificate."}
            </p>

            <form id="utilization-form" onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Organisation Details
                </h2>

                <div>
                  <Label>Nature of Organisation *</Label>
                  <select
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={entityType}
                    onChange={(e) => {
                      setEntityType(e.target.value);
                      update("natureOfOrg", e.target.value);
                    }}
                  >
                    {ENTITY_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <ClientSelector entityType={entityType} onSelect={applyClient} />

                <div>
                  <Label>Name of Organisation *</Label>
                  <Input className="mt-2" value={form.organizationName} onChange={(e) => update("organizationName", e.target.value)} />
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                  <div>
                    <Label>Registration No. (Optional)</Label>
                    <Input className="mt-2" value={form.registrationNo} onChange={(e) => update("registrationNo", e.target.value)} />
                  </div>
                  <div>
                    <Label>PAN (Optional)</Label>
                    <Input className="mt-2" value={form.pan} onChange={(e) => update("pan", e.target.value)} />
                  </div>
                  <div>
                    <Label>GSTIN (Optional)</Label>
                    <Input className="mt-2" value={form.gstin} onChange={(e) => update("gstin", e.target.value)} />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>
                      {form.natureOfOrg === "COLLEGE"
                        ? "College Code / Institution Code"
                        : "CIN (If applicable)"}
                    </Label>
                    <Input className="mt-2" value={form.cin} onChange={(e) => update("cin", e.target.value)} />
                  </div>
                  <div>
                    <Label>Address *</Label>
                    <Textarea className="mt-2" rows={2} value={form.address} onChange={(e) => update("address", e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Grant / Fund Details
                </h2>
                <div>
                  <Label>Name of Grant / Fund (Optional)</Label>
                  <Input className="mt-2" value={form.grantName} onChange={(e) => update("grantName", e.target.value)} placeholder="e.g., CSR Grant for Education" />
                </div>

                <div>
                  <Label>Granting Authority / Donor (Optional)</Label>
                  <Input className="mt-2" value={form.grantingAuthority} onChange={(e) => update("grantingAuthority", e.target.value)} placeholder="e.g., XYZ Foundation" />
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Sanction / Approval Reference No. (Optional)</Label>
                    <Input className="mt-2" value={form.sanctionRefNo} onChange={(e) => update("sanctionRefNo", e.target.value)} placeholder="e.g., CSR/2024/123" />
                  </div>
                  <div>
                    <Label>Sanction Date (Optional)</Label>
                    <Input placeholder="DD-MM-YYYY" className="mt-2" value={form.sanctionDate} onChange={(e) => update("sanctionDate", autoFormatDDMMYYYY(e.target.value))} />
                  </div>
                </div>

                <div>
                  <Label>Grant Type (Internal use - not shown in preview)</Label>
                  <select
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={form.grantType}
                    onChange={(e) => update("grantType", e.target.value)}
                  >
                    {GRANT_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    This determines if purpose-wise breakdown is required
                  </p>
                </div>

                <div>
                  <Label>Amount Sanctioned (₹) *</Label>
                  <Input className="mt-2 text-right" value={form.amountSanctioned} onChange={(e) => update("amountSanctioned", e.target.value)} placeholder="e.g., 10,00,000" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Should match total amount received below
                  </p>
                </div>

                <div className="pt-2">
                  <h3 className="text-base font-semibold mb-2">Period of Utilisation</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>From Date *</Label>
                      <Input className="mt-2" value={form.periodFrom} onChange={(e) => update("periodFrom", e.target.value)} placeholder="DD/MM/YYYY" />
                    </div>
                    <div>
                      <Label>To Date *</Label>
                      <Input className="mt-2" value={form.periodTo} onChange={(e) => update("periodTo", e.target.value)} placeholder="DD/MM/YYYY" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Certificate Purpose
                </h2>

                <div>
                  <Label>Purpose of Certificate *</Label>
                  <Textarea
                    className="mt-2"
                    rows={3}
                    value={form.purpose}
                    onChange={(e) => update("purpose", e.target.value)}
                    placeholder="e.g., Submission to funding authority / Audit / Compliance / Record purpose"
                  />
                </div>
              </div>


              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Payment / Receipt Details
                </h2>
                <p className="text-sm text-muted-foreground">
                  Add all payment receipts. Total should match Amount Sanctioned.
                </p>

                <div className="space-y-2">
                  {normalizePaymentRows(form.paymentRows).map((row, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-[110px_130px_1fr_110px_auto] border-b pb-2">
                      <div>
                        <Label className="text-xs">Date *</Label>
                        <Input
                          placeholder="DD-MM-YYYY"
                          maxLength={10}
                          className="mt-1 h-9"
                          value={row.date}
                          onChange={(e) =>
                            updateRow(
                              "paymentRows",
                              idx,
                              "date",
                              autoFormatDDMMYYYY(e.target.value)
                            )
                          }
                        />

                      </div>

                      <div>
                        <Label className="text-xs">Mode *</Label>
                        <Input
                          className="mt-1 h-9"
                          value={row.mode}
                          onChange={(e) => updateRow("paymentRows", idx, "mode", e.target.value)}
                          placeholder="NEFT/Cheque"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Bank / Transaction Details *</Label>
                        <Input
                          className="mt-1 h-9"
                          value={row.bankDetails}
                          onChange={(e) => updateRow("paymentRows", idx, "bankDetails", e.target.value)}
                          placeholder="SBI A/c 12345, UTR: ABC123"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Amount (₹) *</Label>
                        <Input
                          className="mt-1 h-9 text-right"
                          value={row.amount}
                          onChange={(e) => updateRow("paymentRows", idx, "amount", e.target.value)}
                          placeholder="5,00,000"
                        />
                      </div>

                      <div className="flex items-end">
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeRow("paymentRows", idx)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <Button type="button" variant="outline" size="sm" onClick={() => addRow("paymentRows")} className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Payment Receipt
                  </Button>

                  <div className="grid md:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg">
                    <div>
                      <Label className="text-xs font-semibold">Total Received</Label>
                      <div className="text-xl font-bold text-primary mt-1">
                        ₹ {formatINR(sumRows(form.paymentRows))}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-semibold">Amount Sanctioned</Label>
                      <div className="text-xl font-bold mt-1">
                        ₹ {formatINR(toNumberSafe(form.amountSanctioned) || 0)}
                      </div>
                    </div>
                  </div>

                  {Math.abs(sumRows(form.paymentRows) - (toNumberSafe(form.amountSanctioned) || 0)) > 0.01 && (
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
                      ⚠️ Warning: Total received does not match sanctioned amount
                    </p>
                  )}
                </div>
              </div>

              {form.grantType === "PURPOSE_RESTRICTED" && (
                <div className="space-y-3">
                  <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                    Purpose-wise Utilisation
                  </h2>

                  <div className="space-y-2">
                    {normalizeRows(form.purposeRows).map((row, idx) => (
                      <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_auto]">
                        <div>
                          <Label className="text-xs">Purpose / Activity *</Label>
                          <Input
                            className="mt-1 h-9"
                            value={row.purpose}
                            onChange={(e) => updateRow("purposeRows", idx, "purpose", e.target.value)}
                            placeholder="e.g., Education Materials"
                          />
                        </div>

                        <div>
                          <Label className="text-xs">Amount Utilised (₹) *</Label>
                          <Input
                            className="mt-1 h-9 text-right"
                            value={row.amount}
                            onChange={(e) => updateRow("purposeRows", idx, "amount", e.target.value)}
                            placeholder="2,50,000"
                          />
                        </div>

                        <div className="flex items-end">
                          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeRow("purposeRows", idx)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <Button type="button" variant="outline" size="sm" onClick={() => addRow("purposeRows")} className="w-full">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Purpose Row
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Summary of Funds
                </h2>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Total Utilised (₹)</Label>
                    <Input
                      className="mt-2 text-right"
                      value={isUtilisedEditable ? form.totalUtilised || "" : formatINR(totalUtilised || 0)}
                      readOnly={!isUtilisedEditable}
                      onChange={(e) => {
                        if (isUtilisedEditable) {
                          update("totalUtilised", e.target.value);
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      {isUtilisedEditable ? "Enter total amount utilised during the period" : "Auto-calculated from purpose-wise utilisation"}
                    </p>
                  </div>

                  <div>
                    <Label>Closing Balance (₹) (Auto)</Label>
                    <Input
                      className="mt-2 text-right"
                      value={formatINR(toNumberSafe(form.closingBalance))}
                      readOnly
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Auto-calculated: Funds Received - Funds Utilised
                    </p>
                  </div>
                </div>
              </div>

              {toNumberSafe(form.closingBalance) > 0 && (
                <div className="space-y-3">
                  <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                    Balance Treatment
                  </h2>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>Treatment Type *</Label>
                      <select
                        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                        value={form.balanceTreatment}
                        onChange={(e) => update("balanceTreatment", e.target.value)}
                      >
                        {BALANCE_TREATMENT.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>As on Date *</Label>
                      <Input className="mt-2" value={form.balanceTreatmentDate} onChange={(e) => update("balanceTreatmentDate", autoFormatDDMMYYYY(e.target.value))} placeholder="DD/MM/YYYY" />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Certificate Details
                </h2>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Place *</Label>
                    <Input className="mt-2" value={form.place} onChange={(e) => update("place", e.target.value)} />
                  </div>
                  <div>
                    <Label>Date *</Label>
                    <Input placeholder="DD-MM-YYYY" className="mt-2" value={form.date} onChange={(e) => update("date", autoFormatDDMMYYYY(e.target.value))} />
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-lg font-display font-semibold text-foreground border-b pb-2">
                  Signatory Details
                </h2>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>CA Name / Signatory *</Label>
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
                        {!caSettings || (caSettings?.cas || []).length === 0 ? "No CA found in Settings" : "Select CA/Signatory"}
                      </option>
                      {(caSettings?.cas || []).map((ca) => (
                        <option key={ca.id} value={ca.ca_name}>
                          {ca.ca_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label>Designation *</Label>
                    <Input className="mt-2" value={form.signatoryDesignation} onChange={(e) => update("signatoryDesignation", e.target.value)} placeholder="e.g., Partner / Secretary / Director" />
                  </div>

                  <div>
                    <Label>Membership Number (if CA)</Label>
                    <Input className="mt-2" value={form.membershipNo || ""} readOnly />
                  </div>

                  <div>
                    <Label>UDIN (Optional)</Label>
                    <Input className="mt-2" value={form.udin} onChange={(e) => update("udin", e.target.value)} />
                  </div>

                  <div>
                    <Label>Firm Name (if CA)</Label>
                    <Input className="mt-2" value={form.caFirm} onChange={(e) => update("caFirm", e.target.value)} />
                  </div>

                  <div>
                    <Label>FRN (if CA)</Label>
                    <Input className="mt-2" value={form.frn} onChange={(e) => update("frn", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold border-b pb-2">
                    OBSERVATION
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 text-sm">

                    <label className="flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.cashBook}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            cashBook: e.target.checked,
                          })
                        }
                      />
                      <span>Cash Book</span>
                    </label>

                    <label className="flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.vouchers}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            vouchers: e.target.checked,
                          })
                        }
                      />
                      <span>Vouchers Checking</span>
                    </label>

                    <label className="flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.guidelines}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            guidelines: e.target.checked,
                          })
                        }
                      />
                      <span>Guidelines issued by the Funding Agency</span>
                    </label>

                    <label className="flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.bankStatement}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            bankStatement: e.target.checked,
                          })
                        }
                      />
                      <span>Bank Statement</span>
                    </label>

                    <label className="flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.receipt}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            receipt: e.target.checked,
                          })
                        }
                      />
                      <span>Receipt</span>
                    </label>

                    <label className=" mb-3 flex items-start gap-2 leading-snug">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={form.observations.other}
                        onChange={(e) =>
                          update("observations", {
                            ...form.observations,
                            other: e.target.checked,
                          })
                        }
                      />
                      <span>Other</span>
                    </label>

                  </div>

                  {form.observations.other && (
                    <Input
                      className="mt-2"
                      placeholder="Specify other documents checked"
                      value={form.observations.otherText}
                      onChange={(e) =>
                        update("observations", {
                          ...form.observations,
                          otherText: e.target.value,
                        })
                      }
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t">
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

          <div className="lg:sticky lg:top-6 h-fit">
            <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/20">
                <div className="font-semibold text-sm">Certificate Preview</div>
              </div>

              <div className="preview-stage">
                <div className="preview-canvas">
                  <div className="preview-scale" style={{ transform: 'scale(0.99)' }}>
                    <UtilizationPreview entityType={entityType} form={form} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

