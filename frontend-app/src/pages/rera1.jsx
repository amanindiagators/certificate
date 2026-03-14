import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { toast } from "sonner";

// UI components (RELATIVE PATHS)
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

// Icons
import { ArrowLeft, Trash2, Loader2, PlusCircle } from "lucide-react";

// Utils
import { cn } from "../lib/utils";
import {
  clearDraft,
  loadDraftWithTTL,
  ONE_HOUR_DRAFT_TTL_MS,
  saveDraftWithTTL,
} from "../lib/draftStorage";
const RERA_FORM3_DRAFT_KEY = "draft:rera_form3_v1";

const entityTypes = [
  'PERSONAL', 'PROPRIETORSHIP', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'TRUST', 'NGO', 'SOCIETY', 'GOVERNMENT', 'COLLEGE',
];

const tableItems = [
  {
    id: 'land_cost_group',
    srNo: '1.i',
    particulars: 'Land Cost :',
    isBold: true,
    children: [
      { id: 'land_cost_acquisition', srNo: 'a.', particulars: 'Acquisition Cost of Land or Development Rights, lease Premium, lease rent, interest cost incurred or payable on Land Cost and legal cost.', inputs: 'both', level: 1 },
      { id: 'land_cost_premium', srNo: 'b.', particulars: 'Amount of Premium payable to obtain development rights, FSI, additional FSI, fungible area, and any other incentive under DCR from Local Authority or State Government or any other Statutory Authority.', inputs: 'both', level: 1 },
      { id: 'land_cost_tdr', srNo: 'c.', particulars: 'Acquisition cost of TDR (if any)', inputs: 'both', level: 1 },
      { id: 'land_cost_govt_payable', srNo: 'd.', particulars: 'Amounts payable to State Government or competent authority or any other statutory authority of the State or Central Government, towards stamp duty, transfer charges, registration fees etc; and', inputs: 'both', level: 1 },
      { id: 'land_cost_land_premium_asr', srNo: 'e.', particulars: 'Land Premium payable as per annual statement of rates (ASR) for redevelopment of land owned by public authorities.', inputs: 'both', level: 1 },
      {
        id: 'land_cost_rehab_scheme', srNo: 'f.', particulars: 'Under Rehabilitation Scheme:', isBold: true, level: 1, children: [
          { id: 'rehab_scheme_est_construction', srNo: 'f.(i)', particulars: 'Estimated construction cost of rehab building including site development and infrastructure for the same as certified by Engineer.', inputs: 'both', level: 2 },
          { id: 'rehab_scheme_actual_construction', srNo: 'f.(ii)', particulars: 'Actual Cost of construction of rehab building incurred as per the books of accounts as verified by the CA.', inputs: 'both', level: 2 },
          { id: 'rehab_scheme_note', particulars: 'Note :(for total cost of construction incurred, Minimum of (i) or (ii) is to be considered).', isNote: true, level: 2 },
          { id: 'land_cost_clearance', srNo: 'f.(iii)', particulars: 'Cost towards clearance of land of all or any encumbrances including cost of removal of legal/illegal occupants, cost for providing temporary transit accommodation or rent in lieu of Transit Accommodation, overhead cost,', inputs: 'both', level: 2 },
          { id: 'land_cost_asr_premium', srNo: 'f.(iv)', particulars: 'Cost of ASR linked premium, fees, charges and security deposits or maintenance deposit, or any amount whatsoever payable to any authorities towards and in project of rehabilitation.', inputs: 'both', level: 2 }
        ]
      }
    ]
  },
  { id: 'land_cost_sub_total', particulars: 'Sub-Total of Land Cost', isBold: true, inputs: 'both' },
  {
    id: 'development_cost_group',
    srNo: 'ii',
    particulars: 'Development Cost/ Cost of Construction :',
    isBold: true,
    children: [
      { id: 'dev_cost_construction_est', srNo: 'a.(i)', particulars: 'Estimated Cost of Construction as certified by Engineer.', inputs: 'both', level: 2 },
      { id: 'dev_cost_construction_actual', srNo: 'a.(ii)', particulars: 'Actual Cost of construction incurred as per the books of accounts as verified by the CA.', inputs: 'both', level: 2 },
      { id: 'dev_cost_construction_note', particulars: 'Note : ( for adding to total cost of construction incurred, Minimum of (i) or (ii) is to be considered).', isNote: true, level: 2 },
      { id: 'dev_cost_onsite_expenditure', srNo: 'a.(iii)', particulars: 'On-site expenditure for development of entire project excluding cost of construction as per (i) or (ii) above, i.e. salaries, consultants fees, site overheads, development works, cost of services (including water, electricity, sewerage, drainage, layout roads etc.), cost of machineries and equipment including its hire and maintenance costs, consumables etc.\n\nAll costs directly incurred to complete the (i) construction of the entire phase of the project registered.', inputs: 'both', level: 2 },
      { id: 'dev_cost_taxes', srNo: 'b.', particulars: 'Payment of Taxes, cess, fees, charges, premiums, interest etc. to any Statutory Authority.', inputs: 'both', level: 1 },
      { id: 'dev_cost_financial', srNo: 'c.', particulars: 'Principal sum and interest payable to financial institutions, scheduled banks, non-banking financial institution (NBFC) or money lenders on construction funding or money borrowed for construction;', inputs: 'both', level: 1 }
    ]
  },
  { id: 'development_cost_sub_total', particulars: 'Sub-Total of Development Cost', isBold: true, inputs: 'both' },
  { id: 'total_est_cost_project', srNo: '2.', particulars: 'Total Estimated Cost of the Real Estate Project [1(i) + 1(ii)] of Estimated Column.', inputs: 'single' },
  { id: 'total_incurred_cost_project', srNo: '3.', particulars: 'Total Cost Incurred of the Real Estate Project [1(i) + 1(ii)] of Incurred Column.', inputs: 'single' },
  { id: 'completion_percentage', srNo: '4.', particulars: "% completion of Construction Work\n(as per Project Architect's Certificate)", inputs: 'single' },
  { id: 'proportion_cost_incurred', srNo: '5.', particulars: 'Proportion of the Cost incurred on Land Cost and Construction Cost to the Total Estimated Cost. (3/2)', inputs: 'single' },
  { id: 'withdrawable_amount', srNo: '6.', particulars: 'Amount Which can be withdrawn from the Designated Account. \n Total Estimated Cost * Proportion of cost incurred ( Sr. number 2 * Sr. number 5)', inputs: 'single' },
  { id: 'less_amount_withdrawn', srNo: '7.', particulars: 'Less: Amount withdrawn till date of this certificate as per the Books of Accounts and Bank Statement.', inputs: 'single' },
  { id: 'net_withdrawable_amount', srNo: '8.', particulars: 'Net Amount which can be withdrawn from the Designated Bank Account under this certificate.', inputs: 'single' },
  { id: 'ongoing_projects_header', particulars: '(ADDITIONAL INFORMATION FOR ONGOING PROJECTS)', isHeader: true },
  { id: 'ongoing_balance_cost', srNo: '1.', particulars: 'Estimated Balance Cost to Complete the Real Estate Project\n(Difference of Total Estimated Project cost less Cost incurred)\n(calculated as per the Form IV ).', inputs: 'both' },
  { id: 'ongoing_receivables_sold', srNo: '2.', particulars: 'Balance amount of receivables from sold apartments\n(as per Annexure A to this certificate(as certified by Chartered \nAccountant as verified from the records and books of Accounts).', inputs: 'both' },
  { id: 'ongoing_balance_unsold_area', srNo: '3.i.', particulars: 'Balance Unsold area (to be certified by Management and to be verified by CA from the records and books of accounts).', inputs: 'both', level: 1 },
  { id: 'ongoing_unsold_sales_proceeds', srNo: '3.ii.', particulars: 'Estimated amount of sales proceeds in respect of unsold apartments (calculated as per ASR multiplied to unsold area as on the date of certificate, to be calculated and certified by CA)as per Annexure A to this certificate.', inputs: 'both', level: 1 },
  { id: 'ongoing_estimated_receivables', srNo: '4.', particulars: 'Estimated receivables of ongoing project. Sum of 2 + 3.ii', inputs: 'both' },
  { id: 'ongoing_deposit_amount', srNo: '5.', particulars: 'Amount to be deposited in Designated Account – 70% or 100%\nIf 4 is greater than 1, then 70 % of the balance receivables of ongoing project will be deposited in designated Account\nIf 4 is lesser than 1, then 100% of the of the balance receivables\nof ongoing project will be deposited in designated Account.', inputs: 'both' },
];

