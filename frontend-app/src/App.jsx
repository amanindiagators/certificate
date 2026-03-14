import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import NetWorthForm from "./pages/NetWorthForm";
import TurnoverForm from "./pages/TurnoverForm";
import CertificatePreview from "./pages/CertificatePreview";
import History from "./pages/History";
import Settings from "./pages/Settings";
import UploadCertificates from "./pages/UploadCertificates";
import Layout from "./components/Layout";
import { Toaster } from "./components/ui/sonner";
import {ReraForm7} from "./pages/Reraform7";
import Login from "./pages/Login";
import AdminCredentials from "./pages/AdminCredentials";
import RequireAuth from "./components/RequireAuth";
import { AuthProvider } from "./hooks/useAuth";

import UtilizationForm from "./pages/utilizationform";
import { ReraForm } from "./pages/rera1";
import RbiNbfcForm from "./pages/RbiNbfcForm";
import LiquidAssets45IBForm from "./pages/LiquidAssets45IBForm";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              {/* Home */}
              <Route index element={<Home />} />

              {/* Manual forms */}
              <Route path="networth" element={<NetWorthForm />} />
              <Route path="networth/:id" element={<NetWorthForm />} />

              <Route path="turnover" element={<UploadCertificates />} />
              <Route path="turnover/new" element={<TurnoverForm />} />
              <Route path="turnover/:id" element={<TurnoverForm />} />

              <Route path="rera-form-7" element={<ReraForm7 />} />
              <Route path="rera-form-7/:id" element={<ReraForm7 />} />

              <Route path="utilisation" element={<UtilizationForm />} />
              <Route path="utilisation/:id" element={<UtilizationForm />} />

              <Route path="rera" element={<ReraForm />} />
              <Route path="rera/:id" element={<ReraForm />} />

              <Route path="rbi-statutory-auditor" element={<RbiNbfcForm />} />
              <Route path="rbi-statutory-auditor/:id" element={<RbiNbfcForm />} />
              <Route path="rbi-liquid-assets" element={<LiquidAssets45IBForm />} />
              <Route path="rbi-liquid-assets/:id" element={<LiquidAssets45IBForm />} />

              {/* Upload Excel */}
              <Route path="upload" element={<UploadCertificates />} />

              {/* Others */}
              <Route path="certificate/:id" element={<CertificatePreview />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />

              <Route
                path="admin/credentials"
                element={
                  <RequireAuth role="admin">
                    <AdminCredentials />
                  </RequireAuth>
                }
              />
            </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>

      <Toaster />
    </div>
  );
}

export default App;
