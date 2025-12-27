import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const History = () => {
  const navigate = useNavigate();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificates();
  }, []);

  const fetchCertificates = async () => {
    try {
      const response = await axios.get(`${API}/certificates`);
      setCertificates(response.data);
    } catch (error) {
      console.error("Error fetching certificates:", error);
      toast.error("Failed to load certificates");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading certificates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-background py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-4xl font-display font-bold text-foreground mb-2">
            Certificate History
          </h1>
          <p className="text-muted-foreground">
            View and manage all your generated certificates
          </p>
        </div>

        {certificates.length === 0 ? (
          <div className="text-center py-16 bg-card border border-border rounded-xl">
            <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">No Certificates Yet</h3>
            <p className="text-muted-foreground mb-6">Get started by creating your first certificate</p>
            <Button onClick={() => navigate("/")} data-testid="create-first-cert-btn">
              Create Certificate
            </Button>
          </div>
        ) : (
          <div className="grid gap-6">
            {certificates.map((cert) => (
              <div
                key={cert.id}
                data-testid={`certificate-card-${cert.id}`}
                className="bg-card border border-border rounded-xl p-6 hover:shadow-lg transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4 flex-1">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      cert.certificate_type === "networth" 
                        ? "bg-primary/10 text-primary" 
                        : "bg-secondary/10 text-secondary"
                    }`}>
                      {cert.certificate_type === "networth" ? (
                        <FileText className="h-6 w-6" />
                      ) : (
                        <TrendingUp className="h-6 w-6" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-1">
                        <h3 className="text-xl font-display font-semibold text-foreground">
                          {cert.certificate_type === "networth" ? "Net Worth Certificate" : "Turnover Certificate"}
                        </h3>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          cert.certificate_type === "networth"
                            ? "bg-primary/10 text-primary"
                            : "bg-secondary/10 text-secondary"
                        }`}>
                          {cert.certificate_type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-lg font-semibold text-foreground mb-2">{cert.company_name}</p>
                      <p className="text-sm text-muted-foreground mb-1">CIN: {cert.cin}</p>
                      <p className="text-sm text-muted-foreground">Generated on {formatDate(cert.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/certificate/${cert.id}`)}
                      data-testid={`view-cert-${cert.id}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
