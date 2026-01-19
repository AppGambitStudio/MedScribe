"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Loader2, Copy, Download, FileText, Trash, Brain, ClipboardCheck, AlertTriangle, ImageIcon, FileIcon } from "lucide-react";

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const resolvedParams = use(params);
    const { id } = resolvedParams;

    const [encounter, setEncounter] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [generatingNote, setGeneratingNote] = useState(false);

    // State for Review Steps
    const [planText, setPlanText] = useState("");
    const [differential, setDifferential] = useState<any[]>([]);
    const [step2Complete, setStep2Complete] = useState(false);

    // Step 3 state
    const [noteType, setNoteType] = useState("SOAP Note");
    const [finalNote, setFinalNote] = useState("");

    const fetchData = async () => {
        try {
            const encRes = await api.get(`/encounters/${id}`);
            setEncounter(encRes.data);

            const analysisRes = await api.get(`/analysis/${id}`);
            if (analysisRes.data) {
                setAnalysis(analysisRes.data);
                if (analysisRes.data.status === 'completed') {
                    setDifferential(analysisRes.data.differential || []);
                    setPlanText(JSON.stringify(analysisRes.data.plan, null, 2));
                    setStep2Complete(true);
                }
            }
        } catch (error) {
            // Handle if analysis doesn't exist yet (404)
            if ((error as any).response?.status !== 404) {
                toast.error("Failed to load data");
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [id]);

    // Polling logic for async analysis
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (analysis?.status === 'processing' || analyzing) {
            interval = setInterval(async () => {
                try {
                    const res = await api.get(`/analysis/${id}`);
                    if (res.data) {
                        setAnalysis(res.data);
                        if (res.data.status === 'completed') {
                            setDifferential(res.data.differential || []);
                            setPlanText(JSON.stringify(res.data.plan, null, 2));
                            setStep2Complete(true);
                            setAnalyzing(false);
                            toast.success("Analysis complete!");
                        } else if (res.data.status === 'failed') {
                            setAnalyzing(false);
                            toast.error("Analysis failed in background");
                        }
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 3000); // Poll every 3 seconds
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [id, analysis?.status, analyzing]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            const res = await api.post(`/analysis/${id}`);
            setAnalysis(res.data);
            if (res.data.status === 'completed') {
                setDifferential(res.data.differential || []);
                setPlanText(JSON.stringify(res.data.plan, null, 2));
                toast.success("Analysis complete");
                setStep2Complete(true);
                setAnalyzing(false);
            } else {
                toast.success("Analysis started in background...");
            }
        } catch (error) {
            toast.error("Failed to start analysis");
            setAnalyzing(false);
        }
    };

    const handleGenerateNote = async () => {
        setGeneratingNote(true);
        try {
            const res = await api.post(`/analysis/generate-note/${id}`, {
                type: noteType
            });
            setFinalNote(res.data.note);
            toast.success(`${noteType} generated via AI`);
        } catch (error) {
            toast.error("Failed to generate AI note");
        } finally {
            setGeneratingNote(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(finalNote);
        toast.success("Copied to clipboard");
    };

    const getFileUrl = (path: string) => {
        const baseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace('/api', '');
        return `${baseUrl}/${path}`;
    };

    if (loading) return <div className="p-8 flex items-center justify-center h-screen text-slate-500">Loading...</div>;
    if (!encounter) return <div className="p-8">Encounter not found</div>;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">

            {/* Page Header */}
            <div className="flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/?edit=${id}`)}
                        className="text-slate-500 hover:text-indigo-600 gap-1"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></svg>
                        Back to Step 1
                    </Button>
                    <div className="h-8 w-[1px] bg-slate-200" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{encounter.title}</h1>
                        <p className="text-sm text-slate-500 flex items-center gap-2">
                            Encounter ID: {id.slice(0, 8)} • {new Date(encounter.createdAt).toLocaleString()}
                            <span className="h-1 w-1 rounded-full bg-slate-300" />
                            <span className="text-indigo-600 font-medium tracking-tight">AI Engine: MedGemma 1.5</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Step 2: AI Clinical Analysis */}
            <section className="space-y-4">
                <div className="flex items-center gap-2">
                    <Brain className="text-pink-600" />
                    <h2 className="text-xl font-bold text-slate-900">Step 2: AI Clinical Analysis</h2>
                </div>

                {/* Warning Alert */}
                <Alert className="bg-yellow-50 border-yellow-200 text-yellow-800">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle className="text-yellow-800 font-semibold">Clinical Decision Support</AlertTitle>
                    <AlertDescription className="text-yellow-700">
                        AI suggestions require physician review. Verify all recommendations before applying to patient care.
                    </AlertDescription>
                </Alert>

                {/* Session Context / Notes */}
                <Card className="border-slate-200 shadow-sm border-l-4 border-l-blue-500">
                    <CardHeader className="bg-slate-50 border-b pb-3">
                        <CardTitle className="text-slate-700 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                            <FileText size={16} className="text-blue-500" />
                            Session Transcript / Notes
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">
                        {encounter.transcript && (
                            <div className="space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">AI Transcript</div>
                                <div className="bg-slate-50 border rounded-lg p-3 max-h-[150px] overflow-y-auto">
                                    <p className="text-slate-600 text-xs leading-relaxed italic">
                                        "{encounter.transcript}"
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Clinical Notes / Context</div>
                            <div className="bg-white border rounded-lg p-4 max-h-[200px] overflow-y-auto">
                                {encounter.textNotes ? (
                                    <p className="text-slate-700 whitespace-pre-wrap text-sm leading-relaxed">
                                        {encounter.textNotes}
                                    </p>
                                ) : (
                                    <p className="text-slate-400 italic text-sm text-center py-4">
                                        No manual notes captured for this session.
                                    </p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Clinical Attachments */}
                {encounter.clinicalFilePaths && encounter.clinicalFilePaths.length > 0 && (
                    <Card className="border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50 border-b pb-3">
                            <CardTitle className="text-slate-700 flex items-center gap-2 text-sm font-bold uppercase tracking-wide">
                                <ImageIcon size={16} className="text-purple-500" />
                                Clinical Attachments ({encounter.clinicalFilePaths.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {encounter.clinicalFilePaths.map((path: string, i: number) => {
                                    const isMedicalImage = /\.(jpg|jpeg|png|gif|webp|dcm|dicom|nii|nii\.gz)$/i.test(path);
                                    return (
                                        <div key={i} className="group relative border rounded-lg overflow-hidden bg-slate-50 hover:border-purple-300 transition-all shadow-sm">
                                            {isMedicalImage ? (
                                                <div className="aspect-square relative overflow-hidden bg-white">
                                                    <img
                                                        src={getFileUrl(path)}
                                                        alt={`Attachment ${i}`}
                                                        className="object-contain w-full h-full transition-transform group-hover:scale-105"
                                                    />
                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                </div>
                                            ) : (
                                                <div className="aspect-square flex flex-col items-center justify-center gap-2">
                                                    <FileIcon size={32} className="text-slate-400" />
                                                    <span className="text-[10px] font-medium text-slate-500 uppercase px-2 text-center">
                                                        {path.split('/').pop()?.slice(-20)}
                                                    </span>
                                                </div>
                                            )}
                                            <a
                                                href={getFileUrl(path)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="absolute bottom-2 right-2 bg-white/90 p-1.5 rounded-full shadow-md text-slate-600 hover:text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Download size={14} />
                                            </a>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                )}

                <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50 border-b pb-4">
                        <CardTitle className="text-indigo-700 text-lg uppercase tracking-wide text-sm font-bold">Differential Diagnosis</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6">
                        {!analysis && !analyzing && (
                            <div className="text-center py-6">
                                <Button onClick={runAnalysis} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
                                    Run AI Analysis
                                </Button>
                            </div>
                        )}
                        {analysis?.status === 'processing' || analyzing ? (
                            <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                <div className="relative">
                                    <Loader2 className="animate-spin h-10 w-10 text-indigo-600" />
                                    <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-pink-500" />
                                </div>
                                <div className="text-center">
                                    <div className="font-bold text-slate-900">AI is analyzing your encounter...</div>
                                    <p className="text-sm text-slate-500">This may take a minute on CPU, but will be near-instant on M4 GPU.</p>
                                </div>
                                <Button variant="outline" size="sm" onClick={fetchData} className="mt-2">
                                    Refresh Manually
                                </Button>
                            </div>
                        ) : analysis?.status === 'failed' ? (
                            <div className="text-center py-6 space-y-4">
                                <Alert variant="destructive" className="max-w-md mx-auto">
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Analysis Failed</AlertTitle>
                                    <AlertDescription>The background AI process encountered an error.</AlertDescription>
                                </Alert>
                                <Button onClick={runAnalysis} variant="outline">Retry Analysis</Button>
                            </div>
                        ) : null}

                        {analysis?.status === 'completed' && (
                            <div className="space-y-6">
                                {differential.map((diff: any, i: number) => (
                                    <div key={i} className="space-y-1">
                                        <div className="font-semibold text-slate-900 text-lg">
                                            {i + 1}. {diff.condition}
                                        </div>
                                        <div className="pl-4 text-slate-700 leading-relaxed">
                                            <span className="font-bold text-slate-900">• Supporting Evidence: </span>
                                            {Array.isArray(diff.evidence) ? diff.evidence.join(", ") : "Evidence not available."}
                                        </div>
                                        <div className="pl-4 text-slate-600">
                                            <span className="font-bold text-slate-900">• Confidence Level: </span>
                                            {diff.likelihood}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Plan Review Section */}
                {analysis && (
                    <div className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
                        <div className="bg-green-100 px-4 py-2 border-b border-green-200 flex items-center gap-2 font-bold text-green-800">
                            <ClipboardCheck className="h-5 w-5" />
                            Review & Edit Plan
                        </div>
                        <div className="p-4">
                            <p className="text-sm text-green-800 mb-2">Edit the assessment and plan below, then approve to generate the final note:</p>
                            <Textarea
                                value={planText}
                                onChange={(e) => setPlanText(e.target.value)}
                                className="bg-white font-mono text-sm min-h-[150px]"
                            />
                        </div>
                    </div>
                )}
            </section>

            {/* Step 3: Final Note */}
            <section className="space-y-4 pt-4 border-t">
                <div className="flex items-center gap-2">
                    <FileText className="text-slate-600" />
                    <h2 className="text-xl font-bold text-slate-900">Step 3: Final Note</h2>
                </div>

                <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">Note Type</label>
                        <Select value={noteType} onValueChange={setNoteType}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="SOAP Note">SOAP Note</SelectItem>
                                <SelectItem value="H&P Note">H&P Note</SelectItem>
                                <SelectItem value="Discharge Summary">Discharge Summary</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        onClick={handleGenerateNote}
                        disabled={!step2Complete || generatingNote}
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-semibold h-12 shadow-md"
                    >
                        {generatingNote ? (
                            <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Generating Professional Note...</>
                        ) : (
                            "Generate AI Clinical Note (Approve Plan First)"
                        )}
                    </Button>

                    <div className="relative">
                        <div className="absolute top-0 left-0 right-0 bg-slate-800 text-slate-400 text-xs px-4 py-1 rounded-t-lg border-b border-slate-700">
                            Output Preview
                        </div>
                        <Textarea
                            readOnly
                            value={finalNote || "Final clinical note will appear here after you:\n1. Run AI clinical analysis\n2. Review and approve the treatment plan\n3. Generate the final note"}
                            className="bg-slate-900 text-green-400 font-mono text-sm min-h-[300px] pt-8 rounded-lg border-slate-700 focus-visible:ring-0"
                        />
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <Button variant="outline" className="gap-2 bg-slate-50 hover:bg-slate-100" onClick={handleCopy}>
                            <Copy className="h-4 w-4" /> Copy
                        </Button>
                        <Button variant="outline" className="gap-2 bg-slate-50 hover:bg-slate-100">
                            <Download className="h-4 w-4" /> Download
                        </Button>
                        <Button variant="outline" className="gap-2 bg-slate-50 hover:bg-slate-100">
                            <FileText className="h-4 w-4" /> Word
                        </Button>
                        <div className="flex-1" />
                        <Button variant="destructive" className="gap-2" onClick={() => setFinalNote("")}>
                            <Trash className="h-4 w-4" /> Clear
                        </Button>
                    </div>
                </div>
            </section>

        </div>
    );
}
