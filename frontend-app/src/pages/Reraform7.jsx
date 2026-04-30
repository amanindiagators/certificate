import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";

// UI components (Standard HTML elements will be used for Selects)
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import ClientSelector from "../components/ClientSelector";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
// Icons
import { ArrowLeft, Loader2, PlusCircle, Trash2 } from "lucide-react";

const RERA_FORM7_DRAFT_KEY = "draft:rera_form7_v1";

// --- Data Structures ---

const createApartmentRow = () => ({
  id: crypto.randomUUID(),
  blockNumber: '',
  apartmentType: '', // 1BHK, 2BHK etc.
  carpetArea: '',
  totalSanctioned: '',
  promoterBooked: '',
  promoterSold: '',
  landownerBooked: '',
  landownerSold: '',
  bookingPercentage: '', // Calculated
});

const createAllotteeRow = () => ({
  id: crypto.randomUUID(),
  name: '',
  address: '',
  contactNumber: '',
  email: ''
});

const createGarageRow = () => ({
  id: crypto.randomUUID(),
  blockNumber: '',
  totalSanctioned: '',
  booked: '',
  sold: ''
});

const approvalTypes = [
  "NOC for Environment",
  "Fire N.O.C.",
  "Water Supply Permission",
  "NOC from Airport Authority of India",
  "Other Approval(s), if any, Required for the Project.",
];

const createApprovalRows = () => approvalTypes.map((name, index) => ({
  id: crypto.randomUUID(),
  sNo: index + 1,
  approvalName: name,
  issuingAuthority: '',
  appliedDate: '',
  issuanceDate: '',
  annexureNo: ''
}));

const enforceDefaultApprovalNames = (rows = []) =>
  (Array.isArray(rows) ? rows : []).map((row, index) => ({
    ...row,
    approvalName: index < approvalTypes.length
      ? approvalTypes[index]
      : String(row?.approvalName || "").trim(),
  }));

const constructionProgressTasks = [
  "Excavation (if any)",
  "Basements (if any)",
  "Podiums (if any)",
  "Plinth",
  "Stilt Floor",
  "Slabs of Super Structure",
  "Internal walls, Internal Plaster, Floorings, Doors and Windows within Flats /Premises.",
  "Sanitary Fittings within the Flat/Premises, Electrical Fittings within the Flat/Premises",
  "Staircases, Lifts Wells and Lobbies at each Floor level, Overhead and Underground Water Tanks.",
  "External plumbing and external plaster, elevation, completion of terraces with waterproofing of the Building/Wing.",
  "Installation of Lifts, water pumps, Fire Fighting Fittings and Equipment as per CFO NOC, Electrical fittings, Mechanical Equipment, compliance to conditions of environment/CRZ NOC,\n Finishing to entrance lobby/s, plinth protection, paving of areas appurtenant to Building/Wing, Compound Wall and all other requirements as may be required to complete project as per Specifications in Agreement of Sale.",
  "Any other activities."
];

const createConstructionProgressRows = () => constructionProgressTasks.map(task => ({
  id: crypto.randomUUID(),
  task,
  percentage: '',
  completionDate: ''
}));

const createConstructionProgressWing = (planCaseNo = "", baseTasks = null) => ({
  id: crypto.randomUUID(),
  planCaseNo,
  tasks: Array.isArray(baseTasks) && baseTasks.length
    ? baseTasks.map((row, idx) => ({
      id: crypto.randomUUID(),
      task: row?.task || constructionProgressTasks[idx] || "",
      percentage: row?.percentage || "",
      completionDate: normalizeDateInput(row?.completionDate || ""),
    }))
    : createConstructionProgressRows(),
});

const amenitiesTasks = [
  "Internal Roads & Footpaths", "Water Supply", "Sewerage (Chamber, Line, Septic Tank, STP)",
  "Storm Water Drains", "Landscaping & Tree Planting", "Street Lighting", "Community Buildings",
  "Treatment and Disposal of Sewage and Sullage Water", "Solid Waste Management & Disposal",
  "Water Conservation / Rain Water Harvesting", "Energy Management",
  "Fire Protection and Fire Safety Requirements", "Closed Parking", "Open Parking",
  "Electrical Meter Room, Sub-Station, Receiving Station"
];
const defaultAmenityOtherLabel = "Others (Option to Add More)";

const createAmenityRow = (task = "") => ({
  id: crypto.randomUUID(),
  task,
  proposed: 'No',
  percentage: '',
  completionDate: ''
});

const createAmenitiesRows = () => [
  ...amenitiesTasks.map(task => createAmenityRow(task)),
  createAmenityRow(defaultAmenityOtherLabel),
];

const plottedDevelopmentTasks = [
  "Internal Roads and foot paths", "Water Supply", "Sewerage Chambers Septic Tank",
  "Drains", "Parks, Land Scaping and Tree Planting", "Street Lighting",
  "Disposal of sewage & sullage water", "Water conservation/Rain Water Harvesting", "Energy Management"
];

const createPlottedDevelopmentRows = () => plottedDevelopmentTasks.map(task => ({
  id: crypto.randomUUID(),
  task,
  proposed: 'No',
  percentage: '',
  completionDate: ''
}));

const financialProgressItems = [
  "Project Account No.",
  "Estimated Cost of the Project including land cost at the start of the Project",
  "Estimated Development Cost of the Project at the start of the Project.(Excluding Land Cost)",
  "Any Variation in Development Cost which is declared at the start of the Project .",
  "Amount received during the Quarter",
  "Actual Cost Incurred during the Quarter",
  "Net amount at end of the Quarter",
  "Total expenditure on Project till date",
  "Cumulative fund collected till the end of Quarter in question",
  "Cumulative expenditure done till the end of Quarter in question",
];

const createFinancialProgressRows = () => financialProgressItems.map(item => ({
  id: crypto.randomUUID(),
  particulars: item,
  amount: ''
}));

const unitAllocationTypeLabels = [
  { key: "1bhk", label: "1 BHK" },
  { key: "2bhk", label: "2 BHK" },
  { key: "3bhk", label: "3 BHK" },
  { key: "4bhk", label: "4 BHK" },
  { key: "shop", label: "Shop" },
  { key: "bungalow", label: "Bungalow" },
  { key: "plot", label: "Plot etc" },
];

const createUnitAllocationTextMap = () =>
  unitAllocationTypeLabels.reduce((acc, row) => {
    acc[row.key] = "";
    return acc;
  }, {});

const defaultApartmentTypeLabels = ["1 BHK", "2 BHK", "3 BHK", "Shop", "Bungalow", "Plot etc"];

const createApartmentTypeBreakupRow = (type = "", count = "", carpetArea = "") => ({
  id: crypto.randomUUID(),
  type,
  count,
  carpetArea,
});

const createDefaultApartmentTypeBreakup = () =>
  defaultApartmentTypeLabels.map((label) => createApartmentTypeBreakupRow(label, ""));

const parseQty = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : 0;
};

const getApartmentTypeBreakupTotal = (rows = []) =>
  (Array.isArray(rows) ? rows : []).reduce((sum, row) => sum + parseQty(row?.count), 0);

