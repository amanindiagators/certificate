import { useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { useAuth } from "../hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  { key: "COLLEGE", label: "College / Educational Institution" },
];

const EMPTY_FORM = {
  entity_type: "PRIVATE_LIMITED",
  display_name: "",
  person_name: "",
  company_name: "",
  pan: "",
  cin: "",
  gstin: "",
  address: "",
};

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CIN_RE = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const LLPIN_RE = /^[A-Z]{3}[0-9]{4}$/;

function getEntityLabel(value) {
  return ENTITY_TYPES.find((item) => item.key === value)?.label || value;
}

function normalizeIdentifier(value) {
  return String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

function normalizeClientForm(form) {
  return {
    ...form,
    pan: normalizeIdentifier(form.pan),
    cin: normalizeIdentifier(form.cin),
    gstin: normalizeIdentifier(form.gstin),
  };
}

function validateClientIdentifiers(form) {
  const pan = normalizeIdentifier(form.pan);
  const cin = normalizeIdentifier(form.cin);
  const gstin = normalizeIdentifier(form.gstin);

  if (pan && !PAN_RE.test(pan)) return "Invalid PAN format.";
  if (gstin && !GSTIN_RE.test(gstin)) return "Invalid GSTIN format.";
  if (pan && gstin && gstin.slice(2, 12) !== pan) return "GSTIN PAN segment must match PAN.";
  if (cin) {
    if (form.entity_type === "LLP" && !LLPIN_RE.test(cin)) return "Invalid LLPIN format.";
    if (form.entity_type !== "LLP" && !CIN_RE.test(cin)) return "Invalid CIN format.";
  }
  return null;
}

function getPrimaryName(client) {
  return client.display_name || client.company_name || client.person_name || "";
}

function toClientForm(client) {
  return {
    entity_type: client.entity_type || "PRIVATE_LIMITED",
    display_name: client.display_name || "",
    person_name: client.person_name || "",
    company_name: client.company_name || "",
    pan: client.pan || "",
    cin: client.cin || "",
    gstin: client.gstin || "",
    address: client.address || "",
  };
}

export default function Clients() {
  const { user } = useAuth();
  const canManageClients = user?.role === "admin" || user?.role === "data_executive";
  const [clients, setClients] = useState([]);
  const [query, setQuery] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const editingClient = useMemo(
    () => clients.find((client) => client.id === editingId),
    [clients, editingId]
  );

  const loadClients = async () => {
    try {
      setLoading(true);
      const res = await api.get("/api/clients", {
        params: {
          q: query.trim() || undefined,
          entity_type: entityFilter || undefined,
          limit: 100,
        },
      });
      setClients(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to load clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageClients) return undefined;
    const timer = window.setTimeout(loadClients, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageClients, entityFilter, query]);

  if (!canManageClients) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-semibold text-foreground">Access denied</h1>
        <p className="text-muted-foreground mt-2">Client master access requires admin or data executive role.</p>
      </div>
    );
  }

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const updateIdentifier = (key, value) => update(key, normalizeIdentifier(value));

  const resetForm = () => {
    setEditingId("");
    setForm(EMPTY_FORM);
    setFormOpen(false);
  };

  const handleEdit = (client) => {
    setEditingId(client.id);
    setForm(toClientForm(client));
    setFormOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedForm = normalizeClientForm(form);
    const validationError = validateClientIdentifiers(normalizedForm);
    if (validationError) {
      toast.error(validationError);
      setForm(normalizedForm);
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        await api.put(`/api/clients/${editingId}`, normalizedForm);
        toast.success("Client updated.");
      } else {
        await api.post("/api/clients", normalizedForm);
        toast.success("Client saved.");
      }
      resetForm();
      await loadClients();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save client.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (client) => {
    if (!window.confirm(`Delete ${getPrimaryName(client)} from saved clients?`)) return;
    try {
      setLoading(true);
      await api.delete(`/api/clients/${client.id}`);
      toast.success("Client deleted.");
      if (editingId === client.id) resetForm();
      await loadClients();
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to delete client.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-10 space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Clients</h1>
          <p className="text-muted-foreground mt-1">Save identity details once and reuse them in certificate forms.</p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          {!formOpen ? (
            <div className="h-fit bg-card border border-border rounded-lg p-6 shadow-sm">
              <h2 className="text-xl font-display font-semibold">Clients</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Add a client when you need to save new identity details.
              </p>
              <Button
                type="button"
                className="mt-5 w-full"
                onClick={() => {
                  setEditingId("");
                  setForm(EMPTY_FORM);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="h-fit bg-card border border-border rounded-lg p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <h2 className="text-xl font-display font-semibold">
                {editingId ? "Edit Client" : "Add Client"}
              </h2>
              {editingId ? (
                <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              ) : null}
            </div>

            <div>
              <Label>Entity Type *</Label>
              <select
                className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.entity_type}
                onChange={(event) => update("entity_type", event.target.value)}
              >
                {ENTITY_TYPES.map((type) => (
                  <option key={type.key} value={type.key}>{type.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Display Name</Label>
              <Input className="mt-2" value={form.display_name} onChange={(event) => update("display_name", event.target.value)} />
            </div>

            <div className="grid gap-4">
              <div>
                <Label>Person Name</Label>
                <Input className="mt-2" value={form.person_name} onChange={(event) => update("person_name", event.target.value)} />
              </div>
              <div>
                <Label>Company / Entity Name</Label>
                <Input className="mt-2" value={form.company_name} onChange={(event) => update("company_name", event.target.value)} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>PAN</Label>
                <Input
                  className="mt-2"
                  value={form.pan}
                  onChange={(event) => updateIdentifier("pan", event.target.value)}
                  placeholder="ABCDE1234F"
                />
              </div>
              <div>
                <Label>CIN / LLPIN</Label>
                <Input
                  className="mt-2"
                  value={form.cin}
                  onChange={(event) => updateIdentifier("cin", event.target.value)}
                  placeholder={form.entity_type === "LLP" ? "AAA1234" : "U12345MH2020PTC123456"}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>GSTIN</Label>
                <Input
                  className="mt-2"
                  value={form.gstin}
                  onChange={(event) => updateIdentifier("gstin", event.target.value)}
                  placeholder="27ABCDE1234F1Z5"
                />
              </div>
            </div>

            <div>
              <Label>Address</Label>
              <Textarea className="mt-2" rows={3} value={form.address} onChange={(event) => update("address", event.target.value)} />
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {editingId ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {saving ? "Saving..." : editingId ? "Update Client" : "Save Client"}
            </Button>
          </form>
          )}

          <div className="bg-card border border-border rounded-lg p-6 shadow-sm space-y-5">
            <div className="flex flex-col gap-3 border-b pb-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Label>Search</Label>
                <div className="relative mt-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client or PAN" />
                </div>
              </div>
              <div className="md:w-64">
                <Label>Entity Type</Label>
                <select
                  className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  value={entityFilter}
                  onChange={(event) => setEntityFilter(event.target.value)}
                >
                  <option value="">All entity types</option>
                  {ENTITY_TYPES.map((type) => (
                    <option key={type.key} value={type.key}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-[52%] py-3 pr-4 font-medium">Client</th>
                    <th className="w-[18%] py-3 pr-4 font-medium">PAN</th>
                    <th className="w-[20%] py-3 pr-4 font-medium">Entity Type</th>
                    <th className="w-[10%] py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className={`border-b last:border-0 ${editingClient?.id === client.id ? "bg-muted/40" : ""}`}>
                      <td className="py-4 pr-4 align-middle">
                        <div className="font-medium text-foreground">{getPrimaryName(client)}</div>
                      </td>
                      <td className="py-4 pr-4 align-middle font-mono-data text-sm text-muted-foreground">
                        {client.pan || "-"}
                      </td>
                      <td className="py-4 pr-4 align-middle">{getEntityLabel(client.entity_type)}</td>
                      <td className="py-4 align-middle">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="icon" onClick={() => handleEdit(client)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="destructive" size="icon" onClick={() => handleDelete(client)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!clients.length ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-muted-foreground">
                        {loading ? "Loading clients..." : "No clients found."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
