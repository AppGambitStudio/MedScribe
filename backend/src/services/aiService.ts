import { Encounter } from '../models/Encounter';
import { Analysis } from '../models/Analysis';
import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

const getLlmUrl = () => process.env.AI_LLM_URL || "http://localhost:11434/api/generate";
const getLlmModel = () => process.env.AI_LLM_MODEL || "MedAIBase/MedGemma1.5:4b";
const getAsrUrl = () => process.env.AI_ASR_URL || "http://localhost:8000/transcribe";

export const aiService = {
    async transcribe(audioPath: string): Promise<string> {
        // ... existing transcribe code
        const asrUrl = getAsrUrl();
        console.log(`[AI] Transcribing audio at ${audioPath} using service at ${asrUrl}...`);
        try {
            const formData = new FormData();
            formData.append('file', fs.createReadStream(audioPath));

            const response = await axios.post(asrUrl, formData, {
                headers: { ...formData.getHeaders() },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });

            const transcript = response.data.transcript;
            console.log(`[MedScribe AI] Transcription complete: "${transcript.substring(0, 50)}..."`);
            return transcript;
        } catch (error) {
            console.error("[AI] Transcription failed:", error);
            return "Error: Could not connect to ASR service.";
        }
    },

    async describeImage(imagePath: string): Promise<string> {
        console.log(`[AI] Describing clinical image at ${imagePath} via Llava...`);
        try {
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');

            // Using Llava for Vision tasks (Standard Ollama multimodal approach)
            const response = await axios.post(getLlmUrl(), {
                model: "llava:7b",
                prompt: "You are a clinical assistant. Describe this medical image (vitals monitor, lab report, or imaging) in detail. Focus on names, values, and findings. Be concise but medical-grade.",
                images: [base64Image],
                stream: false
            });

            return response.data.response.trim();
        } catch (error: any) {
            console.error("[AI] Image description failed:", error.message);
            return "Error: Could not analyze clinical image.";
        }
    },

    async initiateAnalysis(transcript: string, notes?: string, clinicalFilePaths: string[] = []): Promise<string> {
        console.log(`[AI] Initiating analysis task via Native MedGemma 1.5 Python Service...`);
        try {
            const formData = new FormData();
            formData.append('transcript', transcript);
            formData.append('notes', notes || "");
            for (const path of clinicalFilePaths) {
                if (fs.existsSync(path)) {
                    formData.append('files', fs.createReadStream(path));
                }
            }
            const response = await axios.post("http://localhost:8000/analyze-clinical", formData, {
                headers: { ...formData.getHeaders() },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
            return response.data.task_id;
        } catch (error: any) {
            console.error("[AI] Failed to initiate analysis:", error.message);
            throw error;
        }
    },

    async checkTaskStatus(taskId: string): Promise<any> {
        try {
            const response = await axios.get(`http://localhost:8000/status/${taskId}`);
            return response.data;
        } catch (error: any) {
            console.error(`[AI] Failed to check status for task ${taskId}:`, error.message);
            throw error;
        }
    },

    async analyzeEncounter(encounterId: string, transcript: string, notes?: string, clinicalFilePaths: string[] = []): Promise<any> {
        // This is now a "wrapper" that handles the polling internally if we still want a single-await call,
        // but for the route background thread, we'll call initiate/poll directly.
        // Keeping this for compatibility but we'll use the two-step process in the route.
        const taskId = await this.initiateAnalysis(transcript, notes, clinicalFilePaths);

        let completed = false;
        let attempts = 0;
        const maxAttempts = 240; // 240 * 10 seconds = 40 minutes

        while (!completed && attempts < maxAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, 10000)); // Poll every 10s

            const task = await this.checkTaskStatus(taskId);
            if (task.status === 'completed') {
                let aiResponse = task.result.response;

                // Final Safeguard: Strip any remaining reasoning tokens or thought blocks
                // We find the first clinical header (# or S:) and strip everything before it if it contains "thought"
                if (aiResponse.toLowerCase().includes("thought")) {
                    const match = aiResponse.match(/(^#+\s+|\n#+\s+|^[A-Z]:\s+|\n[A-Z]:\s+)/);
                    if (match) {
                        aiResponse = aiResponse.substring(match.index!).trim();
                    }
                }

                // For Markdown reports, we store the raw output
                return {
                    clinicalReport: aiResponse,
                    differential: [], // Legacy fields
                    plan: { diagnostics: [], therapeutics: [], monitoring: [] },
                    visualFindings: []
                };
            } else if (task.status === 'failed') {
                throw new Error(task.error || "AI generation failed");
            }
            console.log(`[AI] Task ${taskId} still ${task.status} (Attempt ${attempts}/${maxAttempts})...`);
        }
        throw new Error("Analysis timed out in background polling");
    },

    async generateClinicalNote(transcript: string, notes: string, analysis: any, type: string = "SOAP Note"): Promise<string> {
        console.log(`[AI] Generating ${type} via Native MedGemma 1.5 Python Service Task Queue...`);

        try {
            const formData = new FormData();
            formData.append('transcript', transcript);
            formData.append('clinical_data', analysis.clinicalReport || "No report available.");
            formData.append('note_type', type);

            const response = await axios.post("http://localhost:8000/generate-clinical-note", formData, {
                headers: { ...formData.getHeaders() }
            });

            const taskId = response.data.task_id;
            let completed = false;
            let attempts = 0;
            const maxAttempts = 120; // 120 * 5s = 10 minutes (Notes are usually faster)

            while (!completed && attempts < maxAttempts) {
                attempts++;
                await new Promise(r => setTimeout(r, 5000));
                const task = await this.checkTaskStatus(taskId);
                if (task.status === 'completed') {
                    return task.result.response;
                } else if (task.status === 'failed') {
                    throw new Error(task.error || "AI generation failed");
                }
            }
            throw new Error("Note generation timed out");

        } catch (error: any) {
            console.error("[AI] Note generation failed:", error.message);
            return `Error: Failed to generate note. Please try again. (${error.message})`;
        }
    },
};
