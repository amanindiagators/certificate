import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CertificatePreview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const certificateRef = useRef();
  const [certificate, setCertificate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCertificate();
  }, [id]);

  const fetchCertificate = async () => {
    try {
      const response = await axios.get(`${API}/certificates/${id}`);
      setCertificate(response.data);
    } catch (error) {
      console.error("Error fetching certificate:", error);
      toast.error("Failed to load certificate");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = useReactToPrint({
    contentRef: certificateRef,
  });

  const handleDownloadPDF = async () => {
    try {
      const element = certificateRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgWidth = 210;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
      pdf.save(`${certificate.certificate_type}-certificate-${id}.pdf`);
      toast.success("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF");
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
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
          <Button onClick={() => navigate("/")} className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-muted/30 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="no-print mb-6 flex justify-between items-center">
          <Button
            variant="ghost"
            onClick={() => navigate("/history")}
            data-testid="back-button"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to History
          </Button>
          
          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={handlePrint}
              data-testid="print-button"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
            <Button
              onClick={handleDownloadPDF}
              data-testid="download-button"
              className="bg-primary hover:bg-primary/90"
            >
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </div>

        <div ref={certificateRef} className="certificate-container" data-testid="certificate-preview">
          {certificate.certificate_type === "networth" ? (
            <NetWorthCertificateDisplay certificate={certificate} formatCurrency={formatCurrency} />
          ) : (
            <TurnoverCertificateDisplay certificate={certificate} formatCurrency={formatCurrency} />
          )}
        </div>
      </div>
    </div>
  );
};

const NetWorthCertificateDisplay = ({ certificate, formatCurrency }) => {
  return (
    <div>
      <div className="certificate-title">NET WORTH CERTIFICATE</div>
      
      <div className="text-center mb-8">
        <p className="text-lg font-semibold">TO WHOM IT MAY CONCERN</p>
      </div>

      <div className="certificate-body">
        <p className="mb-4">
          This is to certify that we <strong>{certificate.ca_details.firm_name}</strong> have examined the books of accounts, 
          audited financial statements, capital records and supporting documents of{" "}
          <strong>{certificate.company_name}</strong>, having its registered office at{" "}
          <strong>{certificate.registered_address}</strong>.
        </p>
        <p className="mb-6">
          Based on the audited financial statements and information provided, the Net worth of the Company 
          for the five (5) financial years is as under:
        </p>
      </div>

      <div className="text-center mb-4">
        <h3 className="font-display font-semibold text-lg">Net Worth Summary for 5 Years</h3>
      </div>

      <table className="certificate-table">
        <thead>
          <tr>
            <th>PARTICULARS</th>
            {certificate.financial_years.map((fy, index) => (
              <th key={index} className="text-center">{fy.year}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Total Assets (A)</strong></td>
            {certificate.financial_years.map((fy, index) => (
              <td key={index} className="number-cell">{formatCurrency(fy.total_assets)}</td>
            ))}
          </tr>
          <tr>
            <td><strong>Total Liabilities (B)</strong></td>
            {certificate.financial_years.map((fy, index) => (
              <td key={index} className="number-cell">{formatCurrency(fy.total_liabilities)}</td>
            ))}
          </tr>
          <tr>
            <td><strong>Net Worth (A-B)</strong></td>
            {certificate.financial_years.map((fy, index) => (
              <td key={index} className="number-cell font-bold">{formatCurrency(fy.net_worth)}</td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="certificate-signature">
        <div className="signature-left">
          <p><strong>Date:</strong> {certificate.ca_details.date}</p>
          <p><strong>Place:</strong> {certificate.ca_details.place}</p>
        </div>
        <div className="signature-right">
          <p>For {certificate.ca_details.firm_name}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {certificate.ca_details.frn}</p>
          <p className="mt-8">({certificate.ca_details.ca_name})</p>
          <p>Partner</p>
          <p>M.No. {certificate.ca_details.membership_no}</p>
          <p>UDIN: {certificate.ca_details.udin}</p>
        </div>
      </div>
    </div>
  );
};

const TurnoverCertificateDisplay = ({ certificate, formatCurrency }) => {
  const totalTurnover = certificate.turnover_years.reduce((sum, ty) => sum + ty.turnover, 0);
  
  return (
    <div>
      <div className="certificate-title">TURNOVER CERTIFICATE</div>
      
      <div className="text-center mb-8">
        <p className="text-lg font-semibold">TO WHOM SO EVER IT MAY CONCERN</p>
      </div>

      <div className="certificate-body">
        <p className="mb-4">
          We, M/s, <strong>{certificate.ca_details.firm_name}</strong> (Chartered Accountants), the Statutory Auditors of M/s,{" "}
          <strong>{certificate.company_name}</strong>, CIN – <strong>{certificate.cin}</strong>{" "}
          having its registered office at <strong>{certificate.registered_address}</strong>, do hereby certify that 
          the Gross Turnover (Including GST) for the Last {certificate.turnover_years.length} financial Years ended on 
          31st March of the Company is/are as follows:
        </p>
      </div>

      <table className="certificate-table">
        <thead>
          <tr>
            <th className="text-center">SI. NO</th>
            <th>Financial Year(s)</th>
            <th>Turnover (INR)</th>
          </tr>
        </thead>
        <tbody>
          {certificate.turnover_years.map((ty, index) => (
            <tr key={index}>
              <td className="text-center">{index + 1}</td>
              <td>{ty.year}</td>
              <td className="number-cell">{formatCurrency(ty.turnover)}</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td colSpan={2} className="text-right"><strong>Total</strong></td>
            <td className="number-cell">{formatCurrency(totalTurnover)}</td>
          </tr>
        </tbody>
      </table>

      <div className="certificate-body mt-6">
        <p className="mb-4">
          We have obtained all the information and explanation which to the best of our Knowledge and belief 
          were necessary for this certification and we are issuing this certification on the basis of books of accounts, 
          Audited Financial statements presented for the FY {certificate.turnover_years[0]?.year} to FY {certificate.turnover_years[certificate.turnover_years.length - 1]?.year}.
        </p>
        <p>
          This Certificate is issued on the request of the management of the company and we owe no financial or 
          other liability to anyone in respect of this certificate.
        </p>
      </div>

      <div className="certificate-signature">
        <div className="signature-left">
          <p><strong>Date:</strong> {certificate.ca_details.date}</p>
          <p><strong>Place:</strong> {certificate.ca_details.place}</p>
        </div>
        <div className="signature-right">
          <p>For {certificate.ca_details.firm_name}</p>
          <p>Chartered Accountants</p>
          <p>FRN: {certificate.ca_details.frn}</p>
          <p className="mt-8">({certificate.ca_details.ca_name})</p>
          <p>Partner</p>
          <p>M.No. {certificate.ca_details.membership_no}</p>
          <p>UDIN: {certificate.ca_details.udin}</p>
        </div>
      </div>
    </div>
  );
};

export default CertificatePreview;
