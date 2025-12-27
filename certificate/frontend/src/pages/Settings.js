import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Settings = () => {
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState({
    ca_name: "",
    membership_no: "",
    udin: "",
    firm_name: "P. Jyoti & Co.",
    frn: "010237C",
    place: "",
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await axios.get(`${API}/ca-settings`);
      setSettings(response.data);
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await axios.put(`${API}/ca-settings`, settings);
      toast.success("CA settings saved successfully!");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            Settings
          </h1>
          <p className="text-muted-foreground">
            Configure default CA details for certificates
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-xl font-display font-semibold text-foreground mb-4">
                Default CA Information
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                These details will be pre-filled when creating new certificates
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label htmlFor="ca_name">CA Name *</Label>
                <Input
                  id="ca_name"
                  data-testid="settings-ca-name"
                  value={settings.ca_name}
                  onChange={(e) => setSettings({ ...settings, ca_name: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="membership_no">Membership Number *</Label>
                <Input
                  id="membership_no"
                  data-testid="settings-membership-no"
                  value={settings.membership_no}
                  onChange={(e) => setSettings({ ...settings, membership_no: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="udin">UDIN *</Label>
                <Input
                  id="udin"
                  data-testid="settings-udin"
                  value={settings.udin}
                  onChange={(e) => setSettings({ ...settings, udin: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="place">Place *</Label>
                <Input
                  id="place"
                  data-testid="settings-place"
                  value={settings.place}
                  onChange={(e) => setSettings({ ...settings, place: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="firm_name">Firm Name *</Label>
                <Input
                  id="firm_name"
                  data-testid="settings-firm-name"
                  value={settings.firm_name}
                  onChange={(e) => setSettings({ ...settings, firm_name: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="frn">FRN *</Label>
                <Input
                  id="frn"
                  data-testid="settings-frn"
                  value={settings.frn}
                  onChange={(e) => setSettings({ ...settings, frn: e.target.value })}
                  required
                  className="mt-2"
                />
              </div>
            </div>

            <div className="flex justify-end pt-6 border-t">
              <Button
                type="submit"
                disabled={loading}
                data-testid="save-settings-button"
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Saving..." : "Save Settings"}
              </Button>
            </div>
          </form>
        </div>

        <div className="mt-8 bg-primary/5 border border-primary/20 rounded-xl p-6">
          <h3 className="text-lg font-display font-semibold text-foreground mb-2">
            Note
          </h3>
          <p className="text-sm text-muted-foreground">
            These settings will be used as default values when creating new certificates. 
            You can still edit them individually for each certificate if needed.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
