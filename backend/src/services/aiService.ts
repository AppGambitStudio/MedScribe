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

    async analyzeEncounter(encounterId: string, transcript: string, notes?: string, clinicalFilePaths: string[] = []): Promise<any> {
        console.log(`[AI] Analyzing clinical encounter via Native MedGemma 1.5 Python Service...`);

        try {
            const formData = new FormData();
            formData.append('transcript', transcript);
            formData.append('notes', notes || "");

            console.log(`[AI] Attaching ${clinicalFilePaths.length} files to FormData...`);
            // Attach all clinical files directly
            for (const path of clinicalFilePaths) {
                if (fs.existsSync(path)) {
                    console.log(`[AI] Appending file: ${path}`);
                    formData.append('files', fs.createReadStream(path));
                }
            }

            console.log(`[AI] Sending request to http://localhost:8000/analyze-clinical...`);
            const response = await axios.post("http://localhost:8000/analyze-clinical", formData, {
                headers: { ...formData.getHeaders() },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 300000, // 5 minute timeout for slow CPUs
            });

            console.log(`[AI] Response status: ${response.status}`);

            const aiResponse = response.data.response;
            console.log(`[AI] Native MedGemma Response received: ${aiResponse.substring(0, 100)}...`);

            // Clean the response if it contains markdown code blocks
            let jsonString = aiResponse.replace(/```json/g, "").replace(/```/g, "").trim();

            const result = JSON.parse(jsonString);
            return {
                ...result,
                visualFindings: [] // Findings are now integrated into the reasoning, no separate interpretation step needed
            };

        } catch (error: any) {
            console.error("[AI] Native Analysis failed:", error.message);
            return {
                differential: [{ condition: "Error: AI Service Unavailable", likelihood: "Low", evidence: ["Check python-service logs"] }],
                plan: { diagnostics: [], therapeutics: [], monitoring: ["Ensure ai-service container is running"] }
            };
        }
    },

    async generateClinicalNote(transcript: string, notes: string, analysis: any, type: string = "SOAP Note"): Promise<string> {
        console.log(`[AI] Generating ${type} via Native MedGemma 1.5 Python Service...`);

        try {
            const formData = new FormData();
            formData.append('transcript', transcript);
            formData.append('notes', `MISSION: Generate a professional ${type} based on the provided clinical data.
            STRUCTURE:
            S (Subjective): Summarize patient's complaints and history.
            O (Objective): Summarize any visual findings or reported signs.
            A (Assessment): Summarize conclusions.
            P (Plan): Summarize the clinical plan.

            DATA:
            Captured Notes: ${notes}
            AI Clinical Analysis: ${JSON.stringify(analysis)}`);

            const response = await axios.post("http://localhost:8000/analyze-clinical", formData, {
                headers: { ...formData.getHeaders() }
            });

            return response.data.response;

        } catch (error: any) {
            console.error("[AI] Note generation failed:", error.message);
            return `Error: Failed to generate note. Please try again. (${error.message})`;
        }
    },
};
