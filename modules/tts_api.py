import os
import sys
import io
import argparse
import numpy as np

modules_dir = os.path.dirname(os.path.abspath(__file__))
if modules_dir not in sys.path:
    sys.path.insert(0, modules_dir)

from sparktts_infer import SparkTTSEngine

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import soundfile as sf

REF_AUDIO = os.path.join(modules_dir, "..", "audio_speaker.mp3")

app = FastAPI(title="SparkTTS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine: SparkTTSEngine = None


class TTSRequest(BaseModel):
    text: str


@app.on_event("startup")
async def startup():
    global engine
    if not os.path.isfile(REF_AUDIO):
        raise RuntimeError(f"Reference audio not found: {REF_AUDIO}")
    print(f"[TTS] Loading model with ref audio: {REF_AUDIO}")
    engine = SparkTTSEngine(
        base_model=os.path.join(modules_dir, "Spark-TTS-0.5B"),
        lora_path=r"F:\WebEdit\video-editor\modules\spark_tts_lora",
        ref_audio=REF_AUDIO,
    )
    print("[TTS] Model loaded.")


@app.on_event("shutdown")
async def shutdown():
    global engine
    if engine is not None:
        del engine
        engine = None
        import gc
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
        print("[TTS] Model unloaded.")


@app.post("/tts")
async def synthesize(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(400, "text is empty")
    if engine is None:
        raise HTTPException(503, "Model not loaded")
    try:
        wav: np.ndarray = engine.synthesize(req.text)
        if wav.size == 0:
            raise HTTPException(500, "TTS returned empty audio")
        sr = engine.audio_tokenizer.config.get("sample_rate", 16000)
        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="wav")
        buf.seek(0)
        return Response(content=buf.read(), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(500, str(e))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SparkTTS API server")
    parser.add_argument("--port", type=int, default=8001, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)
