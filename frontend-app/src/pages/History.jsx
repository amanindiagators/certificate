import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Trash2,
  Pencil,
  Eye,
  Plus,
  RefreshCw,
  Calendar,
  FileText,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

const CATEGORY_META = {
  NET_WORTH: {
    chip: "bg-blue-50 text-blue-700 border-blue-200",
    editRoute: (id) => `/networth/${id}`,
  },
  TURNOVER: {
    chip: "bg-green-50 text-green-700 border-green-200",
    editRoute: (id) => `/turnover/${id}`,
  },
  UTILISATION: {
    chip: "bg-purple-50 text-purple-700 border-purple-200",
    editRoute: (id) => `/utilisation/${id}`,
  },
  RERA: {
    chip: "bg-orange-50 text-orange-700 border-orange-200",
    editRoute: null,
  },
  NBFC: {
    chip: "bg-amber-50 text-amber-700 border-amber-200",
    editRoute: (id) => `/rbi-statutory-auditor/${id}`,
  },
  GST: {
    chip: "bg-rose-50 text-rose-700 border-rose-200",
    editRoute: null,
  },
};

const TYPE_CHIP_META = {
  rbi_statutory_auditor_certificate_for_nbfcs: "bg-amber-50 text-amber-700 border-amber-200",
  rbi_statutory_auditor_certificate_for_nbfcs__liquid_assets_45_ib:
    "bg-lime-50 text-lime-700 border-lime-200",
};

const safeUpper = (s) => (s || "").toString().trim().toUpperCase();

const getDisplayName = (cert) => {
  const identity = cert?.identity || {};
  return cert?.entityType === "PERSONAL"
    ? identity?.person_name || "Unnamed Individual"
    : identity?.company_name || "Unnamed Entity";
};

const formatDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return isNaN(date.getTime())
    ? d
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const titleFromType = (cert) => {
  const gstForm = cert?.data?.extras?.selectedForm;
  if (safeUpper(cert?.category) === "GST" && gstForm?.code) {
    return `${gstForm.code} - ${gstForm.title || "REFUND CERTIFICATE"}`;
  }
  const variant = cert?.data?.extras?.formData?.certificateVariant;
  if (variant === "liquid_assets_45_ib") {
    return "CERTIFICATE OF MAINTENANCE OF LIQUID ASSETS U/S 45-IB";
  }
  if (cert?.certificate_type) {
    return cert.certificate_type.replaceAll("_", " ").toUpperCase();
  }
  return "CERTIFICATE";
};

const chipClassFromCert = (cert) => {
  const type = (cert?.certificate_type || "").toLowerCase();
  const variant = (cert?.data?.extras?.formData?.certificateVariant || "").toLowerCase();

  if (type && variant) {
    const key = `${type}__${variant}`;
    if (TYPE_CHIP_META[key]) return TYPE_CHIP_META[key];
  }
  if (type && TYPE_CHIP_META[type]) return TYPE_CHIP_META[type];

  const categoryMeta = CATEGORY_META[safeUpper(cert?.category)];
  return categoryMeta?.chip || "bg-slate-50 text-slate-700 border-slate-200";
};

