import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ClientSelector from "../components/ClientSelector";
import { ArrowLeft, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
const CA_STORAGE_KEY = "ca_settings_v1";
const RBI_NBFC_DRAFT_KEY = "draft:rbi_nbfc_form_v1";
const LIQUID_VARIANT = "liquid_assets_45_ib";

const ENTITY_TYPES = [
  { key: "PROPRIETORSHIP", label: "Proprietorship Firm" },
  { key: "LLP", label: "Limited Liability Partnership (LLP)" },
  { key: "PRIVATE_LIMITED", label: "Private Limited Company" },
  { key: "PUBLIC_LIMITED", label: "Public Limited Company" },
  { key: "TRUST", label: "Trust" },
  { key: "NGO", label: "NGO (Society/Trust/Section 8)" },
  { key: "SOCIETY", label: "Society" },
  { key: "GOVERNMENT", label: "Government / PSU / Department" },
];

const RBI_CLASSIFICATIONS = [
  "Investment Company",
  "Loan Company",
  "NBFC-MFI",
  "NBFC-Factor",
  "AFC",
  "IFC",
  "IDF-NBFC",
];

const yesNoOptions = ["Yes", "No"];
const yesNoNaOptions = ["Yes", "No", "NA"];
const ANNEX_TOTAL_6_7_KEYS = [
  "annexInvestmentSameGroup",
  "annexInvestmentSubsidiaries",
  "annexInvestmentWhollyOwnedSubsidiaries",
  "annexInvestmentOtherNbfcs",
  "annexBookValueSameGroup",
  "annexBookValueSubsidiaries",
  "annexBookValueWhollyOwnedSubsidiariesJvAbroad",
];

const ANNEX_FIELD_DEFS = [
  { key: "annexPaidUpEquityCapital", label: "1. Paid up Equity Capital" },
  { key: "annexPrefSharesCompulsorilyConvertible", label: "2. Pref. shares to be compulsorily converted into equity" },
  { key: "annexGeneralReserve", label: "3(a). General Reserve" },
  { key: "annexSharePremium", label: "3(b). Share Premium" },
  { key: "annexCapitalReserves", label: "3(c). Capital Reserves" },
  { key: "annexDebentureRedemptionReserve", label: "3(d). Debenture Redemption Reserve" },
  { key: "annexCapitalRedemptionReserve", label: "3(e). Capital Redemption Reserve" },
  { key: "annexCreditBalancePL", label: "3(f). Credit Balance in P&L Account" },
  { key: "annexOtherFreeReserves", label: "3(g). Other free reserves (may be specified)" },
  { key: "annexSpecialReserves", label: "4. Special Reserves" },
  { key: "annexTotal1To4", label: "Total of 1 to 4" },
  { key: "annexAccumulatedBalanceLoss", label: "5(i). Less: Accumulated balance of loss" },
  { key: "annexDeferredRevenueExpenditure", label: "5(ii). Less: Deferred Revenue Expenditure" },
  { key: "annexDeferredTaxAssetsNet", label: "5(iii). Less: Deferred Tax Assets (Net)" },
  { key: "annexOtherIntangibleAssets", label: "5(iv). Less: Other intangible Assets" },
  { key: "annexOwnedFund", label: "Owned Fund" },
  { key: "annexInvestmentSameGroup", label: "6(i). Investment in shares of companies in the same group" },
  { key: "annexInvestmentSubsidiaries", label: "6(ii). Investment in shares of subsidiaries" },
  { key: "annexInvestmentWhollyOwnedSubsidiaries", label: "6(iii). Investment in shares of wholly owned subsidiaries" },
  { key: "annexInvestmentOtherNbfcs", label: "6(iv). Investment in shares of other NBFCs" },
  { key: "annexBookValueSameGroup", label: "7(i). Book value of debentures/bonds/loans/advances/deposits with companies in the same group" },
  { key: "annexBookValueSubsidiaries", label: "7(ii). ... with subsidiaries" },
  { key: "annexBookValueWhollyOwnedSubsidiariesJvAbroad", label: "7(iii). ... with wholly owned subsidiaries / joint ventures abroad" },
  { key: "annexTotal6And7", label: "8. Total of 6 and 7", readOnly: true },
  { key: "annexExcessOver10PercentOwnedFund", label: "9. Amount in item 8 in excess of 10% of Owned Fund" },
  { key: "annexNetOwnedFund", label: "10. Net Owned Fund" },
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

function parseAmountSafe(value) {
  const s = String(value || "").replace(/,/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function computeAnnexTotal6And7(data) {
  const hasAnyValue = ANNEX_TOTAL_6_7_KEYS.some((key) =>
    String(data?.[key] || "").trim()
  );
  if (!hasAnyValue) return "";

  const total = ANNEX_TOTAL_6_7_KEYS.reduce(
    (sum, key) => sum + parseAmountSafe(data?.[key]),
    0
  );

  const rounded = Math.round((total + Number.EPSILON) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function defaultForm() {
  return {
    companyName: "",
    certificateOfRegistrationNo: "",
    cin: "",
    pan: "",
    gstin: "",
    registeredOfficeAddress: "",
    corporateOfficeAddress: "",
    rbiClassification: "",
    financialYearEnd: "",

    netOwnedFund: "",
    totalAssets: "",
    financialAssetsPct: "",
    financialIncomePct: "",

    publicDepositsHeld: "No",
    publicDepositsAmount: "",
    reserveFundTransferStatus: "Yes",
    fdiReceived: "No",
    fdiCapitalizationCompliance: "NA",

    nbfcFactorAssetsPct: "",
    nbfcFactorIncomePct: "",
    nbfcMfiQualifyingAssetsPct: "",
    afcPhysicalAssetsPct: "",
    afcIncomeFromPhysicalAssetsPct: "",
    infrastructureLoansPct: "",

    takeoverChangeStatus: "No",
    takeoverChangeDetails: "",
    boardReportMade: "Yes",
    para5Understood: "Yes",

    annexPaidUpEquityCapital: "",
    annexPrefSharesCompulsorilyConvertible: "",
    annexGeneralReserve: "",
    annexSharePremium: "",
    annexCapitalReserves: "",
    annexDebentureRedemptionReserve: "",
    annexCapitalRedemptionReserve: "",
    annexCreditBalancePL: "",
    annexOtherFreeReserves: "",
    annexSpecialReserves: "",
    annexTotal1To4: "",
    annexAccumulatedBalanceLoss: "",
    annexDeferredRevenueExpenditure: "",
    annexDeferredTaxAssetsNet: "",
    annexOtherIntangibleAssets: "",
    annexOwnedFund: "",
    annexInvestmentSameGroup: "",
    annexInvestmentSubsidiaries: "",
    annexInvestmentWhollyOwnedSubsidiaries: "",
    annexInvestmentOtherNbfcs: "",
    annexBookValueSameGroup: "",
    annexBookValueSubsidiaries: "",
    annexBookValueWhollyOwnedSubsidiariesJvAbroad: "",
    annexTotal6And7: "",
    annexExcessOver10PercentOwnedFund: "",
    annexNetOwnedFund: "",

    annexureDetails: "",
    purpose: "RBI statutory compliance for NBFCs",
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
  const optionWithValue = (optionText, value) => {
    const v = String(value || "").trim();
    return v ? `${optionText} ${v}` : optionText;
  };
  const abAnswer = (prefix, value) => {
    const v = String(value || "").trim();
    return `${prefix} ${v || "NA"}`;
  };

  return [
    ["1", "Name of the company", form.companyName],
    ["2", "Certificate of Registration No.", form.certificateOfRegistrationNo],
    ["3", "Registered office Address", form.registeredOfficeAddress],
    ["4", "Corporate office Address", form.corporateOfficeAddress],
    [
      "5",
      "The company has been classified by RBI as: (Investment Company / Loan Company / AFC / NBFC-MFI / NBFC-Factor / IFC / IDF-NBFC)",
      form.rbiClassification,
    ],
    ["6", "Net Owned Fund (in ` Crore) (Calculation of the same is given in the Annex)", form.netOwnedFund],
    ["7", "Total Assets (in ` Crore)", form.totalAssets],
    [
      "8",
      "Asset-Income pattern (in terms of RBI Press Release 1998-99/1269 dated April 8, 1999)",
      [
        abAnswer("a) % of Financial Assets to Total Assets:", form.financialAssetsPct),
        abAnswer("b) % of Financial Income to Gross Income:", form.financialIncomePct),
      ].join("\n"),
    ],
    [
      "9",
      "Whether the company was holding any\nPublic Deposits, as on March 31, ____?\n\nIf Yes, the amount in ` Crore",
      [
        optionWithValue("(Yes/No)", form.publicDepositsHeld),
        form.publicDepositsAmount ? `If Yes, amount in \` Crore: ${form.publicDepositsAmount}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    [
      "10",
      "Has the company transferred a sum not\nless than 20% of its Net Profit for the year\nto Reserve Fund?\n\n(in terms of Sec 45-IC of the RBI Act, 1934).",
      optionWithValue("(Yes/No/NA)", form.reserveFundTransferStatus),
    ],
    [
      "11",
      "Has the company received any FDI?\n\nIf Yes, did the company comply with the\nminimum capitalization norms for the FDI?",
      [
        optionWithValue("(Yes/No)", form.fdiReceived),
        form.fdiCapitalizationCompliance
          ? `If Yes, compliance: ${form.fdiCapitalizationCompliance}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ],
    [
      "12",
      "If the company is classified as an NBFC-\nFactor;\n\na) % of Factoring Assets to Total Assets\n\nb) % of Factoring Income to Gross Income",
      [
        abAnswer("a)", form.nbfcFactorAssetsPct),
        abAnswer("b)", form.nbfcFactorIncomePct),
      ].join("\n"),
    ],
    [
      "13",
      "If the company is classified as an NBFC-\nMFI;\n\n% of Qualifying Assets to Net Assets\n\n(refer to Notification DNBS.PD.No.234 CGM\n(US) 2011 dated December 02, 2011)",
      form.nbfcMfiQualifyingAssetsPct,
    ],
    [
      "14",
      "If the company is classified as an AFC;\n\na) % of Advances given for creation of\nphysical / real assets supporting economic\nactivity to Total Assets\n\nb) % of income generated out of these\nassets to Total Income",
      [
        abAnswer("a)", form.afcPhysicalAssetsPct),
        abAnswer("b)", form.afcIncomeFromPhysicalAssetsPct),
      ].join("\n"),
    ],
    [
      "15",
      "If the company is classified as an NBFC-\nIFC\n\n% of Infrastructure Loans to Total Assets",
      form.infrastructureLoansPct,
    ],
    [
      "16",
      "Has there been any takeover/acquisition of\ncontrol/ change in shareholding/\nManagement during the year which\nrequired prior approval from RBI?\n\n(please refer to DNBR (PD) CC. No.\n065/03.10.001/2015-16 dated July 09, 2015 on\nthe subject for details)",
      [
        optionWithValue("(Yes/No)", form.takeoverChangeStatus),
        "If yes, please specify.",
        String(form.takeoverChangeDetails || "").trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    ],
  ];
}

function buildUniversalPayload({ entityType, form }) {
  const rows = buildMainRows(form);
  const annexTotal6And7 = computeAnnexTotal6And7(form);

  return {
    category: "NBFC",
    certificate_type: "rbi_statutory_auditor_certificate_for_nbfcs",
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
          annexTotal6And7: annexTotal6And7 || String(form.annexTotal6And7 || ""),
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

function RbiNbfcQuickPreview({ form }) {
  const rows = useMemo(() => buildMainRows(form), [form]);
  const annexVal = (v) => String(v || "").trim();
  const autoAnnexTotal6And7 = useMemo(() => computeAnnexTotal6And7(form), [form]);
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

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-center text-lg font-extrabold">
        RBI STATUTORY AUDITOR CERTIFICATE FOR NBFCs
      </div>
      <div className="mt-1 text-center text-sm">Statutory Auditors&apos; Certificate (SAC)</div>

      <p className="mt-4 leading-6">
        We have examined the books of account and records for the financial year ending{" "}
        <strong>{form.financialYearEnd || "__________"}</strong>. Based on the information submitted to us, we certify:
      </p>
      <p className="mt-2 text-sm">(Write NA whichever is not applicable)</p>

      <div className="mt-3 overflow-x-auto">
        <table className="certificate-table compact sac-main-table">
          <thead>
            <tr>
              <th style={{ width: "12%" }}>Sl. No.</th>
              <th style={{ width: "44%", textAlign: "left" }}>Particulars</th>
              <th style={{ textAlign: "left" }}>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{r[0]}</td>
                <td
                  className="whitespace-pre-wrap"
                  style={{ textAlign: "left", verticalAlign: "top" }}
                >
                  {String(r[0]) === "16" ? row16Particulars : r[1]}
                </td>
                <td
                  className="whitespace-pre-wrap"
                  style={{ textAlign: "left", verticalAlign: "top" }}
                >
                  {r[2] || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-sm">
        In terms of paragraph 2 of Notification No. DNBS.201/DG(VL)-2008 dated September 18, 2008, a separate report to the Board of Directors of the company has{" "}
        {form.boardReportMade === "No" ? "not " : ""}been made.
      </p>
      <p className="mt-2 text-sm">
        I {form.para5Understood === "No" ? "have not" : "have"} read and understood paragraph 5 of Notification No. DNBS.201/DG(VL)-2008 dated September 18, 2008.
      </p>

      <div className="mt-4">
        <p className="font-semibold">Annex - Capital Funds (Tier I)</p>
        <div className="mt-2 overflow-x-auto">
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
                <td>{annexVal(form.annexPaidUpEquityCapital)}</td>
              </tr>
              <tr>
                <td>2.</td>
                <td>Pref. shares to be compulsorily converted into equity</td>
                <td>{annexVal(form.annexPrefSharesCompulsorilyConvertible)}</td>
              </tr>
              <tr>
                <td rowSpan={8} className="align-top">3.</td>
                <td>Free Reserves:</td>
                <td></td>
              </tr>
              <tr>
                <td>a. General Reserve</td>
                <td>{annexVal(form.annexGeneralReserve)}</td>
              </tr>
              <tr>
                <td>b. Share Premium</td>
                <td>{annexVal(form.annexSharePremium)}</td>
              </tr>
              <tr>
                <td>c.&nbsp; Capital Reserves</td>
                <td>{annexVal(form.annexCapitalReserves)}</td>
              </tr>
              <tr>
                <td>d. Debenture Redemption Reserve</td>
                <td>{annexVal(form.annexDebentureRedemptionReserve)}</td>
              </tr>
              <tr>
                <td>e. Capital Redemption Reserve</td>
                <td>{annexVal(form.annexCapitalRedemptionReserve)}</td>
              </tr>
              <tr>
                <td>f. Credit Balance in&nbsp; P&amp;L Account</td>
                <td>{annexVal(form.annexCreditBalancePL)}</td>
              </tr>
              <tr>
                <td>g. Other free reserves (may be specified)</td>
                <td>{annexVal(form.annexOtherFreeReserves)}</td>
              </tr>
              <tr>
                <td>4.</td>
                <td>Special Reserves</td>
                <td>{annexVal(form.annexSpecialReserves)}</td>
              </tr>
              <tr>
                <td></td>
                <td>Total of 1 to 4</td>
                <td>{annexVal(form.annexTotal1To4)}</td>
              </tr>
              <tr>
                <td>5.</td>
                <td><strong>Less:</strong> i. Accumulated balance of loss</td>
                <td>{annexVal(form.annexAccumulatedBalanceLoss)}</td>
              </tr>
              <tr>
                <td></td>
                <td>ii. Deferred Revenue Expenditure</td>
                <td>{annexVal(form.annexDeferredRevenueExpenditure)}</td>
              </tr>
              <tr>
                <td></td>
                <td>ii. Deferred Tax Assets (Net)</td>
                <td>{annexVal(form.annexDeferredTaxAssetsNet)}</td>
              </tr>
              <tr>
                <td></td>
                <td>iii. Other intangible Assets</td>
                <td>{annexVal(form.annexOtherIntangibleAssets)}</td>
              </tr>
              <tr>
                <td></td>
                <td><strong>Owned Fund</strong></td>
                <td>{annexVal(form.annexOwnedFund)}</td>
              </tr>
              <tr>
                <td rowSpan={5} className="align-top">6.</td>
                <td>Investment in shares of</td>
                <td></td>
              </tr>
              <tr>
                <td>(i) Companies in the same group</td>
                <td>{annexVal(form.annexInvestmentSameGroup)}</td>
              </tr>
              <tr>
                <td>(ii) Subsidiaries</td>
                <td>{annexVal(form.annexInvestmentSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iii) Wholly Owned Subsidiaries</td>
                <td>{annexVal(form.annexInvestmentWhollyOwnedSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iv) Other NBFCs</td>
                <td>{annexVal(form.annexInvestmentOtherNbfcs)}</td>
              </tr>
              <tr>
                <td rowSpan={3} className="align-top">7.</td>
                <td className="whitespace-pre-wrap">Book value of debentures, bonds  outstanding loans and advances, bills purchased and is counted{"\n"}(including H.P. and lease finance) made to, and deposits with{"\n"}(i) Companies in the same group</td>
                <td>{annexVal(form.annexBookValueSameGroup)}</td>
              </tr>
              <tr>
                <td>(ii) Subsidiaries</td>
                <td>{annexVal(form.annexBookValueSubsidiaries)}</td>
              </tr>
              <tr>
                <td>(iii) Wholly Owned Subsidiaries/Joint Ventures Abroad</td>
                <td>{annexVal(form.annexBookValueWhollyOwnedSubsidiariesJvAbroad)}</td>
              </tr>
              <tr>
                <td>8.</td>
                <td>Total of 6 and 7</td>
                <td>{autoAnnexTotal6And7 || annexVal(form.annexTotal6And7)}</td>
              </tr>
              <tr>
                <td>9.</td>
                <td>Amount in item 8 in excess of 10% of Owned Fund</td>
                <td>{annexVal(form.annexExcessOver10PercentOwnedFund)}</td>
              </tr>
              <tr>
                <td>10.</td>
                <td><strong>Net Owned Fund</strong></td>
                <td>{annexVal(form.annexNetOwnedFund || form.netOwnedFund)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function RbiNbfcForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [entityType, setEntityType] = useState("PRIVATE_LIMITED");
  const [form, setForm] = useState(defaultForm());
  const [draftReady, setDraftReady] = useState(false);
  const [caSettings, setCaSettings] = useState(null);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const applyClient = (client) => {
    const nextEntityType = client?.entity_type || entityType;
    setEntityType(nextEntityType);
    setForm((prev) => ({
      ...prev,
      companyName: client?.company_name || client?.display_name || "",
      cin: client?.cin || "",
      pan: client?.pan || "",
      gstin: client?.gstin || "",
      registeredOfficeAddress: client?.address || "",
    }));
  };

  const selectedFinancialYear = useMemo(
    () => extractFinancialYearEndYear(form.financialYearEnd),
    [form.financialYearEnd]
  );
  const autoAnnexTotal6And7 = useMemo(() => computeAnnexTotal6And7(form), [form]);

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(RBI_NBFC_DRAFT_KEY);
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
      RBI_NBFC_DRAFT_KEY,
      { entityType, form },
      ONE_HOUR_DRAFT_TTL_MS
    );
  }, [entityType, form, isEdit, draftReady]);

  const financialYearEndOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYears = Array.from({ length: 21 }, (_, idx) =>
      String(currentYear + 5 - idx)
    );
    if (
      selectedFinancialYear &&
      !baseYears.includes(selectedFinancialYear)
    ) {
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
        if (type !== "rbi_statutory_auditor_certificate_for_nbfcs") {
          toast.error("This is not an RBI NBFC certificate.");
          navigate(-1);
          return;
        }
        if (variant === LIQUID_VARIANT) {
          toast.message("Opening liquid assets certificate editor.");
          navigate(`/rbi-liquid-assets/${id}`);
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
    if (!String(form.rbiClassification || "").trim()) return "RBI classification is required.";
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
        clearDraft(RBI_NBFC_DRAFT_KEY);
        toast.success("RBI NBFC certificate updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(RBI_NBFC_DRAFT_KEY);
        toast.success("RBI NBFC certificate created successfully!");
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
            <Button form="rbi-nbfc-form" type="submit" disabled={loading}>
              <Save className="h-4 w-4 mr-2" />
              {loading ? (isEdit ? "Updating..." : "Generating...") : isEdit ? "Update" : "Generate"}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="bg-card border border-border rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-display font-bold text-foreground mb-2">
              {isEdit
                ? "Edit RBI Statutory Auditor Certificate for NBFCs"
                : "RBI Statutory Auditor Certificate for NBFCs"}
            </h1>
            <p className="text-muted-foreground mb-8">
              Fill statutory checklist details as per RBI SAC format.
            </p>

            <form id="rbi-nbfc-form" onSubmit={handleSubmit} className="space-y-8">
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

                <ClientSelector entityType={entityType} onSelect={applyClient} />

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Company Name *</Label>
                    <Input className="mt-2" value={form.companyName} onChange={(e) => update("companyName", e.target.value)} />
                  </div>
                  <div>
                    <Label>Certificate of Registration No.</Label>
                    <Input
                      className="mt-2"
                      value={form.certificateOfRegistrationNo}
                      onChange={(e) => update("certificateOfRegistrationNo", e.target.value)}
                    />
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
                      onChange={(e) =>
                        update("financialYearEnd", formatFinancialYearEnd(e.target.value))
                      }
                    >
                      <option value="">Select year</option>
                      {financialYearEndOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Auto-format: March 31, YYYY
                    </p>
                  </div>
                  <div>
                    <Label>RBI Classification *</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.rbiClassification}
                      onChange={(e) => update("rbiClassification", e.target.value)}
                    >
                      <option value="">Select classification</option>
                      {RBI_CLASSIFICATIONS.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Registered Office Address</Label>
                    <Textarea
                      className="mt-2"
                      rows={2}
                      value={form.registeredOfficeAddress}
                      onChange={(e) => update("registeredOfficeAddress", e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>Corporate Office Address</Label>
                    <Textarea
                      className="mt-2"
                      rows={2}
                      value={form.corporateOfficeAddress}
                      onChange={(e) => update("corporateOfficeAddress", e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  RBI Checklist Details
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label>Net Owned Fund (in Crore)</Label>
                    <Input className="mt-2" value={form.netOwnedFund} onChange={(e) => update("netOwnedFund", e.target.value)} />
                  </div>
                  <div>
                    <Label>Total Assets</Label>
                    <Input className="mt-2" value={form.totalAssets} onChange={(e) => update("totalAssets", e.target.value)} />
                  </div>
                  <div>
                    <Label>% Financial Assets to Total Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.financialAssetsPct}
                      onChange={(e) => update("financialAssetsPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>% Financial Income to Gross Income</Label>
                    <Input
                      className="mt-2"
                      value={form.financialIncomePct}
                      onChange={(e) => update("financialIncomePct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Public Deposits Held</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.publicDepositsHeld}
                      onChange={(e) => update("publicDepositsHeld", e.target.value)}
                    >
                      {yesNoOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Public Deposits Amount (in Crore)</Label>
                    <Input
                      className="mt-2"
                      value={form.publicDepositsAmount}
                      onChange={(e) => update("publicDepositsAmount", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Transferred 20% NP to Reserve Fund</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.reserveFundTransferStatus}
                      onChange={(e) => update("reserveFundTransferStatus", e.target.value)}
                    >
                      {yesNoNaOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>FDI Received</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.fdiReceived}
                      onChange={(e) => update("fdiReceived", e.target.value)}
                    >
                      {yesNoOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>FDI Capitalization Compliance</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.fdiCapitalizationCompliance}
                      onChange={(e) => update("fdiCapitalizationCompliance", e.target.value)}
                    >
                      {yesNoNaOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>NBFC-Factor: % Factoring Assets to Total Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.nbfcFactorAssetsPct}
                      onChange={(e) => update("nbfcFactorAssetsPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>NBFC-Factor: % Factoring Income to Gross Income</Label>
                    <Input
                      className="mt-2"
                      value={form.nbfcFactorIncomePct}
                      onChange={(e) => update("nbfcFactorIncomePct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>NBFC-MFI: % Qualifying Assets to Net Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.nbfcMfiQualifyingAssetsPct}
                      onChange={(e) => update("nbfcMfiQualifyingAssetsPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>AFC: % Advances for Physical Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.afcPhysicalAssetsPct}
                      onChange={(e) => update("afcPhysicalAssetsPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>AFC: % Income from Such Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.afcIncomeFromPhysicalAssetsPct}
                      onChange={(e) => update("afcIncomeFromPhysicalAssetsPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>% Infrastructure Loans to Total Assets</Label>
                    <Input
                      className="mt-2"
                      value={form.infrastructureLoansPct}
                      onChange={(e) => update("infrastructureLoansPct", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Takeover/Change in Control/Management</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.takeoverChangeStatus}
                      onChange={(e) => update("takeoverChangeStatus", e.target.value)}
                    >
                      {yesNoOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <Label>Takeover/Change Details</Label>
                    <Textarea
                      className="mt-2"
                      rows={2}
                      value={form.takeoverChangeDetails}
                      onChange={(e) => update("takeoverChangeDetails", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Separate Report to Board Made</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.boardReportMade}
                      onChange={(e) => update("boardReportMade", e.target.value)}
                    >
                      {yesNoOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Paragraph 5 Read & Understood</Label>
                    <select
                      className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      value={form.para5Understood}
                      onChange={(e) => update("para5Understood", e.target.value)}
                    >
                      {yesNoOptions.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                  Annex - Capital Funds (Tier I)
                </h2>
                <div className="grid md:grid-cols-2 gap-6">
                  {ANNEX_FIELD_DEFS.map((field) => (
                    <div key={field.key}>
                      <Label>{field.label}</Label>
                      <Input
                        className="mt-2"
                        value={
                          field.key === "annexTotal6And7"
                            ? (autoAnnexTotal6And7 || form[field.key] || "")
                            : (form[field.key] || "")
                        }
                        onChange={(e) => {
                          if (field.readOnly) return;
                          update(field.key, e.target.value);
                        }}
                        readOnly={Boolean(field.readOnly)}
                        placeholder="Amount in crore"
                      />
                    </div>
                  ))}
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
                    <Input className="mt-2" value={form.date} onChange={(e) => update("date", e.target.value)} />
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
            <RbiNbfcQuickPreview form={form} />
          </div>
        </div>
      </div>
    </div>
  );
}


