import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const NetWorthForm = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: "",
    cin: "",
    registered_address: "",
    financial_years: [
      { year: "F.Y.2020-2021", total_assets: 0, total_liabilities: 0, net_worth: 0 },
      { year: "F.Y.2021-2022", total_assets: 0, total_liabilities: 0, net_worth: 0 },
      { year: "F.Y.2022-2023", total_assets: 0, total_liabilities: 0, net_worth: 0 },
      { year: "F.Y.2023-2024", total_assets: 0, total_liabilities: 0, net_worth: 0 },
      { year: "F.Y.2024-2025", total_assets: 0, total_liabilities: 0, net_worth: 0 },
    ],
    ca_details: {
      ca_name: "",
      membership_no: "",
      udin: "",
      firm_name: "P. Jyoti & Co.",
      frn: "010237C",
      place: "",
      date: new Date().toLocaleDateString('en-IN'),
    },
  });

  useEffect(() => {
    fetchCASettings();
  }, []);

  const fetchCASettings = async () => {
    try {
      const response = await axios.get(`${API}/ca-settings`);
      setFormData(prev => ({
        ...prev,
        ca_details: {
          ...prev.ca_details,
          ca_name: response.data.ca_name,
          membership_no: response.data.membership_no,
          udin: response.data.udin,
          firm_name: response.data.firm_name,
          frn: response.data.frn,
          place: response.data.place,
        }
      }));
    } catch (error) {
      console.error("Error fetching CA settings:", error);
    }
  };

  const handleYearDataChange = (index, field, value) => {
    const updatedYears = [...formData.financial_years];
    updatedYears[index][field] = parseFloat(value) || 0;
    
    if (field === "total_assets" || field === "total_liabilities") {
      updatedYears[index].net_worth = 
        updatedYears[index].total_assets - updatedYears[index].total_liabilities;
    }
    
    setFormData({ ...formData, financial_years: updatedYears });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const response = await axios.post(`${API}/networth`, formData);
      toast.success("Net Worth Certificate created successfully!");
      navigate(`/certificate/${response.data.id}`);
    } catch (error) {
      console.error("Error creating certificate:", error);
      toast.error("Failed to create certificate. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
          data-testid="back-button"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Home
        </Button>

        <div className="bg-card border border-border rounded-xl shadow-sm p-8">
          <h1 className="text-3xl font-display font-bold text-foreground mb-2">
            Net Worth Certificate
          </h1>
          <p className="text-muted-foreground mb-8">
            Fill in the company details and financial data for 5 years
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                Company Information
              </h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    data-testid="company-name-input"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="cin">CIN *</Label>
                  <Input
                    id="cin"
                    data-testid="cin-input"
                    value={formData.cin}
                    onChange={(e) => setFormData({ ...formData, cin: e.target.value })}
                    required
                    className="mt-2"
                  />
                </div>
              </div>
              
              <div>
                <Label htmlFor="registered_address">Registered Address *</Label>
                <Textarea
                  id="registered_address"
                  data-testid="address-input"
                  value={formData.registered_address}
                  onChange={(e) => setFormData({ ...formData, registered_address: e.target.value })}
                  required
                  rows={3}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                Financial Data (5 Years)
              </h2>
              
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-border">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="border border-border p-3 text-left text-sm font-semibold">Financial Year</th>
                      <th className="border border-border p-3 text-left text-sm font-semibold">Total Assets (₹)</th>
                      <th className="border border-border p-3 text-left text-sm font-semibold">Total Liabilities (₹)</th>
                      <th className="border border-border p-3 text-left text-sm font-semibold">Net Worth (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.financial_years.map((year, index) => (
                      <tr key={index} className="hover:bg-muted/30">
                        <td className="border border-border p-3 font-mono-data text-sm">
                          {year.year}
                        </td>
                        <td className="border border-border p-2">
                          <Input
                            type="number"
                            step="0.01"
                            data-testid={`assets-${index}`}
                            value={year.total_assets}
                            onChange={(e) => handleYearDataChange(index, "total_assets", e.target.value)}
                            className="font-mono-data text-sm"
                            required
                          />
                        </td>
                        <td className="border border-border p-2">
                          <Input
                            type="number"
                            step="0.01"
                            data-testid={`liabilities-${index}`}
                            value={year.total_liabilities}
                            onChange={(e) => handleYearDataChange(index, "total_liabilities", e.target.value)}
                            className="font-mono-data text-sm"
                            required
                          />
                        </td>
                        <td className="border border-border p-3 font-mono-data text-sm font-semibold text-primary">
                          {year.net_worth.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-6">
              <h2 className="text-xl font-display font-semibold text-foreground border-b pb-2">
                CA Details
              </h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="ca_name">CA Name *</Label>
                  <Input
                    id="ca_name"
                    data-testid="ca-name-input"
                    value={formData.ca_details.ca_name}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, ca_name: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="membership_no">Membership Number *</Label>
                  <Input
                    id="membership_no"
                    data-testid="membership-no-input"
                    value={formData.ca_details.membership_no}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, membership_no: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="udin">UDIN *</Label>
                  <Input
                    id="udin"
                    data-testid="udin-input"
                    value={formData.ca_details.udin}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, udin: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="place">Place *</Label>
                  <Input
                    id="place"
                    data-testid="place-input"
                    value={formData.ca_details.place}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, place: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="firm_name">Firm Name *</Label>
                  <Input
                    id="firm_name"
                    data-testid="firm-name-input"
                    value={formData.ca_details.firm_name}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, firm_name: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
                
                <div>
                  <Label htmlFor="frn">FRN *</Label>
                  <Input
                    id="frn"
                    data-testid="frn-input"
                    value={formData.ca_details.frn}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      ca_details: { ...formData.ca_details, frn: e.target.value } 
                    })}
                    required
                    className="mt-2"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end space-x-4 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/")}
                data-testid="cancel-button"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                data-testid="submit-button"
                className="bg-primary hover:bg-primary/90"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Generating..." : "Generate Certificate"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default NetWorthForm;