export default function History() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [dateQuery, setDateQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");

  const fetchCerts = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/certificates");
      setItems(Array.isArray(res.data) ? res.data : res.data?.items || []);
    } catch {
      toast.error("Failed to load certificates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCerts();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return items
      .filter((c) => {
        if (categoryFilter !== "ALL" && safeUpper(c.category) !== categoryFilter) {
          return false;
        }

        if (dateQuery) {
          const certDate = new Date(c.created_at).toLocaleDateString("en-CA");
          if (!certDate.includes(dateQuery)) return false;
        }

        if (!q) return true;
        return [
          getDisplayName(c),
          c.category,
          c.certificate_type,
          c.entityType,
          c.id,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [items, query, categoryFilter, dateQuery]);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure?")) return;
    try {
      await api.delete(`/api/certificates/${id}`);
      toast.success("Certificate deleted");
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch {
      toast.error("Delete failed");
    }
  };

  const canManageCertificates = Boolean(
    isAdmin ||
      user?.can_manage_certificates ||
      user?.can_edit_certificates ||
      user?.can_delete_certificates
  );

  const handleEdit = (cert) => {
    const type = cert.certificate_type;

    if (type === "rera_form_3") {
      navigate(`/rera/${cert.id}`);
    } else if (type === "rera_form_7_reg_9") {
      navigate(`/rera-form-7/${cert.id}`);
    } else if (type === "rbi_statutory_auditor_certificate_for_nbfcs") {
      const variant = cert?.data?.extras?.formData?.certificateVariant;
      if (variant === "liquid_assets_45_ib") navigate(`/rbi-liquid-assets/${cert.id}`);
      else navigate(`/rbi-statutory-auditor/${cert.id}`);
    } else {
      const meta = CATEGORY_META[safeUpper(cert.category)];
      if (meta?.editRoute) navigate(meta.editRoute(cert.id));
      else toast.error("Edit form is not available for this certificate type.");
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] py-12">
      <div className="max-w-[95%] xl:max-w-[1440px] mx-auto px-4">
        <div className="flex flex-col lg:flex-row justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-extrabold">Certificate History</h1>
            <p className="text-slate-500 mt-2 text-lg">
              Manage and search your certificates.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={fetchCerts}>
              <RefreshCw className={`mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-indigo-600 text-white">
                  <Plus className="mr-2" />
                  New Certificate
                  <ChevronDown className="ml-2" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuItem onClick={() => navigate("/networth")}>
                  <FileText className="mr-2 text-blue-600" />
                  Net Worth Certificate
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/turnover")}>
                  <FileText className="mr-2 text-green-600" />
                  Turnover Certificate
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/utilisation")}>
                  <FileText className="mr-2 text-purple-600" />
                  Utilisation Certificate
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/rera")}>
                  <FileText className="mr-2 text-orange-600" />
                  RERA Form 3 (CA Certificate)
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/rera-form-7")}>
                  <FileText className="mr-2 text-orange-600" />
                  RERA Form 7 (Reg-9 QPR)
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/rbi-statutory-auditor")}>
                  <FileText className="mr-2 text-amber-600" />
                  RBI Statutory Auditor Certificate for NBFCs
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => navigate("/rbi-liquid-assets")}>
                  <FileText className="mr-2 text-lime-600" />
                  Liquid Assets Certificate u/s 45-IB
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card className="mb-10">
          <CardContent className="p-6 flex flex-col md:flex-row gap-6">
            <Input
              placeholder="Search by name, ID, type..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <Input
              type="date"
              value={dateQuery}
              onChange={(e) => setDateQuery(e.target.value)}
            />

            <select
              className="border rounded px-4 py-2"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {Object.keys(CATEGORY_META).map((k) => (
                <option key={k} value={k}>
                  {k.replace("_", " ")}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>

        <div className="grid gap-6">
          {filtered.map((cert) => {
            return (
              <Card key={cert.id}>
                <CardContent className="p-6 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-xl">{getDisplayName(cert)}</h3>

                    <Badge variant="outline" className={chipClassFromCert(cert)}>
                      {titleFromType(cert)}
                    </Badge>

                    <div className="mt-2 text-xs font-mono text-slate-400">
                      REF: {cert.id}
                    </div>

                    <div className="mt-2 text-slate-600">
                      <span className="flex items-center">
                        <Calendar className="mr-2" />
                        {formatDate(cert.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="ghost"
                      onClick={() => navigate(`/certificate/${cert.id}`)}
                    >
                      <Eye className="mr-2" /> View
                    </Button>

                    {canManageCertificates && (
                      <Button variant="outline" onClick={() => handleEdit(cert)}>
                        <Pencil className="mr-2" /> Edit
                      </Button>
                    )}

                    {canManageCertificates && (
                      <Button
                        variant="ghost"
                        onClick={() => handleDelete(cert.id)}
                      >
                        <Trash2 className="text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
