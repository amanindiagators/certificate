import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  FileText, 
  TrendingUp, 
  ArrowRight, 
  Building2, 
  ChevronDown,
  LayoutDashboard,
  Landmark,
} from "lucide-react";
import { Button } from "../components/ui/button";

const cardBaseClass =
  "group relative h-full min-h-[290px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-7 transition-all duration-300 hover:-translate-y-1";
const cardBodyClass = "relative z-10 flex h-full flex-col";
const ctaButtonClass =
  "mt-auto w-fit rounded-xl border-slate-300 bg-white/85 px-5 text-[15px] font-medium backdrop-blur transition-all";

const Home = () => {
  const [showReraOptions, setShowReraOptions] = useState(false);
  const [showTurnoverOptions, setShowTurnoverOptions] = useState(false);
  const reraMenuRef = useRef(null);
  const turnoverMenuRef = useRef(null);

  // Close card dropdowns if clicking anywhere else on the screen
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (reraMenuRef.current && !reraMenuRef.current.contains(event.target)) {
        setShowReraOptions(false);
      }
      if (turnoverMenuRef.current && !turnoverMenuRef.current.contains(event.target)) {
        setShowTurnoverOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        
        {/* Hero Header */}
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground tracking-tight mb-4">
            Professional Certificate
            <span className="block text-primary mt-2">Generation Platform</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Streamlined compliance tools for Chartered Accountants and Financial Professionals.
          </p>
        </div>

        {/* Main Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
          
          {/* --- RERA MULTI-OPTION CARD --- */}
          <div className="relative h-full" ref={reraMenuRef}>
            <div 
              onClick={() => {
                setShowReraOptions(!showReraOptions);
                setShowTurnoverOptions(false);
              }}
              className={`${cardBaseClass} cursor-pointer ${
                showReraOptions ? "border-blue-500 ring-2 ring-blue-500/20" : "hover:border-blue-500/80"
              }`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400" />

              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-4xl font-display font-semibold leading-none text-slate-900">RERA</h2>
                  <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <Building2 className="h-7 w-7 text-blue-600" />
                  </div>
                </div>

                <p className="text-lg leading-relaxed text-slate-600">
                  Project Cost Certificates (Form 3) and Quarterly Progress Reports (Form 7).
                </p>

                <Button variant="outline" className={`${ctaButtonClass} hover:bg-blue-600 hover:text-white`}>
                  Select Form Type
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showReraOptions ? "rotate-180" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Dropdown Menu */}
            {showReraOptions && (
              <div className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white animate-in fade-in slide-in-from-top-2">
                <Link to="/rera" className="group flex items-center justify-between border-b border-slate-100 p-4 hover:bg-blue-50/70">
                  <div>
                    <p className="font-bold text-slate-800">RERA Form 3</p>
                    <p className="text-xs text-muted-foreground">Cost & Withdrawal Certificate</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-600 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </Link>
                <Link to="/rera-form-7" className="group flex items-center justify-between p-4 hover:bg-blue-50/70">
                  <div>
                    <p className="font-bold text-slate-800">RERA Form 7 (QPR)</p>
                    <p className="text-xs text-muted-foreground">Quarterly Progress Report (Reg-9)</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-blue-600 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </Link>
              </div>
            )}
          </div>

          {/* --- NET WORTH CARD --- */}
          <Link to="/networth" data-testid="networth-card-link">
            <div className={`${cardBaseClass} hover:border-primary/70`}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-blue-400" />
              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-[2rem] font-display font-semibold leading-tight text-slate-900">Net Worth</h2>
                  <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <FileText className="h-7 w-7 text-primary" />
                  </div>
                </div>
                <p className="text-lg leading-relaxed text-slate-600">
                  Generate certificates of financial data and asset/liability breakdown.
                </p>
                <Button variant="outline" className={`${ctaButtonClass} hover:bg-primary hover:text-white`}>
                  Create Certificate <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>

          {/* --- TURNOVER MULTI-OPTION CARD --- */}
          <div className="relative h-full" ref={turnoverMenuRef}>
            <div
              onClick={() => {
                setShowTurnoverOptions(!showTurnoverOptions);
                setShowReraOptions(false);
              }}
              className={`${cardBaseClass} cursor-pointer ${
                showTurnoverOptions ? "border-secondary ring-2 ring-secondary/20" : "hover:border-secondary/80"
              }`}
            >
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-secondary to-emerald-400" />

              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-[2rem] font-display font-semibold leading-tight text-slate-900">Turnover</h2>
                  <div className="w-14 h-14 bg-secondary/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <TrendingUp className="h-7 w-7 text-secondary" />
                  </div>
                </div>

                <p className="text-lg leading-relaxed text-slate-600">
                  Start from Excel upload or fill manually, then generate turnover certificate.
                </p>

                <Button variant="outline" className={`${ctaButtonClass} hover:bg-secondary hover:text-white`}>
                  Select Create Method
                  <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showTurnoverOptions ? "rotate-180" : ""}`} />
                </Button>
              </div>
            </div>

            {/* Dropdown Menu */}
            {showTurnoverOptions && (
              <div className="absolute top-full left-0 z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white animate-in fade-in slide-in-from-top-2">
                <Link to="/turnover" data-testid="turnover-card-link" className="group flex items-center justify-between border-b border-slate-100 p-4 hover:bg-emerald-50/70">
                  <div>
                    <p className="font-bold text-slate-800">Upload Excel</p>
                    <p className="text-xs text-muted-foreground">Auto-extract turnover and continue</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-secondary opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </Link>
                <Link to="/turnover/new" data-testid="turnover-manual-link" className="group flex items-center justify-between p-4 hover:bg-emerald-50/70">
                  <div>
                    <p className="font-bold text-slate-800">Fill Manually</p>
                    <p className="text-xs text-muted-foreground">Open form directly without Excel upload</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-secondary opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </Link>
              </div>
            )}
          </div>

          {/* --- UTILISATION CARD --- */}
          <Link to="/utilisation" data-testid="utilisation-card-link">
            <div className={`${cardBaseClass} hover:border-indigo-500/70`}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 to-violet-400" />
              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-[2rem] font-display font-semibold leading-tight text-slate-900">Utilisation</h2>
                  <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <LayoutDashboard className="h-7 w-7 text-indigo-600" />
                  </div>
                </div>
                <p className="text-lg leading-relaxed text-slate-600">
                  Track grants and fund usage with purpose-wise auto-calculations.
                </p>
                <Button variant="outline" className={`${ctaButtonClass} hover:bg-indigo-600 hover:text-white`}>
                  Create Certificate <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>
          {/* --- RBI NBFC CARD --- */}
          <Link to="/rbi-statutory-auditor" data-testid="rbi-nbfc-card-link">
            <div className={`${cardBaseClass} hover:border-amber-500/70`}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-[2rem] font-display font-semibold leading-tight text-slate-900">RBI NBFC</h2>
                  <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <Landmark className="h-7 w-7 text-amber-600" />
                  </div>
                </div>
                <p className="text-lg leading-relaxed text-slate-600">
                  RBI Statutory Auditor Certificate for NBFCs with checklist and annexure notes.
                </p>
                <Button variant="outline" className={`${ctaButtonClass} hover:bg-amber-600 hover:text-white`}>
                  Create Certificate <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>

          {/* --- RBI LIQUID ASSETS CARD --- */}
          <Link to="/rbi-liquid-assets" data-testid="rbi-liquid-assets-card-link">
            <div className={`${cardBaseClass} hover:border-lime-500/70`}>
              <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-lime-500 to-emerald-400" />
              <div className={cardBodyClass}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <h2 className="text-[2rem] font-display font-semibold leading-tight text-slate-900">Liquid Assets</h2>
                  <div className="w-14 h-14 bg-lime-500/10 rounded-2xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                    <Landmark className="h-7 w-7 text-lime-700" />
                  </div>
                </div>
                <p className="text-lg leading-relaxed text-slate-600">
                  Certificate of maintenance of liquid assets under Section 45-IB of RBI Act, 1934.
                </p>
                <Button variant="outline" className={`${ctaButtonClass} hover:bg-lime-600 hover:text-white`}>
                  Create Certificate <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
};

export default Home;
