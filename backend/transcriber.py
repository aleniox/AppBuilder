import os
import sys
import gc
import json
import threading
from pathlib import Path

modules_dir = Path(__file__).parent.parent / "modules"
if str(modules_dir) not in sys.path:
    sys.path.insert(0, str(modules_dir))

import whisperx
import torch
import numpy as np

_TRANSCRIBE_TASKS: dict[str, dict] = {}
_TRANSCRIBE_LOCK = threading.Lock()


def _update_task(task_id: str, **kwargs):
    with _TRANSCRIBE_LOCK:
        if task_id in _TRANSCRIBE_TASKS:
            _TRANSCRIBE_TASKS[task_id].update(kwargs)


def transcribe_video_background(
    task_id: str,
    audio_path: str,
    model_name: str = "medium",
    language: str = "en",
    device: str = "cuda" if torch.cuda.is_available() else "cpu",
    compute_type: str = "float16" if torch.cuda.is_available() else "float32",
    batch_size: int = 8,
):
    try:
        _update_task(task_id, status="processing", progress=0)

        _update_task(task_id, progress=5, message="Loading Whisper model...")
        model = whisperx.load_model(
            model_name,
            device=device,
            compute_type=compute_type,
            language=language,
            batch_size=batch_size,
        )

        _update_task(task_id, progress=20, message="Loading audio...")
        audio = whisperx.load_audio(audio_path)

        _update_task(task_id, progress=30, message="Transcribing...")
        result = model.transcribe(audio, batch_size=batch_size)
        segments = result.get("segments", [])
        detected_lang = result.get("language", language)

        _update_task(task_id, progress=60, message="Aligning...")
        del model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        align_model, align_metadata = whisperx.load_align_model(
            language=detected_lang, device=device
        )
        if align_model is not None and len(segments) > 0:
            result_aligned = whisperx.align(
                segments,
                align_model,
                align_metadata,
                audio,
                device,
                return_char_alignments=False,
            )
            segments = result_aligned.get("segments", [])

        del align_model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        _update_task(task_id, progress=80, message="Building subtitles...")
        subtitles = []
        for i, seg in enumerate(segments):
            text = seg.get("text", "").strip()
            if not text:
                continue
            subtitles.append({
                "id": f"sub_{i + 1}",
                "start": round(seg.get("start", 0), 3),
                "end": round(seg.get("end", 0), 3),
                "text": text,
                "voice": detected_lang,
                "audio_path": None,
            })

        _update_task(
            task_id,
            status="completed",
            progress=100,
            message="Transcription complete",
            subtitles=subtitles,
            language=detected_lang,
        )

    except Exception as e:
        print(f"[Transcriber] Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        _update_task(task_id, status="failed", error=str(e))
