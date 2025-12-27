import { BrowserRouter, Routes, Route } from "react-router-dom";
import "@/App.css";
import Home from "./pages/Home";
import NetWorthForm from "./pages/NetWorthForm";
import TurnoverForm from "./pages/TurnoverForm";
import CertificatePreview from "./pages/CertificatePreview";
import History from "./pages/History";
import Settings from "./pages/Settings";
import Layout from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="networth" element={<NetWorthForm />} />
            <Route path="turnover" element={<TurnoverForm />} />
            <Route path="certificate/:id" element={<CertificatePreview />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;
