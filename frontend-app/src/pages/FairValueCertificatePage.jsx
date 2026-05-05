import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { getApiErrorMessage } from "../lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ClientSelector from "../components/ClientSelector";
import { ArrowLeft, Trash2, Upload, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import * as pdfjsLib from 'pdfjs-dist';

// Set worker source for pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Local CA Settings
const CA_STORAGE_KEY = "ca_settings_v1";

function getDefaultCASettings() {
    return {
        place: "Patna",
        firm_name: "P. Jyoti & Co.",
        frn: "010237C",
        default_ca_id: "",
        cas: [],
    };
}

function loadCASettingsLocal() {
    try {
        const raw = localStorage.getItem(CA_STORAGE_KEY);
        if (!raw) return getDefaultCASettings();
        const parsed = JSON.parse(raw);
        return { ...getDefaultCASettings(), ...parsed };
    } catch {
        return getDefaultCASettings();
    }
}

function autoFormatDDMMYYYY(value) {
    let v = String(value || "").replace(/\D/g, "");
    if (v.length > 8) v = v.slice(0, 8);
    if (v.length >= 5) return `${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4)}`;
    if (v.length >= 3) return `${v.slice(0, 2)}-${v.slice(2)}`;
    return v;
}

function normalizeDateInput(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
    const dmy = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
    if (dmy) return `${dmy[1]}-${dmy[2]}-${dmy[3]}`;
    return autoFormatDDMMYYYY(s);
}

export default function FairValueCertificatePage() {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(false);
    const [extracting, setExtracting] = useState(false);
    const [step, setStep] = useState(isEdit ? 1 : 0);
    const [caSettings, setCaSettings] = useState(null);
    const [entityType, setEntityType] = useState("PRIVATE_LIMITED");
    
    // Format date like "20th February, 2026"
    const formatDateObj = (date) => {
        const d = date.getDate();
        const suffix = ["th", "st", "nd", "rd"][(d % 10 > 3 ? 0 : (d % 100 - d % 10 !== 10) * d % 10)];
        return `${d}${suffix} ${date.toLocaleString('en-US', { month: 'long' })}, ${date.getFullYear()}`;
    };

    const [form, setForm] = useState({
        company_name: "",
        cin: "",
        registered_address: "",
        as_on_date: formatDateObj(new Date()),
        directors: [],
        purpose: "Bank loan purpose only and shall not be used for any other purpose without our prior written consent.",
        
        caName: "",
        caFirm: "",
        frn: "",
        membershipNo: "",
        udin: "",
        place: "Patna",
        date: new Date().toLocaleDateString("en-IN"),
    });

    useEffect(() => {
        const s = loadCASettingsLocal();
        setCaSettings(s);
        if (!isEdit) {
            setForm(prev => {
                const next = {
                    ...prev,
                    place: prev.place || s.place || "",
                    caFirm: prev.caFirm || s.firm_name || "",
                    frn: prev.frn || s.frn || "",
                };
                if (s.default_ca_id && Array.isArray(s.cas)) {
                    const def = s.cas.find((c) => c.id === s.default_ca_id);
                    if (def) {
                        next.caName = prev.caName || def.ca_name || "";
                        next.membershipNo = prev.membershipNo || def.membership_no || "";
                    }
                }
                return next;
            });
        }
    }, [isEdit]);

    useEffect(() => {
        if (isEdit) {
            setLoading(true);
            api.get(`/api/certificates/${id}`).then(res => {
                const cert = res.data;
                const d = cert.data?.extras || {};
                setForm(prev => ({
                    ...prev,
                    ...cert.identity,
                    ...cert.meta,
                    ...cert.ca,
                    ...d,
                    company_name: cert.identity.company_name,
                    caName: cert.ca.name,
                    caFirm: cert.ca.firm,
                    registered_address: cert.identity.address,
                }));
                setEntityType(cert?.entityType || "PRIVATE_LIMITED");
                setStep(1);
            }).finally(() => setLoading(false));
        }
    }, [isEdit, id]);

    const update = (key, val) => setForm(p => ({ ...p, [key]: val }));

    const applyClient = (client) => {
        setEntityType(client?.entity_type || "PRIVATE_LIMITED");
        setForm((prev) => ({
            ...prev,
            company_name: client?.company_name || client?.display_name || "",
            cin: client?.cin || "",
            registered_address: client?.address || "",
        }));
    };

    const updateDirector = (idx, key, val) => {
        setForm(prev => {
            const next = [...prev.directors];
            next[idx] = {
                ...next[idx],
                [key]: key === "date_of_appointment" ? autoFormatDDMMYYYY(val) : val,
            };
            return { ...prev, directors: next };
        });
    };

    const addDirector = () => {
        setForm(prev => ({
            ...prev,
            directors: [...prev.directors, { name: "", din: "", sr_no: (prev.directors.length + 1).toString(), designation: "Director", date_of_appointment: "" }]
        }));
    };

    const removeDirector = (idx) => {
        setForm(prev => ({
            ...prev,
            directors: prev.directors.filter((_, i) => i !== idx)
        }));
    };

    const handlePdfExtraction = async (file) => {
        setExtracting(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let fullText = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(" ") + "\n";
            }

            const CIN_RE = /CIN\s*[:\s]\s*([A-Z0-9]{21})/i;
            const NAME_RE = /Company Name\s*[:\s]\s*(.*?)(?=\s+ROC Name|$)/i;
            const ADDR_RE = /Registered Address\s*[:\s]\s*(.*?)(?=\s+Address at which|$)/i; 

            const cinMatch = fullText.match(CIN_RE);
            const nameMatch = fullText.match(NAME_RE);
            const addrMatch = fullText.match(ADDR_RE);

            const directors = [];
            const dirPattern = /(\d+)\s+([\d]{8})\s+([A-Z ]+?)\s+(Director|Managing Director|Whole Time Director|CEO|CFO|Nominee Director)\s+(\w+)\s+([\d/]+)/gi;
            let match;
            while ((match = dirPattern.exec(fullText)) !== null) {
                directors.push({
                    sr_no: match[1],
                    din: match[2],
                    name: match[3].trim(),
                    designation: match[4],
                    date_of_appointment: match[6]
                });
            }

            setForm(prev => ({
                ...prev,
                company_name: nameMatch ? nameMatch[1].trim() : prev.company_name,
                cin: cinMatch ? cinMatch[1].trim() : prev.cin,
                registered_address: addrMatch ? addrMatch[1].trim() : prev.registered_address,
                directors: directors.length > 0 ? directors : prev.directors,
            }));

            toast.success("MCA Data extracted locally!");
            setStep(1);
        } catch (err) {
            console.error(err);
            toast.error("Local PDF parsing failed.");
        } finally {
            setExtracting(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) handlePdfExtraction(file);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const directors = (form.directors || [])
            .filter((director) =>
                String(director?.name || director?.din || director?.designation || director?.date_of_appointment || "").trim()
            )
            .map((director) => ({
                ...director,
                date_of_appointment: normalizeDateInput(director?.date_of_appointment),
            }));
        if (!String(form.company_name || "").trim()) return toast.error("Legal Name of Company is required.");
        if (!String(form.cin || "").trim()) return toast.error("CIN / LLPIN is required.");
        if (!String(form.as_on_date || "").trim()) return toast.error("As on Date is required.");
        if (!directors.length) return toast.error("Add at least one director before generating the certificate.");
        if (!String(form.caFirm || "").trim()) return toast.error("Firm Name is required.");
        if (!String(form.frn || "").trim()) return toast.error("FRN is required.");
        if (!String(form.caName || "").trim()) return toast.error("CA Name is required.");
        if (!String(form.membershipNo || "").trim()) return toast.error("Membership Number is required.");

        setLoading(true);

        const payload = {
            category: "LIST_OF_DIRECTORS",
            certificate_type: "list_of_directors",
            entityType,
            identity: {
                company_name: form.company_name,
                cin: form.cin,
                address: form.registered_address,
            },
            meta: {
                purpose: form.purpose,
                place: form.place,
                date: form.date,
            },
            ca: {
                firm: form.caFirm,
                frn: form.frn,
                name: form.caName,
                membership_no: form.membershipNo,
                udin: form.udin,
            },
            data: {
                extras: {
                    ...form,
                    directors,
                }
            }
        };

        try {
            if (isEdit) {
                await api.put(`/api/certificates/${id}`, payload);
                toast.success("Certificate updated!");
            } else {
                await api.post("/api/certificates", payload);
                toast.success("Certificate generated & saved!");
            }
            navigate(`/history`);
        } catch (err) {
            console.error(err);
            toast.error(getApiErrorMessage(err, "Failed to generate or save certificate."));
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading...</div>;

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900">
            <div className="mx-auto max-w-[1600px] px-6 py-8">
                {/* Header */}
                <div className="mb-8 flex items-center justify-between">
                    <div>
                        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="mb-2 -ml-2 text-slate-500 hover:text-slate-900">
                            <ArrowLeft className="h-4 w-4 mr-2" />
                            Back to History
                        </Button>
                        <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900">
                            List of Directors Certification
                        </h1>
                        <p className="text-slate-500 mt-1">
                            {step === 0 ? "1. Extraction Phase" : "2. Certificate Customization & Finalization"}
                        </p>
                    </div>
                </div>

                {step === 0 ? (
                    <div className="max-w-3xl mx-auto mt-20">
                        <div className="bg-white border ring-1 ring-slate-100 rounded-2xl p-12 shadow-xl shadow-slate-200/50 text-center">
                            <div className="mx-auto w-24 h-24 bg-blue-50 rounded-3xl flex items-center justify-center mb-8 rotate-3 transition-transform hover:rotate-0">
                                <FileText className="h-12 w-12 text-blue-600" />
                            </div>
                            <h2 className="text-2xl font-display font-bold mb-3">Upload MCA Master Data</h2>
                            <p className="text-slate-500 mb-10 max-w-sm mx-auto leading-relaxed">
                                Upload your PDF and we'll extract the Company Name, CIN, Address, and Director details locally.
                            </p>
                            
                            <div className="flex flex-col items-center gap-6">
                                <label className="relative group cursor-pointer">
                                    <div className={`
                                        flex items-center gap-3 px-10 py-5 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 transition-all
                                        group-hover:translate-y-[-2px] group-hover:bg-blue-500 active:translate-y-[1px]
                                        ${extracting ? 'opacity-70 cursor-wait' : ''}
                                    `}>
                                        <Upload className="h-5 w-5" />
                                        {extracting ? "Extracting Data..." : "Choose Master Data PDF"}
                                    </div>
                                    <input 
                                        type="file" 
                                        accept=".pdf" 
                                        className="hidden" 
                                        onChange={handleFileUpload}
                                        disabled={extracting}
                                    />
                                </label>
                                
                                <Button variant="ghost" className="text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => setStep(1)}>
                                    Skip to manual entry
                                </Button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-[55%_45%] gap-8 animate-in fade-in zoom-in-95 duration-500">
                        {/* Form Column */}
                        <div className="space-y-6">
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Company Info */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <h2 className="text-xl font-display font-bold">Company Identity</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="col-span-2">
                                            <ClientSelector onSelect={applyClient} />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Legal Name of Company</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.company_name} onChange={e => update("company_name", e.target.value)} required />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CIN / LLPIN Number</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.cin} onChange={e => update("cin", e.target.value)} required />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">As on Date</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.as_on_date} onChange={e => update("as_on_date", e.target.value)} required placeholder="e.g. 20th February, 2026" />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Registered Office Address</Label>
                                            <Textarea className="mt-1.5 bg-slate-50 border-slate-200 focus:bg-white min-h-[80px]" value={form.registered_address} onChange={e => update("registered_address", e.target.value)} />
                                        </div>
                                        <div className="col-span-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Purpose of Certification</Label>
                                            <Textarea 
                                                className="mt-1.5 bg-slate-50 border-slate-200 focus:bg-white min-h-[60px]" 
                                                value={form.purpose} 
                                                onChange={e => update("purpose", e.target.value)} 
                                                placeholder="e.g. Bank loan purpose only..."
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Directors */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                                    <div className="flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                                <Plus className="h-5 w-5" />
                                            </div>
                                            <h2 className="text-xl font-display font-bold">Management (Directors)</h2>
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={addDirector} className="rounded-lg border-slate-200 text-slate-700 bg-white hover:bg-slate-50">
                                            <Plus className="h-4 w-4 mr-2" />
                                            Add Row
                                        </Button>
                                    </div>
                                    <div className="space-y-4">
                                        {form.directors.map((d, i) => (
                                            <div key={i} className="flex gap-4 items-end group animate-in slide-in-from-left-2 duration-300">
                                                <div className="flex-1 grid grid-cols-[3rem_1.5fr_1fr_1fr_1fr] gap-4">
                                                   <Input className="h-10 text-center bg-white border-slate-200" value={d.sr_no} onChange={e => updateDirector(i, "sr_no", e.target.value)} />
                                                   <Input className="h-10 border-slate-200 bg-white" value={d.name} onChange={e => updateDirector(i, "name", e.target.value)} placeholder="Full Name" />
                                                   <Input className="h-10 border-slate-200 bg-white font-mono text-xs" value={d.din} onChange={e => updateDirector(i, "din", e.target.value)} placeholder="DIN/PAN" />
                                                   <Input className="h-10 border-slate-200 bg-white text-xs" value={d.designation} onChange={e => updateDirector(i, "designation", e.target.value)} placeholder="Designation" />
                                                   <Input
                                                       className="h-10 border-slate-200 bg-white"
                                                       value={d.date_of_appointment}
                                                       onChange={e => updateDirector(i, "date_of_appointment", e.target.value)}
                                                       onBlur={e => updateDirector(i, "date_of_appointment", normalizeDateInput(e.target.value))}
                                                       placeholder="DD-MM-YYYY"
                                                   />
                                                </div>
                                                <Button type="button" variant="ghost" size="icon" onClick={() => removeDirector(i)} className="h-10 w-10 text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* CA Details */}
                                <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
                                    <div className="flex items-center gap-3 mb-8">
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <h2 className="text-xl font-display font-bold">CA Details</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="col-span-2">
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CA Name *</Label>
                                            <select
                                                className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:bg-white"
                                                value={form.caName || ""}
                                                onChange={(e) => {
                                                    const name = e.target.value;
                                                    const selected = (caSettings?.cas || []).find((c) => c.ca_name === name);
                                                    setForm(prev => ({
                                                        ...prev,
                                                        caName: selected?.ca_name || "",
                                                        membershipNo: selected?.membership_no || ""
                                                    }));
                                                }}
                                                required
                                            >
                                                <option value="">Select CA</option>
                                                {(caSettings?.cas || []).map((ca) => (
                                                    <option key={ca.id} value={ca.ca_name}>
                                                        {ca.ca_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Membership Number *</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.membershipNo || ""} readOnly />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">UDIN</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.udin} onChange={e => update("udin", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Firm Name *</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.caFirm} onChange={e => update("caFirm", e.target.value)} />
                                        </div>
                                        <div>
                                            <Label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">FRN *</Label>
                                            <Input className="mt-1.5 h-12 bg-slate-50 border-slate-200 focus:bg-white" value={form.frn} onChange={e => update("frn", e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <Button type="button" variant="outline" size="xl" onClick={() => setStep(0)} className="flex-1 h-16 rounded-2xl border-slate-200 hover:bg-slate-100">Back to Upload</Button>
                                    <Button type="submit" size="xl" disabled={loading} className="flex-[2] h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-200 text-white text-lg font-bold">
                                        {loading ? "Generating..." : (isEdit ? "Update Certification" : "Generate Certification")}
                                    </Button>
                                </div>
                            </form>
                        </div>

                        {/* Preview Column (Letterhead Style) */}
                        <div className="hidden lg:block relative">
                            <div className="sticky top-8 space-y-4">
                                <div className="flex items-center justify-between px-3">
                                    <h3 className="font-display font-black text-slate-400 uppercase tracking-[0.2em] text-[9px]">Live Letterhead Preview</h3>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Active Sync</span>
                                    </div>
                                </div>
                                
                                {/* Light Mode Document Preview matches requested screenshot */}
                                <div className="w-[500px] bg-white border border-slate-200 shadow-2xl rounded-sm overflow-auto origin-top p-0 flex flex-col font-serif px-10 py-12">
                                    {/* Document Content */}
                                    <div className="flex-1">
                                        <div className="certificate-subtitle underline uppercase tracking-widest mb-10">
                                            TO WHOM SO EVER IT MAY CONCERN
                                        </div>
                                        
                                        <div className="certificate-body space-y-6">
                                            <p>
                                                This is to certify that the company M/s <span className="font-bold">{form.company_name || "COMPANY NAME"}</span> (CIN- <span className="font-bold">{form.cin || "CIN"}</span>), registered at {form.registered_address || "Registered Address"}.
                                            </p>
                                            <p>
                                                As per the records and information available on the website of the Ministry of Corporate Affairs (MCA) and based on the Annual Filing status of the Company, the <span className="font-bold">List of Director</span> of the Company as on <span className="font-bold">{form.as_on_date}</span> is as under:
                                            </p>
                                        </div>

                                        <div className="mt-6 mb-6">
                                            <table className="certificate-table">
                                                <thead>
                                                    <tr>
                                                        <th className="col-sr">Sr.<br />No</th>
                                                        <th className="text-left">Name of Directors</th>
                                                        <th>DIN</th>
                                                        <th>Designation</th>
                                                        <th>Date of<br />Appointment</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {form.directors.map((d, i) => (
                                                        <tr key={i}>
                                                            <td className="col-sr">{d.sr_no || `${i+1}.`}</td>
                                                            <td className="text-left">{d.name}</td>
                                                            <td>{d.din}</td>
                                                            <td>{d.designation}</td>
                                                            <td>{normalizeDateInput(d.date_of_appointment)}</td>
                                                        </tr>
                                                    ))}
                                                    {form.directors.length === 0 && (
                                                        <tr>
                                                            <td colSpan="5">No directors listed.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="certificate-body mt-6 space-y-5">
                                            <p>
                                                This certificate is issued on the basis of the records and documents produced before us and information available on the MCA portal.
                                            </p>
                                            <p>
                                                This certificate is issued at the specific request of the Company for submission to the {form.purpose || "__________________"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Professional Signature Footer - using global CSS */}
                                    <div className="certificate-signature mt-16 font-bold">
                                        <div className="signature-left">
                                            <div>Date: {form.date}</div>
                                            <div>Place: {form.place}</div>
                                        </div>
                                        <div className="signature-right">
                                            <div>For {form.caFirm || "CA FIRM"}</div>
                                            <div className="mt-0.5 text-xs">(Chartered Accountants)</div>
                                            <div>F. R. No. {form.frn}</div>
                                            
                                            <div className="mt-16">
                                                <div>(CA {form.caName || "Partner Name"})</div>
                                                <div>(Partner)</div>
                                                <div>Membership No: {form.membershipNo}</div>
                                                <div>UDIN: {form.udin || ""}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
