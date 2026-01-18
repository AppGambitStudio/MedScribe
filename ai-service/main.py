from fastapi import FastAPI, UploadFile, File, HTTPException, Form
import uvicorn
import torch
import librosa
import numpy as np
import io
import os
import tempfile
import traceback
from transformers import pipeline
import time

app = FastAPI()

MODEL_ID = "google/medasr"
MEDGEMMA_MODEL_ID = "google/medgemma-1.5-4b-it" 

# Global variables
asr_pipeline = None
medgemma_model = None
medgemma_processor = None
medgemma_tokenizer = None
medgemma_analyzer = None # Keep for compatibility if needed, but we'll use model/processor directly
device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
print(f"MedScribe AI: Detected device: {device}")

@app.on_event("startup")
async def load_models():
    global asr_pipeline, medgemma_model, medgemma_processor, medgemma_tokenizer
    token = os.environ.get("HF_TOKEN")
    
    # 1. Load MedASR (Existing)
    print(f"Loading MedASR model ({MODEL_ID}) on {device}...")
    
    try:
        # We load the model and processor separately to have better control over decoding
        from transformers import AutoProcessor, AutoModelForCTC
        processor = AutoProcessor.from_pretrained(MODEL_ID, token=token, trust_remote_code=True)
        model = AutoModelForCTC.from_pretrained(MODEL_ID, token=token, trust_remote_code=True).to("cuda" if torch.cuda.is_available() else "cpu")
        
        # Save to a global object or just use a custom class
        class CustomPipeline:
            def __init__(self, model, processor):
                self.model = model
                self.processor = processor
                self.device = model.device
            
            def __call__(self, audio_path):
                import librosa
                speech, _ = librosa.load(audio_path, sr=16000)
                inputs = self.processor(speech, sampling_rate=16000, return_tensors="pt")
                inputs = {k: v.to(self.device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    logits = self.model(**inputs).logits
                
                predicted_ids = torch.argmax(logits, dim=-1)[0]
                
                # Manual CTC decoding:
                # 1. Collapse repeats
                # 2. Remove blank tokens (the ones that decode to <epsilon> or <pad>)
                blank_id = self.processor.tokenizer.pad_token_id
                if blank_id is None:
                    # Often 0 is blank in CTC
                    blank_id = 0
                
                print(f"DEBUG: Blank ID: {blank_id}, Vocabulary Size: {logits.shape[-1]}")
                print(f"DEBUG: Predicted IDs (first 50): {predicted_ids[:50].tolist()}")

                # Collapse repeats
                collapsed = []
                last_id = -1
                for pid in predicted_ids.tolist():
                    if pid != last_id:
                        collapsed.append(pid)
                    last_id = pid
                
                # Filter out blanks
                filtered = [pid for pid in collapsed if pid != blank_id]
                print(f"DEBUG: Filtered IDs: {filtered}")
                
                if not filtered:
                    return {"text": ""}
                
                transcription = self.processor.batch_decode([filtered], skip_special_tokens=True)[0]
                return {"text": transcription}

        asr_pipeline = CustomPipeline(model, processor)
        print("MedScribe AI: MedASR custom pipeline loaded successfully.")
    except Exception as e:
        print(f"CRITICAL: Failed to load MedASR: {e}")
        traceback.print_exc()

    # 2. Load MedGemma 1.5 (Optimized for Hardware)
    try:
        from transformers import BitsAndBytesConfig, AutoProcessor, AutoModelForImageTextToText
        
        # Decide on precision and quantization based on device
        if device == "mps":
            print(f"Loading MedGemma 1.5 ({MEDGEMMA_MODEL_ID}) in Full BFloat16 for M4 Hardware Acceleration...")
            model_kwargs = {
                "torch_dtype": torch.bfloat16,
                "low_cpu_mem_usage": True,
                "device_map": "auto"
            }
        else:
            print(f"Loading MedGemma 1.5 ({MEDGEMMA_MODEL_ID}) in 4-bit NF4 (Standard/Docker fallback)...")
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.bfloat16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True
            )
            model_kwargs = {
                "quantization_config": bnb_config,
                "low_cpu_mem_usage": True,
                "device_map": "auto"
            }

        print(f"Loading processor and model for {MEDGEMMA_MODEL_ID}...")
        medgemma_processor = AutoProcessor.from_pretrained(MEDGEMMA_MODEL_ID, token=token, trust_remote_code=True)
        medgemma_model = AutoModelForImageTextToText.from_pretrained(
            MEDGEMMA_MODEL_ID, 
            token=token,
            trust_remote_code=True,
            **model_kwargs
        )
        medgemma_tokenizer = medgemma_processor.tokenizer
        if medgemma_tokenizer.pad_token_id is None:
            medgemma_tokenizer.pad_token = medgemma_tokenizer.eos_token
        
        print(f"MedScribe AI: Native MedGemma 1.5 components loaded successfully on {device}.")
    except Exception as e:
        print(f"CRITICAL: Failed to load MedGemma: {e}")
        traceback.print_exc()
    except Exception as e:
        print(f"CRITICAL: Failed to load MedGemma: {e}")
        traceback.print_exc()

@app.get("/health")
async def health():
    return {"status": "ok", "asr": asr_pipeline is not None, "medgemma": medgemma_model is not None}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    print(f"Received file: {file.filename}", flush=True)
    
    if asr_pipeline is None:
        raise HTTPException(status_code=503, detail="Model not loaded yet.")

    try:
        # Save uploaded file to a temporary file
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1] or ".tmp") as tmp_file:
            content = await file.read()
            tmp_file.write(content)
            tmp_path = tmp_file.name
        
        try:
            # Let the pipeline handle audio loading and inference
            print(f"DEBUG: Processing audio file {tmp_path} via pipeline...")
            
            # We use return_timestamps=False and just get the raw result
            result = asr_pipeline(tmp_path)
            raw_text = result.get("text", "")
            
            print(f"DEBUG: Raw result from pipeline: '{raw_text[:100]}...'")

            # Manually clean up common CTC special tokens if they appear as literals
            transcription = raw_text.replace("<epsilon>", "").replace("<pad>", "").replace("<s>", "").replace("</s>", "").strip()
            
            # If still empty or looks like garbage, try a more surgical approach
            if not transcription or transcription.startswith("<"):
                print("DEBUG: Result looks like special tokens, attempting manual decode...")
                # Pipeline can return tokens if configured, but let's try to get them manually
                # if the output is just a string of tokens.
                # If 'raw_text' contains many repeats, it's a CTC artifact.
                import re
                transcription = re.sub(r'<[^>]+>', '', raw_text).strip()

            print(f"DEBUG: Final Transcription result: '{transcription}'")
            return {"transcript": transcription}

        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        print(f"Error during transcription: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze-clinical")
