import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

const CA_STORAGE_KEY = "ca_settings_v1";

function defaultSettings() {
  return {
    place: "Patna",
    firm_name: "P. Jyoti & Co.",
    frn: "010237C",
    default_ca_id: "",
    cas: [],
  };
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(CA_STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw);
    return { ...defaultSettings(), ...parsed, cas: Array.isArray(parsed?.cas) ? parsed.cas : [] };
  } catch {
    return defaultSettings();
  }
}

function saveSettings(settings) {
  localStorage.setItem(CA_STORAGE_KEY, JSON.stringify(settings));
}

function makeId() {
  return `ca_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

export default function Settings() {
  const [settings, setSettings] = useState(defaultSettings());

  // input fields for new CA
  const [newCAName, setNewCAName] = useState("");
  const [newMembershipNo, setNewMembershipNo] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const cas = useMemo(() => settings.cas || [], [settings.cas]);

  const update = (key, value) => setSettings((p) => ({ ...p, [key]: value }));

  const setDefaultCA = (id) => {
    setSettings((p) => ({ ...p, default_ca_id: id }));
  };

  const addCA = () => {
    const name = newCAName.trim();
    const mem = newMembershipNo.trim();

    if (!name) return toast.error("CA Name is required.");
    if (!mem) return toast.error("Membership No is required.");

    const ca = { id: makeId(), ca_name: name, membership_no: mem };

    setSettings((p) => {
      const next = { ...p, cas: [...(p.cas || []), ca] };
      if (!next.default_ca_id) next.default_ca_id = ca.id;
      return next;
    });

    setNewCAName("");
    setNewMembershipNo("");
  };

  const removeCA = (id) => {
    setSettings((p) => {
      const nextCas = (p.cas || []).filter((c) => c.id !== id);
      const next = { ...p, cas: nextCas };

      if (p.default_ca_id === id) {
        next.default_ca_id = nextCas.length ? nextCas[0].id : "";
      }
      return next;
    });
  };

  const handleSave = () => {
    // Basic validation
    if (!settings.place.trim()) return toast.error("Place is required.");
    if (!settings.firm_name.trim()) return toast.error("Firm Name is required.");
    if (!settings.frn.trim()) return toast.error("FRN is required.");

    saveSettings(settings);
    toast.success("Settings saved (local).");
  };

  const handleReset = () => {
    const ok = window.confirm("Reset settings to default?");
    if (!ok) return;
    const d = defaultSettings();
    setSettings(d);
    saveSettings(d);
    toast.success("Settings reset.");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">
            CA details are stored locally in your browser (universal-only backend).
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardContent className="p-6 space-y-8">
            {/* Firm defaults */}
            <div className="space-y-4">
              <h2 className="text-xl font-display font-semibold border-b pb-2">Default Firm Details</h2>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label>Place *</Label>
                  <Input className="mt-2" value={settings.place} onChange={(e) => update("place", e.target.value)} />
                </div>

                <div>
                  <Label>Firm Name *</Label>
                  <Input
                    className="mt-2"
                    value={settings.firm_name}
                    onChange={(e) => update("firm_name", e.target.value)}
                  />
                </div>

                <div>
                  <Label>FRN *</Label>
                  <Input className="mt-2" value={settings.frn} onChange={(e) => update("frn", e.target.value)} />
                </div>
              </div>
            </div>

            {/* CA List */}
            <div className="space-y-4">
              <h2 className="text-xl font-display font-semibold border-b pb-2">CA List</h2>

              <div className="grid md:grid-cols-3 gap-4 items-end">
                <div>
                  <Label>CA Name *</Label>
                  <Input
                    className="mt-2"
                    value={newCAName}
                    onChange={(e) => setNewCAName(e.target.value)}
                    placeholder="e.g., CA Pankaj Jyoti"
                  />
                </div>

                <div>
                  <Label>Membership No *</Label>
                  <Input
                    className="mt-2"
                    value={newMembershipNo}
                    onChange={(e) => setNewMembershipNo(e.target.value)}
                    placeholder="e.g., 400084"
                  />
                </div>

                <Button onClick={addCA} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add CA
                </Button>
              </div>

              {cas.length === 0 ? (
                <div className="text-sm text-muted-foreground">No CA added yet.</div>
              ) : (
                <div className="space-y-3">
                  {cas.map((ca) => {
                    const isDefault = settings.default_ca_id === ca.id;
                    return (
                      <div
                        key={ca.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                      >
                        <div>
                          <div className="font-semibold">{ca.ca_name}</div>
                          <div className="text-sm text-muted-foreground">M. No: {ca.membership_no}</div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant={isDefault ? "default" : "outline"}
                            onClick={() => setDefaultCA(ca.id)}
                          >
                            {isDefault ? "Default" : "Set Default"}
                          </Button>

                          <Button variant="destructive" onClick={() => removeCA(ca.id)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">
              <Button variant="outline" onClick={handleReset}>
                Reset
              </Button>

              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