const normalizeTypeLabel = (v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const UNIT_ALLOCATION_KEY_BY_TYPE_LABEL = unitAllocationTypeLabels.reduce((acc, row) => {
  acc[normalizeTypeLabel(row.label)] = row.key;
  return acc;
}, {});

const calculateBookingPercentage = (sanctioned, promoterBooked, landownerBooked) => {
  const san = parseQty(sanctioned);
  if (san <= 0) return "";
  const pBook = parseQty(promoterBooked);
  const lBook = parseQty(landownerBooked);
  return ((pBook + lBook) / san * 100).toFixed(2);
};

function autoFormatDDMMYYYY(value) {
  let v = String(value || "").replace(/\D/g, "");
  if (v.length > 8) v = v.slice(0, 8);
  if (v.length >= 5) return `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`;
  if (v.length >= 3) return `${v.slice(0, 2)}-${v.slice(2)}`;
  return v;
}

function normalizeDateInput(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
  return autoFormatDDMMYYYY(s);
}

function todayDDMMYYYY() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

function normalizeFormDates(savedForm = {}) {
  const next = { ...savedForm };
  next.meta = { ...(savedForm.meta || {}) };
  next.projectDetails = { ...(savedForm.projectDetails || {}) };
  next.undertaking = { ...(savedForm.undertaking || {}) };

  next.meta.date = normalizeDateInput(next.meta.date);
  next.projectDetails.startDate = normalizeDateInput(next.projectDetails.startDate);
  next.projectDetails.validUpTo = normalizeDateInput(next.projectDetails.validUpTo);
  next.undertaking.date = normalizeDateInput(next.undertaking.date);

  const baseApprovals = Array.isArray(savedForm.buildingApprovals) && savedForm.buildingApprovals.length
    ? savedForm.buildingApprovals
    : createApprovalRows();
  next.buildingApprovals = enforceDefaultApprovalNames(baseApprovals).map((row) => ({
    ...row,
    appliedDate: normalizeDateInput(row?.appliedDate),
    issuanceDate: normalizeDateInput(row?.issuanceDate),
  }));

  next.constructionProgress = { ...(savedForm.constructionProgress || {}) };
  const legacyTasks = Array.isArray(savedForm?.constructionProgress?.tasks)
    ? savedForm.constructionProgress.tasks.map((row) => ({
      ...row,
      completionDate: normalizeDateInput(row?.completionDate),
    }))
    : createConstructionProgressRows();

  const savedWings = Array.isArray(savedForm?.constructionProgress?.wings)
    ? savedForm.constructionProgress.wings
    : [];

  let normalizedWings = [];
  if (savedWings.length) {
    normalizedWings = savedWings.map((wing) => ({
      id: wing?.id || crypto.randomUUID(),
      planCaseNo: wing?.planCaseNo || "",
      tasks: Array.isArray(wing?.tasks) && wing.tasks.length
        ? wing.tasks.map((row, idx) => ({
          ...row,
          id: row?.id || crypto.randomUUID(),
          task: row?.task || constructionProgressTasks[idx] || "",
          completionDate: normalizeDateInput(row?.completionDate),
        }))
        : createConstructionProgressRows(),
    }));
  } else {
    const planCaseRows = String(savedForm?.constructionProgress?.planCaseNo || "")
      .split(/[\n,]+/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (planCaseRows.length > 1) {
      normalizedWings = planCaseRows.map((pc) => createConstructionProgressWing(pc, legacyTasks));
    } else {
      normalizedWings = [createConstructionProgressWing(savedForm?.constructionProgress?.planCaseNo || "", legacyTasks)];
    }
  }

  next.constructionProgress.wings = normalizedWings;
  next.constructionProgress.planCaseNo = normalizedWings.map((w) => w.planCaseNo).filter(Boolean).join(", ");
  next.constructionProgress.tasks = normalizedWings[0]?.tasks || createConstructionProgressRows();

  if (Array.isArray(savedForm.amenities)) {
    const savedAmenities = savedForm.amenities;
    const fixedAmenities = amenitiesTasks.map((task, index) => {
      const row = savedAmenities[index] || {};
      return {
        id: row?.id || crypto.randomUUID(),
        task,
        proposed: row?.proposed || "No",
        percentage: row?.percentage || "",
        completionDate: normalizeDateInput(row?.completionDate),
      };
    });

    const extraRowsFromSaved = savedAmenities
      .slice(amenitiesTasks.length)
      .map((row) => ({
        id: row?.id || crypto.randomUUID(),
        task: String(row?.task || "").trim(),
        proposed: row?.proposed || "No",
        percentage: row?.percentage || "",
        completionDate: normalizeDateInput(row?.completionDate),
      }))
      .filter((row) => row.task || row.percentage || row.completionDate || row.proposed !== "No");

    next.amenities = [...fixedAmenities, ...extraRowsFromSaved];

    if (!next.amenities.some((row) => String(row?.task || "").trim() === defaultAmenityOtherLabel)) {
      next.amenities.push(createAmenityRow(defaultAmenityOtherLabel));
    }
  } else {
    next.amenities = createAmenitiesRows();
  }

  next.plottedDevelopment = Array.isArray(savedForm.plottedDevelopment)
    ? savedForm.plottedDevelopment.map((row) => ({
      ...row,
      completionDate: normalizeDateInput(row?.completionDate),
    }))
    : savedForm.plottedDevelopment;

  const unitAllocation = { ...(savedForm.unitAllocation || {}) };
  next.unitAllocation = {
    ...unitAllocation,
    sanctioned: {
      ...createUnitAllocationTextMap(),
      ...(unitAllocation.sanctioned || {}),
    },
    allotmentByType: {
      ...createUnitAllocationTextMap(),
      ...(unitAllocation.allotmentByType || {}),
    },
    cancellationByType: {
      ...createUnitAllocationTextMap(),
      ...(unitAllocation.cancellationByType || {}),
    },
    allotmentDetails: unitAllocation.allotmentDetails || "",
    cancellationDetails: unitAllocation.cancellationDetails || "",
  };
  const savedTypeBreakup = Array.isArray(savedForm.apartmentTypeBreakup)
    ? savedForm.apartmentTypeBreakup
    : [];
  if (savedTypeBreakup.length) {
    next.apartmentTypeBreakup = savedTypeBreakup.map((row) => ({
      id: row?.id || crypto.randomUUID(),
      type: String(row?.type || "").trim(),
      count: String(row?.count ?? "").trim(),
      carpetArea: String(row?.carpetArea ?? "").trim(),
    }));
  } else {
    const legacyCarpetLines = String(savedForm?.apartmentInventory?.[0]?.carpetArea || "")
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const mappedRows = unitAllocationTypeLabels.map((row) => ({
      id: crypto.randomUUID(),
      type: row.label,
      count: String(unitAllocation?.sanctioned?.[row.key] ?? "").trim(),
      carpetArea: "",
    }));
    const hasMappedCount = mappedRows.some((row) => row.count);
    if (hasMappedCount) {
      mappedRows.forEach((row, idx) => {
        row.carpetArea = legacyCarpetLines[idx] || "";
      });
      next.apartmentTypeBreakup = mappedRows;
    } else {
      const legacyApartmentTypeText = String(savedForm?.apartmentInventory?.[0]?.apartmentType || "").trim();
      const legacyRows = legacyApartmentTypeText
        .split(/\r?\n+/)
        .map((line) => line.replace(/^\s*\d+\s*[.)-]?\s*/, "").trim())
        .filter(Boolean)
        .map((type, idx) => createApartmentTypeBreakupRow(type, "", legacyCarpetLines[idx] || ""));
      next.apartmentTypeBreakup = legacyRows.length ? legacyRows : createDefaultApartmentTypeBreakup();
    }
  }
  const breakupTypeSummary = next.apartmentTypeBreakup
    .map((row, idx) => {
      const type = String(row?.type || "").trim();
      return type ? `${idx + 1}. ${type}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const breakupCarpetAreaSummary = next.apartmentTypeBreakup
    .map((row, idx) => {
      const carpet = String(row?.carpetArea || "").trim();
      return carpet ? `${idx + 1}. ${carpet}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const breakupTotal = getApartmentTypeBreakupTotal(next.apartmentTypeBreakup);
  if (Array.isArray(next.apartmentInventory) && next.apartmentInventory.length) {
    const firstRow = { ...next.apartmentInventory[0] };
    const sanctionedValue = breakupTotal > 0
      ? String(breakupTotal)
      : String(firstRow.totalSanctioned || "");
    next.apartmentInventory = [{
      ...firstRow,
      apartmentType: breakupTypeSummary || String(firstRow.apartmentType || ""),
      carpetArea: breakupCarpetAreaSummary || String(firstRow.carpetArea || ""),
      totalSanctioned: sanctionedValue,
      bookingPercentage:
        calculateBookingPercentage(
          sanctionedValue,
          firstRow.promoterBooked,
          firstRow.landownerBooked
        ) || String(firstRow.bookingPercentage || ""),
    }];
  }
  next.brochureProspectus = savedForm.brochureProspectus || "Not Attached";

  const misc = { ...(savedForm.miscellaneous || {}) };
  const legalRaw = misc.legalCases;
  const legalObj = legalRaw && typeof legalRaw === "object" ? legalRaw : {};
  const legalLines = typeof legalRaw === "string"
    ? legalRaw.split(/\r?\n/).map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const saleParts = String(misc.saleAgreement || "").split(",");

  next.miscellaneous = {
    ...misc,
    legalCaseNo: misc.legalCaseNo || legalObj.caseNo || legalLines[0] || "",
    legalParties: misc.legalParties || legalObj.parties || legalLines[1] || "",
    executionCases: misc.executionCases || legalObj.executionCases || legalLines[2] || "",
    executionCaseNo: misc.executionCaseNo || legalObj.executionCaseNo || "",
    executionParties: misc.executionParties || legalObj.executionParties || "",
    suoMotoCases: misc.suoMotoCases || legalObj.suoMotoCases || legalLines[3] || "",
    suoMotoCaseNo: misc.suoMotoCaseNo || legalObj.suoMotoCaseNo || "",
    suoMotoParties: misc.suoMotoParties || legalObj.suoMotoParties || "",
    certificateCases: misc.certificateCases || legalObj.certificateCases || legalLines[4] || "",
    certificateCaseNo: misc.certificateCaseNo || legalObj.certificateCaseNo || "",
    certificateParties: misc.certificateParties || legalObj.certificateParties || "",
    saleDeed: misc.saleDeed || saleParts[0]?.trim() || "",
    agreementForSale: misc.agreementForSale || saleParts[1]?.trim() || "",
    possessions: misc.possessions || "",
  };

  return next;
}


const getDefaultFormState = () => ({
  id: null,
  meta: {
    quarterEnding: 'March',
    year: '',
    date: todayDDMMYYYY()
  },
  promoterDetails: {
    registrationNumber: '', // CIN/LLP etc
    firmName: '',
    firmAddress: '',
    experienceTotal: '',
    experienceRera: '',
  },
  // Projects count
  projectsBeforeRera: { residential: '', commercial: '', mixed: '', plotted: '' },
  projectsAfterRera: { residential: '', commercial: '', mixed: '', plotted: '' },

  projectDetails: {
    registrationNumber: '',
    nameOfProject: '',
    nameOfPromoter: '',
    projectAddress: '',
    nameOfCoPromoter: '',
    validUpTo: '',
    startDate: '',
    projectType: 'Residential', // Default
    mapValidity: ''
  },

  // Dynamic Tables
  apartmentInventory: [createApartmentRow()],
  apartmentTypeBreakup: createDefaultApartmentTypeBreakup(),
  associationDetails: {
    name: '',
    allottees: [createAllotteeRow()] // Only used if booking > 50%
  },
  garageInventory: [createGarageRow()],
  buildingApprovals: createApprovalRows(),
  constructionProgress: {
    planCaseNo: '',
    wings: [createConstructionProgressWing()],
    tasks: createConstructionProgressRows()
  },
  amenities: createAmenitiesRows(),
  plottedDevelopment: createPlottedDevelopmentRows(),
  financialProgress: createFinancialProgressRows(),
  geoTaggedPhotos: {
    frontElevation: "Not Attached",
    rearElevation: "Not Attached",
    sideElevation: "Not Attached",
    eachFloor: "Not Attached",
  },
  mortgageDetails: '',
  miscellaneous: {
    legalCaseNo: '',
    legalParties: '',
    executionCases: '',
    executionCaseNo: '',
    executionParties: '',
    suoMotoCases: '',
    suoMotoCaseNo: '',
    suoMotoParties: '',
    certificateCases: '',
    certificateCaseNo: '',
    certificateParties: '',
    saleDeed: '',
    agreementForSale: '',
    possessions: ''
  },
  milestoneChartLag: '',
  unitAllocation: {
    sanctioned: createUnitAllocationTextMap(),
    allotmentByType: createUnitAllocationTextMap(),
    cancellationByType: createUnitAllocationTextMap(),
    allotmentDetails: '',
    cancellationDetails: ''
  },
  brochureProspectus: "Not Attached",
  grievanceOfficer: { name: '', contact: '', email: '', address: '' },
  undertaking: { name: '', date: todayDDMMYYYY() }
});

const ReraForm7 = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState(getDefaultFormState());
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    if (isEdit) {
      setDraftReady(true);
      return;
    }
    const draft = loadDraftWithTTL(RERA_FORM7_DRAFT_KEY);
    if (draft) {
      setFormState((prev) => ({ ...prev, ...draft }));
      toast.message("Draft restored (saved within last 1 hour).");
    }
    setDraftReady(true);
  }, [isEdit]);

  useEffect(() => {
    if (isEdit || !draftReady) return;
    saveDraftWithTTL(
      RERA_FORM7_DRAFT_KEY,
      formState,
      ONE_HOUR_DRAFT_TTL_MS
    );
  }, [formState, isEdit, draftReady]);

  // --- Calculations ---

  // Calculate total booking percentage across all rows to determine if Association section shows
  const apartmentInventory = formState.apartmentInventory;
  const apartmentTypeBreakup = useMemo(
    () => (Array.isArray(formState.apartmentTypeBreakup) ? formState.apartmentTypeBreakup : []),
    [formState.apartmentTypeBreakup]
  );
  const totalSanctionedFromTypeBreakup = useMemo(
    () => getApartmentTypeBreakupTotal(apartmentTypeBreakup),
    [apartmentTypeBreakup]
  );
  const totalBookingPercentage = useMemo(() => {
    if (!apartmentInventory.length) return 0;

    let totalSanctioned = 0;
    let totalBooked = 0;

    apartmentInventory.forEach(row => {
      const sanctioned = parseFloat(row.totalSanctioned) || 0;
      const pBooked = parseFloat(row.promoterBooked) || 0;
      const lBooked = parseFloat(row.landownerBooked) || 0;

      totalSanctioned += sanctioned;
      totalBooked += (pBooked + lBooked);
    });

    if (totalSanctioned <= 0) {
      totalSanctioned = totalSanctionedFromTypeBreakup;
    }

    return totalSanctioned > 0 ? (totalBooked / totalSanctioned) * 100 : 0;
  }, [apartmentInventory, totalSanctionedFromTypeBreakup]);

  // Load Data if Edit Mode
  useEffect(() => {
    if (isEdit && id) {
      const loadCertificate = async () => {
        try {
          setIsSubmitting(true);
          const res = await api.get(`/api/certificates/${id}`);
          const cert = res.data;

          const savedForm =
            cert?.data?.extras?.formData;

          if (savedForm && typeof savedForm === "object") {
            const normalized = normalizeFormDates(savedForm);
            setFormState({
              ...getDefaultFormState(), // ensure missing fields exist
              ...normalized,
              id: cert.id,
            });
          } else {
            toast.error("Saved Form-7 data not found");
          }
        } catch (err) {
          console.error("Load error:", err);
          toast.error("Failed to load report");
          navigate("/history");
        } finally {
          setIsSubmitting(false);
        }
      };

      loadCertificate();
    }
  }, [isEdit, id, navigate]);

  // --- Handlers ---

  const handleDeepChange = (section, field, value) => {
    setFormState(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleFlatObjectChange = (section, field, value) => {
    setFormState(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value
      }
    }));
  };

  const handleNestedObjectChange = (section, objectField, key, value) => {
    setFormState(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [objectField]: {
          ...(prev[section]?.[objectField] || {}),
          [key]: value
        }
      }
    }));
  };

  const syncApartmentSummaryFromTypeBreakup = (prevState, nextBreakupRows) => {
    const total = getApartmentTypeBreakupTotal(nextBreakupRows);
    const firstRow = Array.isArray(prevState.apartmentInventory) && prevState.apartmentInventory.length
      ? { ...prevState.apartmentInventory[0] }
      : createApartmentRow();
    const apartmentTypeSummary = nextBreakupRows
      .map((row, idx) => {
        const type = String(row?.type || "").trim();
        return type ? `${idx + 1}. ${type}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const apartmentCarpetAreaSummary = nextBreakupRows
      .map((row, idx) => {
        const carpet = String(row?.carpetArea || "").trim();
        return carpet ? `${idx + 1}. ${carpet}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const nextBooking = calculateBookingPercentage(total, firstRow.promoterBooked, firstRow.landownerBooked);

    const nextSanctionedMap = {
      ...createUnitAllocationTextMap(),
      ...(prevState.unitAllocation?.sanctioned || {}),
    };
    Object.keys(nextSanctionedMap).forEach((key) => {
      nextSanctionedMap[key] = "";
    });
    nextBreakupRows.forEach((row) => {
      const normalized = normalizeTypeLabel(row?.type);
      const mapKey = UNIT_ALLOCATION_KEY_BY_TYPE_LABEL[normalized];
      if (!mapKey) return;
      const existing = parseQty(nextSanctionedMap[mapKey]);
      const incoming = parseQty(row?.count);
      const nextValue = existing + incoming;
      nextSanctionedMap[mapKey] = nextValue > 0 ? String(nextValue) : "";
    });

    return {
      ...prevState,
      apartmentTypeBreakup: nextBreakupRows,
      apartmentInventory: [{
        ...firstRow,
        apartmentType: apartmentTypeSummary,
        carpetArea: apartmentCarpetAreaSummary,
        totalSanctioned: total > 0 ? String(total) : "",
        bookingPercentage: nextBooking,
      }],
      unitAllocation: {
        ...prevState.unitAllocation,
        sanctioned: nextSanctionedMap,
      },
    };
  };

  const handleApartmentTypeBreakupChange = (id, field, value) => {
    setFormState((prev) => {
      const currentRows = Array.isArray(prev.apartmentTypeBreakup) && prev.apartmentTypeBreakup.length
        ? prev.apartmentTypeBreakup
        : createDefaultApartmentTypeBreakup();
      const nextRows = currentRows.map((row) => {
        if (row.id !== id) return row;
        return { ...row, [field]: value };
      });
      return syncApartmentSummaryFromTypeBreakup(prev, nextRows);
    });
  };

  const addApartmentTypeBreakupRow = () => {
    setFormState((prev) => {
      const currentRows = Array.isArray(prev.apartmentTypeBreakup) ? prev.apartmentTypeBreakup : [];
      const nextRows = [...currentRows, createApartmentTypeBreakupRow()];
      return syncApartmentSummaryFromTypeBreakup(prev, nextRows);
    });
  };

  const removeApartmentTypeBreakupRow = (id) => {
    setFormState((prev) => {
      const currentRows = Array.isArray(prev.apartmentTypeBreakup) && prev.apartmentTypeBreakup.length
        ? prev.apartmentTypeBreakup
        : createDefaultApartmentTypeBreakup();
      const filtered = currentRows.filter((row) => row.id !== id);
      const nextRows = filtered.length ? filtered : [createApartmentTypeBreakupRow()];
      return syncApartmentSummaryFromTypeBreakup(prev, nextRows);
    });
  };


  const handleArrayChange = (arrayName, id, field, value) => {
    setFormState(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].map(row => {
        if (row.id !== id) return row;

        const updatedRow = { ...row, [field]: value };

        // Auto-calculate row percentage for apartments
        if (arrayName === 'apartmentInventory' && (field === 'totalSanctioned' || field === 'promoterBooked' || field === 'landownerBooked')) {
          const sanFromTypeBreakup = getApartmentTypeBreakupTotal(prev.apartmentTypeBreakup || []);
          const san = parseFloat(updatedRow.totalSanctioned) || sanFromTypeBreakup || 0;
          updatedRow.bookingPercentage = calculateBookingPercentage(
            san,
            updatedRow.promoterBooked,
            updatedRow.landownerBooked
          );
        }

        return updatedRow;
      })
    }));
  };

  const handleSingleApartmentChange = (field, value) => {
    setFormState(prev => {
      const firstRow = Array.isArray(prev.apartmentInventory) && prev.apartmentInventory.length
        ? { ...prev.apartmentInventory[0] }
        : createApartmentRow();

      const updatedRow = { ...firstRow, [field]: value };

      if (field === 'totalSanctioned' || field === 'promoterBooked' || field === 'landownerBooked') {
        const sanFromTypeBreakup = getApartmentTypeBreakupTotal(prev.apartmentTypeBreakup || []);
        const san = parseFloat(updatedRow.totalSanctioned) || sanFromTypeBreakup || 0;
        updatedRow.bookingPercentage = calculateBookingPercentage(
          san,
          updatedRow.promoterBooked,
          updatedRow.landownerBooked
        );
      }

      return {
        ...prev,
        apartmentInventory: [updatedRow]
      };
    });
  };

  const handleSingleGarageChange = (field, value) => {
    setFormState(prev => {
      const firstRow = Array.isArray(prev.garageInventory) && prev.garageInventory.length
        ? { ...prev.garageInventory[0] }
        : createGarageRow();

      return {
        ...prev,
        garageInventory: [{ ...firstRow, [field]: value }]
      };
    });
  };

  const handleConstructionProgressChange = (wingId, taskId, field, value) => {
    setFormState(prev => {
      const wings = Array.isArray(prev.constructionProgress?.wings) && prev.constructionProgress.wings.length
        ? prev.constructionProgress.wings
        : [createConstructionProgressWing(prev.constructionProgress?.planCaseNo || "", prev.constructionProgress?.tasks)];

      const nextWings = wings.map((wing) => {
        if (wing.id !== wingId) return wing;
        return {
          ...wing,
          tasks: wing.tasks.map((t) =>
            t.id === taskId ? { ...t, [field]: value } : t
          ),
        };
      });

      return {
        ...prev,
        constructionProgress: {
          ...prev.constructionProgress,
          wings: nextWings,
          planCaseNo: nextWings.map((w) => String(w.planCaseNo || "").trim()).filter(Boolean).join(", "),
          tasks: nextWings[0]?.tasks || [],
        },
      };
    });
  };

  const handleConstructionWingPlanCaseNoChange = (wingId, value) => {
    setFormState(prev => {
      const wings = Array.isArray(prev.constructionProgress?.wings) && prev.constructionProgress.wings.length
        ? prev.constructionProgress.wings
        : [createConstructionProgressWing(prev.constructionProgress?.planCaseNo || "", prev.constructionProgress?.tasks)];

      const nextWings = wings.map((wing) => wing.id === wingId ? { ...wing, planCaseNo: value } : wing);
      return {
        ...prev,
        constructionProgress: {
          ...prev.constructionProgress,
          wings: nextWings,
          planCaseNo: nextWings.map((w) => String(w.planCaseNo || "").trim()).filter(Boolean).join(", "),
          tasks: nextWings[0]?.tasks || [],
        },
      };
    });
  };

  const addConstructionWing = () => {
    setFormState(prev => {
      const wings = Array.isArray(prev.constructionProgress?.wings) ? prev.constructionProgress.wings : [];
      const templateTasks = wings[0]?.tasks || prev.constructionProgress?.tasks || createConstructionProgressRows();
      const nextWings = [...wings, createConstructionProgressWing("", templateTasks)];
      return {
        ...prev,
        constructionProgress: {
          ...prev.constructionProgress,
          wings: nextWings,
          planCaseNo: nextWings.map((w) => String(w.planCaseNo || "").trim()).filter(Boolean).join(", "),
          tasks: nextWings[0]?.tasks || [],
        },
      };
    });
  };

  const removeConstructionWing = (wingId) => {
    setFormState(prev => {
      const wings = Array.isArray(prev.constructionProgress?.wings) ? prev.constructionProgress.wings : [];
      const filtered = wings.filter((w) => w.id !== wingId);
      const nextWings = filtered.length ? filtered : [createConstructionProgressWing()];
      return {
        ...prev,
        constructionProgress: {
          ...prev.constructionProgress,
          wings: nextWings,
          planCaseNo: nextWings.map((w) => String(w.planCaseNo || "").trim()).filter(Boolean).join(", "),
          tasks: nextWings[0]?.tasks || [],
        },
      };
    });
  };

  const addRow = (arrayName, creatorFn) => {
    setFormState(prev => ({
      ...prev,
      [arrayName]: [...prev[arrayName], creatorFn()]
    }));
  };

  const removeRow = (arrayName, id) => {
    setFormState(prev => ({
      ...prev,
      [arrayName]: prev[arrayName].filter(r => r.id !== id)
    }));
  };

  const handleAssociationAllotteeChange = (id, field, value) => {
    setFormState(prev => ({
      ...prev,
      associationDetails: {
        ...prev.associationDetails,
        allottees: prev.associationDetails.allottees.map(r => r.id === id ? { ...r, [field]: value } : r)
      }
    }));
  };

  const applyClient = (client) => {
    const clientName = client?.company_name || client?.display_name || client?.person_name || "";
    setFormState((prev) => ({
      ...prev,
      promoterDetails: {
        ...prev.promoterDetails,
        registrationNumber: client?.cin || client?.gstin || client?.pan || prev.promoterDetails.registrationNumber,
        firmName: clientName,
        firmAddress: client?.address || "",
      },
      projectDetails: {
        ...prev.projectDetails,
        nameOfPromoter: clientName,
      },
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const normalizedFormState = normalizeFormDates(formState);
      const misc = normalizedFormState.miscellaneous || {};
      const saleAgreementCombined = [misc.saleDeed, misc.agreementForSale]
        .map((v) => String(v || "").trim())
        .filter(Boolean)
        .join(", ");
      normalizedFormState.miscellaneous = {
        ...misc,
        legalCases: {
          caseNo: misc.legalCaseNo || "",
          parties: misc.legalParties || "",
          executionCases: misc.executionCases || "",
          executionCaseNo: misc.executionCaseNo || "",
          executionParties: misc.executionParties || "",
          suoMotoCases: misc.suoMotoCases || "",
          suoMotoCaseNo: misc.suoMotoCaseNo || "",
          suoMotoParties: misc.suoMotoParties || "",
          certificateCases: misc.certificateCases || "",
          certificateCaseNo: misc.certificateCaseNo || "",
          certificateParties: misc.certificateParties || "",
        },
        saleAgreement: saleAgreementCombined,
      };
      const payload = {
        category: "RERA",
        certificate_type: "rera_form_7_reg_9",

        // ✅ REQUIRED BY BACKEND
        entityType: "PRIVATE_LIMITED",

        // ✅ REQUIRED BY _required_display_name()
        identity: {
          company_name:
            normalizedFormState.projectDetails?.nameOfPromoter ||
            normalizedFormState.promoterDetails?.firmName ||
            " ",
          address: normalizedFormState.projectDetails?.projectAddress || ""
        },

        // ✅ backend still requires place; set fallback as not collected in UI
        meta: {
          place: normalizedFormState.meta.place || "N/A",
          date:
            normalizedFormState.meta.date ||
            normalizedFormState.undertaking.date ||
            todayDDMMYYYY(),
          quarterEnding: normalizedFormState.meta.quarterEnding,
          year: normalizedFormState.meta.year
        },

        // ✅ RERA Form-7 does not need CA
        ca: {},

        // ✅ SNAPSHOT STORED HERE (CRITICAL)
        data: {
          tables: {},
          extras: {
            formData: normalizedFormState
          }
        }
      };

      if (isEdit) {
        await api.put(`/api/certificates/${id}`, payload);
        clearDraft(RERA_FORM7_DRAFT_KEY);
        toast.success("Report updated successfully!");
        navigate(`/certificate/${id}`);
      } else {
        const res = await api.post("/api/certificates", payload);
        clearDraft(RERA_FORM7_DRAFT_KEY);
        toast.success("Report created successfully!");
        if (res.data?.id) navigate(`/certificate/${res.data.id}`);
      }
    } catch (error) {
      console.error("Submission error", error);
      toast.error(
        error?.response?.data?.detail || "Failed to save report"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Common styles for standard selects to match Shadcn Inputs
  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">

        {/* Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEdit ? 'Update Report' : 'Save Report'}
          </Button>
        </div>

        {/* Title Section */}
        <div className="text-center space-y-4 bg-secondary/20 p-6 rounded-lg border">
          <h1 className="text-2xl font-bold">FORM-7 [REGULATION-9]</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left max-w-xl mx-auto">
            <div className="space-y-2">
              <Label>Quarterly progress report for quarter ending</Label>
              <select
                className={selectClass}
                value={formState.meta.quarterEnding}
                onChange={(e) => handleDeepChange('meta', 'quarterEnding', e.target.value)}
              >
                <option value="March">March</option>
                <option value="June">June</option>
                <option value="September">September</option>
                <option value="December">December</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                placeholder="Year"
                value={formState.meta.year}
                onChange={(e) => handleDeepChange('meta', 'year', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* SECTION I: PROMOTER DETAILS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>I. PARTICULARS OF PROMOTERS</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 pt-6">
            <ClientSelector onSelect={applyClient} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Promoter's Reg No / CIN / Partnership Deed / LLP</Label>
                <Input
                  value={formState.promoterDetails.registrationNumber}
                  onChange={(e) => handleDeepChange('promoterDetails', 'registrationNumber', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Name of Firm</Label>
                <Input
                  value={formState.promoterDetails.firmName}
                  onChange={(e) => handleDeepChange('promoterDetails', 'firmName', e.target.value)}
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Firm Address</Label>
                <Input
                  value={formState.promoterDetails.firmAddress}
                  onChange={(e) => handleDeepChange('promoterDetails', 'firmAddress', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Total Experience in Real Estate (Years)</Label>
                <Input
                  value={formState.promoterDetails.experienceTotal}
                  onChange={(e) => handleDeepChange('promoterDetails', 'experienceTotal', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Experience after RERA Implementation (Years)</Label>
                <Input
                  value={formState.promoterDetails.experienceRera}
                  onChange={(e) => handleDeepChange('promoterDetails', 'experienceRera', e.target.value)}
                />
              </div>
            </div>

            {/* Past Projects Table Grid */}
            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-5 bg-secondary text-secondary-foreground font-medium p-3 text-sm">
                <div className="col-span-1">Criteria</div>
                <div className="text-center">Residential</div>
                <div className="text-center">Commercial</div>
                <div className="text-center">Res-cum-Comm</div>
                <div className="text-center">Plotted</div>
              </div>

              <div className="grid grid-cols-5 p-3 items-center border-b gap-2">
                <div className="text-sm font-medium">Projects Before RERA</div>
                <Input placeholder="Qty" value={formState.projectsBeforeRera.residential} onChange={(e) => handleFlatObjectChange('projectsBeforeRera', 'residential', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsBeforeRera.commercial} onChange={(e) => handleFlatObjectChange('projectsBeforeRera', 'commercial', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsBeforeRera.mixed} onChange={(e) => handleFlatObjectChange('projectsBeforeRera', 'mixed', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsBeforeRera.plotted} onChange={(e) => handleFlatObjectChange('projectsBeforeRera', 'plotted', e.target.value)} />
              </div>

              <div className="grid grid-cols-5 p-3 items-center gap-2">
                <div className="text-sm font-medium">Projects After RERA</div>
                <Input placeholder="Qty" value={formState.projectsAfterRera.residential} onChange={(e) => handleFlatObjectChange('projectsAfterRera', 'residential', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsAfterRera.commercial} onChange={(e) => handleFlatObjectChange('projectsAfterRera', 'commercial', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsAfterRera.mixed} onChange={(e) => handleFlatObjectChange('projectsAfterRera', 'mixed', e.target.value)} />
                <Input placeholder="Qty" value={formState.projectsAfterRera.plotted} onChange={(e) => handleFlatObjectChange('projectsAfterRera', 'plotted', e.target.value)} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION II: PROJECT DETAILS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>II. PARTICULARS OF PROJECT</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="space-y-2">
              <Label>Project Registration Number</Label>
              <Input
                value={formState.projectDetails.registrationNumber}
                onChange={(e) => handleDeepChange('projectDetails', 'registrationNumber', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Name of Project/Phase</Label>
              <Input
                value={formState.projectDetails.nameOfProject}
                onChange={(e) => handleDeepChange('projectDetails', 'nameOfProject', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Name of Promoter</Label>
              <Input
                value={formState.projectDetails.nameOfPromoter}
                onChange={(e) => handleDeepChange('projectDetails', 'nameOfPromoter', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Project Address</Label>
              <Input
                value={formState.projectDetails.projectAddress}
                onChange={(e) => handleDeepChange('projectDetails', 'projectAddress', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Name of Co-Promoter</Label>
              <Input
                value={formState.projectDetails.nameOfCoPromoter}
                onChange={(e) => handleDeepChange('projectDetails', 'nameOfCoPromoter', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Project Registration Valid Up To</Label>
              <Input
                value={formState.projectDetails.validUpTo}
                onChange={(e) => handleDeepChange('projectDetails', 'validUpTo', autoFormatDDMMYYYY(e.target.value))}
                placeholder="DD-MM-YYYY"
              />
            </div>
            <div className="space-y-2">
              <Label>Starting Date of Project</Label>
              <Input
                placeholder="DD-MM-YYYY"
                value={formState.projectDetails.startDate}
                onChange={(e) => handleDeepChange('projectDetails', 'startDate', autoFormatDDMMYYYY(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Type of Project</Label>
              {/* Standard HTML Select */}
              <select
                className={selectClass}
                value={formState.projectDetails.projectType}
                onChange={(e) => handleDeepChange('projectDetails', 'projectType', e.target.value)}
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
                <option value="Mixed">Residential-cum-Commercial</option>
                <option value="Plotted">Plotted Project</option>
              </select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Period of validity of map by Competent Authority</Label>
              <Input
                value={formState.projectDetails.mapValidity}
                onChange={(e) => handleDeepChange('projectDetails', 'mapValidity', e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* SECTION III: APARTMENT INVENTORY */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>III. DISCLOSURE OF SOLD/BOOKED INVENTORY OF APARTMENTS</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {(() => {
              const singleRow = formState.apartmentInventory?.[0] || createApartmentRow();
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1050px] border border-black border-collapse text-sm">
                    <tbody>
                      <tr className="bg-muted/30">
                        <td className="border border-black p-2 font-semibold">Building / Block Number</td>
                        <td className="border border-black p-2 font-semibold">Apartment Type</td>
                        <td className="border border-black p-2 font-semibold">Carpet Area</td>
                        <td className="border border-black p-2 font-semibold">Total Number of sanctioned apartments</td>
                        <td className="border border-black p-2 font-semibold">Total Number of Apartments in Promoter&apos;s share</td>
                        <td className="border border-black p-2 font-semibold">Total Number of Apartments in Landowner&apos;s share</td>
                      </tr>

                      <tr>
                        <td className="border border-black p-2 align-top" rowSpan={2}>
                          <Input
                            value={singleRow.blockNumber || ""}
                            onChange={(e) => handleSingleApartmentChange('blockNumber', e.target.value)}
                          />
                        </td>
                        <td className="border border-black p-2 align-top" rowSpan={2}>
                          <div className="space-y-2">
                            <div className="grid grid-cols-[56px_1fr_96px_36px] gap-2 text-xs font-semibold">
                              <div>No.</div>
                              <div>Type</div>
                              <div>Qty</div>
                              <div></div>
                            </div>
                            {apartmentTypeBreakup.map((typeRow, idx) => (
                              <div
                                key={typeRow.id}
                                className="grid grid-cols-[56px_1fr_96px_36px] gap-2 items-center"
                              >
                                <Input value={idx + 1} readOnly />
                                <Input
                                  value={typeRow.type || ""}
                                  placeholder="Apartment type"
                                  onChange={(e) => handleApartmentTypeBreakupChange(typeRow.id, "type", e.target.value)}
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  value={typeRow.count || ""}
                                  placeholder="Qty"
                                  onChange={(e) => handleApartmentTypeBreakupChange(typeRow.id, "count", e.target.value)}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeApartmentTypeBreakupRow(typeRow.id)}
                                  disabled={apartmentTypeBreakup.length <= 1}
                                  title="Delete type"
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            ))}
                            <Button type="button" variant="outline" size="sm" onClick={addApartmentTypeBreakupRow}>
                              <PlusCircle className="h-4 w-4 mr-2" /> Add Type
                            </Button>
                          </div>
                        </td>
                        <td className="border border-black p-2 align-top" rowSpan={2}>
                          <div className="space-y-2">
                            {apartmentTypeBreakup.map((typeRow) => (
                              <div
                                key={`carpet-area-${typeRow.id}`}
                                className="grid grid-cols-1 gap-2 items-center"
                              >
                                <Input
                                  value={typeRow.carpetArea || ""}
                                  onChange={(e) =>
                                    handleApartmentTypeBreakupChange(typeRow.id, "carpetArea", e.target.value)
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="border border-black p-2 align-top" rowSpan={2}>
                          <Input
                            type="number"
                            value={totalSanctionedFromTypeBreakup > 0 ? totalSanctionedFromTypeBreakup : ""}
                            readOnly
                          />
                          <div className="text-[11px] text-muted-foreground mt-1">
                            Auto total of all apartment type quantities
                          </div>
                        </td>
                        <td className="border border-black p-2 align-top">
                          <div className="space-y-2">
                            <div className="text-xs font-medium">1. Booked / Allotted</div>
                            <Input
                              type="number"
                              value={singleRow.promoterBooked || ""}
                              onChange={(e) => handleSingleApartmentChange('promoterBooked', e.target.value)}
                            />
                            <div className="text-xs font-medium">2. Sold</div>
                            <Input
                              type="number"
                              value={singleRow.promoterSold || ""}
                              onChange={(e) => handleSingleApartmentChange('promoterSold', e.target.value)}
                            />
                          </div>
                        </td>
                        <td className="border border-black p-2 align-top">
                          <div className="space-y-2">
                            <div className="text-xs font-medium">1. Booked / Allotted</div>
                            <Input
                              type="number"
                              value={singleRow.landownerBooked || ""}
                              onChange={(e) => handleSingleApartmentChange('landownerBooked', e.target.value)}
                            />
                            <div className="text-xs font-medium">2. Sold</div>
                            <Input
                              type="number"
                              value={singleRow.landownerSold || ""}
                              onChange={(e) => handleSingleApartmentChange('landownerSold', e.target.value)}
                            />
                          </div>
                        </td>
                      </tr>

                      <tr>
                        <td className="border border-black p-2 align-top">
                          <div className="text-xs font-medium mb-2">Percentage of booking</div>
                          <Input
                            value={singleRow.bookingPercentage || ""}
                            onChange={(e) => handleSingleApartmentChange('bookingPercentage', e.target.value)}
                          />
                        </td>
                        <td className="border border-black p-2 align-top">
                          <div className="text-xs font-medium mb-2">Percentage of booking</div>
                          <Input
                            value={singleRow.bookingPercentage || ""}
                            onChange={(e) => handleSingleApartmentChange('bookingPercentage', e.target.value)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* CONDITIONAL: ASSOCIATION OF ALLOTTEES */}
        {totalBookingPercentage > 50 && (
          <Card className="border-yellow-500 border-2">
            <CardHeader className="bg-yellow-50">
              <CardTitle>Association of Allottees Details</CardTitle>
              <CardDescription className="text-yellow-700 font-semibold">
                Booking percentage exceeds 50%. Information about formation of association is required.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="space-y-2">
                <Label>Association of Allottees Name</Label>
                <Input
                  value={formState.associationDetails.name}
                  onChange={(e) => handleDeepChange('associationDetails', 'name', e.target.value)}
                />
              </div>

              <div className="bg-red-500 text-white font-bold p-2 text-center rounded">
                These details may not be available to common people
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-500 hover:bg-red-600">
                      <TableHead className="text-white">Name</TableHead>
                      <TableHead className="text-white">Address</TableHead>
                      <TableHead className="text-white">Contact Number</TableHead>
                      <TableHead className="text-white">Email ID</TableHead>
                      <TableHead className="text-white w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formState.associationDetails.allottees.map(row => (
                      <TableRow key={row.id}>
                        <TableCell><Input value={row.name} onChange={e => handleAssociationAllotteeChange(row.id, 'name', e.target.value)} /></TableCell>
                        <TableCell><Input value={row.address} onChange={e => handleAssociationAllotteeChange(row.id, 'address', e.target.value)} /></TableCell>
                        <TableCell><Input value={row.contactNumber} onChange={e => handleAssociationAllotteeChange(row.id, 'contactNumber', e.target.value)} /></TableCell>
                        <TableCell><Input value={row.email} onChange={e => handleAssociationAllotteeChange(row.id, 'email', e.target.value)} /></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => {
                            setFormState(prev => ({
                              ...prev,
                              associationDetails: {
                                ...prev.associationDetails,
                                allottees: prev.associationDetails.allottees.filter(r => r.id !== row.id)
                              }
                            }))
                          }}>
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" onClick={() => {
                setFormState(prev => ({
                  ...prev,
                  associationDetails: {
                    ...prev.associationDetails,
                    allottees: [...prev.associationDetails.allottees, createAllotteeRow()]
                  }
                }))
              }}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Allottee
              </Button>
            </CardContent>
          </Card>
        )}

        {/* SECTION IV: GARAGE INVENTORY */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>IV. DISCLOSURE OF SOLD / BOOKED INVENTORY OF GARAGES</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {(() => {
              const garage = formState.garageInventory?.[0] || createGarageRow();
              return (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border border-black border-collapse text-sm">
                    <tbody>
                      <tr className="bg-muted/30">
                        <td className="border border-black p-2 font-semibold">Building / Block Number</td>
                        <td className="border border-black p-2 font-semibold">Total Number of Sanctioned Garages</td>
                        <td className="border border-black p-2 font-semibold">Total Number of Garages:</td>
                        <td className="border border-black p-2 font-semibold"></td>
                      </tr>
                      <tr>
                        <td className="border border-black p-2 align-top">
                          <Input
                            value={garage.blockNumber || ""}
                            onChange={(e) => handleSingleGarageChange('blockNumber', e.target.value)}
                          />
                        </td>
                        <td className="border border-black p-2 align-top">
                          <Input
                            type="number"
                            value={garage.totalSanctioned || ""}
                            onChange={(e) => handleSingleGarageChange('totalSanctioned', e.target.value)}
                          />
                        </td>
                        <td className="border border-black p-2 align-top whitespace-pre-wrap">
                          1. Booked/Allotted
                          <br />
                          2. Sold
                        </td>
                        <td className="border border-black p-2 align-top space-y-2">
                          <Input
                            type="number"
                            placeholder="Booked/Allotted"
                            value={garage.booked || ""}
                            onChange={(e) => handleSingleGarageChange('booked', e.target.value)}
                          />
                          <Input
                            type="number"
                            placeholder="Sold"
                            value={garage.sold || ""}
                            onChange={(e) => handleSingleGarageChange('sold', e.target.value)}
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* SECTION V: BUILDING APPROVALS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>V. DETAILS OF BUILDING APPROVALS</CardTitle>
            <CardDescription>(If already filed along with Registration Application, then there is no need of further filing)</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Table className="min-w-[800px] border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px]">S.No.</TableHead>
                  <TableHead className="w-[300px]">Name of Approval / NOC</TableHead>
                  <TableHead>Issuing Authority</TableHead>
                  <TableHead>Applied Date</TableHead>
                  <TableHead>Issuance Date</TableHead>
                  <TableHead>Annexure No.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formState.buildingApprovals.map((row, index) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-bold">{index + 1}</TableCell>
                    <TableCell className="font-medium">
                      {approvalTypes[index] || row.approvalName}
                    </TableCell>
                    <TableCell><Input value={row.issuingAuthority} onChange={e => handleArrayChange('buildingApprovals', row.id, 'issuingAuthority', e.target.value)} /></TableCell>
                    <TableCell><Input placeholder="DD-MM-YYYY" value={row.appliedDate} onChange={e => handleArrayChange('buildingApprovals', row.id, 'appliedDate', autoFormatDDMMYYYY(e.target.value))} /></TableCell>
                    <TableCell><Input placeholder="DD-MM-YYYY" value={row.issuanceDate} onChange={e => handleArrayChange('buildingApprovals', row.id, 'issuanceDate', autoFormatDDMMYYYY(e.target.value))} /></TableCell>
                    <TableCell><Input value={row.annexureNo} onChange={e => handleArrayChange('buildingApprovals', row.id, 'annexureNo', e.target.value)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* SECTION VI: CONSTRUCTION PROGRESS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>VI. CONSTRUCTION PROGRESS OF THE PROJECT</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={addConstructionWing}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Table
              </Button>
            </div>

            {(Array.isArray(formState.constructionProgress?.wings) ? formState.constructionProgress.wings : [createConstructionProgressWing()]).map((wing) => (
              <div key={wing.id} className="space-y-3 border rounded-md p-3">
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-2">
                    <Label>Plan Case No. (To be added for each Building / Wing)</Label>
                    <Input
                      value={wing.planCaseNo || ""}
                      onChange={(e) => handleConstructionWingPlanCaseNoChange(wing.id, e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeConstructionWing(wing.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>

                <Table className="border">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">S.No</TableHead>
                      <TableHead>Tasks/Activity</TableHead>
                      <TableHead className="w-[150px]">% of Actual Work Done</TableHead>
                      <TableHead className="w-[200px]">Expected Completion Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(wing.tasks) ? wing.tasks : []).map((task, index) => (
                      <TableRow key={task.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{task.task}</TableCell>
                        <TableCell>
                          <Input
                            placeholder="%"
                            value={task.percentage}
                            onChange={e => handleConstructionProgressChange(wing.id, task.id, 'percentage', e.target.value)}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="DD-MM-YYYY"
                            value={task.completionDate}
                            onChange={e => handleConstructionProgressChange(wing.id, task.id, 'completionDate', autoFormatDDMMYYYY(e.target.value))}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* SECTION VII: AMENITIES */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>VII. AMENITIES AND COMMON AREA AND EXTERNAL INFRASTRUCTURE DEVELOPMENT WORKS</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table className="border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">S.No</TableHead>
                  <TableHead>Common Areas and Facilities</TableHead>
                  <TableHead className="w-[150px]">Proposed (Yes/No)</TableHead>
                  <TableHead className="w-[150px]">% of Actual Work Done</TableHead>
                  <TableHead className="w-[200px]">Expected Completion Date</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formState.amenities.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">
                      {index >= amenitiesTasks.length ? (
                        <Input
                          placeholder="Enter facility/task"
                          value={item.task}
                          onChange={e => handleArrayChange('amenities', item.id, 'task', e.target.value)}
                        />
                      ) : item.task}
                    </TableCell>
                    <TableCell>
                      <select className={selectClass} value={item.proposed} onChange={e => handleArrayChange('amenities', item.id, 'proposed', e.target.value)}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </TableCell>
                    <TableCell><Input placeholder="%" value={item.percentage} onChange={e => handleArrayChange('amenities', item.id, 'percentage', e.target.value)} /></TableCell>
                    <TableCell><Input placeholder="DD-MM-YYYY" value={item.completionDate} onChange={e => handleArrayChange('amenities', item.id, 'completionDate', autoFormatDDMMYYYY(e.target.value))} /></TableCell>
                    <TableCell>
                      {index >= amenitiesTasks.length ? (
                        <Button variant="ghost" size="icon" onClick={() => removeRow('amenities', item.id)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <Button variant="outline" className="mt-4" onClick={() => addRow('amenities', () => createAmenityRow(""))}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Row
            </Button>
          </CardContent>
        </Card>

        {/* SECTION VIII A: PLOTTED DEVELOPMENT */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>VIII. A EXTERNAL AND INTERNAL DEVELOPMENT WORKS IN CASE OF PLOTTED DEVELOPMENT</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table className="border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">S.No</TableHead>
                  <TableHead>Works</TableHead>
                  <TableHead className="w-[150px]">Proposed (Yes/No)</TableHead>
                  <TableHead className="w-[150px]">% of Actual Work Done</TableHead>
                  <TableHead className="w-[200px]">Expected Completion Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formState.plottedDevelopment.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{item.task}</TableCell>
                    <TableCell>
                      <select className={selectClass} value={item.proposed} onChange={e => handleArrayChange('plottedDevelopment', item.id, 'proposed', e.target.value)}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </TableCell>
                    <TableCell><Input placeholder="%" value={item.percentage} onChange={e => handleArrayChange('plottedDevelopment', item.id, 'percentage', e.target.value)} /></TableCell>
                    <TableCell><Input placeholder="DD-MM-YYYY" value={item.completionDate} onChange={e => handleArrayChange('plottedDevelopment', item.id, 'completionDate', autoFormatDDMMYYYY(e.target.value))} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* SECTION IX: GEO TAGGED PHOTOGRAPHS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>IX. GEO TAGGED AND DATE PHOTOGRAPH OF(EACH BLOCK) OF THE PROJECT</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table className="border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Part</TableHead>
                  <TableHead className="w-[80px]">Sr. No.</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-[220px]">Attached / Not Attached</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell rowSpan={3} className="align-top font-semibold">(A)</TableCell>
                  <TableCell>1.</TableCell>
                  <TableCell>Front Elevation</TableCell>
                  <TableCell>
                    <select
                      className={selectClass}
                      value={formState.geoTaggedPhotos.frontElevation}
                      onChange={(e) => handleDeepChange('geoTaggedPhotos', 'frontElevation', e.target.value)}
                    >
                      <option>Attached</option>
                      <option>Not Attached</option>
                    </select>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>2.</TableCell>
                  <TableCell>Rear Elevation</TableCell>
                  <TableCell>
                    <select
                      className={selectClass}
                      value={formState.geoTaggedPhotos.rearElevation}
                      onChange={(e) => handleDeepChange('geoTaggedPhotos', 'rearElevation', e.target.value)}
                    >
                      <option>Attached</option>
                      <option>Not Attached</option>
                    </select>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>3.</TableCell>
                  <TableCell>Side Elevation</TableCell>
                  <TableCell>
                    <select
                      className={selectClass}
                      value={formState.geoTaggedPhotos.sideElevation}
                      onChange={(e) => handleDeepChange('geoTaggedPhotos', 'sideElevation', e.target.value)}
                    >
                      <option>Attached</option>
                      <option>Not Attached</option>
                    </select>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-semibold">(B)</TableCell>
                  <TableCell></TableCell>
                  <TableCell>Photograph of each floor</TableCell>
                  <TableCell>
                    <select
                      className={selectClass}
                      value={formState.geoTaggedPhotos.eachFloor}
                      onChange={(e) => handleDeepChange('geoTaggedPhotos', 'eachFloor', e.target.value)}
                    >
                      <option>Attached</option>
                      <option>Not Attached</option>
                    </select>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* SECTION X: FINANCIAL PROGRESS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>X. FINANCIAL PROGRESS OF THE PROJECT</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Table className="border">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">S.No</TableHead>
                  <TableHead>Particulars</TableHead>
                  <TableHead className="w-[250px]">Amount (In Rs.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {formState.financialProgress.map((item, index) => (
                  <TableRow key={item.id}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-medium">{item.particulars}</TableCell>
                    <TableCell><Input type="number" placeholder="Rs." value={item.amount} onChange={e => handleArrayChange('financialProgress', item.id, 'amount', e.target.value)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* SECTION XI: MORTGAGE DETAILS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XI. DETAILS OF MORTGAGE OR CHARGE</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Textarea
              placeholder="Details of mortgage or charge if any created/details of loan taken by promoters against the project, if any"
              value={formState.mortgageDetails}
              onChange={(e) => setFormState(prev => ({ ...prev, mortgageDetails: e.target.value }))}
            />
          </CardContent>
        </Card>

        {/* SECTION XII: MISCELLANEOUS */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XII. MISCELLANEOUS</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="space-y-4">
              <Label className="font-semibold">A. List of Legal Cases (if any) - On Project / Promoter</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>1. Case No.</Label>
                  <Input
                    value={formState.miscellaneous.legalCaseNo}
                    onChange={e => handleDeepChange('miscellaneous', 'legalCaseNo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>2. Name of Parties</Label>
                  <Input
                    value={formState.miscellaneous.legalParties}
                    onChange={e => handleDeepChange('miscellaneous', 'legalParties', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>3. No of Execution Cases against this project</Label>
                  <Input
                    value={formState.miscellaneous.executionCases}
                    onChange={e => handleDeepChange('miscellaneous', 'executionCases', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Case No.</Label>
                  <Input
                    value={formState.miscellaneous.executionCaseNo}
                    onChange={e => handleDeepChange('miscellaneous', 'executionCaseNo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name of Parties</Label>
                  <Input
                    value={formState.miscellaneous.executionParties}
                    onChange={e => handleDeepChange('miscellaneous', 'executionParties', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>4. No of Suo - Moto cases against this project</Label>
                  <Input
                    value={formState.miscellaneous.suoMotoCases}
                    onChange={e => handleDeepChange('miscellaneous', 'suoMotoCases', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Case No.</Label>
                  <Input
                    value={formState.miscellaneous.suoMotoCaseNo}
                    onChange={e => handleDeepChange('miscellaneous', 'suoMotoCaseNo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name of Parties</Label>
                  <Input
                    value={formState.miscellaneous.suoMotoParties}
                    onChange={e => handleDeepChange('miscellaneous', 'suoMotoParties', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>5. No of Certificate cases /PDR cases against this project</Label>
                  <Input
                    value={formState.miscellaneous.certificateCases}
                    onChange={e => handleDeepChange('miscellaneous', 'certificateCases', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Case No.</Label>
                  <Input
                    value={formState.miscellaneous.certificateCaseNo}
                    onChange={e => handleDeepChange('miscellaneous', 'certificateCaseNo', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Name of Parties</Label>
                  <Input
                    value={formState.miscellaneous.certificateParties}
                    onChange={e => handleDeepChange('miscellaneous', 'certificateParties', e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <Label className="font-semibold">B. Sale/Agreement for Sale during the Quarter</Label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>1. Sale Deed</Label>
                  <Input
                    value={formState.miscellaneous.saleDeed}
                    onChange={e => handleDeepChange('miscellaneous', 'saleDeed', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>2. Agreement for Sale</Label>
                  <Input
                    value={formState.miscellaneous.agreementForSale}
                    onChange={e => handleDeepChange('miscellaneous', 'agreementForSale', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>3. No. of possessions given to allottees</Label>
                <Input
                  value={formState.miscellaneous.possessions}
                  onChange={e => handleDeepChange('miscellaneous', 'possessions', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION XIII: MILESTONE CHART */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XIII. PERCENTAGE OF WORK ALONG WITH MILESTONE CHART</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <Label>Is the project in progress as per time schedule or lagging behind?</Label>
            <Input className="mt-2" placeholder="e.g., On schedule, Lagging by 2 months" value={formState.milestoneChartLag} onChange={e => setFormState(prev => ({ ...prev, milestoneChartLag: e.target.value }))} />
          </CardContent>
        </Card>

        {/* SECTION XIV: UNITS ALLOCATION */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XIV. UNITS ALLOCATION DETAILS</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div>
              <Label className="font-semibold">Total Number of sanctioned apartments</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                {unitAllocationTypeLabels.map((typeRow) => (
                  <div className="space-y-1" key={typeRow.key}>
                    <Label className="text-sm">{typeRow.label}</Label>
                    <Input
                      placeholder="Qty"
                      value={formState.unitAllocation.sanctioned?.[typeRow.key] || ""}
                      onChange={e => handleNestedObjectChange('unitAllocation', 'sanctioned', typeRow.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Details of allotment made so far (with Flat number / Bungalow / Plot etc)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unitAllocationTypeLabels.map((typeRow) => (
                  <div className="space-y-1" key={`allot-${typeRow.key}`}>
                    <Label className="text-sm">{typeRow.label}</Label>
                    <Textarea
                      placeholder="Enter multiple room/flat numbers separated by comma or new line"
                      value={formState.unitAllocation.allotmentByType?.[typeRow.key] || ""}
                      onChange={e => handleNestedObjectChange('unitAllocation', 'allotmentByType', typeRow.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="font-semibold">Cancellation of flat allotment, if any (with Flat number / Bungalow / Plot etc)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unitAllocationTypeLabels.map((typeRow) => (
                  <div className="space-y-1" key={`cancel-${typeRow.key}`}>
                    <Label className="text-sm">{typeRow.label}</Label>
                    <Textarea
                      placeholder="Enter multiple cancelled room/flat numbers"
                      value={formState.unitAllocation.cancellationByType?.[typeRow.key] || ""}
                      onChange={e => handleNestedObjectChange('unitAllocation', 'cancellationByType', typeRow.key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SECTION XV: BROCHURE */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XV. BROCHURE / PROSPECTUS</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-2">
            <Label>Attachment Status</Label>
            <select
              className={selectClass}
              value={formState.brochureProspectus || "Not Attached"}
              onChange={(e) => setFormState(prev => ({ ...prev, brochureProspectus: e.target.value }))}
            >
              <option value="Attached">Attached</option>
              <option value="Not Attached">Not Attached</option>
            </select>
          </CardContent>
        </Card>

        {/* SECTION XVI: GRIEVANCE OFFICER */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>XVI. GRIEVANCE REDRESSAL OFFICER</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
            <div className="space-y-2"><Label>Name</Label><Input value={formState.grievanceOfficer.name} onChange={e => handleDeepChange('grievanceOfficer', 'name', e.target.value)} /></div>
            <div className="space-y-2"><Label>Contact No</Label><Input value={formState.grievanceOfficer.contact} onChange={e => handleDeepChange('grievanceOfficer', 'contact', e.target.value)} /></div>
            <div className="space-y-2"><Label>Email ID</Label><Input type="email" value={formState.grievanceOfficer.email} onChange={e => handleDeepChange('grievanceOfficer', 'email', e.target.value)} /></div>
            <div className="space-y-2"><Label>Address</Label><Input value={formState.grievanceOfficer.address} onChange={e => handleDeepChange('grievanceOfficer', 'address', e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* UNDERTAKING */}
        <Card>
          <CardHeader className="bg-secondary/10">
            <CardTitle>Undertaking</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              I/we solemnly affirm, declare and undertake that all the details stated above are true to the best of my knowledge and nothing material has been concealed here from. I am/we are executing this undertaking to attest to the truth of all the foregoing and to apprise the Authority of such facts as mentioned as well as for whatever other legal purposes this undertaking may serve.
            </p>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Signature of promoter will be done physically on the printed copy.
              </p>
              <Label>Name</Label>
              <Input value={formState.undertaking.name} onChange={e => handleDeepChange('undertaking', 'name', e.target.value)} />
              <Label>Date</Label>
              <Input
                placeholder="DD-MM-YYYY"
                value={formState.undertaking.date}
                onChange={e => {
                  const nextDate = autoFormatDDMMYYYY(e.target.value);
                  handleDeepChange('undertaking', 'date', nextDate);
                  handleDeepChange('meta', 'date', nextDate);
                }}
              />
            </div>
          </CardContent>
        </Card>


        <div className="flex justify-end gap-4 mt-8">
          <Button variant="outline" size="lg" onClick={() => navigate(-1)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Report
          </Button>
        </div>

      </div>
    </div>
  );
};

export { ReraForm7 };