async def analyze_clinical(
    transcript: str = Form(""), 
    notes: str = Form(""), 
    files: list[UploadFile] = File([])
):
    print(f"[DEBUG] /analyze-clinical hit! transcript_len={len(transcript)}, notes_len={len(notes)}, files={len(files)}", flush=True)
    
    if medgemma_model is None or medgemma_processor is None:
        raise HTTPException(status_code=503, detail="MedGemma model not loaded.")
    
    from PIL import Image
    import pydicom
    
    clinical_images = []
    
    print(f"[DEBUG] Starting file processing loop for {len(files)} files...", flush=True)
    for file in files:
        content = await file.read()
        filename = file.filename.lower()
        print(f"[DEBUG] Processing file: {filename}", flush=True)
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
            
        try:
            if filename.endswith(('.dcm', '.dicom')):
                print(f"[DEBUG] Reading DICOM: {filename}", flush=True)
                ds = pydicom.dcmread(tmp_path)
                pixel_array = ds.pixel_array
                pixel_array = pixel_array.astype(float)
                pixel_array = (np.maximum(pixel_array, 0) / pixel_array.max()) * 255.0
                img = Image.fromarray(np.uint8(pixel_array))
                clinical_images.append(img)
            else:
                print(f"[DEBUG] Opening image: {filename}", flush=True)
                img = Image.open(io.BytesIO(content))
                clinical_images.append(img.convert("RGB"))
        except Exception as e:
            print(f"Error processing {filename}: {e}", flush=True)
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    
    print(f"[DEBUG] File processing complete. images_found={len(clinical_images)}", flush=True)

    # Construct a very concise prompt to minimize pre-fill time on CPU
    prompt_text = (
        f"Notes: {notes}\n"
        f"Transcript: {transcript}\n\n"
        "Clinical Analysis JSON (differential, plan, visualFindings):"
    )
    
    # Prepare messages for pipeline
    content = []
    for img in clinical_images:
        content.append({"type": "image", "image": img})
    content.append({"type": "text", "text": prompt_text})
    
    messages = [{"role": "user", "content": content}]
    print(f"[DEBUG] Prompt prepared. Input length approximately {len(prompt_text)} chars.", flush=True)
    
    try:
        print(f"[AI] Preparing inputs for MedGemma inference...", flush=True)
        
        # Use processor to prepare inputs following official example
        inputs = medgemma_processor.apply_chat_template(
            messages, 
            add_generation_prompt=True, 
            tokenize=True,
            return_dict=True, 
            return_tensors="pt"
        ).to(medgemma_model.device)
        
        print(f"[AI] Starting MedGemma generation loop...", flush=True)
        from transformers import TextStreamer
        streamer = TextStreamer(medgemma_tokenizer, skip_prompt=True)
        
        start_time = time.time()
        
        # Using inference_mode as recommended in official documentation
        with torch.inference_mode():
            output_ids = medgemma_model.generate(
                **inputs,
                max_new_tokens=512,
                do_sample=False,
                streamer=streamer,
                pad_token_id=medgemma_tokenizer.pad_token_id if medgemma_tokenizer.pad_token_id else medgemma_tokenizer.eos_token_id
            )
        
        elapsed = time.time() - start_time
        
        # Decode only the generated part
        input_len = inputs["input_ids"].shape[-1]
        generated_ids = output_ids[0][input_len:]
        generated_text = medgemma_tokenizer.decode(generated_ids, skip_special_tokens=True)
        
        print(f"\n[AI] Inference completed in {elapsed:.2f}s", flush=True)
        return {"response": generated_text}
    except Exception as e:
        print(f"[AI] Inference failed: {e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/convert-medical-image")
async def convert_medical_image(file: UploadFile = File(...)):
    """
    Converts DICOM or other medical formats to a standard PNG base64 for vision models.
    """
    import pydicom
    from PIL import Image
    import base64
    
    filename = file.filename.lower()
    content = await file.read()
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if filename.endswith(('.dcm', '.dicom')):
            ds = pydicom.dcmread(tmp_path)
            # Basic conversion of pixel data to image
            pixel_array = ds.pixel_array
            
            # Normalize to 0-255
            pixel_array = pixel_array.astype(float)
            pixel_array = (np.maximum(pixel_array, 0) / pixel_array.max()) * 255.0
            pixel_array = np.uint8(pixel_array)
            
            img = Image.fromarray(pixel_array)
            
            # Save to buffer
            buffered = io.BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            
            return {"base64": img_str, "format": "png"}
        
        else:
            # Fallback/Identity for standard images
            img_str = base64.b64encode(content).decode()
            return {"base64": img_str, "format": "original"}

    except Exception as e:
        print(f"Error converting image: {e}")
        raise HTTPException(status_code=500, detail=f"Conversion failed: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
