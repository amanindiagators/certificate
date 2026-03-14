import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import React from "react";
import { useAuth } from "../hooks/useAuth";

/** ---------- Helpers (universal) ---------- */
const ENTITY_LABELS = {
  PERSONAL: "Individual (Personal)",
  PROPRIETORSHIP: "Proprietorship Firm",
  PRIVATE_LIMITED: "Private Limited Company",
  PUBLIC_LIMITED: "Public Limited Company",
  TRUST: "Trust",
  NGO: "NGO (Society/Trust/Section 8)",
  SOCIETY: "Society",
  GOVERNMENT: "Government / PSU / Department",
  COLLEGE: "College / Educational Institution",
};

const UNIT_ALLOCATION_TYPE_ROWS = [
  { key: "1bhk", label: "1 BHK" },
  { key: "2bhk", label: "2 BHK" },
  { key: "3bhk", label: "3 BHK" },
  { key: "4bhk", label: "4 BHK" },
  { key: "shop", label: "Shop" },
  { key: "bungalow", label: "Bungalow" },
  { key: "plot", label: "Plot etc" },
];

const GST_RFD01_REFUND_GROUNDS = [
  "Excess balance in Cash ledger",
  "Exports of goods / services",
  "Supply of goods / services to SEZ/EOU",
  "Assessment/provisional assessment/ Appeal/ Order No",
  "ITC accumulated due to inverted duty structure",
];

function getGstRfdFormId(cert) {
  const explicit =
    cert?.data?.extras?.selectedForm?.id ||
    cert?.data?.extras?.formData?.selectedFormId ||
    "";
  if (explicit) return explicit;
  const type = String(cert?.certificate_type || "").toLowerCase();
  const match = type.match(/gst_rfd_(\d{2})_/);
  if (!match) return "";
  return `rfd_${match[1]}`;
}

function createUnitAllocationPreviewMap() {
  return UNIT_ALLOCATION_TYPE_ROWS.reduce((acc, row) => {
    acc[row.key] = "";
    return acc;
  }, {});
}

function SectionHeaderTitle({ section = "", title }) {
  if (!section) return <span>{title}</span>;
  return (
    <span
      style={{
        display: "grid",
        width: "100%",
        gridTemplateColumns: "max-content 1fr",
        columnGap: "0.5rem",
        alignItems: "start",
      }}
    >
      <span>{section}</span>
      <span>{title}</span>
    </span>
  );
}

function isBlank(v) {
  return !(v || "").toString().trim();
}

function isLiquidAssets45IBVariant(cert) {
  return cert?.data?.extras?.formData?.certificateVariant === "liquid_assets_45_ib";
}
function PageBreakBlock({ title, children }) {
  const [enabled, setEnabled] = React.useState(false);

  return (
    <>
      {/* Toggle – preview only */}
      <div className="no-print mb-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={() => setEnabled((v) => !v)}
        />
        <span>Start “{title}” on new page</span>
      </div>

      {/* Content */}
      <div
        className={`table-page-block ${enabled ? "break-before-page" : ""
          }`}
      >
        {children}
      </div>
    </>
  );
}


function getDisplayName(entityType, identity) {
  if (entityType === "PERSONAL") return (identity?.person_name || "").trim();
  return (identity?.company_name || "").trim();
}

function formatLine(label, value) {
  const v = (value || "").toString().trim();
  if (!v) return null;
  return `${label}: ${v}`;
}

function toNumberSafe(v) {
  const s = (v || "").toString().replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
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

  const numberToWordsIndian = (n) => {
    if (!n) return "";
    if (n < 100) return twoDigits(n);

    const units = [
      { value: 10000000, label: "Crore" },
      { value: 100000, label: "Lakh" },
      { value: 1000, label: "Thousand" },
      { value: 100, label: "Hundred" },
    ];

    const parts = [];
    let remaining = n;

    for (const u of units) {
      if (remaining >= u.value) {
        const count = Math.floor(remaining / u.value);
        if (u.value === 100) {
          parts.push(`${a[count]} ${u.label}`);
        } else {
          parts.push(`${numberToWordsIndian(count)} ${u.label}`);
        }
        remaining %= u.value;
      }
    }

    if (remaining) parts.push(twoDigits(remaining));
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };

  return numberToWordsIndian(Math.floor(num));
}

function sumScheduleAmount(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((acc, r) => {
    const n = toNumberSafe(r?.[2]); // schedule rows are [sr, particulars, amount]
    return acc + (n ?? 0);
  }, 0);
}

function formatINR(n) {
  if (n === null || n === undefined) return "";
  try {
    return n.toLocaleString("en-IN");
  } catch {
    return String(n);
  }
}

function formatDDMMYYYY(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  const digits = s.replace(/\D/g, "").slice(0, 8);
  if (digits.length >= 5) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return s;
}


function getPersonalLineFromCert(cert) {
  const identity = cert?.identity || {};
  const extrasPersonal = cert?.data?.extras?.personal || {};

  const titlePrefix = extrasPersonal?.titlePrefix || "Mr./Ms.";
  const relationType = extrasPersonal?.relationType || "S/o";
  const relationName = extrasPersonal?.relationName || "__________";

  const name = (identity?.person_name || "").trim() || "__________________";
  const pan = (identity?.pan || "").trim() || "__________";
  const address = (identity?.address || "").trim() || "__________";

  return `${titlePrefix} ${name}, ${relationType} ${relationName}, PAN ${pan}, residing at ${address}`;
}

