# 🩺 MedScribe: Local Multimodal AI Clinical Assistant

MedScribe is a local-first clinical assistant designed for HIPAA-compliant patient encounter analysis. It leverages the latest Google Gemma 3 family model, MedGemma 1.5 with MedASR, to analyze audio transcripts, clinical notes, and medical imaging (DICOM/X-ray) natively.

[Google Research: Next generation medical image interpretation with MedGemma 1.5 and medical speech to text with MedASR](https://research.google/blog/next-generation-medical-image-interpretation-with-medgemma-15-and-medical-speech-to-text-with-medasr/)

## 🏗️ Architecture

- **Frontend**: Next.js 15, Tailwind CSS, Shadcn UI.
- **Backend**: Node.js, Express, TypeScript, Sequelize (Postgres/SQLite).
- **AI Service**: FastAPI, PyTorch, Transformers, MedGemma 1.5, MedASR.

---

## 🚀 Quick Start (Dockerized)

The fastest way to get everything running is via Docker Compose.

### 1. Prerequisites
- Docker & Docker Compose
- Hugging Face Token (with access to `google/medgemma-1.5-4b-it`)

### 2. Setup Environment
Create a `.env` file in the root:
```bash
HF_TOKEN=your_huggingface_token_here
```

### 3. Launch
```bash
docker-compose up -d --build
```
Access the UI at `http://localhost:3000`.

---

## 🏎️ M4 Hardware Acceleration (macOS)

Running in Docker on Mac is limited to CPU. To unlock the full power of your **M4 Pro/Max GPU (Metal)**, run the AI service natively.

### 1. Initialize Python 3.11+
```bash
brew install python@3.11
cd ai-service
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Run Natively
```bash
export HF_TOKEN="your_token"
python3 main.py
```
The service will auto-detect your M4 GPU (`mps`) and switch to high-speed **Full BFloat16** precision.

---

## 🛠️ Component Breakdown

### **Frontend** (`/frontend`)
- **Capture**: Multimodal upload (audio, notes, DICOM).
- **Review**: Real-time AI reasoning display.
- **Output**: Professional SOAP note generation.

### **Backend** (`/backend`)
- Orchestrates data flow between UI and AI.
- Manages encounter persistence.
- Handles DICOM processing and metadata extraction.

### **AI Service** (`/ai-service`)
- **MedASR**: Specialized CTC decoding for clinical transcription.
- **MedGemma 1.5**: Native multimodal reasoning (Text + Image).
- **TextStreamer**: Real-time token-by-token feedback in console.

---

## 🧪 Development & Testing

### Health Check
Verify AI models are loaded:
`GET http://localhost:8000/health`

### Transcribe Test
`POST http://localhost:8000/transcribe` (multipart/form-data: `file`)

---

## 🔒 Privacy & Security
- **Local-first**: All PHI remains on-device. No data is sent to external cloud APIs (except for initial weight downloading from Hugging Face).
- **Open Weights**: Uses Google's open-weights clinical models.

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
**MedScribe v1.1.0** | Powered by Google MedGemma 1.5 & MedASR