const createSoldRow = () => ({ id: crypto.randomUUID(), flatNo: '', carpetArea: '', unitConsideration: '', receivedAmount: '', balanceReceivable: '' });
const createUnsoldRow = () => ({ id: crypto.randomUUID(), flatNo: '', carpetArea: '', unitConsideration: '' });

const getDefaultFormState = () => ({
  id: null,
  identity: { person_name: '', company_name: '', pan: '', cin: '', gstin: '', address: '' },
  meta: { purpose: 'For project registration and withdrawal of money', place: '', date: '', as_on_date: '' },
  ca: { firm: '', frn: '', name: '', membership_no: '', udin: '' },
  projectInfo: { pcost: '', reraRegistrationNumber: '' },
  formData: {},
  soldInventory: [createSoldRow()],
  unsoldInventory: [createUnsoldRow()],
  entityType: 'PRIVATE_LIMITED',
  readyReckonerRate: '',
});

// Helper to get values as numbers
function parseNumber(value) {
  if (value === null || value === undefined) return 0;

  // convert everything to string safely
  const str = String(value).trim();
  if (str === '') return 0;

  const cleaned = str.replace(/,/g, '').replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);

  return isNaN(num) ? 0 : num;
}

function getCalculatedValues(formData) {
  const calculated = {};

  // Calculate land cost subtotal
  const landSubtotal = [
    'land_cost_acquisition',
    'land_cost_premium',
    'land_cost_tdr',
    'land_cost_govt_payable',
    'land_cost_land_premium_asr',
    'land_cost_rehab_scheme',
    'rehab_scheme_actual_construction',
    'rehab_scheme_est_construction',
    'land_cost_clearance',
    'land_cost_asr_premium',

  ].reduce((acc, key) => {
    const data = formData[key] || {};
    return {
      estimated: acc.estimated + parseNumber(data.estimated || 0),
      incurred: acc.incurred + parseNumber(data.incurred || 0)
    };
  }, { estimated: 0, incurred: 0 });

  calculated['land_cost_sub_total'] = landSubtotal;

  // Calculate development cost subtotal
  const devSubtotal = [
    'dev_cost_construction_group',
    'dev_cost_construction_est',
    'dev_cost_construction_actual',
    'dev_cost_onsite_expenditure',
    'dev_cost_all_costs',
    'dev_cost_taxes',
    'dev_cost_financial'
  ].reduce((acc, key) => {
    const data = formData[key] || {};
    return {
      estimated: acc.estimated + parseNumber(data.estimated || 0),
      incurred: acc.incurred + parseNumber(data.incurred || 0)
    };
  }, { estimated: 0, incurred: 0 });

  calculated['development_cost_sub_total'] = devSubtotal;

  // Calculate total estimated cost (land subtotal estimated + dev subtotal estimated)
  calculated['total_est_cost_project'] = {
    estimated: landSubtotal.estimated + devSubtotal.estimated,
    incurred: 0
  };

  // Calculate total incurred cost
  calculated['total_incurred_cost_project'] = {
    estimated: landSubtotal.incurred + devSubtotal.incurred,
  };

  // Calculate proportion (Sr. 3 / Sr. 2)
  const estimatedTotal = calculated['total_est_cost_project']?.estimated || 0;
  const incurredTotal = calculated['total_incurred_cost_project']?.estimated || 0;

  const proportion =
    estimatedTotal > 0 ? incurredTotal / estimatedTotal : 0;

  calculated['proportion_cost_incurred'] = {
    estimated: Number(proportion.toFixed(3)), // store ratio
    incurred: 0,
  };


  // Calculate withdrawable amount
  calculated['withdrawable_amount'] = {
    estimated: estimatedTotal * proportion,
    incurred: 0,
  };

  // Get amount withdrawn
  const amountWithdrawn = parseNumber(formData['less_amount_withdrawn']?.estimated || 0);
  calculated['less_amount_withdrawn'] = {
    estimated: amountWithdrawn,
    incurred: 0
  };

  // Calculate net withdrawable
  calculated['net_withdrawable_amount'] = {
    estimated: Math.max(0, calculated['withdrawable_amount'].estimated - amountWithdrawn),
    incurred: 0
  };

  // For ongoing projects
  calculated['ongoing_balance_cost'] = {
    estimated: Math.max(0, estimatedTotal - incurredTotal),
    incurred: 0
  };

  return calculated;
}