/** ---------- Universal Generic Table Renderer ---------- */
function UniversalTableView({ table }) {
  const columns = Array.isArray(table?.columns) ? table.columns : [];
  const rows = Array.isArray(table?.rows) ? table.rows : [];

  if (!columns.length && !rows.length) {
    return <div className="text-sm text-muted-foreground">No table data.</div>;
  }

  const safeCols =
    columns.length ? columns : rows[0]?.map((_, i) => `Column ${i + 1}`) || [];

  return (
    <div className="overflow-x-auto mt-3">
      <table className="certificate-table compact">
        {/* ✅ STRUCTURAL COLUMN CONTROL */}
        <colgroup>
          <col className="col-sr" />
          <col className="col-text" />
          {safeCols.slice(2).map((_, i) => (
            <col key={i} className="col-num" />
          ))}
        </colgroup>

        <thead>
          <tr>
            {safeCols.map((c, idx) => (
              <th key={idx}>{c}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((r, ridx) => (
              <tr key={ridx}>
                {safeCols.map((_, cidx) => (
                  <td key={cidx}>{r?.[cidx] ?? ""}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={safeCols.length}>No rows</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** ---------- Turnover Certificate Renderer ---------- */
function TurnoverCertificateView({ cert }) {
  const entityType = cert?.entityType;
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const data = cert?.data || {};
  const main = data?.tables?.main || { columns: [], rows: [] };

  const displayName = getDisplayName(entityType, identity) || "__________________";
  const constitution = ENTITY_LABELS[entityType] || "__________________";

  const pan = identity?.pan || "";
  const cin = identity?.cin || "";
  const gstin = identity?.gstin || "";
  const address = identity?.address || "";

  const purpose = meta?.purpose || "";
  const place = meta?.place || "";
  const date = meta?.date || "";

  const firm = ca?.firm || "";
  const frn = ca?.frn || "";
  const caName = ca?.name || "";
  const membershipNo = ca?.membership_no || "";
  const udin = ca?.udin || "";

  const rows = Array.isArray(main?.rows) ? main.rows : [];
  const safeRows = rows.length ? rows : [["20XX-XX", ""]];

  return (
    <div>
      <div className="certificate-title">TURNOVER CERTIFICATE</div>

      <div className="text-center">
        <p className="certificate-subtitle">TO WHOM IT MAY CONCERN</p>
      </div>

      <div className="certificate-body">
        <p>
          This is to certify that, based on the documents, records, and audited financial statements produced before us, in respect of the entity:
        </p>

        <div className="rounded-xl border border-dashed p-3 mb-3">
          <div className="font-bold">Identification</div>
          <div className="mt-2 text-sm">
            {displayName}
            {!isBlank(pan) && <span>, PAN: {pan}</span>}
            {!isBlank(cin) && <span>, CIN: {cin}</span>}
            {!isBlank(gstin) && <span>, GSTIN: {gstin}</span>}
          </div>
          {!isBlank(address) && <div className="mt-1 text-sm">Address: {address}</div>}
          <div className="mt-1 text-sm">
            <span className="font-bold">Constitution:</span> {constitution}
          </div>
        </div>

        <p>
          We hereby confirm that the <b>TURNOVER</b> of the said entity for the last{" "}
          <b>{safeRows.length}</b> financial year{safeRows.length > 1 ? "s" : ""} is as under:
        </p>

        <table className="certificate-table compact">
          <thead>
            <tr>
              <th className="text-left">{main?.columns?.[0] || "Financial Year"}</th>
              <th className="turnover-col">Turnover</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((r, idx) => (
              <tr key={idx}>
                <td className="text-left">{r?.[0] || "__________"}</td>
                <td className="turnover-col">{r?.[1] || "__________"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>
          The above turnover figures have been verified by us with reference to the audited books of accounts, financial statements, and other relevant records as produced for our verification.
        </p>

        <p className="mt-2">
          This certificate is issued at the specific request of the above-mentioned entity for the purpose of{" "}
          <strong>{purpose || "______________"}</strong>. This certificate should not be used for any other purpose and no responsibility is accepted by us for any use other than the stated purpose.
        </p>
      </div>

      <div className="certificate-signature text-xs mt-2 font-bold">
        <div className="signature-left">
          <p><strong>Date:</strong> {date || ""}</p>
          <p><strong>Place:</strong> {place || ""}</p>
        </div>

        <div className="signature-right">
          <p>For {firm || ""}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {frn || ""}</p>
          <p className="mt-6">{caName || ""}</p>
          <p>Partner</p>
          <p>M.No. {membershipNo || ""}</p>
          <p>UDIN: {udin || ""}</p>
        </div>
      </div>
    </div>
  );
}

function GenericUniversalCertificateView({ cert }) {
  const entityType = cert?.entityType;
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const data = cert?.data || {};

  const gstForm = data?.extras?.selectedForm;
  const title =
    cert?.category === "GST" && gstForm?.code
      ? `${gstForm.code} - ${gstForm.title || "REFUND CERTIFICATE"}`
      : (cert?.certificate_type || "CERTIFICATE").replaceAll("_", " ").toUpperCase();

  const displayName = getDisplayName(entityType, identity) || "__________________";

  const idLines = [
    formatLine(entityType === "PERSONAL" ? "Name" : "Entity", displayName),
    formatLine("PAN", identity?.pan),
    formatLine("CIN", identity?.cin),
    formatLine("GSTIN", identity?.gstin),
    formatLine("Reg No", identity?.reg_no),
    formatLine("Department", identity?.department),
    formatLine("Address", identity?.address),
  ].filter(Boolean);

  const tableKeys = Object.keys(data?.tables || {});
  const isPersonal = entityType === "PERSONAL";

  // if this cert has personal extras, show the same style as networthform
  const hasPersonalExtras = Boolean(data?.extras?.personal);
  const personalLine = hasPersonalExtras ? getPersonalLineFromCert(cert) : null;

  return (
    <div>
      <div className="certificate-title">{title}</div>

      <div className="text-center mb-4">
        <p className="certificate-subtitle">TO WHOM IT MAY CONCERN</p>
      </div>

      <div className="certificate-body">
        {isPersonal && personalLine ? (
          <p className="leading-6">
            This is to certify that, based on the documents and information produced before us for verification, in respect of{" "}
            <b>{personalLine}</b>.
          </p>
        ) : (
          <div className="rounded-xl border border-dashed p-3 mb-3">
            <div className="font-bold">Identification</div>
            <div className="mt-2 text-sm">
              {idLines.length ? idLines.join(" | ") : "______________________________"}
            </div>
            <div className="mt-2 text-sm">
              <span className="font-bold">Constitution:</span>{" "}
              {ENTITY_LABELS[entityType] || "__________________"}
            </div>
          </div>
        )}

        <p className="mb-2">
          <strong>Purpose:</strong> {meta?.purpose || "______________"}
        </p>

        {tableKeys.length ? (
          tableKeys.map((k) => (
            <div key={k} className="mt-4">
              <div className="font-bold">{k.toUpperCase()} TABLE</div>
              <UniversalTableView table={data.tables[k]} />
            </div>
          ))
        ) : (
          <div className="mt-4 text-sm text-muted-foreground">No tables found in this certificate.</div>
        )}
      </div>

      <div className="mt-3 certificate-signature">
        <div className="signature-left">
          <p><strong>Date:</strong> {meta?.date || ""}</p>
          <p><strong>Place:</strong> {meta?.place || ""}</p>
        </div>

        <div className="signature-right">
          <p>For {ca?.firm || ""}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {ca?.frn || ""}</p>
          <p className="mt-8">({ca?.name || ""})</p>
          <p>Partner</p>
          <p>M.No. {ca?.membership_no || ""}</p>
          <p>UDIN: {ca?.udin || ""}</p>
        </div>
      </div>
    </div>
  );
}

function GstRefundCertificateView({ cert }) {
  const formId = getGstRfdFormId(cert);
  if (
    formId !== "rfd_01" &&
    formId !== "rfd_02" &&
    formId !== "rfd_03" &&
    formId !== "rfd_04" &&
    formId !== "rfd_05" &&
    formId !== "rfd_06" &&
    formId !== "rfd_07" &&
    formId !== "rfd_08" &&
    formId !== "rfd_09" &&
    formId !== "rfd_10"
  ) {
    return <GenericUniversalCertificateView cert={cert} />;
  }

  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const formData = cert?.data?.extras?.formData || {};
  const tables = cert?.data?.tables || {};

  const asText = (value, fallback = "") => {
    const s = String(value ?? "").trim();
    return s || fallback;
  };
  if (formId === "rfd_02") {
    const government = asText(formData.governmentAuthority, "Government of India /States");
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule ---]");
    const applicationReferenceNo = asText(formData.applicationReferenceNo, "<Application Reference Number>");
    const acknowledgementNo = asText(formData.acknowledgementNo, "");
    const acknowledgementDate = asText(formatDDMMYYYY(formData.acknowledgementDate), "");
    const gstin = asText(formData.gstin || identity.gstin, "");
    const taxpayerName = asText(formData.entityName || identity.person_name || identity.company_name, "");
    const formNo = asText(cert?.data?.extras?.selectedForm?.code, "GST RFD-02");
    const formDescription = asText(cert?.data?.extras?.selectedForm?.title, "Acknowledgement");
    const centerJurisdiction = asText(formData.centerJurisdiction, "");
    const stateJurisdiction = asText(formData.stateJurisdiction, "");
    const filedBy = asText(formData.filedBy, "");
    const place = asText(formData.acknowledgementPlace || formData.place || meta.place, "");
    const taxPeriodFrom = asText(formatDDMMYYYY(formData.taxPeriodFrom), "");
    const taxPeriodTo = asText(formatDDMMYYYY(formData.taxPeriodTo), "");
    const taxPeriod = taxPeriodFrom || taxPeriodTo ? `${taxPeriodFrom}${taxPeriodFrom && taxPeriodTo ? " to " : ""}${taxPeriodTo}` : "";
    const filingDateTime = asText(formData.filingDateTime, "");
    const reason = asText(formData.reason, "");
    const igstAmount = asText(formData.rfd02IgstAmount, "");
    const cgstAmount = asText(formData.rfd02CgstAmount, "");
    const sgstAmount = asText(formData.rfd02SgstAmount, "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.4 }}>
        <div style={{ textAlign: "center", marginBottom: "18px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-02</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>Acknowledgment</div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <p style={{ marginBottom: "8px" }}>
            Your Refund application has been successfully acknowledged against {applicationReferenceNo}
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "180px 14px 1fr", rowGap: "6px", marginBottom: "10px" }}>
            <div>Acknowledgement Number</div><div>:</div><div>{acknowledgementNo}</div>
            <div>Date of Acknowledgement</div><div>:</div><div>{acknowledgementDate}</div>
            <div>GSTIN</div><div>:</div><div>{gstin}</div>
            <div>Taxpayer Name</div><div>:</div><div>{taxpayerName}</div>
            <div>Form No.</div><div>:</div><div>{formNo}</div>
            <div>Form Description</div><div>:</div><div>{formDescription}</div>
            <div>Center Jurisdiction</div><div>:</div><div>{centerJurisdiction}</div>
            <div>State Jurisdiction</div><div>:</div><div>{stateJurisdiction}</div>
            <div>Filed By</div><div>:</div><div>{filedBy}</div>
            <div>Place</div><div>:</div><div>{place}</div>
          </div>

          <table style={{ width: "86%", borderCollapse: "collapse", marginBottom: "12px" }}>
            <thead>
              <tr>
                <th colSpan={4} style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center", fontWeight: 400 }}>
                  Refund Application Details
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px", width: "32%" }}>Tax Period</td>
                <td colSpan={3} style={{ border: "1px solid #000", padding: "4px 6px" }}>{taxPeriod}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>Date and Time of Filing</td>
                <td colSpan={3} style={{ border: "1px solid #000", padding: "4px 6px" }}>{filingDateTime}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>Reason for Refund</td>
                <td colSpan={3} style={{ border: "1px solid #000", padding: "4px 6px" }}>{reason}</td>
              </tr>
              <tr>
                <td rowSpan={2} style={{ border: "1px solid #000", padding: "4px 6px" }}>Refund Claimed</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>IGST Amount</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>CGST Amount</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>SGST Amount</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>{igstAmount}</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>{cgstAmount}</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px", textAlign: "center" }}>{sgstAmount}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ borderTop: "1px solid #000", marginBottom: "10px" }} />
          <p style={{ fontStyle: "italic", marginBottom: "8px" }}>
            Note 1: The status of the Application can be viewed through “Track Application Status” at dash board on the GST Portal.
          </p>
          <p style={{ fontStyle: "italic" }}>
            Note 2: It is a system generated acknowledgement and does not require any signature.
          </p>
        </div>
      </div>
    );
  }

  if (formId === "rfd_03") {
    const government = asText(formData.governmentAuthority, "Government of India/State");
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule --]");
    const noticeReferenceNo = asText(formData.noticeReferenceNo, "");
    const noticeDate = asText(formatDDMMYYYY(formData.rfd03NoticeDate || formData.rfd03Date), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "____________");
    const address = asText(formData.address || identity.address, "____________");
    const arn = asText(formData.applicationReferenceNo, "............");
    const arnDate = asText(formatDDMMYYYY(formData.rfd03ArnDate), "<DD/MM/YYYY>");
    const sectionRef = asText(formData.rfd03SectionReference, "----");
    const deficiency1 = asText(formData.rfd03Deficiency1, "");
    const deficiency2 = asText(formData.rfd03Deficiency2, "");
    const otherReason = asText(
      formData.rfd03OtherReason,
      "any other reason other than the reason selected from the 'reason master'"
    );
    const officerName = asText(formData.rfd03OfficerName, "");
    const officerDesignation = asText(formData.rfd03OfficerDesignation, "");
    const officeAddress = asText(formData.rfd03OfficeAddress, "");
    const place = asText(formData.rfd03Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd03Date || meta.date), "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-03</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>
            Notice of Deficiency on Application for Refund
          </div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Notice Reference No. : {noticeReferenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {noticeDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName})</div>
            <div>____________ ({address})</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            Application Reference No. (ARN) {arn} Dated {arnDate}
          </div>

          <p style={{ marginBottom: "10px", textAlign: "justify" }}>
            This is with reference to your Refund application referred above, filed under section {sectionRef} of the
            Goods and Services Tax Act, 20--. The Department has examined your application and certain defects were
            observed from preliminary scrutiny which are as under:
          </p>

          <table style={{ width: "86%", borderCollapse: "collapse", marginBottom: "8px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "4px 6px", width: "80px", fontWeight: 400, textAlign: "left" }}>
                  Sr No
                </th>
                <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 400, textAlign: "left" }}>
                  Description( select the reason from the drop down of the Refund application)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>1.</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{deficiency1}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>2.</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{deficiency2}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>Other</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                  {otherReason}
                  <span style={{ fontStyle: "italic" }}>
                    {" "}
                    {otherReason ? "" : "( any other reason other than the reason select from the 'reason master' )"}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginBottom: "18px" }}>
            You are directed to file fresh refund application after the rectification of above deficiencies.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name of Proper Officer: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_04") {
    const taxHead = asText(formData.rfd04TaxHead, "SGST").toUpperCase();
    const isStateVariant = taxHead === "SGST";

    const government = asText(
      formData.governmentAuthority,
      isStateVariant ? "Government of <<State>>" : "Government of India"
    );
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule -]");
    const referenceNo = asText(formData.rfd04ReferenceNo || formData.provisionalOrderNo, "");
    const orderDate = asText(formatDDMMYYYY(formData.rfd04OrderDate || formData.rfd04Date), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "____________");
    const address = asText(formData.address || identity.address, "____________");
    const acknowledgementNo = asText(formData.acknowledgementNo, "");
    const acknowledgementDate = asText(
      formatDDMMYYYY(formData.rfd04AcknowledgementDate || formData.acknowledgementDate),
      "<DD/MM/YYYY>"
    );

    const claimedIgst = asText(
      formData.rfd04ClaimedIgst || (taxHead === "IGST" ? formData.rfd04ClaimedTax : ""),
      ""
    );
    const claimedCgst = asText(
      formData.rfd04ClaimedCgst || (taxHead === "CGST" ? formData.rfd04ClaimedTax : ""),
      ""
    );
    const reducedIgst = asText(
      formData.rfd04Reduced20Igst || (taxHead === "IGST" ? formData.rfd04Reduced20Tax : ""),
      ""
    );
    const reducedCgst = asText(
      formData.rfd04Reduced20Cgst || (taxHead === "CGST" ? formData.rfd04Reduced20Tax : ""),
      ""
    );
    const balanceIgst = asText(
      formData.rfd04BalanceIgst || (taxHead === "IGST" ? formData.rfd04BalanceTax : ""),
      ""
    );
    const balanceCgst = asText(
      formData.rfd04BalanceCgst || (taxHead === "CGST" ? formData.rfd04BalanceTax : ""),
      ""
    );

    const claimedSgst = asText(formData.rfd04ClaimedTax, "");
    const reducedSgst = asText(formData.rfd04Reduced20Tax, "");
    const balanceSgst = asText(formData.rfd04BalanceTax, "");

    const bankAccountNo = asText(formData.bankAccountNo, "");
    const bankAccountType = asText(formData.bankAccountType, "");
    const bankAccountHolder = asText(formData.bankAccountHolder, "");
    const bankName = asText(formData.bankName, "");
    const bankBranchAddress = asText(formData.bankBranchAddress, "");
    const bankIfsc = asText(formData.bankIfsc, "");
    const bankMicr = asText(formData.bankMicr, "");

    const officerName = asText(formData.rfd04OfficerName, "");
    const officerDesignation = asText(formData.rfd04OfficerDesignation, "");
    const officeAddress = asText(formData.rfd04OfficeAddress, "");
    const place = asText(formData.rfd04Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd04Date || meta.date), "");

    const bankRows = [
      ["i.", "Bank Account no as per application", bankAccountNo],
      ["ii.", "Bank Account Type", bankAccountType],
      ["iii.", "Name of the Account holder", bankAccountHolder],
      ["iv.", "Name of the Bank", bankName],
      ["v.", "Address of the Bank /Branch", bankBranchAddress],
      ["vi.", "IFSC", bankIfsc],
      ["vii.", "MICR", bankMicr],
    ];

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-04</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>Provisional Refund Order</div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Reference No : {referenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {orderDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName})</div>
            <div>____________ ({address})</div>
          </div>

          <div style={{ marginBottom: "12px" }}>
            Acknowledgement No. {acknowledgementNo} Dated {acknowledgementDate}
          </div>

          <p style={{ marginBottom: "6px" }}>Sir/Madam,</p>
          <p style={{ marginBottom: "10px" }}>
            With reference to your refund application as, following refund is sanctioned to you:
          </p>

          {isStateVariant ? (
            <table style={{ width: "76%", borderCollapse: "collapse", marginBottom: "12px", marginLeft: "10mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claimed</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Reduced by 20%</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance refund Sanctioned</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 700, textAlign: "center" }}>Bank Details</td><td style={{ border: "1px solid #000", padding: "2px 6px" }} /></tr>
                {bankRows.map((r) => (
                  <tr key={`rfd04_state_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "76%", borderCollapse: "collapse", marginBottom: "12px", marginLeft: "10mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>IGST</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>CGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claimed</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Reduced by 20%</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance refund Sanctioned</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 700, textAlign: "center" }}>Bank Details</td><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px" }} /></tr>
                {bankRows.map((r) => (
                  <tr key={`rfd04_central_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "16px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_05") {
    const isStateVariant = asText(formData.rfd05Variant, "central_igst_cgst") === "state_sgst";

    const government = asText(
      formData.governmentAuthority,
      isStateVariant ? "Government of <<State>>" : "Government of India"
    );
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule --]");
    const referenceNo = asText(formData.rfd05ReferenceNo || formData.sanctionOrderNo, "");
    const topDate = asText(formatDDMMYYYY(formData.rfd05OrderDate || formData.rfd05Date), "<DD/MM/YYYY>");
    const datedValue = asText(formatDDMMYYYY(formData.rfd05AcknowledgementDate), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "____________");
    const address = asText(formData.address || identity.address, "____________");
    const acknowledgementNo = asText(formData.rfd05AcknowledgementNo || formData.acknowledgementNo, "");

    const inadmissibleReason = asText(formData.rfd05InadmissibleReason, "");

    const claimedIgst = asText(formData.rfd05ClaimedIgst, "");
    const claimedCgst = asText(formData.rfd05ClaimedCgst, "");
    const provisionalIgst = asText(formData.rfd05ProvisionalIgst, "");
    const provisionalCgst = asText(formData.rfd05ProvisionalCgst, "");
    const inadmissibleIgst = asText(formData.rfd05InadmissibleIgst, "");
    const inadmissibleCgst = asText(formData.rfd05InadmissibleCgst, "");
    const balanceIgst = asText(formData.rfd05BalanceAllowedIgst, "");
    const balanceCgst = asText(formData.rfd05BalanceAllowedCgst, "");
    const reducedDemandIgst = asText(formData.rfd05ReducedDemandIgst, "");
    const reducedDemandCgst = asText(formData.rfd05ReducedDemandCgst, "");
    const netSanctionedIgst = asText(formData.rfd05NetSanctionedIgst, "");
    const netSanctionedCgst = asText(formData.rfd05NetSanctionedCgst, "");

    const claimedSgst = asText(formData.rfd05ClaimedSgst, "");
    const provisionalSgst = asText(formData.rfd05ProvisionalSgst, "");
    const inadmissibleSgst = asText(formData.rfd05InadmissibleSgst, "");
    const balanceSgst = asText(formData.rfd05BalanceAllowedSgst, "");
    const reducedDemandSgst = asText(formData.rfd05ReducedDemandSgst, "");
    const netSanctionedSgst = asText(formData.rfd05NetSanctionedSgst, "");

    const demandOrderNoDate = asText(formData.rfd05DemandOrderNoDate, "Demand Order No...... date......");
    const provisionalOrderNoDate = asText(formData.rfd05ProvisionalOrderNoDate, "Order No....date");

    const bankAccountNo = asText(formData.bankAccountNo, "");
    const bankName = asText(formData.bankName, "");
    const bankAccountType = asText(formData.bankAccountType, "");
    const bankAccountHolder = asText(formData.bankAccountHolder, "");
    const bankBranchAddress = asText(formData.bankBranchAddress, "");
    const bankIfsc = asText(formData.bankIfsc, "");
    const bankMicr = asText(formData.bankMicr, "");

    const sanctionAmountInr = asText(formData.rfd05SanctionAmountInr, "___________");
    const subSection = asText(formData.rfd05SanctionSubSection, "(...)");
    const section = asText(formData.rfd05SanctionSection, "(...)");

    const officerName = asText(formData.rfd05OfficerName, "");
    const officerDesignation = asText(formData.rfd05OfficerDesignation, "");
    const officeAddress = asText(formData.rfd05OfficeAddress, "");
    const place = asText(formData.rfd05Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd05Date || meta.date), "");

    const bankRows = [
      ["i.", "Bank Account no as per application", bankAccountNo],
      ["ii.", "Name of the Bank", bankName],
      ["iii.", "Bank Account Type", bankAccountType],
      ["iv.", "Name of the Account holder", bankAccountHolder],
      ["v.", "Name and Address of the Bank /branch", bankBranchAddress],
      ["vi.", "IFSC", bankIfsc],
      ["vii.", "MICR", bankMicr],
    ];

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-05</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>Refund Sanction/Rejection Order</div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Reference No. : {referenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {topDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName})</div>
            <div>____________ ({address})</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", marginBottom: "10px" }}>
            <div>Acknowledgement No. {acknowledgementNo}</div>
            <div>Dated {datedValue}</div>
          </div>

          <p style={{ marginBottom: "6px" }}>Sir/Madam,</p>
          <p style={{ marginBottom: "10px" }}>
            With reference to your refund application as referred above and further furnishing of information/ filing
            of documents, refund calculation after adjustment of dues is as follows:
          </p>

          {isStateVariant ? (
            <table style={{ width: "82%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "8mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claim</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund Sanctioned on Provisional Basis ({provisionalOrderNoDate})</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund amount inadmissible {inadmissibleReason ? `(${inadmissibleReason})` : "<<reason dropdown>>"}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iv.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance refund allowed (i-ii-iii)</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>v.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund reduced against outstanding demand (as per order no.) under earlier law or under this law. {demandOrderNoDate}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>vi.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Net Amount of Refund Sanctioned</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{netSanctionedSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 700, textAlign: "center" }}>Bank Details</td><td style={{ border: "1px solid #000", padding: "2px 6px" }} /></tr>
                {bankRows.map((r) => (
                  <tr key={`rfd05_state_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "82%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "8mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>IGST</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>CGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claim</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund Sanctioned on Provisional Basis ({provisionalOrderNoDate})</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund amount inadmissible {inadmissibleReason ? `(${inadmissibleReason})` : "<<reason dropdown>>"}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iv.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance refund allowed (i-ii-iii)</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>v.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund reduced against outstanding demand (as per order no.) under earlier law or under this law. {demandOrderNoDate}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>vi.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Net Amount of Refund Sanctioned</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{netSanctionedIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{netSanctionedCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 700, textAlign: "center" }}>Bank Details</td><td style={{ border: "1px solid #000", padding: "2px 6px" }} /><td style={{ border: "1px solid #000", padding: "2px 6px" }} /></tr>
                {bankRows.map((r) => (
                  <tr key={`rfd05_central_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ marginBottom: "10px" }}>
            I hereby sanction an amount of INR {sanctionAmountInr} to M/s {applicantName} having GSTIN {gstin} under
            sub-section {subSection} of Section {section} of the Act. .
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_06") {
    const isStateVariant = asText(formData.rfd06Variant, "central_igst_cgst") === "state_sgst";

    const government = asText(
      formData.governmentAuthority,
      isStateVariant ? "Government of <<State>>" : "Government of India"
    );
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule-----]");
    const referenceNo = asText(formData.rfd06ReferenceNo || formData.adjustmentOrderNo, "");
    const topDate = asText(formatDDMMYYYY(formData.rfd06OrderDate || formData.rfd06Date), "<DD/MM/YYYY>");
    const datedValue = asText(formatDDMMYYYY(formData.rfd06AcknowledgementDate), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "____________");
    const address = asText(formData.address || identity.address, "____________");
    const acknowledgementNo = asText(formData.rfd06AcknowledgementNo || formData.acknowledgementNo, "");

    const inadmissibleReason = asText(formData.rfd06InadmissibleReason, "<<reason dropdown>>");
    const provisionalOrderNoDate = asText(formData.rfd06ProvisionalOrderNoDate, "Order No...dated");
    const demandOrderNoDate = asText(formData.rfd06DemandOrderNoDate, "Demand Order No...... date......");

    const claimedIgst = asText(formData.rfd06ClaimedIgst, "");
    const claimedCgst = asText(formData.rfd06ClaimedCgst, "");
    const provisionalIgst = asText(formData.rfd06ProvisionalIgst, "");
    const provisionalCgst = asText(formData.rfd06ProvisionalCgst, "");
    const inadmissibleIgst = asText(formData.rfd06InadmissibleIgst, "");
    const inadmissibleCgst = asText(formData.rfd06InadmissibleCgst, "");
    const admissibleIgst = asText(formData.rfd06AdmissibleIgst, "");
    const admissibleCgst = asText(formData.rfd06AdmissibleCgst, "");
    const reducedDemandIgst = asText(formData.rfd06ReducedDemandIgst, "");
    const reducedDemandCgst = asText(formData.rfd06ReducedDemandCgst, "");
    const balanceIgst = asText(formData.rfd06BalanceIgst, "Nil");
    const balanceCgst = asText(formData.rfd06BalanceCgst, "Nil");

    const claimedSgst = asText(formData.rfd06ClaimedSgst, "");
    const provisionalSgst = asText(formData.rfd06ProvisionalSgst, "");
    const inadmissibleSgst = asText(formData.rfd06InadmissibleSgst, "");
    const admissibleSgst = asText(formData.rfd06AdmissibleSgst, "");
    const reducedDemandSgst = asText(formData.rfd06ReducedDemandSgst, "");
    const balanceSgst = asText(formData.rfd06BalanceSgst, "Nil");

    const disposalText = asText(
      formData.rfd06DispositionText,
      "I hereby, order that the amount of admissible refund as shown above is completely adjusted against the outstanding demand under this act / under the earlier law."
    );
    const subSection = asText(formData.rfd06SectionSubSection, "(...)");
    const section = asText(formData.rfd06SectionMain, "(...)");

    const officerName = asText(formData.rfd06OfficerName, "");
    const officerDesignation = asText(formData.rfd06OfficerDesignation, "");
    const officeAddress = asText(formData.rfd06OfficeAddress, "");
    const place = asText(formData.rfd06Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd06Date || meta.date), "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-06</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>
            Order for Complete adjustment of claimed Refund
          </div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Reference No. : {referenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {topDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName})</div>
            <div>____________ ({address})</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", marginBottom: "10px" }}>
            <div>Acknowledgement No. {acknowledgementNo}</div>
            <div>Dated {datedValue}</div>
          </div>

          <p style={{ marginBottom: "6px" }}>Sir/Madam,</p>
          <p style={{ marginBottom: "10px" }}>
            With reference to your refund application as referred above and further furnishing of information/ filing
            of documents against the amount of refund by you has been completely adjusted
          </p>

          {isStateVariant ? (
            <table style={{ width: "82%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "8mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>SGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claimed</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund Sanctioned on Provisional Basis ({provisionalOrderNoDate})</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund amount inadmissible {inadmissibleReason}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iv.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund admissible (i-ii-iii)</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{admissibleSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>v.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund reduced against outstanding demand (as per order no.) under earlier law or under this law. {demandOrderNoDate}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandSgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>vi.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance amount of refund</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceSgst}</td></tr>
              </tbody>
            </table>
          ) : (
            <table style={{ width: "82%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "8mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700 }}>Refund Calculation</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>IGST</th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>CGST</th>
                </tr>
              </thead>
              <tbody>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>i.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Amount of Refund claimed</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{claimedCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>ii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund Sanctioned on Provisional Basis ({provisionalOrderNoDate})</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{provisionalCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iii.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund amount inadmissible {inadmissibleReason}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{inadmissibleCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>iv.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund admissible (i-ii-iii)</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{admissibleIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{admissibleCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>v.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Refund reduced against outstanding demand (as per order no.) under earlier law or under this law. {demandOrderNoDate}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{reducedDemandCgst}</td></tr>
                <tr><td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>vi.</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>Balance amount of refund</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceIgst}</td><td style={{ border: "1px solid #000", padding: "2px 6px" }}>{balanceCgst}</td></tr>
              </tbody>
            </table>
          )}

          <p style={{ marginBottom: "12px", textAlign: "justify" }}>
            {disposalText} This applicant stands disposed as per provisions under sub-section {subSection} of Section{" "}
            {section} of the Act.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_07") {
    const government = asText(formData.governmentAuthority, "Government of India/State");
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule-----]");
    const referenceNo = asText(formData.rfd07ReferenceNo || formData.showCauseNoticeNo, "");
    const topDate = asText(
      formatDDMMYYYY(formData.rfd07NoticeDate || formData.rfd07Date || formData.date),
      "<DD/MM/YYYY>"
    );
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "");
    const address = asText(formData.address || identity.address, "");
    const arn = asText(formData.rfd07Arn || formData.applicationReferenceNo, "..........");
    const datedValue = asText(
      formatDDMMYYYY(formData.rfd07Dated || formData.rfd07ApplicationDate),
      "<DD/MM/YYYY>"
    );
    const sectionRef = asText(formData.rfd07SectionReference, "----");
    const reason1 = asText(formData.rfd07Reason1, "");
    const amount1 = asText(formData.rfd07AmountInadmissible1, "");
    const reason2 = asText(formData.rfd07Reason2, "");
    const amount2 = asText(formData.rfd07AmountInadmissible2, "");
    const otherReason = asText(formData.rfd07ReasonOther, "");
    const otherAmount = asText(formData.rfd07AmountInadmissibleOther, "");
    const responseDays = asText(formData.rfd07ResponseDays, "15");
    const responseByDate = asText(formatDDMMYYYY(formData.rfd07ResponseByDate), "<Date>");
    const receiptDate = asText(formatDDMMYYYY(formData.rfd07ReceiptDate), "<receipt >");
    const officerName = asText(formData.rfd07OfficerName, "");
    const officerDesignation = asText(formData.rfd07OfficerDesignation, "");
    const officeAddress = asText(formData.rfd07OfficeAddress, "");
    const place = asText(formData.rfd07Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd07Date || meta.date), "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-07</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>
            Show cause notice for reject of refund application
          </div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Reference No. : {referenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {topDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName || "Name"})</div>
            <div>____________ ({address || "Address"})</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", marginBottom: "10px" }}>
            <div>Application Reference No. (ARN) {arn}</div>
            <div>Dated {datedValue}</div>
          </div>

          <p style={{ marginBottom: "10px", textAlign: "justify" }}>
            This is with reference to your Refund application referred above, filed under Section {sectionRef} of the
            Goods and Services Tax Act, 20--. On examination, following reasons for non-admissibility of refund
            application have been observed:
          </p>

          <table style={{ width: "94%", borderCollapse: "collapse", marginBottom: "10px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "4px 6px", width: "80px", fontWeight: 400, textAlign: "left" }}>
                  Sr No
                </th>
                <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 400, textAlign: "center" }}>
                  Description (select the reasons of inadmissibility of refund from the drop down)
                </th>
                <th style={{ border: "1px solid #000", padding: "4px 6px", width: "220px", fontWeight: 400, textAlign: "center" }}>
                  Amount Inadmissible
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>1.</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{reason1}</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{amount1}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>2.</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{reason2}</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{amount2}</td>
              </tr>
              <tr>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>Other</td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>
                  {otherReason || (
                    <span style={{ fontStyle: "italic" }}>
                      any other reason other than the reasons mentioned in reason master
                    </span>
                  )}
                </td>
                <td style={{ border: "1px solid #000", padding: "4px 6px" }}>{otherAmount}</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginBottom: "18px", textAlign: "justify" }}>
            You are hereby called upon to show cause as to why your refund claim should not be rejected for reasons
            stated above. You are requested to submit your response within {"<"}
            {responseDays}
            {">"} days, {responseByDate} to the undersigned from the date of {receiptDate} of this notice. If you fail
            to file reply, it will be presumed that you have nothing to report and your application for refund claim
            stands rejected.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_08") {
    const isStateVariant = asText(formData.rfd08Variant, "central_igst_cgst") === "state_sgst";
    const government = asText(
      formData.governmentAuthority,
      isStateVariant ? "Government of <<State>>" : "Government of India"
    );
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule-----]");
    const paymentAdviceNo = asText(formData.paymentAdviceNo || formData.rfd08ReferenceNo, "");
    const topDate = asText(formatDDMMYYYY(formData.rfd08Date || formData.rfd08OrderDate), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "");
    const address = asText(formData.address || identity.address, "");
    const refundSanctionOrderNo = asText(formData.rfd08RefundSanctionOrderNo, "............");
    const datedValue = asText(
      formatDDMMYYYY(formData.rfd08RefundSanctionDate || formData.rfd08OrderDate),
      "<DD/MM/YYYY>"
    );
    const amountInr = asText(formData.rfd08AmountInr, "<....>");

    const bankAccountNo = asText(formData.bankAccountNo, "");
    const bankName = asText(formData.bankName, "");
    const bankAccountType = asText(formData.bankAccountType, "");
    const bankAccountHolder = asText(formData.bankAccountHolder, "");
    const bankBranchAddress = asText(formData.bankBranchAddress, "");
    const bankIfsc = asText(formData.bankIfsc, "");
    const bankMicr = asText(formData.bankMicr, "");

    const certificateText = asText(
      formData.rfd08CertificationText,
      "<<Certificate of sanctioning authority >>>"
    );
    const officerName = asText(formData.rfd08OfficerName, "");
    const officerDesignation = asText(formData.rfd08OfficerDesignation, "");
    const officeAddress = asText(formData.rfd08OfficeAddress, "");
    const place = asText(formData.rfd08Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd08Date || meta.date), "");

    const bankRows = [
      ["1.", "Bank Account no as per application", bankAccountNo],
      ["2.", "Name of the Bank", bankName],
      ["3.", "Bank Account Type", bankAccountType],
      ["4.", "Name of the Account holder", bankAccountHolder],
      ["5.", "Name and Address of the Bank /branch", bankBranchAddress],
      ["6.", "IFSC", bankIfsc],
      ["7.", "MICR", bankMicr],
    ];

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-08</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>Payment Advice</div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Payment Advice No: - {paymentAdviceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {topDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName || "Name"})</div>
            <div>____________ ({address || "Address"})</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", marginBottom: "10px" }}>
            <div>Refund Sanction Order No. {refundSanctionOrderNo}</div>
            <div>Dated {datedValue}</div>
          </div>

          <p style={{ marginBottom: "6px" }}>Sir/Madam,</p>
          <p style={{ marginBottom: "12px", textAlign: "justify" }}>
            With reference to the Refund Sanction Order as referred above, refund payment advice is hereby being issued
            to the concerned bank for Amount of INR {amountInr} as per the details below:
          </p>

          {isStateVariant ? (
            <table style={{ width: "76%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "10mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700, textAlign: "left" }}>
                    Details of the Bank
                  </th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>
                    SGST
                  </th>
                </tr>
              </thead>
              <tbody>
                {bankRows.map((r) => (
                  <tr key={`rfd08_state_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table style={{ width: "76%", borderCollapse: "collapse", marginBottom: "10px", marginLeft: "10mm" }}>
              <thead>
                <tr>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "40px", fontWeight: 400 }} />
                  <th style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 700, textAlign: "left" }}>
                    Details of the Bank
                  </th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>
                    IGST
                  </th>
                  <th style={{ border: "1px solid #000", padding: "4px 6px", width: "90px", fontWeight: 400 }}>
                    CGST
                  </th>
                </tr>
              </thead>
              <tbody>
                {bankRows.map((r) => (
                  <tr key={`rfd08_central_${r[0]}`}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px", textAlign: "right" }}>{r[0]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[1]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{r[2]}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }} />
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: "18px", marginLeft: "20mm" }}>{certificateText}</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_09") {
    const isStateVariant = asText(formData.rfd09Variant, "central_igst_cgst") === "state_sgst";
    const government = asText(
      formData.governmentAuthority,
      isStateVariant ? "Government of <<State>>" : "Government of India"
    );
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule-----]");
    const referenceNo = asText(formData.rfd09ReferenceNo || formData.interestOrderNo, "");
    const topDate = asText(formatDDMMYYYY(formData.rfd09Date || formData.rfd09OrderDate), "<DD/MM/YYYY>");
    const gstin = asText(formData.gstin || identity.gstin, "____________");
    const applicantName = asText(formData.entityName || identity.person_name || identity.company_name, "Name");
    const address = asText(formData.address || identity.address, "Address");
    const sanctionOrderNo = asText(formData.rfd09RefundSanctionOrderNo, "..........");
    const datedValue = asText(
      formatDDMMYYYY(formData.rfd09RefundSanctionDate || formData.rfd09OrderDate),
      "<DD/MM/YYYY>"
    );

    const refundIgst = asText(formData.rfd09RefundIgst, "");
    const delayIgst = asText(formData.rfd09DelayIgst, "");
    const rateIgst = asText(formData.rfd09RateIgst, "");
    const interestIgst = asText(formData.rfd09InterestIgst, "");

    const refundCgst = asText(formData.rfd09RefundCgst, "");
    const delayCgst = asText(formData.rfd09DelayCgst, "");
    const rateCgst = asText(formData.rfd09RateCgst, "");
    const interestCgst = asText(formData.rfd09InterestCgst, "");

    const refundSgst = asText(formData.rfd09RefundSgst, "");
    const delaySgst = asText(formData.rfd09DelaySgst, "");
    const rateSgst = asText(formData.rfd09RateSgst, "");
    const interestSgst = asText(formData.rfd09InterestSgst, "");

    const officerName = asText(formData.rfd09OfficerName, "");
    const officerDesignation = asText(formData.rfd09OfficerDesignation, "");
    const officeAddress = asText(formData.rfd09OfficeAddress, "");
    const place = asText(formData.rfd09Place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.rfd09Date || meta.date), "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM-GST-RFD-09</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>
            Order for Interest on delayed Refunds
          </div>
        </div>

        <div style={{ padding: "0 6mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", marginBottom: "8px" }}>
            <div>Reference No. : {referenceNo}</div>
            <div style={{ textAlign: "right" }}>Date: {topDate}</div>
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ fontWeight: 700 }}>To</div>
            <div style={{ marginTop: "2px" }}>____________ ({gstin})</div>
            <div>____________ ({applicantName})</div>
            <div>____________ ({address})</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", marginBottom: "10px" }}>
            <div>Refund Sanction Order No. {sanctionOrderNo}</div>
            <div>Dated {datedValue}</div>
          </div>

          <p style={{ marginBottom: "6px" }}>Sir/Madam,</p>
          <p style={{ marginBottom: "10px", textAlign: "justify" }}>
            With reference to the Refund Sanction Order as referred above, the interest calculation for delayed period
            is given as follows:
          </p>
          <p style={{ marginBottom: "8px" }}>Amount of Interest on Delayed payment of refund</p>

          <table style={{ width: "88%", borderCollapse: "collapse", marginBottom: "18px" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: 400, textAlign: "left" }}>
                  Particulars
                </th>
                <th style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: 400, textAlign: "left" }}>
                  Refund Amount
                </th>
                <th style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: 400, textAlign: "left" }}>
                  Period of Delay (Days/ Month)
                </th>
                <th style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: 400, textAlign: "left" }}>
                  Rate of Interest (%)
                </th>
                <th style={{ border: "1px solid #000", padding: "3px 6px", fontWeight: 400, textAlign: "left" }}>
                  Interest Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {isStateVariant ? (
                <tr>
                  <td style={{ border: "1px solid #000", padding: "3px 6px" }}>SGST</td>
                  <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{refundSgst}</td>
                  <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{delaySgst}</td>
                  <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{rateSgst}</td>
                  <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{interestSgst}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>CGST</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{refundCgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{delayCgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{rateCgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{interestCgst}</td>
                  </tr>
                  <tr>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>IGST</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{refundIgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{delayIgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{rateIgst}</td>
                    <td style={{ border: "1px solid #000", padding: "3px 6px" }}>{interestIgst}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature (DSC):</div>
              <div style={{ marginBottom: "4px" }}>Name: {officerName}</div>
              <div style={{ marginBottom: "4px" }}>Designation: {officerDesignation}</div>
              <div>Office Address: {officeAddress}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (formId === "rfd_10") {
    const asNum = (value) => {
      const n = Number(String(value || "").replace(/,/g, "").trim());
      return Number.isFinite(n) ? n : 0;
    };
    const showNum = (value) => {
      if (!value) return "";
      return value.toLocaleString("en-IN");
    };
    const matrixCell = (row, col) => asText(formData?.rfd10RefundMatrix?.[row]?.[col], "");
    const matrixRows = ["IGST", "CGST", "SGST"];
    const matrixCols = ["tax", "interest", "penalty", "fees", "others"];
    const rowTotal = (row) => {
      const explicitTotal = asNum(matrixCell(row, "total"));
      if (explicitTotal) return explicitTotal;
      return matrixCols.reduce((sum, col) => sum + asNum(matrixCell(row, col)), 0);
    };

    const colTotals = {
      tax: matrixRows.reduce((sum, row) => sum + asNum(matrixCell(row, "tax")), 0),
      interest: matrixRows.reduce((sum, row) => sum + asNum(matrixCell(row, "interest")), 0),
      penalty: matrixRows.reduce((sum, row) => sum + asNum(matrixCell(row, "penalty")), 0),
      fees: matrixRows.reduce((sum, row) => sum + asNum(matrixCell(row, "fees")), 0),
      others: matrixRows.reduce((sum, row) => sum + asNum(matrixCell(row, "others")), 0),
      total: matrixRows.reduce((sum, row) => sum + rowTotal(row), 0),
    };

    const government = asText(formData.governmentAuthority, "Government of India");
    const department = asText(formData.governmentDepartment, "Department of....");
    const ruleReference = asText(formData.ruleReference, "[See Rule-----]");
    const uin = asText(formData.rfd10Uin || formData.gstin || identity.gstin, "");
    const embassyOrgName = asText(
      formData.rfd10EmbassyOrgName || formData.embassyName || formData.entityName || identity.company_name,
      ""
    );
    const embassyAddress = asText(formData.rfd10Address || formData.address || identity.address, "");
    const taxFrom = asText(formatDDMMYYYY(formData.taxPeriodFrom), "<DD/MM/YY>");
    const taxTo = asText(formatDDMMYYYY(formData.taxPeriodTo), "<DD/MM/YY>");
    const amountInr = asText(formData.rfd10AmountInr, "<INR>");
    const amountWords = asText(formData.rfd10AmountWords, "<In Words>");

    const bankAccountNo = asText(formData.bankAccountNo, "");
    const bankAccountType = asText(formData.bankAccountType, "");
    const bankName = asText(formData.bankName, "");
    const bankAccountHolder = asText(formData.bankAccountHolder, "");
    const bankBranchAddress = asText(formData.bankBranchAddress, "");
    const bankIfsc = asText(formData.bankIfsc, "");
    const bankMicr = asText(formData.bankMicr, "");

    const representative = asText(formData.rfd10VerificationRepresentative, "");
    const verificationOrgName = asText(formData.rfd10VerificationOrgName || embassyOrgName, "");
    const signatoryName = asText(formData.signatoryName, "");
    const designationStatus = asText(
      formData.rfd10VerificationDesignationStatus || formData.signatoryDesignationStatus,
      ""
    );
    const place = asText(formData.place || meta.place, "");
    const date = asText(formatDDMMYYYY(formData.date || meta.date), "");

    return (
      <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.55 }}>
        <div style={{ textAlign: "center", marginBottom: "14px" }}>
          <div style={{ fontWeight: 700 }}>{government}</div>
          <div style={{ fontWeight: 700 }}>{department}</div>
          <div style={{ fontWeight: 700 }}>FORM GST RFD-10</div>
          <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
          <div style={{ marginTop: "4px", fontWeight: 700, fontSize: "14pt" }}>
            Refund Application form for Embassies/ International Organizations
          </div>
        </div>

        <div style={{ padding: "0 8mm" }}>
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 14px 1fr", rowGap: "4px", marginBottom: "8px" }}>
            <div>1.</div><div>UIN</div><div>:</div><div>{uin}</div>
            <div>2.</div><div>Name of the Embassy/ International organization</div><div>:</div><div>{embassyOrgName}</div>
            <div>3.</div><div>Address of Embassy/ International Organization</div><div>:</div><div>{embassyAddress}</div>
            <div>4.</div><div>Tax Period</div><div>:</div><div>From {taxFrom} To {taxTo}</div>
            <div>5.</div><div>Amount of Refund Claim</div><div>:</div><div>{amountInr} {amountWords}</div>
          </div>

          <table style={{ width: "66%", borderCollapse: "collapse", marginBottom: "12px", marginLeft: "10mm" }}>
            <thead>
              <tr>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }} />
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Tax</th>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Interest</th>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Penalty</th>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Fees</th>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Others</th>
                <th style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={`rfd10_row_${row}`}>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{row}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixCell(row, "tax")}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixCell(row, "interest")}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixCell(row, "penalty")}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixCell(row, "fees")}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixCell(row, "others")}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(rowTotal(row))}</td>
                </tr>
              ))}
              <tr>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>Total</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.tax)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.interest)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.penalty)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.fees)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.others)}</td>
                <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{showNum(colTotals.total)}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ marginBottom: "2px" }}>6.&nbsp;&nbsp;Details of Bank Account:</div>
            <div style={{ marginLeft: "22px" }}>a.&nbsp;&nbsp;Bank Account Number&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankAccountNo}</div>
            <div style={{ marginLeft: "22px" }}>b.&nbsp;&nbsp;Bank Account Type&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankAccountType}</div>
            <div style={{ marginLeft: "22px" }}>c.&nbsp;&nbsp;Name of the Bank&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankName}</div>
            <div style={{ marginLeft: "22px" }}>d.&nbsp;&nbsp;Name of the Account Holder/Operator&nbsp; {bankAccountHolder}</div>
            <div style={{ marginLeft: "22px" }}>e.&nbsp;&nbsp;Address of Bank Branch&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankBranchAddress}</div>
            <div style={{ marginLeft: "22px" }}>f.&nbsp;&nbsp;&nbsp;IFSC&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankIfsc}</div>
            <div style={{ marginLeft: "22px" }}>g.&nbsp;&nbsp;MICR&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {bankMicr}</div>
          </div>

          <div style={{ marginBottom: "8px" }}>
            7.&nbsp;&nbsp;Attach details of inward supplied in From GSTR-11 with the application.
          </div>

          <div style={{ marginBottom: "10px" }}>
            <div style={{ marginBottom: "2px" }}>8.&nbsp;&nbsp;Verification</div>
            <div style={{ marginLeft: "22px", textAlign: "justify" }}>
              I {representative || "_______"} as an authorized representative of {verificationOrgName || "<< Name of Embassy/international organization >>"} hereby solemnly affirm and declare that the information given herein above is true and correct to the best of my knowledge and belief and nothing has been concealed therefrom.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "14px" }}>
            <div>
              <div style={{ marginBottom: "4px" }}>Date: {date}</div>
              <div>Place: {place}</div>
            </div>
            <div>
              <div style={{ marginBottom: "4px" }}>Signature of Authorized Signatory:</div>
              <div style={{ marginBottom: "4px" }}>Name: {signatoryName}</div>
              <div>Designation / Status: {designationStatus}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const toNum = (value) => {
    const n = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const matrixVal = (row, col) => asText(formData?.refundMatrix?.[row]?.[col], "");
  const rowTotal = (row) =>
    ["tax", "interest", "penalty", "fees", "others"].reduce(
      (sum, col) => sum + toNum(formData?.refundMatrix?.[row]?.[col]),
      0
    );

  const government = asText(formData.governmentAuthority, "Government of India /State");
  const department = asText(formData.governmentDepartment, "Department of....");
  const ruleReference = asText(formData.ruleReference, "[See rule------]");
  const gstin = asText(formData.gstin || identity.gstin, "____________");
  const applicantName = asText(
    formData.entityName || identity.person_name || identity.company_name,
    "____________"
  );
  const address = asText(formData.address || identity.address, "____________");
  const taxFrom = asText(formatDDMMYYYY(formData.taxPeriodFrom), "<DD/MM/YY>");
  const taxTo = asText(formatDDMMYYYY(formData.taxPeriodTo), "<DD/MM/YY>");
  const selectedGround = asText(formData.refundGround || formData.reason, "");

  const bankAccountNo = asText(formData.bankAccountNo, "____________");
  const bankName = asText(formData.bankName, "____________");
  const bankAccountType = asText(formData.bankAccountType, "____________");
  const bankAccountHolder = asText(formData.bankAccountHolder, "____________");
  const bankBranchAddress = asText(formData.bankBranchAddress, "____________");
  const bankIfsc = asText(formData.bankIfsc, "____________");
  const bankMicr = asText(formData.bankMicr, "____________");
  const declarationApplicable = asText(formData.selfDeclarationApplicable, "yes").toLowerCase();

  const totalTax = toNum(matrixVal("IGST", "tax")) + toNum(matrixVal("CGST", "tax")) + toNum(matrixVal("SGST", "tax"));
  const totalInterest =
    toNum(matrixVal("IGST", "interest")) +
    toNum(matrixVal("CGST", "interest")) +
    toNum(matrixVal("SGST", "interest"));
  const totalPenalty =
    toNum(matrixVal("IGST", "penalty")) +
    toNum(matrixVal("CGST", "penalty")) +
    toNum(matrixVal("SGST", "penalty"));
  const totalFees = toNum(matrixVal("IGST", "fees")) + toNum(matrixVal("CGST", "fees")) + toNum(matrixVal("SGST", "fees"));
  const totalOthers =
    toNum(matrixVal("IGST", "others")) + toNum(matrixVal("CGST", "others")) + toNum(matrixVal("SGST", "others"));
  const grandTotal = rowTotal("IGST") + rowTotal("CGST") + rowTotal("SGST");

  const annexureTableRows = Array.isArray(formData.annexure1Invoices) && formData.annexure1Invoices.length
    ? formData.annexure1Invoices
    : (Array.isArray(tables?.annexure_1_goods?.rows)
      ? tables.annexure_1_goods.rows.map((r) => ({
          invoiceNo: r?.[1] ?? "",
          invoiceDate: r?.[2] ?? "",
          uqc: r?.[3] ?? "",
          quantity: r?.[4] ?? "",
          value: r?.[5] ?? "",
          goodsServices: r?.[6] ?? "",
          hsnSac: r?.[7] ?? "",
          taxableValue: r?.[8] ?? "",
          igstRate: r?.[9] ?? "",
          igstAmt: r?.[10] ?? "",
          cgstRate: r?.[11] ?? "",
          cgstAmt: r?.[12] ?? "",
          sgstRate: r?.[13] ?? "",
          sgstAmt: r?.[14] ?? "",
        }))
      : []);
  const annexureRows = [...annexureTableRows];
  while (annexureRows.length < 4) annexureRows.push({});

  const annexureTaxPeriod = `${taxFrom}${taxFrom && taxTo ? " to " : ""}${taxTo}`;
  const refundAmountWords = asText(formData.annexure2RefundAmountWords, "--------------");
  const refundAmountInr = asText(formData.amountClaimed, "--------------");
  const verificationName = asText(formData.verificationName, "<Taxpayer Name>");
  const signatoryName = asText(formData.signatoryName, "____________");
  const designationStatus = asText(formData.signatoryDesignationStatus, "____________");
  const selfDeclarationText = asText(
    formData.selfDeclarationText,
    "I/We, M/s. ____________________ (Applicant) having GSTIN -------, solemnly affirm and certify that in respect of the refund amounting to INR---/ with respect to the tax and interest for the period from---to---, claimed in the refund application, the incidence of such tax and interest has not been passed on to any other person."
  );
  const place = asText(meta.place || formData.place, "____________");
  const date = asText(meta.date || formData.date, "____________");

  const LineItem = ({ number, children }) => (
    <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", columnGap: "12px", marginBottom: "8px" }}>
      <div>{number}.</div>
      <div>{children}</div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Times New Roman', Times, serif", color: "#000", fontSize: "12pt", lineHeight: 1.4 }}>
      <div style={{ textAlign: "center", marginBottom: "22px" }}>
        <div style={{ fontWeight: 700 }}>{government}</div>
        <div style={{ fontWeight: 700 }}>{department}</div>
        <div style={{ fontWeight: 700 }}>FORM-GST-RFD-01</div>
        <div style={{ marginTop: "4px", fontStyle: "italic" }}>{ruleReference}</div>
        <div style={{ marginTop: "6px", fontWeight: 700, fontSize: "14pt" }}>Refund Application Form</div>
      </div>

      <div style={{ padding: "0 8mm" }}>
        <LineItem number="1">GSTIN: {gstin}</LineItem>
        <LineItem number="2">Name : {applicantName}</LineItem>
        <LineItem number="3">Address: {address}</LineItem>
        <LineItem number="4">
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: "16px" }}>
            <span>Tax Period:</span>
            <span>From {taxFrom}</span>
            <span>To {taxTo}</span>
          </div>
        </LineItem>

        <LineItem number="5">
          <div>
            <div style={{ marginBottom: "8px" }}>Amount of Refund Claimed :</div>
            <table style={{ width: "70%", borderCollapse: "collapse", marginLeft: "20mm" }}>
              <thead>
                <tr>
                  {["", "Tax", "Interest", "Penalty", "Fees", "Others", "Total"].map((h) => (
                    <th key={h} style={{ border: "1px solid #000", padding: "2px 6px", fontWeight: 400, textAlign: "center" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {["IGST", "CGST", "SGST"].map((row) => (
                  <tr key={row}>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{row}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixVal(row, "tax")}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixVal(row, "interest")}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixVal(row, "penalty")}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixVal(row, "fees")}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{matrixVal(row, "others")}</td>
                    <td style={{ border: "1px solid #000", padding: "2px 6px" }}>
                      {rowTotal(row) ? rowTotal(row).toLocaleString("en-IN") : ""}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={1} style={{ border: "1px solid #000", padding: "2px 6px" }}>Total</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{totalTax ? totalTax.toLocaleString("en-IN") : ""}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{totalInterest ? totalInterest.toLocaleString("en-IN") : ""}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{totalPenalty ? totalPenalty.toLocaleString("en-IN") : ""}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{totalFees ? totalFees.toLocaleString("en-IN") : ""}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{totalOthers ? totalOthers.toLocaleString("en-IN") : ""}</td>
                  <td style={{ border: "1px solid #000", padding: "2px 6px" }}>{grandTotal ? grandTotal.toLocaleString("en-IN") : ""}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </LineItem>

        <LineItem number="6">
          <div>
            <div>Grounds of Refund Claim: (selected from the drop down)</div>
            <ol type="a" style={{ marginTop: "4px", paddingLeft: "28px" }}>
              {GST_RFD01_REFUND_GROUNDS.map((g) => (
                <li key={g} style={{ marginBottom: "2px" }}>
                  {g}
                  {selectedGround === g ? " (Selected)" : ""}
                </li>
              ))}
            </ol>
          </div>
        </LineItem>

        <LineItem number="7">
          <div>
            <div>
              Details of Bank Account <span style={{ fontStyle: "italic" }}>( to be auto populated from RC)</span>
            </div>
            <div style={{ marginTop: "4px", paddingLeft: "24px" }}>
              <div>a. Bank Account Number : {bankAccountNo}</div>
              <div>b. Name of the Bank : {bankName}</div>
              <div>c. Bank Account Type : {bankAccountType}</div>
              <div>d. Name of account holder : {bankAccountHolder}</div>
              <div>e. Address of Bank Branch : {bankBranchAddress}</div>
              <div>f. IFSC : {bankIfsc}</div>
              <div>g. MICR : {bankMicr}</div>
            </div>
          </div>
        </LineItem>

        <LineItem number="8">
          <div>
            Whether Self-Declaration by Applicant u/s....... , If applicable{" "}
            <span style={{ marginLeft: "16px" }}>Yes/No</span>
            <span
              style={{
                display: "inline-block",
                width: "34px",
                height: "22px",
                border: "1px solid #000",
                marginLeft: "10px",
                textAlign: "center",
                lineHeight: "22px",
              }}
            >
              {declarationApplicable === "yes" ? "\u2713" : ""}
            </span>
          </div>
        </LineItem>
      </div>

      <div className="break-before-page" style={{ padding: "0 10mm" }}>
        <div style={{ textAlign: "center", fontWeight: 700, textDecoration: "underline", marginBottom: "12px", fontSize: "16pt" }}>
          Self-Declaration
        </div>
        <p style={{ marginBottom: "10px" }}>{selfDeclarationText}</p>
        <p style={{ marginBottom: "14px" }}>
          (This Declaration is not required to be furnished by applicants, who are claiming refund under sub rule&lt;&gt;
          of the GST Rules&lt;...&gt;.)
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "28px 1fr", columnGap: "12px" }}>
          <div>9.</div>
          <div>
            <div style={{ marginBottom: "6px" }}>Verification</div>
            <p style={{ marginBottom: "18px" }}>
              I/We {verificationName} hereby solemnly affirm and declare that the information given herein above is
              true and correct to the best of my/our knowledge and belief and nothing has been concealed therefrom.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "8px" }}>
              <div>
                <div>Place</div>
                <div style={{ marginTop: "8px" }}>Date</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div>Signature of Authorized Signatory</div>
                <div style={{ marginTop: "8px" }}>({signatoryName})</div>
                <div style={{ marginTop: "8px" }}>Designation/ Status : {designationStatus}</div>
              </div>
            </div>
          </div>
        </div>
        <p style={{ borderTop: "1px solid #000", marginTop: "18px", paddingTop: "4px", fontStyle: "italic" }}>
          <strong>Note:</strong> 1) A separate statement has to be filed under sub-rule (4) of rule 1 of draft Goods
          and Services Tax refund rule.
        </p>
      </div>

      <div className="break-before-page" style={{ padding: "0 4mm" }}>
        <p style={{ marginBottom: "8px", fontStyle: "italic", fontSize: "14pt" }}>
          <strong>Annexure-1</strong> Statement containing the number and date of invoices under &lt;...&gt;of GST Rules,
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11pt" }}>
          <thead>
            <tr>
              <th colSpan={15} style={{ border: "1px solid #000", padding: "4px 6px", fontWeight: 400, textAlign: "center" }}>
                Tax Period: {annexureTaxPeriod || ".............."}
              </th>
            </tr>
            <tr>
              <th rowSpan={2} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>Sr. No.</th>
              <th colSpan={8} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>Details of Invoices</th>
              <th colSpan={2} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>IGST</th>
              <th colSpan={2} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>CGST</th>
              <th colSpan={2} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>SGST</th>
            </tr>
            <tr>
              {["No.", "Date", "UQC", "Qty", "Value", "Goods/Services", "HSN/SAC", "Taxable value", "Rate", "Amt", "Rate", "Amt", "Rate", "Amt"].map((h) => (
                <th key={h} style={{ border: "1px solid #000", padding: "2px 4px", fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {annexureRows.map((r, idx) => (
              <tr key={`rfd01_annex_row_${idx}`}>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{idx + 1}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.invoiceNo, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.invoiceDate, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.uqc, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.quantity, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.value, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.goodsServices, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.hsnSac, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.taxableValue, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.igstRate, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.igstAmt, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.cgstRate, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.cgstAmt, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.sgstRate, "")}</td>
                <td style={{ border: "1px solid #000", padding: "2px 4px" }}>{asText(r?.sgstAmt, "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="break-before-page" style={{ padding: "0 10mm" }}>
        <div style={{ textAlign: "center", marginTop: "40mm", marginBottom: "14px", fontSize: "18pt", fontWeight: 700 }}>
          Annexure-2
        </div>
        <div style={{ textAlign: "center", fontSize: "16pt", fontWeight: 700, textDecoration: "underline", marginBottom: "18px" }}>
          Certificate
        </div>
        <p style={{ marginBottom: "18px" }}>
          This is to certify that the refund amounting to INR &lt;&lt; {refundAmountInr} &gt;&gt; {refundAmountWords} (in
          word) claimed by M/s {applicantName} (Applicant&apos;s Name) GSTIN-{gstin} for the tax period {annexureTaxPeriod},
          the incidence of tax and interest as claimed by the applicant, has not been passed on to any other person.
          This certificate is based on the examination of the Books of Accounts and other relevant particulars
          maintained by the applicant.
        </p>
        <div style={{ marginBottom: "8px" }}>Signature of the Chartered Accountant/ Cost Accountant:</div>
        <div style={{ marginBottom: "8px" }}>Name: {asText(ca?.name, "____________")}</div>
        <div style={{ marginBottom: "8px" }}>Membership Number: {asText(ca?.membership_no, "____________")}</div>
        <div style={{ marginBottom: "8px" }}>Place: {place}</div>
        <div style={{ marginBottom: "8px" }}>Date: {date}</div>

        <p style={{ marginTop: "12px" }}>
          This Declaration is not required to be furnished by applicants, who are claiming refund under sub-section&lt;&gt;of
          section&lt;&gt; of the Act
        </p>
        <p style={{ marginTop: "10px", fontStyle: "italic" }}>
          <strong>Note:</strong> The certificate is to be filed by applicants wherever applicable.
        </p>
      </div>
    </div>
  );
}

function LiquidAssets45IBCertificateView({ cert }) {
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const formData = cert?.data?.extras?.formData || {};

  const asText = (value, fallback = "") => {
    const trimmed = String(value || "").trim();
    return trimmed || fallback;
  };
  const toNumber = (value) => {
    const n = Number(String(value || "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const amountInputUnitLabel = "Rupees";
  const unitDivisor = 10000000;
  const toInputUnitValueFromCrore = (croreValue) => {
    if (croreValue === null || croreValue === undefined) return null;
    return croreValue * unitDivisor;
  };
  const formatNumericOnly = (value) => {
    if (value === null || value === undefined) return "__________";
    const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    return rounded.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  };
  const parseInputToCroreOrNull = (value) => {
    const raw = asText(value, "");
    if (!raw) return null;
    return toNumber(raw) / unitDivisor;
  };

  const displayName = asText(
    formData?.companyName || getDisplayName(cert?.entityType, identity),
    "__________________"
  );
  const constitution = ENTITY_LABELS[cert?.entityType] || "__________________";
  const registrationNo = asText(
    formData?.certificateOfRegistrationNo || identity?.reg_no,
    "__________"
  );
  const cinValue = asText(formData?.cin || identity?.cin, "");
  const panValue = asText(formData?.pan || identity?.pan, "");
  const gstinValue = asText(formData?.gstin || identity?.gstin, "");
  const registeredOfficeAddress = asText(
    formData?.registeredOfficeAddress || identity?.address,
    "[Registered Office Address]"
  );
  const secondPrecedingQuarterDate = asText(
    formData?.secondPrecedingQuarterDate || formData?.date || meta?.date,
    "__________"
  );
  const secondPrecedingQuarterDateDisplay =
    formatDDMMYYYY(secondPrecedingQuarterDate) || "__________";
  const asOnDate = asText(
    formData?.asOnDate || formData?.secondPrecedingQuarterDate || formData?.date || meta?.date,
    "__________"
  );
  const asOnDateDisplay = formatDDMMYYYY(asOnDate) || "__________";

  const publicDepositsOutstandingCrore = parseInputToCroreOrNull(formData?.publicDepositsOutstanding);
  const requiredPercentage = asText(formData?.requiredPercentage, "___");

  const requiredLiquidAssetsCrore = (() => {
    const direct = parseInputToCroreOrNull(formData?.requiredLiquidAssets);
    if (direct !== null) return direct;
    if (publicDepositsOutstandingCrore === null) return null;
    const pct = toNumber(formData?.requiredPercentage);
    if (!pct) return null;
    return (publicDepositsOutstandingCrore * pct) / 100;
  })();

  const cashInHandCrore = parseInputToCroreOrNull(formData?.cashInHand);
  const bankBalancesScheduledCrore = parseInputToCroreOrNull(formData?.bankBalancesScheduled);
  const unencumberedApprovedSecuritiesCrore = parseInputToCroreOrNull(formData?.unencumberedApprovedSecurities);
  const otherEligibleLiquidAssetsCrore = parseInputToCroreOrNull(formData?.otherEligibleLiquidAssets);

  const totalLiquidAssetsCrore = (() => {
    const direct = parseInputToCroreOrNull(formData?.totalLiquidAssets);
    if (direct !== null) return direct;
    const items = [
      cashInHandCrore,
      bankBalancesScheduledCrore,
      unencumberedApprovedSecuritiesCrore,
      otherEligibleLiquidAssetsCrore,
    ];
    if (items.every((v) => v === null)) return null;
    return items.reduce((acc, value) => acc + (value || 0), 0);
  })();

  const complianceStatus = (() => {
    const direct = asText(formData?.complianceStatus, "");
    if (direct) return direct;
    if (!requiredLiquidAssetsCrore) return "Required";
    return (totalLiquidAssetsCrore || 0) >= requiredLiquidAssetsCrore
      ? "Complied"
      : "Not Complied";
  })();
  const hasMaintained = complianceStatus === "Complied";

  const purpose = asText(meta?.purpose || formData?.purpose, "");
  const place = asText(meta?.place, "");
  const date = asText(meta?.date, "");
  const firm = asText(ca?.firm, "");
  const frn = asText(ca?.frn, "");
  const caName = asText(ca?.name, "");
  const membershipNo = asText(ca?.membership_no, "");
  const udin = asText(ca?.udin, "");

  const publicDepositsInputValue = toInputUnitValueFromCrore(publicDepositsOutstandingCrore);
  const requiredInputValue = toInputUnitValueFromCrore(requiredLiquidAssetsCrore);
  const totalInputValue = toInputUnitValueFromCrore(totalLiquidAssetsCrore);
  const cashInputValue = toInputUnitValueFromCrore(cashInHandCrore);
  const bankInputValue = toInputUnitValueFromCrore(bankBalancesScheduledCrore);
  const securitiesInputValue = toInputUnitValueFromCrore(unencumberedApprovedSecuritiesCrore);
  const otherInputValue = toInputUnitValueFromCrore(otherEligibleLiquidAssetsCrore);

  return (
    <div>
      <div className="certificate-title">CERTIFICATE OF MAINTENANCE OF LIQUID ASSETS</div>

      <div className="text-center mb-4">
        <p className="certificate-subtitle" style={{ fontSize: "11pt", marginBottom: "4mm" }}>
          (Pursuant to Section 45-IB of the Reserve Bank of India Act, 1934)
        </p>
      </div>

      <div className="certificate-body">
        <div className="rounded-xl border border-dashed p-3 mb-3">
          <div className="font-bold">Identification</div>
          <div className="mt-2">
            {displayName}
            {!isBlank(cinValue) && <span><br /> CIN: {cinValue}</span>}
            {!isBlank(panValue) && <span><br /> PAN: {panValue}</span>}
            {!isBlank(gstinValue) && <span><br /> GSTIN: {gstinValue}</span>}
          </div>
          {!isBlank(registeredOfficeAddress) && (
            <div className="mt-1 ">Address: {registeredOfficeAddress}</div>
          )}
          <div className="mt-1">
            <span className="font-bold">Constitution:</span> {constitution}
          </div>
        </div>

        <p className="mt-3">
          We have examined the books of account, records and other relevant documents of{" "}
          <strong>{displayName}</strong>, having RBI Registration No.{" "}
          <strong>{registrationNo}</strong>, for the purpose of certifying compliance with the
          provisions of Section 45-IB of the Reserve Bank of India Act, 1934 and the applicable
          directions issued by the Reserve Bank of India.
        </p>

        <p>
          Based on our examination and according to the information and explanations given to us,
          we hereby certify that:
        </p>
        <p className="mt-3"><strong>Public Deposits Outstanding ({amountInputUnitLabel})</strong></p>
        <p>
          The total amount of public deposits outstanding as at the close of business on the last
          working day of the second preceding quarter, i.e., as on {secondPrecedingQuarterDateDisplay}, was:
        </p>
        <p><strong>Rs. {formatNumericOnly(publicDepositsInputValue)}</strong></p>

        <p className="mt-3"><strong>Minimum Liquid Assets Required ({amountInputUnitLabel})</strong></p>
        <p>
          The minimum liquid assets required to be maintained (being {requiredPercentage}% of
          public deposits as applicable) amounted to:
        </p>
        <p><strong>Rs. {formatNumericOnly(requiredInputValue)}</strong></p>

        <p className="break-before-page mt-3"><strong>Liquid Assets Actually Maintained as on {asOnDateDisplay}</strong></p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="certificate-table compact">
          <thead>
            <tr>
              <th style={{ width: "65%", textAlign: "left" }}>Particulars</th>
              <th style={{ textAlign: "left" }}>Amount ({amountInputUnitLabel})</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "left" }}>Cash in Hand</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(cashInputValue)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Balance in Current Account with Scheduled Banks</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(bankInputValue)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Unencumbered Approved Securities</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(securitiesInputValue)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}>Other Eligible Liquid Assets (if any)</td>
              <td style={{ textAlign: "left" }}>Rs. {formatNumericOnly(otherInputValue)}</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left" }}><strong>Total Liquid Assets Maintained</strong></td>
              <td style={{ textAlign: "left" }}><strong>Rs. {formatNumericOnly(totalInputValue)}</strong></td>
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
          liquid assets as prescribed under the Act as at {asOnDateDisplay}.
        </p>

        <p className="mt-3"><strong>Restriction on Use</strong></p>
        <p>
          This certificate is issued at the request of the Company for{" "}
          {purpose || "submission to the Reserve Bank of India"} and should not be used for any
          other purpose without our prior written consent.
        </p>
      </div>

      <div className="certificate-signature mt-2 font-bold">
        <div className="signature-left">
          <p><strong>Date:</strong> {date || "__________"}</p>
          <p><strong>Place:</strong> {place || "__________"}</p>
        </div>

        <div className="signature-right">
          <p>For {firm || "[Name of CA Firm]"}</p>
          <p>Chartered Accountants</p>
          <p>FRN.: {frn || "__________"}</p>
          <p className="mt-8"></p>
          <p>{caName || "__________"}</p>
          <p>Membership No.: {membershipNo || "__________"}</p>
          <p>UDIN: {udin || "__________"}</p>
        </div>
      </div>
    </div>
  );
}

function RbiNbfcCertificateView({ cert }) {
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const formData = cert?.data?.extras?.formData || {};
  const rowsRaw = cert?.data?.tables?.main?.rows || [];

  const asText = (value, fallback = "NA") => {
    const trimmed = String(value || "").trim();
    return trimmed || fallback;
  };

  const optionWithValue = (optionText, value) => {
    const v = String(value || "").trim();
    return v ? `${optionText} ${v}` : optionText;
  };
  const abAnswer = (prefix, value) => {
    const v = String(value || "").trim();
    return `${prefix} ${v || "NA"}`;
  };

  const buildRowsFromForm = (form, fallbackIdentity) => {
    const companyName = asText(form?.companyName || fallbackIdentity?.company_name, "__________________");
    return [
      ["1", "Name of the company", companyName],
      ["2", "Certificate of Registration No.", asText(form?.certificateOfRegistrationNo)],
      ["3", "Registered office Address", asText(form?.registeredOfficeAddress)],
      ["4", "Corporate office Address", asText(form?.corporateOfficeAddress)],
      [
        "5",
        "The company has been classified by RBI as:\n(Investment Company / Loan Company / AFC / NBFC-MFI / NBFC-Factor / IFC / IDF-NBFC)",
        asText(form?.rbiClassification),
      ],
      [
        "6",
        "Net Owned Fund (in ` Crore)\n(Calculation of the same is given in the Annex)",
        asText(form?.netOwnedFund),
      ],
      ["7", "Total Assets (in ` Crore)", asText(form?.totalAssets)],
      [
        "8",
        "Asset-Income pattern:\n(in terms of RBI Press Release 1998-99/1269 dated April 8, 1999)\n(NBFC-Factor / NBFC-MFI / AFC / IFC may also report separately below)",
        [
          abAnswer("a) % of Financial Assets to Total Assets:", form?.financialAssetsPct),
          abAnswer("b) % of Financial Income to Gross Income:", form?.financialIncomePct),
        ].join("\n"),
      ],
      [
        "9",
        "Whether the company was holding any\nPublic Deposits, as on March 31, ____?\n\nIf Yes, the amount in ` Crore",
        [
          optionWithValue("(Yes/No)", form?.publicDepositsHeld),
          form?.publicDepositsAmount ? `If Yes, amount in \` Crore: ${form.publicDepositsAmount}` : "",
        ].join("\n"),
      ],
      [
        "10",
        "Has the company transferred a sum not\nless than 20% of its Net Profit for the year\nto Reserve Fund?\n\n(in terms of Sec 45-IC of the RBI Act, 1934).",
        optionWithValue("(Yes/No/NA)", form?.reserveFundTransferStatus),
      ],
      [
        "11",
        "Has the company received any FDI?\n\nIf Yes, did the company comply with the\nminimum capitalization norms for the FDI?",
        [
          optionWithValue("(Yes/No)", form?.fdiReceived),
          form?.fdiCapitalizationCompliance
            ? `If Yes, compliance: ${form.fdiCapitalizationCompliance}`
            : "",
        ].join("\n"),
      ],
      [
        "12",
        "If the company is classified as an NBFC-\nFactor;\n\na) % of Factoring Assets to Total Assets\n\nb) % of Factoring Income to Gross Income",
        [
          abAnswer("a)", form?.nbfcFactorAssetsPct),
          abAnswer("b)", form?.nbfcFactorIncomePct),
        ].join("\n"),
      ],
      [
        "13",
        "If the company is classified as an NBFC-\nMFI;\n\n% of Qualifying Assets to Net Assets\n\n(refer to Notification DNBS.PD.No.234 CGM\n(US) 2011 dated December 02, 2011)",
        asText(form?.nbfcMfiQualifyingAssetsPct),
      ],
      [
        "14",
        "If the company is classified as an AFC;\n\na) % of Advances given for creation of\nphysical / real assets supporting economic\nactivity to Total Assets\n\nb) % of income generated out of these\nassets to Total Income",
        [
          abAnswer("a)", form?.afcPhysicalAssetsPct),
          abAnswer("b)", form?.afcIncomeFromPhysicalAssetsPct),
        ].join("\n"),
      ],
      [
        "15",
        "If the company is classified as an NBFC-\nIFC\n\n% of Infrastructure Loans to Total Assets",
        asText(form?.infrastructureLoansPct),
      ],
      [
        "16",
        "Has there been any takeover/acquisition of\ncontrol/ change in shareholding/\nManagement during the year which\nrequired prior approval from RBI?\n\n(please refer to DNBR (PD) CC. No.\n065/03.10.001/2015-16 dated July 09, 2015 on\nthe subject for details)",
        [
          optionWithValue("(Yes/No)", form?.takeoverChangeStatus),
          "If yes, please specify.",
          String(form?.takeoverChangeDetails || "").trim(),
        ].join("\n"),
      ],
    ];
  };

  const fallbackRows = Array.isArray(rowsRaw)
    ? rowsRaw.map((r) => [
      String(r?.[0] ?? ""),
      String(r?.[1] ?? ""),
      String(r?.[2] ?? ""),
    ])
    : [];

  const hasFormData = Object.keys(formData || {}).length > 0;
  const rows = hasFormData ? buildRowsFromForm(formData, identity) : (fallbackRows.length ? fallbackRows : buildRowsFromForm({}, identity));
  const displayName = asText(formData?.companyName || getDisplayName(cert?.entityType, identity), "__________________");
  const financialYearEnd = asText(formData?.financialYearEnd, "March 31, 20____");
  const boardReportMade = String(formData?.boardReportMade || "").trim().toLowerCase() !== "no";
  const para5Understood = String(formData?.para5Understood || "").trim().toLowerCase() !== "no";
  const place = meta?.place || "";
  const date = meta?.date || "";
  const firm = ca?.firm || "";
  const frn = ca?.frn || "";
  const caName = ca?.name || "";
  const membershipNo = ca?.membership_no || "";
  const udin = ca?.udin || "";
  const annexVal = (value) => asText(value, "");
  const dNbrLink = "https://rbi.org.in/Scripts/NotificationUser.aspx?Id=9934&Mode=0";
  const row16Particulars = (
    <>
      Has there been any takeover/acquisition of
      <br />
      control/ change in shareholding/
      <br />
      Management during the year which
      <br />
      required prior approval from RBI?
      <br />
      <br />
      (please refer to{" "}
      <a
        href={dNbrLink}
        target="_blank"
        rel="noreferrer"
        style={{ color: "#0000EE", textDecoration: "underline" }}
      >
        DNBR (PD) CC. No. 065/03.10.001/2015-16 dated July 09, 2015
      </a>{" "}
      on the subject for details)
    </>
  );
  const annexTotal6And7 = (() => {
    const keys = [
      "annexInvestmentSameGroup",
      "annexInvestmentSubsidiaries",
      "annexInvestmentWhollyOwnedSubsidiaries",
      "annexInvestmentOtherNbfcs",
      "annexBookValueSameGroup",
      "annexBookValueSubsidiaries",
      "annexBookValueWhollyOwnedSubsidiariesJvAbroad",
    ];
    const hasAnyValue = keys.some((key) => String(formData?.[key] || "").trim());
    if (!hasAnyValue) return annexVal(formData?.annexTotal6And7);

    const total = keys.reduce((sum, key) => {
      const raw = String(formData?.[key] || "").replace(/,/g, "").trim();
      const n = Number(raw);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    const rounded = Math.round((total + Number.EPSILON) * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  })();

  return (
    <div>
      <div className="certificate-title">STATUTORY AUDITORS&apos; CERTIFICATE (SAC)</div>

      <div className="text-center mb-4">
        <p className="certificate-subtitle">(On the letter head of the Statutory Auditors of the company)</p>
      </div>

      <div className="certificate-body">
        <p className="leading-6">
          We have examined the books of accounts and other records of{" "}
          <strong>{displayName}</strong> for the financial year ending{" "}
          <strong>{financialYearEnd}</strong>. On the basis of the information submitted to us,
          we certify the following:
        </p>
        <p className="mt-2">(Write NA whichever is not applicable)</p>

        <div className=" overflow-x-auto">
          <table className="certificate-table compact sac-main-table">
            <thead>
              <tr>
                <th style={{ width: "10%" }}>Sl. No.</th>
                <th style={{ width: "50%", textAlign: "center" }}>Particulars</th>
                <th style={{ textAlign: "center" }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row[0] || String(idx + 1)}</td>
                  <td
                    className="whitespace-pre-wrap"
                    style={{ textAlign: "left", verticalAlign: "middle" }}
                  >
                    {String(row[0]) === "16" ? row16Particulars : (row[1] || "-")}
                  </td>
                  <td
                    className="whitespace-pre-wrap"
                    style={{ textAlign: "left", verticalAlign: "middle" }}
                  >
                    {row[2] || "NA"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-2">
          In terms of paragraph 2 of Notification No. DNBS.201/DG(VL)-2008 dated September 18, 2008, a separate report to the Board of Directors of the company has{" "}
          {boardReportMade ? "been made." : "not been made."}
        </p>
        <p className="">
          I {para5Understood ? "have" : "have not"} read and understood paragraph 5 of Notification No. DNBS.201/DG(VL)-2008 dated September 18, 2008.
        </p>
      </div>

      <div className="mt-4">
        <p>
          <strong>Signature and Stamp of the Statutory Auditor:</strong>
        </p>
        <div className="certificate-signature font-bold">
          <div className="signature-left">
            <p><strong>Place:</strong> {place || "__________"}</p>
            <p><strong>Date:</strong> {date || "__________"}</p>
          </div>

          <div className="signature-right">
            <p>For {firm || "__________ & Co."}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {frn || "__________"}</p>
            <p>{caName || "__________"}</p>
            <p>Partner</p>
            <p>M.No. {membershipNo || "__________"}</p>
            <p>UDIN: {udin || "_________________________"}</p>
          </div>
        </div>

      </div>

      <div className="mt-6 break-before-page">
        <div className="certificate-title">Annex</div>
        <div className="overflow-x-auto">
          <table className="certificate-table compact sac-annex-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}></th>
                <th style={{ width: "64%", textAlign: "left" }}>Capital Funds - Tier I</th>
                <th style={{ width: "28%" }} className="text-right italic">(₹ In crore)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1.</td>
                <td>Paid up Equity Capital</td>
                <td>{annexVal(formData?.annexPaidUpEquityCapital)}</td>
              </tr>
              <tr>
                <td>2.</td>
                <td>Pref. shares to be compulsorily converted into equity</td>
                <td>{annexVal(formData?.annexPrefSharesCompulsorilyConvertible)}</td>
              </tr>
              <tr>
                <td rowSpan={8} className="align-top">3.</td>
                <td>Free Reserves:</td>
                <td></td>
              </tr>
              <tr>
                <td>a. General Reserve</td>
                <td>{annexVal(formData?.annexGeneralReserve)}</td>
              </tr>
              <tr>
                <td>b. Share Premium</td>
                <td>{annexVal(formData?.annexSharePremium)}</td>
              </tr>
              <tr>
                <td>c.&nbsp; Capital Reserves</td>
                <td>{annexVal(formData?.annexCapitalReserves)}</td>
              </tr>
              <tr>
                <td>d. Debenture Redemption Reserve</td>
                <td>{annexVal(formData?.annexDebentureRedemptionReserve)}</td>
              </tr>
              <tr>
                <td>e. Capital Redemption Reserve</td>
                <td>{annexVal(formData?.annexCapitalRedemptionReserve)}</td>
              </tr>
              <tr>
                <td>f. Credit Balance in&nbsp; P&amp;L Account</td>
                <td>{annexVal(formData?.annexCreditBalancePL)}</td>
              </tr>
              <tr>
                <td>g. Other free reserves (may be specified)</td>
                <td>{annexVal(formData?.annexOtherFreeReserves)}</td>
              </tr>
              <tr>
                <td>4.</td>
                <td>Special Reserves</td>
                <td>{annexVal(formData?.annexSpecialReserves)}</td>
              </tr>
              <tr>
                <td></td>
                <td>Total of 1 to 4</td>
                <td>{annexVal(formData?.annexTotal1To4)}</td>
              </tr>
              <tr>
                <td>5.</td>
                <td><strong>Less:</strong> i. Accumulated balance of loss</td>
                <td>{annexVal(formData?.annexAccumulatedBalanceLoss)}</td>
              </tr>
              <tr>
                <td></td>
                <td>ii. Deferred Revenue Expenditure</td>
                <td>{annexVal(formData?.annexDeferredRevenueExpenditure)}</td>
              </tr>
              <tr>
                <td></td>
                <td>ii. Deferred Tax Assets (Net)</td>
                <td>{annexVal(formData?.annexDeferredTaxAssetsNet)}</td>
              </tr>
              <tr>
                <td></td>
                <td>iii. Other intangible Assets</td>
                <td>{annexVal(formData?.annexOtherIntangibleAssets)}</td>
              </tr>
              <tr>
                <td></td>
                <td><strong>Owned Fund</strong></td>
                <td>{annexVal(formData?.annexOwnedFund)}</td>
              </tr>
              <tr>
                <td rowSpan={5} className="break-before-page align-top">6.</td>
                <td>Investment in shares of</td>
                <td></td>
              </tr>
              <tr>
                <td>(i) Companies in the same group</td>
                <td>{annexVal(formData?.annexInvestmentSameGroup)}</td>
              </tr>
              <tr>
                <td>(ii) Subsidiaries</td>
                <td>{annexVal(formData?.annexInvestmentSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iii) Wholly Owned Subsidiaries</td>
                <td>{annexVal(formData?.annexInvestmentWhollyOwnedSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iv) Other NBFCs</td>
                <td>{annexVal(formData?.annexInvestmentOtherNbfcs)}</td>
              </tr>
              <tr>
                <td rowSpan={3} className="align-top">7.</td>
                <td className="whitespace-pre-wrap">Book value of debentures, bonds  outstanding loans and advances, bills purchased and is counted{"\n"}(including H.P. and lease finance) made to, and deposits with{"\n"}(i) Companies in the same group</td>
                <td>{annexVal(formData?.annexBookValueSameGroup)}</td>
              </tr>
              <tr>
                <td>(ii) Subsidiaries</td>
                <td>{annexVal(formData?.annexBookValueSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iii) Wholly Owned Subsidiaries/Joint Ventures Abroad</td>
                <td>{annexVal(formData?.annexBookValueWhollyOwnedSubsidiariesJvAbroad)}</td>
              </tr>
              <tr>
                <td>8.</td>
                <td>Total of 6 and 7</td>
                <td>{annexTotal6And7}</td>
              </tr>
              <tr>
                <td>9.</td>
                <td>Amount in item 8 in excess of 10% of Owned Fund</td>
                <td>{annexVal(formData?.annexExcessOver10PercentOwnedFund)}</td>
              </tr>
              <tr>
                <td>10.</td>
                <td><strong>Net Owned Fund</strong></td>
                <td>{annexVal(formData?.annexNetOwnedFund || formData?.netOwnedFund)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-2 certificate-signature font-bold">
          <div className="signature-left">
            <p><strong>Place:</strong> {place || "__________"}</p>
            <p><strong>Date:</strong> {date || "__________"}</p>
          </div>

          <div className="signature-right">
            <p>For {firm || "__________ & Co."}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {frn || "__________"}</p>
            <p className="mt-2">{caName || "__________"}</p>
            <p>Partner</p>
            <p>M.No. {membershipNo || "__________"}</p>
            <p>UDIN: {udin || "_________________________"}</p>
          </div>
        </div>

      </div>
    </div>
  );
}

function NetWorthCertificateView({ cert }) {
  const entityType = cert?.entityType;
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const tables = cert?.data?.tables || {};
  const extras = cert?.data?.extras || {};

  const isPersonal = entityType === "PERSONAL";

  const displayName = getDisplayName(entityType, identity) || "__________________";
  const constitution = ENTITY_LABELS[entityType] || "__________________";

  const purpose = meta?.purpose || "";
  const place = meta?.place || "";
  const date = meta?.date || "";
  const asOn = meta?.as_on_date || "";

  const firm = ca?.firm || "";
  const frn = ca?.frn || "";
  const caName = ca?.name || "";
  const membershipNo = ca?.membership_no || "";
  const udin = ca?.udin || "";

  const scheduleA = tables?.scheduleA || {};
  const scheduleB = tables?.scheduleB || {};
  const scheduleC = tables?.scheduleC || {};
  const isAssessee =
    entityType === "PERSONAL" || entityType === "PROPRIETORSHIP";

  const aTotal = sumScheduleAmount(scheduleA?.rows);
  const bTotal = sumScheduleAmount(scheduleB?.rows);
  const cTotal = sumScheduleAmount(scheduleC?.rows);
  const netWorth = aTotal + bTotal - cTotal;
  function ScheduleWithTotal({ title, table }) {
    const rows = Array.isArray(table?.rows) ? table.rows : [];

    const total = sumScheduleAmount(rows);

    return (
      <div className="table-page-block">
        {/* Schedule Title */}
        <div className="certificate-title">
          {title}
        </div>

        {/* Schedule Table */}
        <UniversalTableView table={table} />

        {/* TOTAL ROW (SEPARATE, CLEAR, AUDIT-FRIENDLY) */}
        <table className="certificate-table compact mt-2">
          <tbody>
            <tr>
              <td className="font-bold" style={{ width: "85%" }}>
                Total – {title}
              </td>
              <td className="text-right font-bold">
                {formatINR(total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  // ✅ VISA / FX DATA (SAVED SNAPSHOT)
  const visa = extras?.visa;
  const isVisa = Boolean(visa?.currency && visa?.rate);
  const visaCurrency = visa?.currency;
  const visaRate = visa?.rate;

  const convert = (n) =>
    isVisa ? (Number(n) * visaRate).toFixed(2) : null;

  const identityLine = [
    displayName,
    identity?.pan ? `PAN: ${identity.pan}` : "",
    identity?.cin ? `CIN: ${identity.cin}` : "",
    identity?.gstin ? `GSTIN: ${identity.gstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const personalLine = getPersonalLineFromCert(cert);

  return (
    <div>
      <div className="mt-3 certificate-title">NET WORTH CERTIFICATE</div>

      <div className="text-center mb-2">
        <p className="certificate-subtitle">TO WHOM IT MAY CONCERN</p>
      </div>

      <div className="certificate-body">
        {isPersonal ? (
          <p className="leading-6">
            This is to certify that, based on the documents, records, and information produced before us
            for verification, we have computed the <b>Net Worth</b> of{" "}
            <b>{personalLine}</b> as on <b>{asOn || "__________"}</b>, as under.
          </p>
        ) : (
          <>
            <p className="leading-6">
              This is to certify that, based on the documents, records, and audited financial statements
              produced before us for verification, in respect of the entity:
            </p>

            <div className="mt-3 rounded-xl border border-dashed p-3">
              <div className="font-bold">Identification</div>
              <div className="mt-2 text-sm">{identityLine || "__________"}</div>
              {identity?.address && (
                <div className="mt-1 text-sm">Address: {identity.address}</div>
              )}
              <div className="mt-2 text-sm">
                <span className="font-bold">Constitution:</span> {constitution}
              </div>
            </div>

            <p className="mt-3 leading-6">
              We have computed the <b>Net Worth</b> of the above{" "}
              <b>{isAssessee ? "assessee" : "entity"}</b> as on{" "}
              <b>{asOn || "__________"}</b>, as under.
            </p>
          </>
        )}

        {/* ================= SUMMARY TABLE ================= */}
        <div className="mt-3 overflow-x-auto">
          <table className="certificate-table compact">
            <thead>
              <tr>
                <th className="text-center" style={{ width: "10%" }}>SR. NO.</th>
                <th className="text-center">PARTICULARS</th>
                <th className="text-center" style={{ width: "20%" }}>AMOUNT (₹)</th>
                {isVisa && (
                  <th className="text-center" style={{ width: "20%" }}>
                    AMOUNT ({visaCurrency})
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1</td>
                <td>Movable / Current Assets (Schedule A)</td>
                <td className="text-right">{formatINR(aTotal)}</td>
                {isVisa && <td className="text-right">{convert(aTotal)}</td>}
              </tr>
              <tr>
                <td className="text-center">2</td>
                <td>Immovable / Non-Current Assets (Schedule B)</td>
                <td className="text-right">{formatINR(bTotal)}</td>
                {isVisa && <td className="text-right">{convert(bTotal)}</td>}
              </tr>
              <tr>
                <td className="text-center">3</td>
                <td>Liabilities (Schedule C)</td>
                <td className="text-right">{formatINR(cTotal)}</td>
                {isVisa && <td className="text-right">{convert(cTotal)}</td>}
              </tr>
              <tr>
                <td />
                <td className="font-bold">NET WORTH (A + B − C)</td>
                <td className="text-right font-bold">{formatINR(netWorth)}</td>
                {isVisa && (
                  <td className="text-right font-bold">
                    {convert(netWorth)}
                  </td>
                )}
              </tr>
            </tbody>
          </table>

          {isVisa && (
            <p className="text-center mt-2 text-xs italic">
              Foreign currency equivalents are computed at exchange rate
              1 INR = {visaRate} {visaCurrency}, prevailing on the date of the certificate.
            </p>
          )}
        </div>

        <p className="mt-2 leading-6">
          This certificate is issued at the specific request of the{" "}
          <b>{isAssessee ? "assessee" : "entity"}</b> for the purpose of{" "}
          <strong>{purpose || "______________"}</strong> only.
        </p>

        {/* ================= SIGNATURE ================= */}
        <div className="mt-3 certificate-signature font-bold">
          <div className="signature-left">
            <p><strong>Place:</strong> {place || "__________"}</p>
            <p><strong>Date:</strong> {date || "__________"}</p>
          </div>

          <div className="signature-right">
            <p>For {firm || "__________ & Co."}</p>
            <p>Chartered Accountants</p>
            <p>FRN: {frn || "__________"}</p>
            <p className="mt-8">{caName || "__________"}</p>
            <p>Partner</p>
            <p>M.No. {membershipNo || "__________"}</p>
            <p>UDIN: {udin || "_________________________"}</p>
          </div>
        </div>

        {/* ================= SCHEDULES ================= */}
        <div className="break-before-page">
          <ScheduleWithTotal
            title={scheduleA?.title || "Movable / Current Assets (Schedule A)"}
            table={scheduleA}
          />
        </div>

        <PageBreakBlock
          title={scheduleB?.title || "Immovable / Non-Current Assets (Schedule B)"}
        >
          <ScheduleWithTotal
            title={scheduleB?.title || "Immovable / Non-Current Assets (Schedule B)"}
            table={scheduleB}
          />
        </PageBreakBlock>

        <PageBreakBlock
          title={scheduleC?.title || "Liabilities (Schedule C)"}
        >
          <ScheduleWithTotal
            title={scheduleC?.title || "Liabilities (Schedule C)"}
            table={scheduleC}
          />
        </PageBreakBlock>
      </div>
    </div>
  );
}

function UtilizationCertificateView({ cert }) {
  const entityType = cert?.entityType;
  const identity = cert?.identity || {};
  const meta = cert?.meta || {};
  const ca = cert?.ca || {};
  const tables = cert?.data?.tables || {};
  const extras = cert?.data?.extras || {};

  const displayName = getDisplayName(entityType, identity) || "__________";
  const constitution = ENTITY_LABELS[entityType] || "__________";

  const grantDetails = extras?.grantDetails || {};
  const balanceTreatment = extras?.balanceTreatment || {};
  const period = extras?.period || {};
  const grantType = extras?.grantType || "PURPOSE_RESTRICTED";

  const purpose = meta?.purpose || "";
  const place = meta?.place || "";
  const date = meta?.date || "";

  const firm = ca?.firm || "";
  const frn = ca?.frn || "";
  const caName = ca?.name || "";
  const membershipNo = ca?.membership_no || "";
  const udin = ca?.udin || "";

  const paymentDetails = tables?.paymentDetails || {};
  const purposeWise = tables?.purposeWise || {};

  const isPurposeRestricted = grantType === "PURPOSE_RESTRICTED";

  /* ================== CALCULATIONS (SINGLE SOURCE OF TRUTH) ================== */

  const paymentRows = Array.isArray(paymentDetails?.rows)
    ? paymentDetails.rows
    : [];

  const totalReceived = paymentRows.reduce((sum, r) => {
    const amt = Number((r?.[3] || "0").toString().replace(/,/g, ""));
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const purposeRows = Array.isArray(purposeWise?.rows)
    ? purposeWise.rows
    : [];

  const totalUtilised =
    grantType === "PURPOSE_RESTRICTED"
      ? purposeRows.reduce((sum, r) => {
        const amt = Number(
          (r?.[2] || "0").toString().replace(/,/g, "")
        );
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0)
      : Number(
        (extras?.form?.totalUtilised || "0")
          .toString()
          .replace(/,/g, "")

      ) || 0;

  const closingBalance = totalReceived - totalUtilised;
  const observations = extras?.form?.observations || {};

  const observationList = [];

  if (observations.cashBook) observationList.push("Cash Book");
  if (observations.vouchers) observationList.push("Vouchers Checking");
  if (observations.guidelines)
    observationList.push("Guidelines issued by the Funding Agency");
  if (observations.bankStatement) observationList.push("Bank Statement");
  if (observations.receipt) observationList.push("Receipt");

  if (observations.other && observations.otherText?.trim()) {
    observationList.push(observations.otherText.trim());
  }

  const observationText =
    observationList.length > 0
      ? observationList.join(", ")
      : "relevant books of accounts and records";

  /* ================== IDENTITY LINE ================== */
  const isCollege = entityType === "COLLEGE";
  const sanctioned = Number(grantDetails?.amountSanctioned || 0);

  const identityLine = [
    displayName,
    identity?.pan ? `PAN: ${identity.pan}` : "",
    identity?.cin ? `CIN: ${identity.cin}` : "",
    identity?.gstin ? `GSTIN: ${identity.gstin}` : "",
    identity?.reg_no ? `Reg. No: ${identity.reg_no}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
  if (isCollege) {
    return (
      <div>
        <div className="text-center">
          <div className="certificate-title text-lg font-bold">
            {displayName}
          </div>

          <div className="text-sm">
            {identity?.address || "__________"}
          </div>

          {identity?.cin && (
            <div className="text-sm font-semibold mt-1">
              College Code : {identity.cin}
            </div>
          )}

          <div className="certificate-title">
            UTILISATION CERTIFICATE
          </div>
        </div>

        {/* BODY */}
        <div className="mt-2 certificate-body text-sm leading-7">
          <p>
            This is to certify that an amount of{" "}
            <strong>₹ {formatINR(sanctioned)}</strong>{" "}
            (Rupees <b>{amountToWords(sanctioned)}</b> Only) was duly sanctioned and
            released in favour of{" "}
            <strong>{displayName}, {identity?.address || "__________"}</strong> by{" "}
            <strong>{grantDetails?.grantingAuthority || "__________"}</strong>
            {grantDetails?.sanctionRefNo && (
              <> vide sanction letter bearing reference no. <strong>{grantDetails.sanctionRefNo}</strong></>
            )}
            {grantDetails?.sanctionDate && (
              <> dated <strong>{grantDetails.sanctionDate}</strong></>
            )}, for the period from{" "}
            <strong>{period?.from}</strong> to{" "}
            <strong>{period?.to}</strong>, towards the purpose of{" "}
            <strong>{purpose || "__________"}</strong>.
          </p>


          {/* PAYMENT TABLE */}
          <div className="certificate-section">
            <div className="mt-2">
              PAYMENT / RECEIPT DETAILS
            </div>
            <table className="certificate-table compact">
              <thead>
                <tr>
                  <th style={{ width: "13%", textAlign: "center" }}>Date</th>
                  <th style={{ width: "15%", textAlign: "center" }}>Mode</th>
                  <th>Bank / Transaction Details</th>
                  <th style={{ width: "20%", textAlign: "center" }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="text-center text-xs">{r?.[0]}</td>
                    <td className="text-xs">{r?.[1]}</td>
                    <td className="text-xs">{r?.[2]}</td>
                    <td className="text-right">{r?.[3]}</td>
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

          <p className="mt-2">
            The grant amount received through authorised banking channels has been duly
            accounted for and utilised for {purpose || "__________"}.
            Utilisation of the grant amounting to{" "}
            <strong>₹{formatINR(totalUtilised)}</strong> has been verified by us with
            reference to the supporting records produced before us.
            {closingBalance > 0 && (
              <>
                {" "}The unutilised balance of{" "}
                <strong>₹ {formatINR(closingBalance)}</strong> as on{" "}
                <strong>{balanceTreatment?.date || "__________"}</strong> has been{" "}
                <strong>{balanceTreatment?.label?.toLowerCase()}</strong>.
              </>
            )}
            {" "}
          </p>
          <p>We further certify that the conditions subject to which the grant-in-aid was sanctioned have been duly complied with and appropriate checks were exercised to ensure proper utilisation of the funds.</p>

          <div className="mt-2">
            <strong>Checks and Verifications Undertaken:</strong>
            <div> {observationText}</div>
          </div>
        </div>

        {/* SIGNATURE – PAGE 1 */}
        <div className="mt-2 certificate-signature flex justify-between text-sm">
          <div>
            <p><strong>Place:</strong> {place || "__________"}</p>
            <p><strong>Date:</strong> {date || "__________"}</p>
          </div>
          <strong>
            <div className="text-right">
              <p>For {firm || "__________"}</p>
              <p>Chartered Accountants</p>
              <p>FRN: {frn || "__________"}</p>
              <p className="mt-6">{caName || "__________"}</p>
              <p>Partner</p>
              {membershipNo && <p>M. No. {membershipNo}</p>}
              {udin && <p>UDIN: {udin}</p>}
            </div>
          </strong>
        </div>

        {/* ===================== PAGE 2 ===================== */}
        <div className="break-before-page">

          {/* HEADER */}
          <div className="text-center mt-6 mb-6">
            <div className="certificate-title text-lg font-bold">
              {displayName}
            </div>

            <div className="text-sm">
              {identity?.address || "__________"}
            </div>

            {identity?.cin && (
              <div className="text-sm font-semibold mt-1">
                College Code : {identity.cin}
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
              <strong>₹ {formatINR(sanctioned)}</strong>{" "}
              (Rupees <b>{amountToWords(sanctioned)}</b> Only), which was duly sanctioned and
              released in favour of <strong>{displayName}</strong> by{" "}
              <strong>{grantDetails?.grantingAuthority || "__________"}</strong>
              {grantDetails?.sanctionRefNo && (
                <> vide sanction letter bearing reference no. <strong>{grantDetails.sanctionRefNo}</strong></>
              )}
              {grantDetails?.sanctionDate && (
                <> dated <strong>{grantDetails.sanctionDate}</strong></>
              )}, for the period commencing from{" "}
              <strong>{period?.from}</strong> to{" "}
              <strong>{period?.to}</strong>, has been fully and properly utilised for{" "}
              <strong>{purpose || "__________"}</strong>, being the purpose for which the
              grant was originally sanctioned. The utilisation of the said grant has been
              examined and verified by us with reference to{" "}
              <strong>{observationText}</strong> and other relevant books of accounts,
              vouchers, and supporting records produced before us.
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

  return (
    <div>
      <div className="certificate-title">
        CERTIFICATE OF UTILISATION OF FUNDS / GRANT
      </div>

      {/* ================== PAGE 1 ================== */}
      <div className="certificate-body">
        <p className="leading-6 mt-4">
          This is to certify that, based on verification of the following documents:
          <strong> {observationText}</strong>, in respect of the entity:
        </p>


        <div className="rounded-xl border border-dashed p-3">
          <div className="font-bold">Organisation Identification</div>
          <div className="mt-2 text-sm">{identityLine}</div>
          {identity?.address && (
            <div className="mt-1 text-sm">Address: {identity.address}</div>
          )}
          <div className="mt-2 text-sm">
            <span className="font-bold">Constitution:</span> {constitution}
          </div>
        </div>

        {/* GRANT DETAILS */}
        <div className="certificate-section">
          <div className="font-bold">GRANT / FUND DETAILS</div>
          <p className="leading-6">
            The above entity has received{" "}
            {grantDetails?.grantName && (
              <>
                grant/fund <b>{grantDetails.grantName}</b>
              </>
            )}{" "}
            from <b>{grantDetails?.grantingAuthority || "__________"}</b>
            {grantDetails?.sanctionRefNo && (
              <>
                , vide sanction/approval reference{" "}
                <b>{grantDetails.sanctionRefNo}</b>
              </>
            )}
            {grantDetails?.sanctionDate && (
              <>
                {" "}
                dated <b>{grantDetails.sanctionDate}</b>
              </>
            )}
            , for a sanctioned amount of{" "}
            <b>
              ₹{" "}
              {grantDetails?.amountSanctioned
                ? formatINR(grantDetails.amountSanctioned)
                : "__________"}
            </b>
            , during the period from{" "}
            <b>{period?.from || "__________"}</b> to{" "}
            <b>{period?.to || "__________"}</b>.
          </p>
        </div>

        {/* PAYMENT DETAILS WITH TOTAL */}
        <div className="certificate-section">
          <div className="font-bold mt-2">PAYMENT / RECEIPT DETAILS</div>

          <table className="certificate-table compact">
            <thead>
              <tr>
                <th style={{ width: "13%", textAlign: "center" }}>Date</th>
                <th style={{ width: "15%", textAlign: "center" }}>Mode</th>
                <th>Bank / Transaction Details</th>
                <th style={{ width: "20%", textAlign: "center" }}>Amount (₹)</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.map((r, idx) => (
                <tr key={idx}>
                  <td className="text-center text-xs">{r?.[0]}</td>
                  <td className="text-xs">{r?.[1]}</td>
                  <td className="text-xs">{r?.[2]}</td>
                  <td className="text-right">{r?.[3]}</td>
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

        {/* BALANCE TREATMENT */}
        <div className="certificate-section">
          <p className="mt-2 leading-6">
            The total amount utilised during the period is{" "}
            <b>₹ {formatINR(totalUtilised)}</b>
            {closingBalance > 0 && balanceTreatment?.type && (
              <>
                , leaving an unutilised balance of{" "}
                <b>₹ {formatINR(closingBalance)}</b> as on{" "}
                <b>{balanceTreatment?.date || "__________"}</b>, which is{" "}
                <b>{balanceTreatment?.label?.toLowerCase()}</b>
              </>
            )}
            .
          </p>
        </div>


        <p className="mt-1.5 leading-6">
          This certificate is issued at the specific request of the entity for
          the purpose of{" "}
          <strong>{purpose || "______________"}</strong> only.
        </p>
      </div>


      {/* SIGNATURE */}
      <div className="mt-2 certificate-signature font-bold flex justify-between">

        {/* LEFT SIDE */}
        <div className="signature-left text-sm font-normal">
          <p>
            <strong>Place:</strong> {place || "__________"}
          </p>
          <p className="mb-2">
            <strong>Date:</strong> {date || "__________"}
          </p>
        </div>

        {/* RIGHT SIDE */}
        <div className="signature-right text-sm text-right">
          <p>For {firm || "__________"}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {frn || "__________"}</p>

          <p className="mt-8">{caName || "__________"}</p>
          <p>Partner</p>
          {membershipNo && <p>M.No. {membershipNo}</p>}
          {udin && <p>UDIN: {udin}</p>}
        </div>

      </div>


      {/* ================== PAGE 2 ================== */}
      <div className="break-before-page">
        <div className="certificate-section">
          <div className="certificate-title mb-4">UTILISATION DETAILS</div>

          {isPurposeRestricted && purposeRows.length > 0 && (
            <>
              <div className="font-semibold mb-2 text-sm">
                A. Purpose-wise Utilisation
              </div>

              <table className="certificate-table compact">
                <thead>
                  <tr>
                    <th style={{ width: "8%", textAlign: "center" }}>Sr. No.</th>
                    <th>Purpose / Activity</th>
                    <th style={{ width: "28%", textAlign: "center" }}>Amount Utilised (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {purposeRows.map((r, idx) => (
                    <tr key={idx}>
                      <td className="text-center">{idx + 1}</td>
                      <td className="text-xs">{r?.[1]}</td>
                      <td className="text-right">{r?.[2]}</td>
                    </tr>
                  ))}

                  <tr>
                    <td colSpan={2} className="text-right font-bold">
                      Total Utilised
                    </td>
                    <td className="text-right font-bold">
                      {formatINR(totalUtilised)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="mb-4" />
            </>
          )}

          <div className="font-semibold mb-2 text-sm">
            {isPurposeRestricted && purposeRows.length > 0 ? "B. " : ""}
            Summary of Funds
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
                <td>Funds Received during the period</td>
                <td className="text-right">
                  {formatINR(totalReceived)}
                </td>
              </tr>
              <tr>
                <td>Funds Utilised</td>
                <td className="text-right">
                  {formatINR(totalUtilised)}
                </td>
              </tr>
              <tr>
                <td className="font-bold">
                  Closing / Unutilised Balance
                </td>
                <td className="text-right font-bold">
                  {formatINR(closingBalance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ReraForm3CertificateView({ certificate }) {
  if (!certificate) return null;

  const { identity, meta, ca, data, entityType } = certificate;
  const { tables, extras } = data || {};
  const { main_form, sold_inventory, unsold_inventory } = tables || {};
  const projectCostNumber = toNumberSafe(extras?.pcost);
  const projectCostWords = projectCostNumber !== null ? amountToWords(projectCostNumber) : "";

  const format = (v) =>
    v === "" || v === null || v === undefined
      ? ""
      : new Intl.NumberFormat("en-IN").format(v);

  // Split rows into three sections
  const allRows = (main_form?.rows || []).filter(
    row => row.id !== 'ongoing_projects_header'
  );
  // Table 1: From start until (but not including) development_cost_group
  const table1Rows = [];
  // Table 2: From development_cost_group until (but not including) total_est_cost_project
  const table2Rows = [];
  // Non-table section: From total_est_cost_project until (but not including) ongoing_projects_header
  const nonTableRows = [];
  // Table 3: From ongoing_projects_header onwards
  const table3Rows = [];

  let currentSection = 'table1';

  allRows.forEach((row) => {
    if (row.id === 'development_cost_group') {
      currentSection = 'table2';
    } else if (row.id === 'total_est_cost_project') {
      currentSection = 'nonTable';
    } else if (row.id === 'ongoing_balance_cost') {
      currentSection = 'table3';
    }

    if (currentSection === 'table1') table1Rows.push(row);
    else if (currentSection === 'table2') table2Rows.push(row);
    else if (currentSection === 'nonTable') nonTableRows.push(row);
    else if (currentSection === 'table3') table3Rows.push(row);
  });

  // Render a row helper
  const renderRow = (row, i) => {
    /* ---------- HEADER ROW ---------- */
    if (row.isHeader) {
      return (
        <tr key={i} className="bg-gray-200 font-bold">
          <td
            colSpan={4}
            className="border text-center"
            style={{ padding: "12px 8px" }}
          >
            {row.particulars}
          </td>
        </tr>
      );
    }

    /* ---------- NOTE ROW ---------- */
    if (row.isNote) {
      return (
        <tr key={i}>
          <td className="border" />
          <td
            colSpan={3}
            className="border italic text-xs"
            style={{
              padding: "8px",
              textAlign: "justify",
              textJustify: "inter-word",
            }}
          >
            {row.particulars}
          </td>
        </tr>
      );
    }

    // ✅ PDF-style indentation (controlled, not excessive)
    const paddingLeft = row.level ? "24px" : "8px";

    /* ---------- SINGLE INPUT ---------- */
    if (row.inputs === "single") {
      return (
        <tr key={i}>
          <td
            className="border text-center align-top"
            style={{ padding: "10px 8px" }}
          >
            {row.srNo}
          </td>

          <td
            className={`border align-top whitespace-pre-line ${row.isBold ? "font-bold" : ""}`}
            style={{
              padding: "10px 8px",
              paddingLeft,
              textAlign: "justify",
              textJustify: "inter-word",
            }}
          >
            {row.particulars}
          </td>

          <td
            colSpan={2}
            className="border text-right align-top"
            style={{ padding: "10px 8px" }}
          >
            {row.id === "proportion_cost_incurred"
              ? `${row.estimated}%`
              : format(row.estimated)}
          </td>
        </tr>
      );
    }

    /* ---------- NORMAL ROW ---------- */
    return (
      <tr key={i}>
        <td
          className="border text-center align-top"
          style={{ padding: "10px 8px" }}
        >
          {row.srNo}
        </td>

        <td
          className={`border align-top whitespace-pre-line ${row.isBold ? "font-bold" : ""}`}
          style={{
            padding: "10px 8px",
            paddingLeft,
            textAlign: "justify",
            textJustify: "inter-word",
          }}
        >
          {row.particulars}
        </td>

        <td
          className="border text-right align-top"
          style={{ padding: "10px 8px" }}
        >
          {format(row.estimated)}
        </td>

        <td
          className="border text-right align-top"
          style={{ padding: "10px 8px" }}
        >
          {format(row.incurred)}
        </td>
      </tr>
    );
  };


  // Footer signature component
  const FooterSignature = () => (
    <>
      {/* Footer Text */}
      <p className="mt-6 text-justify">
        This certificate is being issued for RERA compliance for the Company{" "}
        <b>{identity?.person_name || identity?.company_name}</b>{" "}
        and is based on the records and documents produced before me and
        explanations provided to me by the management of the Company.
      </p>

      {/* Signature */}
      <div className="flex justify-between mt-4 text-sm">
        <div>
          <p>
            <b>Place:</b> {meta?.place}
          </p>
          <p>
            <b>Date:</b> {meta?.date}
          </p>
        </div>

        <div className="text-right">
          <p className="font-bold">For {ca?.firm}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {ca?.frn}</p>
          <div className="mt-6" />
          <p className="font-bold">{ca?.name}</p>
          <p>Partner</p>
          <p>M.No.: {ca?.membership_no}</p>
          {ca?.udin && <p>UDIN: {ca.udin}</p>}
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="text-center mt-6">
        <p className="font-bold ">Annexure A <br />
          List of Extra/Additional Items executed with Cost <br />
          (which were not part of the original Estimate of Total Cost)</p>
        <p className="mt-4 mb-3">FORM No. 3</p>
        <p >[See Regulation 3]</p>
        <p className="text-[12.5pt] font-bold mt-3">
          CHARTERED ACCOUNTANT'S CERTIFICATE
        </p>
        <p className="text-[12.5pt] font-bold mt-2">
          (FOR REGISTRATION OF A PROJECT AND SUBSEQUENT WITHDRAWAL OF MONEY)
        </p>
      </div>

      {/* ================= PROJECT INFO ================= */}
      <div className="border-y py-8 mt-4 space-y-4">
        <div>
          <b>Cost of Real Estate Project (in Rupees):</b> ₹ {extras?.pcost}
          {projectCostWords ? ` (${projectCostWords} Only)` : ""}
        </div>
        <div>
          <b>Bihar RERA Registration Number:</b> {extras?.reraRegistrationNumber}
        </div>
      </div>

      <div className="border-y py-8 mt-4 space-y-2">
        <div>
          <b>{entityType === "PERSONAL" ? "Person Name" : "Company Name"}:</b>{" "}
          {entityType === "PERSONAL"
            ? identity?.person_name
            : identity?.company_name}
        </div>
        <div><b>Entity Type:</b> {entityType.replace("_", " ")}</div>
        <div className="col-span-2"><b>Address:</b> {identity?.address}</div>
        {identity?.pan ? <div><b>PAN:</b> {identity?.pan}</div> : null}
        {identity?.gstin ? <div><b>GSTIN:</b> {identity?.gstin}</div> : null}
        {identity?.cin ? <div><b>CIN:</b> {identity?.cin}</div> : null}
      </div>

      {/* ================= TABLE 1: Land Cost ================= */}
      <div className="mt-10 break-before-page">
        <table className="w-full border certificate-table" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-3 w-20 text-center" style={{ padding: '12px 8px', width: "8%" }}>Sr. No.</th>
              <th className="border p-3 text-left" style={{ padding: '12px 8px', width: "60%" }}>Particulars</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Estimated Amount (₹)</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Incurred Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {table1Rows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>
      </div>
      <br />
      {/* ================= TABLE 2: Development Cost ================= */}
      <div className="mt-10 break-before-page">
        <table className=" w-full border certificate-table" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-gray-100 mt-6">
              <th className="border p-3 w-20 text-center" style={{ padding: '12px 8px', width: "8%" }}>Sr. No.</th>
              <th className="border p-3 text-left" style={{ padding: '12px 8px', width: "60%" }}>Particulars</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Estimated Amount (₹)</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Incurred Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {table2Rows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>
      </div>

      {/* ================= NON-TABLE SECTION (Items 2-8) ================= */}
      <div className="break-before-page mt-10 space-y-3">
        {nonTableRows.map((row, i) => {
          const value = row.inputs === "single"
            ? (row.id === "proportion_cost_incurred" ? `${row.estimated}%` : format(row.estimated))
            : `Estimated: ${format(row.estimated)}, Incurred: ${format(row.incurred)}`;

          return (
            <div key={i} className="flex items-start gap-3">
              <span className="font-semibold min-w-[2rem]">{row.srNo}</span>
              <span className="flex-1 whitespace-pre-line">{row.particulars}</span>
              <span className="font-medium text-right min-w-[10rem]">{value}</span>
            </div>
          );
        })}
      </div>

      {/* ================= FOOTER AFTER ITEM 8 ================= */}
      <FooterSignature />

      {/* ================= TABLE 3: Ongoing Projects (NEW PAGE) ================= */}
      <div className="break-before-page">
        <h3 className="mt-10 mb-3 text-center font-bold text-lg">(ADDITIONAL INFORMATION FOR ONGOING PROJECTS)</h3>
        <table className="w-full border text-sm certificate-table" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-3 w-20 text-center" style={{ padding: '12px 8px', width: "8%" }}>Sr. No.</th>
              <th className="border p-3 text-justify" style={{ padding: '12px 8px', width: "60%" }}>Particulars</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Estimated Amount (₹)</th>
              <th className="border p-3 w-36 text-center" style={{ padding: '12px 8px' }}>Incurred Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {table3Rows.map((row, i) => renderRow(row, i))}
          </tbody>
        </table>

        {/* ================= FOOTER AFTER ITEM 5 (Ongoing Section) ================= */}
        <FooterSignature />
      </div>

      {/* ================= ANNEXURE A ================= */}
      <div className="break-before-page">
        <h3 className="mt-6 text-center font-bold">Annexure A</h3>
        <b><p className="text-center font-bold text-[13.3pt] mt-6 mb-2">
          Statement for calculation of Receivables from the Sales of the Ongoing Real Estate Project
        </p></b>
        {/* Sold Inventory */}
        <h4 className="font-bold text-center mb-2">Sold Inventory</h4>
        <table
          className="w-full border certificate-table"
          style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "8%" }} />   {/* SR NO */}
            <col style={{ width: "12%" }} />  {/* FLAT NO */}
            <col style={{ width: "12%" }} />  {/* CARPET AREA */}
            <col style={{ width: "22%" }} />  {/* UNIT CONSIDERATION */}
            <col style={{ width: "15%" }} />  {/* RECEIVED */}
            <col style={{ width: "15%" }} />  {/* BALANCE */}
          </colgroup>

          <thead>
            <tr className="bg-gray-100">
              {sold_inventory?.columns?.map((c, i) => (
                <th
                  key={i}
                  className="border text-center align-middle"
                  style={{
                    padding: "12px 8px",
                    lineHeight: "1.35",
                    wordBreak: "break-word"
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-100">
              {sold_inventory?.columns?.map((_, i) => (
                <th
                  key={`sold-num-${i}`}
                  className="border text-center align-middle"
                  style={{
                    padding: "6px 8px",
                    lineHeight: "1.2",
                    wordBreak: "break-word"
                  }}
                >
                  ({i + 1})
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {sold_inventory?.rows?.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="border align-top"
                    style={{
                      padding: "10px 8px",
                      textAlign: j >= 2 ? "right" : "center"
                    }}
                  >
                    {format(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {/* Unsold Inventory */}
        <h4 className="break-before-page font-bold text-center mt-6 mb-3">(Unsold Inventory Valuation)</h4>
        <b><p className="text-center font-bold text-[13.3pt] mb-4">
          Ready Reckoner Rate as on the date of Certificate
          <br />
          of the Residential/Commercial premises  Rs. {format(extras?.readyReckonerRate)} per sq.mts.
        </p></b>
        <table
          className="w-full border certificate-table"
          style={{ borderCollapse: "collapse", tableLayout: "fixed" }}
        >
          <colgroup>
            <col style={{ width: "10%" }} />  {/* SR NO */}
            <col style={{ width: "15%" }} />  {/* FLAT NO */}
            <col style={{ width: "35%" }} />  {/* CARPET AREA */}
            <col style={{ width: "40%" }} />  {/* UNIT CONSIDERATION */}
          </colgroup>

          <thead>
            <tr className="bg-gray-100">
              {unsold_inventory?.columns?.map((c, i) => (
                <th
                  key={i}
                  className="border text-center align-middle"
                  style={{
                    padding: "12px 8px",
                    lineHeight: "1.35",
                    wordBreak: "break-word"
                  }}
                >
                  {c}
                </th>
              ))}
            </tr>
            <tr className="bg-gray-100">
              {unsold_inventory?.columns?.map((_, i) => (
                <th
                  key={`unsold-num-${i}`}
                  className="border text-center align-middle"
                  style={{
                    padding: "6px 8px",
                    lineHeight: "1.2",
                    wordBreak: "break-word"
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {unsold_inventory?.rows?.map((r, i) => (
              <tr key={i}>
                {r.map((cell, j) => (
                  <td
                    key={j}
                    className="border align-top"
                    style={{
                      padding: "10px 8px",
                      textAlign: j >= 2 ? "right" : "center"
                    }}
                  >
                    {format(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReraForm7Preview({ cert }) {
  const data = cert?.data?.extras?.formData;
  if (!data) {
    return <div className="text-center text-red-500">Form 7 data is missing or corrupt.</div>;
  }

  const apartmentRows = Array.isArray(data.apartmentInventory) ? data.apartmentInventory : [];
  const apartmentTypeBreakupRowsRaw = Array.isArray(data.apartmentTypeBreakup)
    ? data.apartmentTypeBreakup
    : [];
  const apartmentTypeBreakupRows = apartmentTypeBreakupRowsRaw
    .map((row) => ({
      type: String(row?.type || "").trim(),
      count: String(row?.count ?? "").trim(),
      carpetArea: String(row?.carpetArea ?? "").trim(),
    }))
    .filter((row) => row.type || row.count || row.carpetArea);
  const toFloat = (v) => {
    const n = parseFloat(String(v ?? "").replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  };
  const totalSanctionedUnitsFromBreakup = apartmentTypeBreakupRows.reduce(
    (sum, row) => sum + toFloat(row?.count),
    0
  );
  const sanctionedTypeMap = data.unitAllocation?.sanctioned || {};
  const totalSanctionedUnitsFromMap = UNIT_ALLOCATION_TYPE_ROWS.reduce(
    (sum, row) => sum + toFloat(sanctionedTypeMap[row.key]),
    0
  );
  const totalSanctionedUnitsFromRows = apartmentRows.reduce((sum, row) => sum + toFloat(row?.totalSanctioned), 0);
  const totalSanctionedUnits =
    totalSanctionedUnitsFromBreakup > 0
      ? totalSanctionedUnitsFromBreakup
      : totalSanctionedUnitsFromMap > 0
        ? totalSanctionedUnitsFromMap
        : totalSanctionedUnitsFromRows;
  const totalBookedUnits = apartmentRows.reduce(
    (sum, row) => sum + toFloat(row?.promoterBooked) + toFloat(row?.landownerBooked),
    0
  );
  const bookingPercentage = totalSanctionedUnits > 0 ? (totalBookedUnits / totalSanctionedUnits) * 100 : 0;
  const showAssociationSection = bookingPercentage > 50;
  const allotteeRows = Array.isArray(data.associationDetails?.allottees)
    ? data.associationDetails.allottees
    : [];
  const hasAllotteeData = allotteeRows.some((row) =>
    String(row?.name || "").trim() ||
    String(row?.address || "").trim() ||
    String(row?.contactNumber || "").trim() ||
    String(row?.email || "").trim()
  );
  const associationRowsToRender = hasAllotteeData ? allotteeRows : [{}];
  const apartmentCell = (field) =>
    apartmentRows
      .map((r) => String(r?.[field] ?? "").trim())
      .filter(Boolean)
      .join("\n");
  const garageRows = Array.isArray(data.garageInventory) ? data.garageInventory : [];
  const garageCell = (field) =>
    garageRows
      .map((r) => String(r?.[field] ?? "").trim())
      .filter(Boolean)
      .join("\n");
  const approvalNameDefaults = [
    "NOC for Environment",
    "Fire N.O.C.",
    "Water Supply Permission",
    "NOC from Airport Authority of India",
    "Other Approval(s), if any, Required for the Project.",
  ];
  const approvalRows = approvalNameDefaults.map((defaultName, idx) => {
    const row = Array.isArray(data.buildingApprovals) ? (data.buildingApprovals[idx] || {}) : {};
    return {
      approvalName: defaultName,
      issuingAuthority: row.issuingAuthority || "",
      appliedDate: row.appliedDate || "",
      issuanceDate: row.issuanceDate || "",
      annexureNo: row.annexureNo || "",
    };
  });
  const amenityDefaults = [
    "Internal Roads & Footpaths",
    "Water Supply",
    "Sewerage (Chamber, Line, Septic Tank, STP)",
    "Storm Water Drains",
    "Landscaping & Tree Planting",
    "Street Lighting",
    "Community Buildings",
    "Treatment and Disposal of Sewage and Sullage Water",
    "Solid Waste Management & Disposal",
    "Water Conservation / Rain Water Harvesting",
    "Energy Management",
    "Fire Protection and Fire Safety Requirements",
    "Closed Parking",
    "Open Parking",
    "Electrical Meter Room, Sub-Station, Receiving Station",
  ];
  const amenityRows = amenityDefaults.map((defaultTask, idx) => {
    const row = Array.isArray(data.amenities) ? (data.amenities[idx] || {}) : {};
    return {
      task: row.task || defaultTask,
      proposed: row.proposed || "",
      percentage: row.percentage || "",
      completionDate: row.completionDate || "",
    };
  });
  const amenityExtraRows = (Array.isArray(data.amenities) ? data.amenities.slice(amenityDefaults.length) : [])
    .filter((row) => {
      const task = String(row?.task || "").trim();
      const proposed = String(row?.proposed || "").trim();
      const percentage = String(row?.percentage || "").trim();
      const completionDate = String(row?.completionDate || "").trim();
      return task || proposed || percentage || completionDate;
    })
    .map((row) => ({
      task: row.task || "Others",
      proposed: row.proposed || "",
      percentage: row.percentage || "",
      completionDate: row.completionDate || "",
    }));
  const amenityAllRows = [...amenityRows, ...amenityExtraRows];
  const plottedDefaults = [
    "Internal Roads and foot paths",
    "Water Supply",
    "Sewerage Chambers Septic Tank",
    "Drains",
    "Parks, Land Scaping and Tree Planting",
    "Street Lighting",
    "Disposal of sewage & sullage water",
    "Water conservation/Rain Water Harvesting",
    "Energy Management",
  ];
  const plottedRows = plottedDefaults.map((defaultTask, idx) => {
    const row = Array.isArray(data.plottedDevelopment) ? (data.plottedDevelopment[idx] || {}) : {};
    return {
      task: row.task || defaultTask,
      proposed: row.proposed || "",
      percentage: row.percentage || "",
      completionDate: row.completionDate || "",
    };
  });
  const plottedExtraRows = (Array.isArray(data.plottedDevelopment) ? data.plottedDevelopment.slice(plottedDefaults.length) : [])
    .filter((row) => {
      const task = String(row?.task || "").trim();
      const proposed = String(row?.proposed || "").trim();
      const percentage = String(row?.percentage || "").trim();
      const completionDate = String(row?.completionDate || "").trim();
      return task || proposed || percentage || completionDate;
    })
    .map((row) => ({
      task: row.task || "Others",
      proposed: row.proposed || "",
      percentage: row.percentage || "",
      completionDate: row.completionDate || "",
    }));
  const plottedAllRows = [...plottedRows, ...plottedExtraRows];
  const financialDefaults = [
    "Project Account No.",
    "Estimated Cost of the Project including land cost at the start of the Project",
    "Estimated Development Cost of the Project at the start of the Project.(Excluding Land Cost)",
    "Any Variation in Development Cost which is declared at the start of the Project.",
    "Amount received during the Quarter",
    "Actual Cost Incurred during the Quarter",
    "Net amount at end of the Quarter",
    "Total expenditure on Project till date",
    "Cumulative fund collected till the end of Quarter in question",
    "Cumulative expenditure done till the end of Quarter in question",
  ];
  const financialRows = financialDefaults.map((defaultText, idx) => {
    const row = Array.isArray(data.financialProgress) ? (data.financialProgress[idx] || {}) : {};
    return {
      particulars: row.particulars || defaultText,
      amount: row.amount || "",
    };
  });
  const geoTagged = data?.geoTaggedPhotos || {};
  const frontElevationStatus = geoTagged.frontElevation || "Not Attached";
  const rearElevationStatus = geoTagged.rearElevation || "Not Attached";
  const sideElevationStatus = geoTagged.sideElevation || "Not Attached";
  const eachFloorStatus = geoTagged.eachFloor || "Not Attached";
  const legacyConstructionTasks = Array.isArray(data?.constructionProgress?.tasks)
    ? data.constructionProgress.tasks
    : [];
  const constructionWings = Array.isArray(data?.constructionProgress?.wings) && data.constructionProgress.wings.length
    ? data.constructionProgress.wings
    : [{
      id: "legacy-wing",
      planCaseNo: data?.constructionProgress?.planCaseNo || "",
      tasks: legacyConstructionTasks,
    }];
  const legalRaw = data?.miscellaneous?.legalCases;
  const legalObj = legalRaw && typeof legalRaw === "object" ? legalRaw : {};
  const legalLines = typeof legalRaw === "string"
    ? legalRaw.split(/\r?\n/).map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const misc = data?.miscellaneous || {};
  const legalCaseNo = misc.legalCaseNo || legalObj.caseNo || legalLines[0] || "";
  const legalParties = misc.legalParties || legalObj.parties || legalLines[1] || "";
  const executionCases = misc.executionCases || legalObj.executionCases || legalLines[2] || "";
  const executionCaseNo = misc.executionCaseNo || legalObj.executionCaseNo || "";
  const executionParties = misc.executionParties || legalObj.executionParties || "";
  const suoMotoCases = misc.suoMotoCases || legalObj.suoMotoCases || legalLines[3] || "";
  const suoMotoCaseNo = misc.suoMotoCaseNo || legalObj.suoMotoCaseNo || "";
  const suoMotoParties = misc.suoMotoParties || legalObj.suoMotoParties || "";
  const certificateCases = misc.certificateCases || legalObj.certificateCases || legalLines[4] || "";
  const certificateCaseNo = misc.certificateCaseNo || legalObj.certificateCaseNo || "";
  const certificateParties = misc.certificateParties || legalObj.certificateParties || "";
  const saleParts = String(misc.saleAgreement || "").split(",");
  const saleDeed = misc.saleDeed || saleParts[0]?.trim() || "";
  const agreementForSale = misc.agreementForSale || saleParts[1]?.trim() || "";
  const possessions = misc.possessions || "";
  const unitAllocation = data.unitAllocation || {};
  const sanctionedByType = {
    ...createUnitAllocationPreviewMap(),
    ...(unitAllocation.sanctioned || {}),
  };
  const allotmentByType = {
    ...createUnitAllocationPreviewMap(),
    ...(unitAllocation.allotmentByType || {}),
  };
  const cancellationByType = {
    ...createUnitAllocationPreviewMap(),
    ...(unitAllocation.cancellationByType || {}),
  };
  const legacyAllotment = String(unitAllocation.allotmentDetails || "").trim();
  const legacyCancellation = String(unitAllocation.cancellationDetails || "").trim();
  const hasTypedAllotment = UNIT_ALLOCATION_TYPE_ROWS.some((row) => String(allotmentByType[row.key] || "").trim());
  const hasTypedCancellation = UNIT_ALLOCATION_TYPE_ROWS.some((row) => String(cancellationByType[row.key] || "").trim());
  const stripSeriesPrefix = (text) =>
    String(text || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\d+\s*[.)-]?\s*/, "").trim())
      .filter(Boolean)
      .join("\n");
  const apartmentTypeFromTypeRows = apartmentTypeBreakupRows
    .map((row) => String(row.type || "").trim())
    .filter(Boolean)
    .join("\n");
  const apartmentTypeText = apartmentTypeFromTypeRows || stripSeriesPrefix(apartmentCell("apartmentType"));
  const apartmentQtyFromTypeRows = apartmentTypeBreakupRows
    .map((row) => String(row.count || "").trim())
    .join("\n");
  const apartmentQtyFromSanctionedMap = UNIT_ALLOCATION_TYPE_ROWS
    .map((row) => String(sanctionedByType[row.key] || "").trim())
    .filter(Boolean)
    .join("\n");
  const apartmentQtyText =
    apartmentQtyFromTypeRows.trim() ? apartmentQtyFromTypeRows : apartmentQtyFromSanctionedMap;
  const carpetAreaFromTypeRows = apartmentTypeBreakupRows
    .filter((row) => String(row.carpetArea || "").trim())
    .map((row) => String(row.carpetArea))
    .join("\n");
  const carpetAreaText = carpetAreaFromTypeRows || stripSeriesPrefix(apartmentCell("carpetArea"));
  const sanctionedApartmentsText =
    totalSanctionedUnits > 0 ? String(totalSanctionedUnits) : apartmentCell("totalSanctioned");
  const bookingPercentageText =
    apartmentCell("bookingPercentage") || (totalSanctionedUnits > 0 ? bookingPercentage.toFixed(2) : "");
  const brochureProspectusStatus = data.brochureProspectus || "Not Attached";

  return (
    <div className="space-y-4 max-w-none mx-auto p-2 bg-white">
      <div className="certificate-title font-bold text-center border-b pb-4">FORM-7 [REGULATION-9]</div>
      <div className="text-center">
        <p className="certificate-subtitle">
          Quarterly progress report for quarter ending {data.meta?.quarterEnding} {data.meta?.year}
        </p>
      </div>

      {/* Section I: Promoter Details (table layout) */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "35%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                <SectionHeaderTitle section="I." title="PARTICULARS OF PROMOTERS" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                Promoter&apos;s Registration Number/CIN No/Partnership deed no/LLP Details/Any other registration with MSME or Govt. Bodies
              </td>
              <td className="border border-black px-2 py-1 align-top font-semibold text-left">
                {data.promoterDetails?.registrationNumber || ""}
              </td>
              <td className="border border-black px-2 py-1 align-top font-semibold text-left">Name of Firm</td>
              <td className="border border-black px-2 py-1 align-top font-medium text-left">
                {data.promoterDetails?.firmName || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold align-top text-left">
                Firm Address :
              </td>
              <td className="border border-black px-2 py-1 font-medium text-left" colSpan={3}>
                {data.promoterDetails?.firmAddress || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                Total Experience of promoter in Real Estate sector
              </td>
              <td className="border border-black px-2 py-1 font-medium text-left" colSpan={3}>
                {data.promoterDetails?.experienceTotal || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                Total Experience in Real Estate after Implementation of RERA
              </td>
              <td className="border border-black px-2 py-1 font-medium text-left" colSpan={3}>
                {data.promoterDetails?.experienceRera || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                No of Project done Before Implementation of RERA
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                1. Residential
                <br />
                2. Commercial
                <br />
                3. Residential-cum Commercial
                <br />
                4. Plotted project
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                1. {data.projectsBeforeRera?.residential || ""}
                <br />
                2. {data.projectsBeforeRera?.commercial || ""}
                <br />
                3. {data.projectsBeforeRera?.mixed || ""}
                <br />
                4. {data.projectsBeforeRera?.plotted || ""}
              </td>
              <td className="border border-black px-2 py-1"></td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                No of Project done After Implementation of RERA
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                1. Residential
                <br />
                2. Commercial
                <br />
                3. Residential-cum Commercial
                <br />
                4. Plotted project
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                1. {data.projectsAfterRera?.residential || ""}
                <br />
                2. {data.projectsAfterRera?.commercial || ""}
                <br />
                3. {data.projectsAfterRera?.mixed || ""}
                <br />
                4. {data.projectsAfterRera?.plotted || ""}
              </td>
              <td className="border border-black px-2 py-1"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section II: Project Details (table layout) */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "30%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "25%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                <SectionHeaderTitle section="II." title="PARTICULARS OF PROJECT" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Project Registration Number</td>
              <td className="border border-black px-2 py-1 align-top text-left">{data.projectDetails?.registrationNumber || ""}</td>
              <td className="border border-black px-2 py-1 align-top text-left">Name of Project/Phase of Registered Project</td>
              <td className="border border-black px-2 py-1 align-top text-left">{data.projectDetails?.nameOfProject || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Name of Promoter</td>
              <td className="border border-black px-2 py-1 align-top text-left">{data.projectDetails?.nameOfPromoter || ""}</td>
              <td className="border border-black px-2 py-1 align-top text-left">Project Address</td>
              <td className="border border-black px-2 py-1 align-top text-left" rowSpan={4}>{data.projectDetails?.projectAddress || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Name of Co-promoter</td>
              <td className="border border-black px-2 py-1 align-top text-left" colSpan={3}>{data.projectDetails?.nameOfCoPromoter || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Project Registration is valid up to</td>
              <td className="border border-black px-2 py-1 align-top text-left" colSpan={3}>{formatDDMMYYYY(data.projectDetails?.validUpTo)}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Starting date of Project or Phase of the Project</td>
              <td className="border border-black px-2 py-1 align-top text-left" colSpan={3}>{formatDDMMYYYY(data.projectDetails?.startDate)}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">
                Type of Project or Phase of the Project
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                1. Residential
                <br />
                2. Commercial
                <br />
                3. Residential-cum-Commercial
                <br />
                4. Plotted project
              </td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1"></td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Period of validity of map by the Competent Authority</td>
              <td className="border border-black px-2 py-1 align-top text-left" colSpan={3}>{data.projectDetails?.mapValidity || ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section III: APARTMENT INVENTORY */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "12%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "8%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "19%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={7}>
                <SectionHeaderTitle section="III." title="DISCLOSURE OF SOLD/BOOKED INVENTORY OF APARTMENTS" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Building /Block Number</td>
              <td className="border border-black px-2 py-1 align-top text-left" colSpan={2}>Apartment Type</td>
              <td className="border border-black px-2 py-1 align-top text-left">Carpet Area</td>
              <td className="border border-black px-2 py-1 align-top text-left">Total Number of sanctioned apartments</td>
              <td className="border border-black px-2 py-1 align-top text-left">Total Number of Apartments in Promoter&apos;s share</td>
              <td className="border border-black px-2 py-1 align-top text-left">Total Number of Apartments in Landowner&apos;s share</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                {apartmentCell("blockNumber")}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                {apartmentTypeText}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                {apartmentQtyText}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                {carpetAreaText}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                {sanctionedApartmentsText}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">
                1. Booked / Allotted - {apartmentCell("promoterBooked")}
                <br />
                2. Sold - {apartmentCell("promoterSold")}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">
                1. Booked / Allotted - {apartmentCell("landownerBooked")}
                <br />
                2. Sold - {apartmentCell("landownerSold")}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">
                Percentage of booking - {bookingPercentageText}
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">
                Percentage of booking - {bookingPercentageText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Association of Allottees Details (Visible if booking > 50%) */}

      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "25%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                ASSOCIATION OF ALLOTTEES
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left" colSpan={4}>
                Association Name: {data.associationDetails?.name || ""}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left" colSpan={4}>
                Details of allottees - Name, Address, Email id (if any), contact number.<br />These details may not be available to common people.
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 font-semibold text-center">Name</td>
              <td className="border border-black px-2 py-1 font-semibold text-center">Address</td>
              <td className="border border-black px-2 py-1 font-semibold text-center">Contact Number</td>
              <td className="border border-black px-2 py-1 font-semibold text-center">Email id (If any)</td>
            </tr>
            {associationRowsToRender.map((allottee, i) => (
              <tr key={`allottee-row-${i}`}>
                <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{allottee?.name || ""}</td>
                <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{allottee?.address || ""}</td>
                <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{allottee?.contactNumber || ""}</td>
                <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{allottee?.email || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section IV: GARAGE INVENTORY  */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "22%" }} />
            <col style={{ width: "25%" }} />
            <col style={{ width: "31%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                <SectionHeaderTitle section="IV." title="DISCLOSURE OF SOLD / BOOKED INVENTORY OF GARAGES" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">Building / Block Number</td>
              <td className="border border-black px-2 py-1 align-top text-left">Total Number of Sanctioned Garages</td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap" rowSpan={2}>
                Total Number of Garages:
                <br />
                1. Booked/Allotted -
                <br />
                2. Sold -
              </td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">
                <br />{garageCell("booked")}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{garageCell("blockNumber")}</td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{garageCell("totalSanctioned")}</td>
              <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{garageCell("sold")}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section V: DETAILS OF BUILDING APPROVALS */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "28%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={6}>
                <SectionHeaderTitle section="V." title="DETAILS OF BUILDING APPROVALS" />
              </td>
            </tr>
            <tr style={{ backgroundColor: "#d8d8d8" }}>
              <td className="border border-black px-2 py-1 text-center" colSpan={6}>
                (If already filed along with Registration Application, then there is no need of further filing)
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-left">S. No.</td>
              <td className="border border-black px-2 py-1 align-top text-left">
                Name of the Approval /
                <br />
                N.O.C./ Permission /
                <br />
                Certificate
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">Issuing Authority</td>
              <td className="border border-black px-2 py-1 align-top text-left">
                Applied
                <br />
                Date
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                Issuance
                <br />
                Date
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">
                Enclosed as
                <br />
                Annexure No.
              </td>
            </tr>
            {approvalRows.map((row, i) => (
              <tr key={`approval-row-${i}`}>
                <td className="border border-black px-2 py-1 align-top text-center">{i + 1}.</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.approvalName}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.issuingAuthority}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{formatDDMMYYYY(row.appliedDate)}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{formatDDMMYYYY(row.issuanceDate)}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.annexureNo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section VI: CONSTRUCTION PROGRESS  */}
      {constructionWings.map((wing, wingIdx) => (
        <div key={`wing-preview-${wing?.id || wingIdx}`} className="break-before-page preview-card p-2 bg-white">
          <table
            className="w-full border border-black border-collapse"
            style={{
              fontFamily: "'Times New Roman', serif",
              tableLayout: "fixed",
              lineHeight: 1.2,
            }}
          >
            <colgroup>
              <col style={{ width: "8%" }} />
              <col style={{ width: "50%" }} />
            </colgroup>
            <tbody>
              <tr style={{ backgroundColor: "#c6c6c6" }}>
                <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                  <SectionHeaderTitle section="VI." title="CONSTRUCTION PROGRESS OF THE PROJECT" />
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 align-top text-left" colSpan={4}>
                  1.&nbsp;&nbsp;Plan Case No. {wing?.planCaseNo || "________________"} (To be added for each Building / Wing)
                </td>
              </tr>
              <tr>
                <td className="border border-black px-2 py-1 align-top text-center">
                  S. No.
                  <br />
                  (1)
                </td>
                <td className="border border-black px-2 py-1 align-top text-center">
                  Tasks/Activity (2)
                </td>
                <td className="border border-black px-2 py-1 align-top text-center">
                  Percentage of
                  <br />
                  Actual Work
                  <br />
                  Done
                  <br />
                  (As on date of
                  <br />
                  the Certificate)
                  <br />
                  (3)
                </td>
                <td className="border border-black px-2 py-1 align-top text-center">
                  Expected
                  <br />
                  Completion
                  <br />
                  date in
                  <br />
                  (dd/mm/yyyy)
                  <br />
                  Format
                </td>
              </tr>
              {(Array.isArray(wing?.tasks) ? wing.tasks : []).map((row, i) => (
                <tr key={`construction-row-${wingIdx}-${i}`}>
                  <td className="border border-black px-2 py-1 align-top text-center">{i + 1}.</td>
                  <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row?.task || ""}</td>
                  <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row?.percentage ? `${row.percentage}` : ""}</td>
                  <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{formatDDMMYYYY(row?.completionDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Section VII: AMENITIES AND COMMON AREA */}
      <div className="preview-card break-before-page p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "7%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "23%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "21%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={5}>
                <SectionHeaderTitle
                  section="VII."
                  title="AMENITIES AND COMMON AREA AND EXTERNAL INFRASTRUCTURE DEVELOPMENT WORKS"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-center">
                S.
                <br />
                No.
              </td>
              <td className="border border-black px-2 py-1 align-top text-left">Common Areas and Facilities</td>
              <td className="border border-black px-2 py-1 align-top text-center">Proposed (Yes/No)</td>
              <td className="border border-black px-2 py-1 align-top text-center">
                Percentage
                <br />
                of actual
                <br />
                Work Done
                <br />
                (As on date
                <br />
                of the
                <br />
                Certificate)
              </td>
              <td className="border border-black px-2 py-1 align-top text-center">
                Expected
                <br />
                Completion
                <br />
                date in
                <br />
                (dd/mm/yyyy)
                <br />
                Format
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-center">(1)</td>
              <td className="border border-black px-2 py-1 text-center">(2)</td>
              <td className="border border-black px-2 py-1 text-center">(3)</td>
              <td className="border border-black px-2 py-1 text-center">(4)</td>
              <td className="border border-black px-2 py-1 text-center">(5)</td>
            </tr>
            {amenityAllRows.map((row, i) => (
              <tr key={`amenity-row-${i}`}>
                <td className="border border-black px-2 py-1 align-top text-center">{i + 1}.</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.task}</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row.proposed}</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row.percentage ? `${row.percentage}%` : ""}</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{formatDDMMYYYY(row.completionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section VIII: PLOTTED DEVELOPMENT WORKS */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "16%" }} />
            <col style={{ width: "20%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={5}>
                <SectionHeaderTitle
                  section="VIII"
                  title="A EXTERNAL AND INTERNAL DEVELOPMENT WORKS IN CASE OF PLOTTED DEVELOPMENT"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-center"></td>
              <td className="border border-black px-2 py-1 align-top text-center"></td>
              <td className="border border-black px-2 py-1 align-top text-center">
                PROPOSED
                <br />
                YES/NO.
              </td>
              <td className="border border-black px-2 py-1 align-top text-center">
                PERCENT
                <br />
                AGE OF
                <br />
                ACTUAL
                <br />
                WORK
                <br />
                DONE (As
                <br />
                on date
                <br />
                of
                <br />
                certificate)
              </td>
              <td className="border border-black px-2 py-1 align-top text-center">
                Expected
                <br />
                Completion
                <br />
                date in
                <br />
                (dd/mm/yy)
                <br />
                Format
              </td>
            </tr>
            {plottedAllRows.map((row, i) => (
              <tr key={`plotted-row-${i}`}>
                <td className="border border-black px-2 py-1 align-top text-center">{i + 1}.</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row.task}</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row.proposed}</td>
                <td className="border border-black px-2 py-1 align-top text-center whitespace-pre-wrap">{row.percentage ? `${row.percentage}%` : ""}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{formatDDMMYYYY(row.completionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section IX: GEO TAGGED AND DATE PHOTOGRAPH */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
            <col style={{ width: "60%" }} />
            <col style={{ width: "20%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                <SectionHeaderTitle section="IX." title="GEO TAGGED AND DATE PHOTOGRAPH OF(EACH BLOCK) OF THE PROJECT" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">(A)</td>
              <td className="border border-black px-2 py-1 text-left">Sr. No.</td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-left"></td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-left">1.</td>
              <td className="border border-black px-2 py-1 text-left">Front Elevation</td>
              <td className="border border-black px-2 py-1 text-left">{frontElevationStatus}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-left">2.</td>
              <td className="border border-black px-2 py-1 text-left">Rear Elevation</td>
              <td className="border border-black px-2 py-1 text-left">{rearElevationStatus}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-left">3.</td>
              <td className="border border-black px-2 py-1 text-left">Side Elevation</td>
              <td className="border border-black px-2 py-1 text-left">{sideElevationStatus}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">(B)</td>
              <td className="border border-black px-2 py-1"></td>
              <td className="border border-black px-2 py-1 text-left">Photograph of each floor</td>
              <td className="border border-black px-2 py-1 text-left">{eachFloorStatus}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section X: FINANCIAL PROGRESS */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "59%" }} />
            <col style={{ width: "31%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={3}>
                <SectionHeaderTitle section="X." title="FINANCIAL PROGRESS OF THE PROJECT" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 align-top text-center">S. No.</td>
              <td className="border border-black px-2 py-1 align-top text-center">Particulars</td>
              <td className="border border-black px-2 py-1 align-top text-center">Amount (In Rs.)</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-center">(1)</td>
              <td className="border border-black px-2 py-1 text-center">(2)</td>
              <td className="border border-black px-2 py-1 text-center">(3)</td>
            </tr>
            {financialRows.map((row, i) => (
              <tr key={`financial-row-${i}`}>
                <td className="border border-black px-2 py-1 align-top text-center">{i + 1}.</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.particulars}</td>
                <td className="border border-black px-2 py-1 align-top text-left whitespace-pre-wrap">{row.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Section XI: MORTGAGE/LOAN DETAILS */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left">
                <SectionHeaderTitle
                  section="XI."
                  title="DETAILS OF MORTGAGE OR CHARGE IF ANY CREATED/DETAILS OF LOAN TAKEN BY PROMOTERS AGAINST THE PROJECT, If any"
                />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-3 text-left whitespace-pre-wrap">{data.mortgageDetails || ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section XII + XIII: MISCELLANEOUS + MILESTONE */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "50%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={3}>
                <SectionHeaderTitle section="XII." title="MISCELLANEOUS" />
              </td>
            </tr>

            <tr>
              <td className="border border-black px-2 py-1 font-bold text-left">A</td>
              <td className="border border-black px-2 py-1 text-left" colSpan={2}>List of Legal Cases (if any) - On Project / Promoter</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">1.</td>
              <td className="border border-black px-2 py-1 text-left">Case No.</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{legalCaseNo}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">2.</td>
              <td className="border border-black px-2 py-1 text-left">Name of Parties</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{legalParties}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">3.</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                No of Execution Cases against this project
                <br />
                <br />
                Case No.
                <br />
                Name of Parties
              </td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                {executionCases}
                <br />
                <br />
                {executionCaseNo}
                <br />
                {executionParties}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">4.</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                No of Suo - Moto cases against this project
                <br />
                <br />
                Case No.
                <br />
                Name of Parties
              </td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                {suoMotoCases}
                <br />
                <br />
                {suoMotoCaseNo}
                <br />
                {suoMotoParties}
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">5.</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                No of Certificate cases /PDR cases against this project
                <br />
                <br />
                Case No.
                <br />
                Name of Parties
              </td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">
                {certificateCases}
                <br />
                <br />
                {certificateCaseNo}
                <br />
                {certificateParties}
              </td>
            </tr>

            <tr>
              <td className="border border-black px-2 py-1 font-bold text-left">B</td>
              <td className="border border-black px-2 py-1 text-left">Sale/Agreement for Sale during the Quarter</td>
              <td className="border border-black px-2 py-1"></td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">1.</td>
              <td className="border border-black px-2 py-1 text-left">Sale Deed</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{saleDeed}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">2.</td>
              <td className="border border-black px-2 py-1 text-left">Agreement for Sale</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{agreementForSale}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-right">3.</td>
              <td className="border border-black px-2 py-1 text-left">No. of possessions given to allottees</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{possessions}</td>
            </tr>

            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={3}>
                <SectionHeaderTitle section="XIII." title="PERCENTAGE OF WORK ALONG WITH MILESTONE CHART" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left" colSpan={3}>
                Weather the project in progress is as per time schedule or lagging behind?
                {data.milestoneChartLag ? ` ${data.milestoneChartLag}` : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section XIV: UNIT ALLOCATION DETAILS */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "16%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "33%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={4}>
                <SectionHeaderTitle section="XIV." title="UNITS ALLOCATION DETAILS" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">Unit Type</td>
              <td className="border border-black px-2 py-1 text-left font-semibold">Total sanctioned</td>
              <td className="border border-black px-2 py-1 text-left font-semibold">Details of allotment made so far (with Flat number/ Bungalow / Plot etc)</td>
              <td className="border border-black px-2 py-1 text-left font-semibold">Cancellation of flat allotment, If any with Flat number / Bungalow / Plot etc</td>
            </tr>
            {UNIT_ALLOCATION_TYPE_ROWS.map((row, idx) => {
              const allotmentValue =
                String(allotmentByType[row.key] || "").trim() ||
                (!hasTypedAllotment && idx === 0 ? legacyAllotment : "");
              const cancellationValue =
                String(cancellationByType[row.key] || "").trim() ||
                (!hasTypedCancellation && idx === 0 ? legacyCancellation : "");
              return (
                <tr key={`unit-allocation-${row.key}`}>
                  <td className="border border-black px-2 py-1 text-left">{row.label}</td>
                  <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{sanctionedByType[row.key] || "-"}</td>
                  <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{allotmentValue || "-"}</td>
                  <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{cancellationValue || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Section XV: BROCHURE/PROSPECTUS */}
      <div className="preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left">
                <SectionHeaderTitle section="XV." title="BROCHURE /Prospectus" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left">{brochureProspectusStatus}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section XVI: GRIEVANCE OFFICER  */}
      <div className="break-before-page preview-card p-2 bg-white">
        <table
          className="w-full border border-black border-collapse"
          style={{
            fontFamily: "'Times New Roman', serif",
            tableLayout: "fixed",
            lineHeight: 1.2,
          }}
        >
          <colgroup>
            <col style={{ width: "24%" }} />
            <col style={{ width: "76%" }} />
          </colgroup>
          <tbody>
            <tr style={{ backgroundColor: "#c6c6c6" }}>
              <td className="border border-black px-2 py-1 font-bold text-left" colSpan={2}>
                <SectionHeaderTitle section="XVI." title="GRIEVANCE REDRESSAL OFFICER" />
              </td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">Name :</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{data.grievanceOfficer?.name || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">Contact No :</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{data.grievanceOfficer?.contact || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">Email id :</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{data.grievanceOfficer?.email || ""}</td>
            </tr>
            <tr>
              <td className="border border-black px-2 py-1 text-left font-semibold">Address :</td>
              <td className="border border-black px-2 py-1 text-left whitespace-pre-wrap">{data.grievanceOfficer?.address || ""}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Final Undertaking  */}
      <div className="mt-6 bg-white p-2 text-black">
        <p className="font-bold text-left mb-4">Undertaking:</p>
        <p className="text-justify leading-8 mb-16">
          I/we solemnly affirm, declare and undertake that all the details stated above are true to the best of my knowledge and nothing material has been concealed here from. I am/we are executing this undertaking to attest to the truth of all the foregoing and to apprise the Authority of such facts as mentioned as well as for whatever other legal purposes this undertaking may serve.
        </p>
        <div className="flex justify-end">
          <div className="text-right">
            <p className="mb-3">Signature of Promoter</p>
            <p className="mb-2">Name: {data.undertaking?.name || ""}</p>
            <p>Date: {formatDDMMYYYY(data.undertaking?.date || data.meta?.date || new Date().toLocaleDateString("en-GB"))}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ---------- Main Page ---------- */
export default function CertificatePreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const certificateRef = useRef(null);
  const canManageCertificates = Boolean(
    isAdmin ||
    user?.can_manage_certificates ||
    user?.can_edit_certificates ||
    user?.can_delete_certificates
  );

  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCertificate = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/certificates/${id}`);
      setCertificate(response.data);
    } catch (error) {
      console.error("Error fetching certificate:", error);
      toast.error("Failed to load certificate");
    } finally {
      setLoading(false);
    }
  };

  const isTurnover = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "TURNOVER" || type.includes("turnover");
  }, [certificate]);

  const isNetWorth = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "NET_WORTH" || type.includes("net_worth");
  }, [certificate]);

  const isUtilisation = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "UTILISATION" || type.includes("utilisation");
  }, [certificate]);

  // Add this useMemo check in the main component:
  const isReraForm3 = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "RERA" && type === "rera_form_3";
  }, [certificate]);

  const isReraForm7 = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "RERA" && type === "rera_form_7_reg_9";
  }, [certificate]);

  const isRbiNbfc = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "NBFC" && type === "rbi_statutory_auditor_certificate_for_nbfcs";
  }, [certificate]);

  const isGstRefund = useMemo(() => {
    const cat = (certificate?.category || "").toUpperCase();
    const type = (certificate?.certificate_type || "").toLowerCase();
    return cat === "GST" && (type === "gst_refund_rfd_certificate" || type.startsWith("gst_rfd_"));
  }, [certificate]);

  const isLiquidAssets45IB = useMemo(() => {
    return isRbiNbfc && isLiquidAssets45IBVariant(certificate);
  }, [certificate, isRbiNbfc]);

  const renderedCertificateView = isTurnover ? (
    <TurnoverCertificateView cert={certificate} />
  ) : isNetWorth ? (
    <NetWorthCertificateView cert={certificate} />
  ) : isUtilisation ? (
    <UtilizationCertificateView cert={certificate} />
  ) : isReraForm3 ? (
    <ReraForm3CertificateView certificate={certificate} />
  ) : isReraForm7 ? (
    <ReraForm7Preview cert={certificate} />
  ) : isLiquidAssets45IB ? (
    <LiquidAssets45IBCertificateView cert={certificate} />
  ) : isRbiNbfc ? (
    <RbiNbfcCertificateView cert={certificate} />
  ) : isGstRefund ? (
    <GstRefundCertificateView cert={certificate} />
  ) : (
    <GenericUniversalCertificateView cert={certificate} />
  );

  const handlePrint = useReactToPrint({
    contentRef: certificateRef,
    pageStyle: `
      @page { size: A4; margin: 0; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    `,
  });

  const handleDelete = async () => {
    if (!canManageCertificates) {
      toast.error("Certificate manage permission denied.");
      return;
    }
    const ok = window.confirm("Are you sure you want to delete this certificate?");
    if (!ok) return;

    try {
      await api.delete(`/api/certificates/${id}`);
      toast.success("Certificate deleted.");
      navigate("/history");
    } catch (e) {
      console.error(e);
      toast.error("Failed to delete certificate.");
    }
  };

  const handleEdit = () => {
    if (!canManageCertificates) {
      toast.error("Certificate manage permission denied.");
      return;
    }
    if (isTurnover) navigate(`/turnover/${id}`);
    else if (isNetWorth) navigate(`/networth/${id}`);
    else if (isUtilisation) navigate(`/utilisation/${id}`);
    else if (isReraForm3) navigate(`/rera/${id}`);
    else if (isReraForm7) navigate(`/rera-form-7/${id}`);
    else if (isLiquidAssets45IB) navigate(`/rbi-liquid-assets/${id}`);
    else if (isRbiNbfc) navigate(`/rbi-statutory-auditor/${id}`);
    else if (isGstRefund) toast.error("GST refund form is no longer available for editing.");
    else navigate(`/certificate/edit/${id}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading certificate...</p>
        </div>
      </div>
    );
  }

  if (!certificate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-muted-foreground">Certificate not found</p>
          <Button onClick={() => navigate("/history")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>
        </div>
      </div>
    );
  }

  const usePlainWrapper = isReraForm7 || isGstRefund;
  const plainWrapperClass = `certificate-wrapper no-letterhead${isReraForm7 ? " rera-only" : ""}`;
  const plainContainerClass = `certificate-container${isReraForm7 ? " no-letterhead-container rera-only-container" : ""}`;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Action bar */}
        <div className="no-print mb-6 flex justify-between items-center">
          <Button variant="ghost" onClick={() => navigate("/history")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>

          <div className="flex space-x-3">
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>

            {canManageCertificates && (
              <Button onClick={handleEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            )}

            {canManageCertificates && (
              <Button variant="destructive" onClick={handleDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Printable certificate */}
        {usePlainWrapper ? (
          <div ref={certificateRef} className={plainWrapperClass}>
            <div className={plainContainerClass}>
              {renderedCertificateView}
            </div>
          </div>
        ) : (
          <div
            ref={certificateRef}
            className={`certificate-wrapper ${isTurnover && (certificate?.data?.tables?.main?.rows?.length || 0) <= 3 ? "compact-page" : ""
              }`}>
            <img src="/letterhead.png" alt="Header" className="certificate-header" />
            <img src="/letterhead2.png" alt="Footer" className="certificate-footer" />

            <table className="print-layout-table">
              <thead>
                <tr>
                  <td><div className="print-header-spacer"></div></td>
                </tr>
              </thead>

              <tbody>
                <tr>
                  <td>
                    <div className="certificate-container">
                      {renderedCertificateView}
                    </div>
                  </td>
                </tr>
              </tbody>

              <tfoot>
                <tr>
                  <td><div className="print-footer-spacer"></div></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

