"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { Mic, Square, Loader2, PlayCircle, Heading, FileAudio, X, FileText, ImageIcon, Activity } from "lucide-react";

interface ClinicalFile {
  id: string;
  file: File;
  type: 'vitals' | 'labs' | 'imaging';
}

export default function CapturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [clinicalFiles, setClinicalFiles] = useState<ClinicalFile[]>([]);
  const [existingFilePaths, setExistingFilePaths] = useState<string[]>([]);
  const [existingAudioPath, setExistingAudioPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Manual Text Inputs for Clinical Data
  const [vitalsText, setVitalsText] = useState("");
  const [labsText, setLabsText] = useState("");
  const [imagingText, setImagingText] = useState("");

  useEffect(() => {
    if (editId) {
      const fetchEncounter = async () => {
        setIsLoading(true);
        try {
          const res = await api.get(`/encounters/${editId}`);
          setTitle(res.data.title || "");
          setNotes(res.data.textNotes || "");
          setExistingFilePaths(res.data.clinicalFilePaths || []);
          setExistingAudioPath(res.data.audioPath || null);
          // Note: We can't easily re-populate File objects for security reasons,
          // but we could show existing paths if needed. For now, focus on text.
        } catch (error) {
          toast.error("Failed to load existing encounter data");
        } finally {
          setIsLoading(false);
        }
      };
      fetchEncounter();
    }
  }, [editId]);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const triggerFileInput = (id: string) => {
    document.getElementById(id)?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'vitals' | 'labs' | 'imaging') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (type === 'audio') {
        setAudioFile(file);
        toast.success(`Audio uploaded: ${file.name}`);
      } else {
        const newFile: ClinicalFile = {
          id: Math.random().toString(36).substr(2, 9),
          file,
          type
        };
        setClinicalFiles(prev => [...prev, newFile]);
        toast.success(`${type} attachment added`);
      }
      // Reset input
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setClinicalFiles(prev => prev.filter(f => f.id !== id));
    toast.success("Attachment removed");
  };

  const handleTranscribe = async () => {
    if (!audioFile) return;
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      const res = await api.post("/encounters/transcribe", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setNotes(prev => prev ? prev + "\n" + res.data.transcript : res.data.transcript);
      toast.success("Transcription complete");
    } catch (error) {
      console.error(error);
      toast.error("Transcription failed");
    } finally {
      setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const file = new File([blob], `recording_${Date.now()}.webm`, { type: 'audio/webm' });
        setAudioFile(file);
        toast.success("Recording saved");
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast.error("Could not access microphone");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const toggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("title", title);

      // Format clinical text data into notes
      let finalNotes = notes;
      const clinicalTextParts = [];
      if (vitalsText.trim()) clinicalTextParts.push(`Vital:\n${vitalsText.trim()}`);
      if (labsText.trim()) clinicalTextParts.push(`Labs: ${labsText.trim()}`);
      if (imagingText.trim()) clinicalTextParts.push(`Imaging: ${imagingText.trim()}`);

      if (clinicalTextParts.length > 0) {
        finalNotes = (finalNotes ? finalNotes + "\n\n" : "") + clinicalTextParts.join("\n\n");
      }

      formData.append("textNotes", finalNotes);
      if (audioFile) {
        formData.append("audio", audioFile);
      }
      clinicalFiles.forEach((cf) => {
        formData.append(`clinical_files`, cf.file); // Match backend field name
      });
      // Pass existing paths to merge in backend
      formData.append("existingFilePaths", JSON.stringify(existingFilePaths));
      if (existingAudioPath) {
        formData.append("existingAudioPath", existingAudioPath);
      }

      let res;
      if (editId) {
        // If editing, we might want a PUT, but for now we follow the user's flow
        // and just create/update. Let's assume the user wants to update the existing one
        // or create a new version. The current API only handles POST for new.
        // For simplicity in MVP, we create a new one or we'd need a PATCH /api/encounters/:id
        res = await api.post("/encounters", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        res = await api.post("/encounters", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      toast.success("Encounter saved successfully");
      router.push(`/encounter/${res.data.id}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save encounter");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-2">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
            <FileAudio size={24} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Step 1: Clinical Data</h1>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Powered By</span>
          <span className="text-xs font-semibold text-indigo-600">Google MedGemma 1.5 & MedASR</span>
        </div>
      </div>

      <div className="space-y-6">
        {/* Patient Encounter Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
            <Mic size={20} />
            Patient Encounter
          </h2>

          <div className="bg-white rounded-xl border p-6 space-y-6 shadow-sm">
            {/* Record / Upload Controls */}
            <div className="flex items-center gap-4">
              <Button
                type="button"
                onClick={toggleRecording}
                className={`${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700'} text-white gap-2 rounded-full px-6 transition-all`}
              >
                {isRecording ? (
                  <>
                    <Square size={16} fill="white" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <Mic size={16} />
                    Record
                  </>
                )}
              </Button>
              <div className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-md font-mono text-sm font-medium">
                {formatTime(recordingTime)}
              </div>

              {audioFile && (
                <Button
                  variant="secondary"
                  onClick={handleTranscribe}
                  disabled={isTranscribing}
                  className="gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-indigo-200"
                >
                  {isTranscribing ? (
                    <><Loader2 className="animate-spin h-4 w-4" /> Transcribing...</>
                  ) : (
                    <><PlayCircle size={16} /> Transcribe Audio</>
                  )}
                </Button>
              )}
            </div>

            {/* Dropzone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center relative hover:bg-slate-100 transition-colors cursor-pointer ${audioFile ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-slate-50'}`}
              onClick={() => triggerFileInput('audio')}
            >
              <Input
                id="audio"
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileChange(e, 'audio')}
                className="hidden"
              />
              <div className="text-slate-500 font-medium flex flex-col items-center gap-2 text-center">
                {audioFile || existingAudioPath ? (
                  <>
                    <span className="text-green-600 font-bold flex items-center gap-2 bg-green-100 px-3 py-1 rounded-full text-xs">
                      ✓ {audioFile ? audioFile.name : existingAudioPath?.split('/').pop()}
                    </span>
                    <span className="text-[10px] text-green-500 uppercase tracking-wider">Ready to Transcribe or Submit</span>
                    {existingAudioPath && !audioFile && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); setExistingAudioPath(null); }}
                        className="text-red-500 hover:bg-red-50 h-6 px-2 text-[10px] mt-1"
                      >
                        Remove Persisted Audio
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <FileAudio className="text-slate-300" size={32} />
                    <span>Upload or Record Encounter Audio</span>
                  </>
                )}
              </div>
            </div>

            {/* Patient / Title Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Patient Name / ID</label>
              <Input
                placeholder="e.g. John Doe"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-slate-50"
              />
            </div>

            {/* Transcript / Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Transcript / Notes</label>
              <Textarea
                placeholder="Conversation transcript will appear here..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="min-h-[150px] bg-slate-50 font-sans"
              />
            </div>
          </div>
        </section>

        {/* Clinical Data Section */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
            <Heading size={20} />
            Clinical Data
          </h2>

          <div className="grid grid-cols-3 gap-4">
            {/* Vitals */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col items-center gap-3 group hover:border-indigo-200 transition-colors">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <Activity size={16} className="text-indigo-500" /> Vitals
              </span>
              <Input id="vitals" type="file" className="hidden" onChange={(e) => handleFileChange(e, 'vitals')} />
              <Button
                variant="outline"
                className="w-full border-dashed text-slate-500 hover:text-slate-700 hover:bg-slate-50 group-hover:bg-slate-50"
                onClick={() => triggerFileInput('vitals')}
              >
                📷 Photo
              </Button>
              <Textarea
                placeholder="BP: 120/80..."
                value={vitalsText}
                onChange={(e) => setVitalsText(e.target.value)}
                className="text-xs min-h-[60px] bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-indigo-200"
              />
            </div>
            {/* Labs */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3 group hover:border-indigo-200 transition-colors">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <FileText size={16} className="text-emerald-500" /> Labs
              </span>
              <Input id="labs" type="file" className="hidden" onChange={(e) => handleFileChange(e, 'labs')} />
              <Button
                variant="outline"
                className="w-full border-dashed text-slate-500 hover:text-slate-700 hover:bg-slate-50 group-hover:bg-slate-50"
                onClick={() => triggerFileInput('labs')}
              >
                📄 PDF/Photo
              </Button>
              <Textarea
                placeholder="WBC: normal..."
                value={labsText}
                onChange={(e) => setLabsText(e.target.value)}
                className="text-xs min-h-[60px] bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-indigo-200"
              />
            </div>
            {/* Imaging */}
            <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-col gap-3 group hover:border-indigo-200 transition-colors">
              <span className="font-semibold text-slate-700 flex items-center gap-2">
                <ImageIcon size={16} className="text-amber-500" /> Imaging
              </span>
              <Input id="imaging" type="file" className="hidden" onChange={(e) => handleFileChange(e, 'imaging')} />
              <Button
                variant="outline"
                className="w-full border-dashed text-slate-500 hover:text-slate-700 hover:bg-slate-50 group-hover:bg-slate-50"
                onClick={() => triggerFileInput('imaging')}
              >
                🌄 Upload
              </Button>
              <Textarea
                placeholder="CXR: Clear..."
                value={imagingText}
                onChange={(e) => setImagingText(e.target.value)}
                className="text-xs min-h-[60px] bg-slate-50 border-none focus-visible:ring-1 focus-visible:ring-indigo-200"
              />
            </div>
          </div>

          {/* Uploaded Files List */}
          {clinicalFiles.length > 0 && (
            <div className="bg-slate-50 rounded-xl border p-4 space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Attached Clinical Data ({clinicalFiles.length})</div>
              <div className="grid grid-cols-1 gap-2">
                {clinicalFiles.map((cf) => (
                  <div key={cf.id} className="bg-white border rounded-lg p-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className={`p-2 rounded-md ${cf.type === 'vitals' ? 'bg-indigo-50 text-indigo-600' :
                        cf.type === 'labs' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                        {cf.type === 'vitals' && <Activity size={14} />}
                        {cf.type === 'labs' && <FileText size={14} />}
                        {cf.type === 'imaging' && <ImageIcon size={14} />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-slate-700 truncate">{cf.file.name}</span>
                        <span className="text-[10px] text-slate-400 capitalize">{cf.type} • {(cf.file.size / 1024).toFixed(0)} KB</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeFile(cf.id)}
                      className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing Files List (from high-level state/persisted) */}
          {existingFilePaths.length > 0 && (
            <div className="bg-slate-50 rounded-xl border p-4 space-y-3">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Previously Attached Data ({existingFilePaths.length})</div>
              <div className="grid grid-cols-1 gap-2">
                {existingFilePaths.map((path, idx) => (
                  <div key={idx} className="bg-white border rounded-lg p-3 flex items-center justify-between group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2 rounded-md bg-slate-100 text-slate-500">
                        {/\.(jpg|jpeg|png|gif|webp|dcm|dicom|nii|nii\.gz)$/i.test(path) ? <ImageIcon size={14} /> : <FileText size={14} />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold text-slate-700 truncate">{path.split('/').pop()}</span>
                        <span className="text-[10px] text-slate-400">Persisted from previous step</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setExistingFilePaths(prev => prev.filter((_, i) => i !== idx))}
                      className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-full"
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Action Button */}
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-12 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg rounded-xl transition-all"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" />
              Running Analysis...
            </>
          ) : (
            <>⚡ Run Clinical Analysis</>
          )}
        </Button>

      </div>
    </div>
  );
}