const safeValue = (v) =>
  v === null || v === undefined ? "" : String(v);

function generateCertificatePayload(formState) {
  const {
    id,
    entityType,
    identity,
    meta,
    ca,
    projectInfo,
    formData,
    soldInventory,
    unsoldInventory,
    readyReckonerRate,
  } = formState;

  const mainFormRows = tableItems.flatMap(item => {
    const rows = [];
    const itemData = formData[item.id] || {};

    rows.push({
      id: item.id,
      srNo: item.srNo,
      particulars: item.particulars,
      estimated: safeValue(itemData.estimated),
      incurred: safeValue(itemData.incurred),
      isHeader: item.isHeader,
      isNote: item.isNote,
      isBold: item.isBold,
      level: item.level || 0,
      inputs: item.inputs,
    });

    item.children?.forEach(child => {
      const cd = formData[child.id] || {};
      rows.push({
        id: child.id,
        srNo: child.srNo,
        particulars: child.particulars,
        estimated: safeValue(cd.estimated),
        incurred: safeValue(cd.incurred),
        isHeader: child.isHeader,
        isNote: child.isNote,
        isBold: child.isBold,
        level: child.level || 0,
        inputs: child.inputs,
      });

      child.children?.forEach(sub => {
        const sd = formData[sub.id] || {};
        rows.push({
          id: sub.id,
          srNo: sub.srNo,
          particulars: sub.particulars,
          estimated: safeValue(sd.estimated),
          incurred: safeValue(sd.incurred),
          isHeader: sub.isHeader,
          isNote: sub.isNote,
          isBold: sub.isBold,
          level: sub.level || 0,
          inputs: sub.inputs,
        });
      });
    });

    return rows;
  });
  return {
    id,
    category: "RERA",
    certificate_type: "rera_form_3",
    entityType,

    identity: {
      person_name: identity.person_name || "",
      company_name: identity.company_name || "",
      pan: identity.pan || "",
      cin: identity.cin || "",
      gstin: identity.gstin || "",
      address: identity.address || "",
    },

    meta: {
      purpose: meta.purpose || "",
      place: meta.place || "",
      date: meta.date || "",
      as_on_date: meta.as_on_date || "",
    },

    ca: {
      firm: ca.firm || "",
      frn: ca.frn || "",
      name: ca.name || "",
      membership_no: ca.membership_no || "",
      udin: ca.udin || "",
    },

    data: {
      tables: {
        main_form: {
          columns: [
            "Sr. No.",
            "Particulars",
            "Estimated Amount (₹)",
            "Incurred Amount (₹)",
          ],
          rows: mainFormRows,
        },

        // ✅ MUST BE ARRAY (List[List])
        sold_inventory: {
          columns: [
            "Sr. No.",
            "Flat No.",
            "Carpet Area(in sq.mts.)",
            "Unit Consideration as per Agreement / Letter of Allotment",
            "Received Amount",
            "Balance Receivable",
          ],
          rows: soldInventory.map((r, i) => [
            i + 1,
            r.flatNo || "",
            r.carpetArea || "",
            r.unitConsideration || "",
            r.receivedAmount || "",
            r.balanceReceivable || "",
          ]),
        },

        unsold_inventory: {
          columns: [
            "Sr. No.",
            "Flat No.",
            "Carpet Area(in sq.mts.)",
            "Unit Consideration as per Read Reckoner",
          ],
          rows: unsoldInventory.map((r, i) => [
            i + 1,
            r.flatNo || "",
            r.carpetArea || "",
            r.unitConsideration || "",
          ]),
        },

      },

      extras: {
        pcost: projectInfo.pcost || "",
        reraRegistrationNumber: projectInfo.reraRegistrationNumber || "",
        readyReckonerRate: safeValue(readyReckonerRate),
      },
    },
  };

}

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

// Custom hook for form persistence
const useFormPersistence = (key, initial) => {
  const [state, setState] = useState(() => {
    if (!key) return initial;
    try {
      return loadDraftWithTTL(key) || initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    if (!key) return;
    saveDraftWithTTL(key, state, ONE_HOUR_DRAFT_TTL_MS);
  }, [key, state]);

  return [state, setState];
};

const ReraForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formState, setFormState] = useFormPersistence(
    isEdit ? "" : RERA_FORM3_DRAFT_KEY,
    getDefaultFormState()
  );
  const { formData, soldInventory, unsoldInventory, entityType } = formState;
  const [caSettings, setCaSettings] = useState(null);
  useEffect(() => {
    const settings = loadCASettingsLocal();
    if (!settings) return;

    setCaSettings(settings);

    const defaultCA = (settings.cas || []).find(
      (c) => c.id === settings.default_ca_id
    );

    setFormState((prev) => ({
      ...prev,

      meta: {
        ...prev.meta,
        place: prev.meta.place || settings.place || "",
      },

      ca: {
        ...prev.ca,
        firm: prev.ca.firm || settings.firm_name || "",
        frn: prev.ca.frn || settings.frn || "",
        name: prev.ca.name || defaultCA?.ca_name || "",
        membership_no:
          prev.ca.membership_no || defaultCA?.membership_no || "",
      },
    }));
  }, [setFormState]);


  // Auto-calculation logic
  useEffect(() => {
    const newCalculatedValues = getCalculatedValues(formData);
    let hasChanged = false;
    for (const key in newCalculatedValues) {
      const current = formData[key] || {};
      const calculated = newCalculatedValues[key];

      if (
        parseNumber(current.estimated) !== parseNumber(calculated.estimated) ||
        parseNumber(current.incurred) !== parseNumber(calculated.incurred)
      ) {
        hasChanged = true;
        break;
      }
    }

    if (hasChanged) {
      setFormState(prev => ({
        ...prev,
        formData: { ...prev.formData, ...newCalculatedValues }
      }));
    }
  }, [formData, setFormState]);

  // Load certificate if editing
  useEffect(() => {
    if (isEdit && id) {
      const loadCertificate = async () => {
        try {
          setIsSubmitting(true);
          const response = await api.get(`/api/certificates/${id}`);
          const cert = response.data;

          if (cert.category !== "RERA" || cert.certificate_type !== "rera_form_3") {
            toast.error("This certificate is not a RERA Form 3 certificate.");
            navigate("/");
            return;
          }


          // Transform backend data to form state
          const transformedFormData = {};
          cert.data.tables.main_form.rows.forEach(row => {
            if (row.id) {
              transformedFormData[row.id] = {
                estimated: row.estimated || '',
                incurred: row.incurred || ''
              };
            }
          });

          setFormState({
            id: cert.id,
            entityType: cert.entityType,

            identity: {
              person_name: cert.identity?.person_name || "",
              company_name: cert.identity?.company_name || "",
              pan: cert.identity?.pan || "",
              cin: cert.identity?.cin || "",
              gstin: cert.identity?.gstin || "",
              address: cert.identity?.address || "",
            },

            meta: {
              purpose: cert.meta?.purpose || "",
              place: cert.meta?.place || "",
              date: cert.meta?.date || "",
              as_on_date: cert.meta?.as_on_date || "",
            },

            ca: {
              firm: cert.ca?.firm || "",
              frn: cert.ca?.frn || "",
              name: cert.ca?.name || "",
              membership_no: cert.ca?.membership_no || "",
              udin: cert.ca?.udin || "",
            },

            projectInfo: {
              pcost: cert.data?.extras?.pcost || "",
              reraRegistrationNumber: cert.data?.extras?.reraRegistrationNumber || "",
            },

            readyReckonerRate: cert.data?.extras?.readyReckonerRate || "",

            formData: cert.data?.tables?.main_form?.rows.reduce((acc, r) => {
              if (r.id) {
                acc[r.id] = {
                  estimated: r.estimated || "",
                  incurred: r.incurred || "",
                };
              }
              return acc;
            }, {}),

            soldInventory: cert.data?.tables?.sold_inventory?.rows.map(r => ({
              id: crypto.randomUUID(),
              flatNo: r[1] || "",
              carpetArea: r[2] || "",
              unitConsideration: r[3] || "",
              receivedAmount: r[4] || "",
              balanceReceivable: r[5] || "",
            })) || [createSoldRow()],

            unsoldInventory: cert.data?.tables?.unsold_inventory?.rows.map(r => ({
              id: crypto.randomUUID(),
              flatNo: r[1] || "",
              carpetArea: r[2] || "",
              unitConsideration: r[3] || "",
            })) || [createUnsoldRow()],
          });


        } catch (error) {
          console.error("Error loading certificate:", error);
          toast.error("Failed to load certificate.");
          navigate("/");
        } finally {
          setIsSubmitting(false);
        }
      };

      loadCertificate();
    }
  }, [isEdit, id, navigate, setFormState]);

  // --- Handlers ---
  const updateNestedField = (section, field, value) => {
    setFormState(prev => ({
      ...prev,
      [section]: {
        ...(prev[section]),
        [field]: value,
      }
    }));
  };

  const updateRootField = (field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }

  const handleInputChange = (id, type, value) => {
    setFormState(prev => ({
      ...prev,
      formData: {
        ...prev.formData,
        [id]: {
          ...(prev.formData[id] || { estimated: '', incurred: '' }),
          [type === 'single' ? 'estimated' : type]: value,
        },
      }
    }));
  };

  const handleInventoryChange = (type, id, field, value) => {
    setFormState(prev => ({
      ...prev,
      [type]: prev[type].map((row) => (row.id === id ? { ...row, [field]: value } : row))
    }));
  };

  const addInventoryRow = (type) => {
    const newRow = type === 'soldInventory' ? createSoldRow() : createUnsoldRow();
    setFormState(prev => ({
      ...prev,
      [type]: [...prev[type], newRow]
    }));
  };

  const removeInventoryRow = (type, id) => {
    setFormState(prev => {
      const currentRows = prev[type];
      if (currentRows.length <= 1) return prev;
      return {
        ...prev,
        [type]: currentRows.filter((row) => row.id !== id)
      };
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const payload = generateCertificatePayload(formState);

      // 🔴 IMPORTANT: never send id in PUT body
      if (isEdit) {
        delete payload.id;
      }

      let response;
      if (isEdit) {
        response = await api.put(`/api/certificates/${id}`, payload);
        clearDraft(RERA_FORM3_DRAFT_KEY);
        toast.success("Certificate updated successfully!");
      } else {
        response = await api.post("/api/certificates", payload);
        clearDraft(RERA_FORM3_DRAFT_KEY);
        toast.success("Certificate created successfully!");
      }

      // 🔵 Navigate correctly after save
      const certId = isEdit ? id : response?.data?.id;
      if (certId) {
        navigate(`/certificate/${certId}`);
      }

    } catch (error) {
      console.error(
        "Error saving certificate:",
        error?.response?.data || error
      );

      const detail = error?.response?.data?.detail;
      let message = isEdit
        ? "Failed to update certificate."
        : "Failed to create certificate.";

      // ✅ SAFE error handling (prevents React crash)
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail)) {
        message = detail.map(d => d.msg).join(", ");
      } else if (detail && typeof detail === "object" && detail.msg) {
        message = detail.msg;
      }

      toast.error(message);

    } finally {
      setIsSubmitting(false);
    }
  };
  function autoFormatDDMMYYYY(value) {
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

  const renderFormItem = (item, level = 0) => {
    if (item.isHeader) {
      return (
        <TableRow key={item.id}>
          <TableCell colSpan={4} className="text-center font-bold text-lg p-4 bg-secondary">
            {item.particulars}
          </TableCell>
        </TableRow>
      );
    }

    if (item.isNote) {
      return (
        <TableRow key={item.id}>
          <TableCell></TableCell>
          <TableCell
            colSpan={3}
            className='p-2 text-left align-top whitespace-pre-line text-sm text-muted-foreground italic'
            style={{ paddingLeft: `${1 + level * 1.5}rem` }}
          >
            {item.particulars}
          </TableCell>
        </TableRow>
      )
    }

    const hasChildren = !!item.children?.length;

    const estimatedInput = (item.inputs === 'both' || item.inputs === 'estimated' || item.inputs === 'single') && (
      <Input
        type="text"
        name={`${item.id}_estimated`}
        placeholder={item.inputs === 'single' ? 'Value' : "Amount (₹)"}
        value={formData[item.id]?.estimated ?? ''}
        onChange={e => handleInputChange(item.id, 'estimated', e.target.value)}
        disabled={!item.inputs}
      />
    );

    const incurredInput = (item.inputs === 'both' || item.inputs === 'incurred') && (
      <Input
        type="text"
        name={`${item.id}_incurred`}
        placeholder="Amount (₹)"
        value={formData[item.id]?.incurred ?? ''}
        onChange={e => handleInputChange(item.id, 'incurred', e.target.value)}
        disabled={!item.inputs}
      />
    );

    return (
      <React.Fragment key={item.id}>
        <TableRow className={cn(item.isSubHeader && "bg-secondary/50")}>
          <TableCell className="font-medium w-20 p-2 text-left align-top"> {item.srNo} </TableCell>
          <TableCell
            className={
              cn(
                'p-2 text-left align-top whitespace-pre-line',
                (item.isBold || hasChildren) && 'font-bold',
              )}
            style={{ paddingLeft: `${1 + level * 1.5}rem` }}
          >
            {item.particulars}
          </TableCell>

          {
            item.inputs === 'single' ? (
              <TableCell colSpan={2} className="p-2">
                <Input
                  type="text"
                  name={`${item.id}_single`}
                  placeholder="Value"
                  value={formData[item.id]?.estimated ?? ''}
                  onChange={e => handleInputChange(item.id, 'single', e.target.value)}
                  disabled={!item.inputs}
                />
              </TableCell>
            ) : (
              <>
                <TableCell className="w-48 p-2">
                  {estimatedInput}
                </TableCell>
                <TableCell className="w-48 p-2">
                  {incurredInput}
                </TableCell>
              </>
            )}

        </TableRow>
        {
          item.children &&
          item.children.map(subItem =>
            renderFormItem(subItem, level + 1)
          )
        }
      </React.Fragment>
    );
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Update Certificate' : 'Save Certificate'}
            </Button>
          </div>
        </div>

        <div className="grid-cols-1">
          {/* FORM SECTION */}
          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Entity Information</CardTitle>
                <CardDescription>Details of the promoter / entity for the certificate.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="entityType">Entity Type</Label>
                  <select
                    id="entityType"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={entityType}
                    onChange={(e) => updateRootField('entityType', e.target.value)}
                  >
                    <option value="">Select entity type</option>
                    {entityTypes.map(type => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                {
                  entityType === 'PERSONAL' ? (
                    <div className="space-y-2">
                      <Label htmlFor="person_name">Person Name</Label>
                      <Input id="person_name" value={formState.identity.person_name} onChange={e => updateNestedField('identity', 'person_name', e.target.value)} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="company_name">Company Name</Label>
                      <Input id="company_name" value={formState.identity.company_name} onChange={e => updateNestedField('identity', 'company_name', e.target.value)} />
                    </div>
                  )
                }
                <div className="space-y-2">
                  <Label htmlFor="pan">PAN</Label>
                  <Input id="pan" value={formState.identity.pan} onChange={e => updateNestedField('identity', 'pan', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cin">CIN</Label>
                  <Input id="cin" value={formState.identity.cin} onChange={e => updateNestedField('identity', 'cin', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input id="gstin" value={formState.identity.gstin} onChange={e => updateNestedField('identity', 'gstin', e.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Address</Label>
                  <Input id="address" value={formState.identity.address} onChange={e => updateNestedField('identity', 'address', e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
                <CardDescription>Details about the real estate project.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="project_name">Cost of Real Estate Project</Label>
                  <Input id="project_name" value={formState.projectInfo.pcost} onChange={e => updateNestedField('projectInfo', 'pcost', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rera_reg_no">RERA Registration Number</Label>
                  <Input id="rera_reg_no" value={formState.projectInfo.reraRegistrationNumber} onChange={e => updateNestedField('projectInfo', 'reraRegistrationNumber', e.target.value)} />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Certificate & CA Details</CardTitle>
                <CardDescription>
                  Certificate signing details and Chartered Accountant information.
                </CardDescription>
              </CardHeader>

              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ---------- Certificate Meta ---------- */}
                <div className="md:col-span-2">
                  <h4 className="font-semibold text-sm text-muted-foreground border-b pb-1 mb-2">
                    Certificate Details
                  </h4>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_place">Place of Signature</Label>
                  <Input
                    id="meta_place"
                    value={formState.meta.place}
                    onChange={e => updateNestedField("meta", "place", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="meta_date">Date of Signature</Label>
                  <Input
                    id="meta_date"
                    placeholder="DD-MM-YYYY"
                    maxLength={10}
                    value={formState.meta.date}
                    onChange={(e) =>
                      updateNestedField(
                        "meta",
                        "date",
                        autoFormatDDMMYYYY(e.target.value)
                      )
                    }
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="meta_purpose">Purpose of Certificate</Label>
                  <Textarea
                    id="meta_purpose"
                    value={formState.meta.purpose}
                    onChange={e => updateNestedField("meta", "purpose", e.target.value)}
                  />
                </div>

                {/* ---------- CA Details ---------- */}
                <div className="md:col-span-2 mt-4">
                  <h4 className="font-semibold text-sm text-muted-foreground border-b pb-1 mb-2">
                    Chartered Accountant Details
                  </h4>
                </div>

                {/* Firm (locked from Settings) */}
                <div className="space-y-2">
                  <Label>CA Firm Name</Label>
                  <Input value={formState.ca.firm} disabled />
                </div>

                {/* FRN (locked from Settings) */}
                <div className="space-y-2">
                  <Label>Firm Registration Number (FRN)</Label>
                  <Input value={formState.ca.frn} disabled />
                </div>

                {/* CA Selector */}
                <div className="space-y-2">
                  <Label>Signing Partner</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={formState.ca.name || ""}
                    onChange={(e) => {
                      const selected = caSettings?.cas?.find(
                        (c) => c.ca_name === e.target.value
                      );

                      setFormState((prev) => ({
                        ...prev,
                        ca: {
                          ...prev.ca,
                          name: selected?.ca_name || "",
                          membership_no: selected?.membership_no || "",
                        },
                      }));
                    }}
                    disabled={!caSettings || !caSettings.cas?.length}
                  >
                    <option value="">
                      {!caSettings || !caSettings.cas?.length
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

                {/* Membership No (auto-filled) */}
                <div className="space-y-2">
                  <Label>Membership Number</Label>
                  <Input value={formState.ca.membership_no} disabled />
                </div>

                {/* UDIN */}
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="ca_udin">UDIN</Label>
                  <Input
                    id="ca_udin"
                    value={formState.ca.udin}
                    onChange={e => updateNestedField("ca", "udin", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>FORM No. 3</CardTitle>
                <CardDescription>(FOR REGISTRATION OF A PROJECT AND SUBSEQUENT WITHDRAWAL OF MONEY)</CardDescription>
              </CardHeader>

              <CardContent className="p-0 sm:p-2 md:p-4">
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">Sr.No.</TableHead>
                        <TableHead>Particulars</TableHead>
                        <TableHead className="w-48 text-center">Estimated Amount(₹)</TableHead>
                        <TableHead className="w-48 text-center">Incurred Amount(₹)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tableItems.map(item => renderFormItem(item))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <div className="mt-8 print:mt-16 print:break-before-page">
              <Card>
                <CardHeader className="text-center space-y-2 p-6">
                  <CardTitle className="font-bold text-xl">Annexure A</CardTitle>
                  <CardDescription>Statement for calculation of Receivables from the Sales of the Ongoing Real Estate Project</CardDescription>
                </CardHeader>

                <CardContent className="space-y-8 p-4 md:p-6">
                  {/* Sold Inventory Table */}
                  <div>
                    <h3 className="font-bold text-center mb-4">Sold Inventory</h3>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[900px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Sr.No.<br />(1)</TableHead>
                            <TableHead>Flat No.<br />(2)</TableHead>
                            <TableHead>Carpet Area(in sq.mts.)<br />(3)</TableHead>
                            <TableHead>Unit Consideration as per Agreement / Letter of Allotment<br />(4)</TableHead>
                            <TableHead>Received Amount<br />(5)</TableHead>
                            <TableHead>Balance Receivable<br />(6)</TableHead>
                            <TableHead className="w-12 print:hidden" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {
                            soldInventory.map((row, index) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-medium p-2">{index + 1}</TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.flatNo} onChange={e => handleInventoryChange('soldInventory', row.id, 'flatNo', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.carpetArea} onChange={e => handleInventoryChange('soldInventory', row.id, 'carpetArea', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.unitConsideration} onChange={e => handleInventoryChange('soldInventory', row.id, 'unitConsideration', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.receivedAmount} onChange={e => handleInventoryChange('soldInventory', row.id, 'receivedAmount', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.balanceReceivable} onChange={e => handleInventoryChange('soldInventory', row.id, 'balanceReceivable', e.target.value)} />
                                </TableCell>
                                <TableCell className="print:hidden p-2">
                                  {
                                    soldInventory.length > 1 && (
                                      <Button variant="ghost" size="icon" title="Remove row" onClick={() => removeInventoryRow('soldInventory', row.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-start mt-4 print:hidden">
                      <Button variant="outline" onClick={() => addInventoryRow('soldInventory')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Row
                      </Button>
                    </div>
                  </div>

                  {/* Unsold Inventory Table */}
                  <div>
                    <h3 className="font-bold text-center mb-2">(Unsold Inventory Valuation)</h3>
                    <div className="flex justify-center items-center flex-wrap gap-2 mb-4 text-sm">
                      <p>Ready Reckoner Rate as on the date of Certificate of the Residential / Commercial premises</p>
                      <span>Rs.</span>
                      <Input className="w-32" value={formState.readyReckonerRate} onChange={e => updateRootField('readyReckonerRate', e.target.value)} />
                      <span>per sq.mts.</span>
                    </div>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[800px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">Sr.No.<br />(01)</TableHead>
                            <TableHead>Flat No.<br />(02)</TableHead>
                            <TableHead>Carpet Area(in sq.mts.)<br />(03)</TableHead>
                            <TableHead>Unit Consideration as per Read Reckoner<br />(04)</TableHead>
                            <TableHead className="w-12 print:hidden" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {
                            unsoldInventory.map((row, index) => (
                              <TableRow key={row.id}>
                                <TableCell className="font-medium p-2">{index + 1}</TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.flatNo} onChange={e => handleInventoryChange('unsoldInventory', row.id, 'flatNo', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.carpetArea} onChange={e => handleInventoryChange('unsoldInventory', row.id, 'carpetArea', e.target.value)} />
                                </TableCell>
                                <TableCell className='p-2'>
                                  <Input value={row.unitConsideration} onChange={e => handleInventoryChange('unsoldInventory', row.id, 'unitConsideration', e.target.value)} />
                                </TableCell>
                                <TableCell className="print:hidden p-2">
                                  {
                                    unsoldInventory.length > 1 && (
                                      <Button variant="ghost" size="icon" title="Remove row" onClick={() => removeInventoryRow('unsoldInventory', row.id)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>
                                    )}
                                </TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-start mt-4 print:hidden">
                      <Button variant="outline" onClick={() => addInventoryRow('unsoldInventory')}>
                        <PlusCircle className="mr-2 h-4 w-4" /> Add Row
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end mt-8 print:hidden">
              <Button onClick={handleSubmit} disabled={isSubmitting} size="lg">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEdit ? 'Update Certificate' : 'Save Certificate'}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
export { ReraForm };

