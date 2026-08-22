import os
import sys
import gc
import re
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


def _split_long_segments(segments: list) -> list:
    """Split long segments into smaller sentence-based subtitle segments with proportional timestamps."""
    processed = []
    for seg in segments:
        text = seg.get("text", "").strip()
        if not text:
            continue
        start = float(seg.get("start", 0))
        end = float(seg.get("end", 0))
        dur = max(0.1, end - start)
        
        # Split by punctuation . ! ? ; \n
        parts = [p.strip() for p in re.split(r'(?<=[.!?;\n])\s+', text) if p.strip()]
        if dur > 6.0 and len(parts) > 1:
            total_len = sum(len(p) for p in parts)
            cur_start = start
            for p in parts:
                p_dur = max(0.8, (len(p) / total_len) * dur)
                p_end = min(end, cur_start + p_dur)
                processed.append({
                    "start": round(cur_start, 3),
                    "end": round(p_end, 3),
                    "text": p,
                })
                cur_start = p_end
        else:
            processed.append({
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
            })
    return processed


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

        _update_task(task_id, progress=5, message="Loading model ASR...")
        model = whisperx.load_model(
            model_name,
            device=device,
            compute_type=compute_type,
            language=language,
        )

        _update_task(task_id, progress=20, message="Loading audio...")
        audio = whisperx.load_audio(audio_path)

        _update_task(task_id, progress=30, message="Transcribing...")
        result = model.transcribe(audio, batch_size=batch_size)
        raw_segments = result.get("segments", [])
        detected_lang = result.get("language", language) or language

        _update_task(task_id, progress=60, message="Aligning...")
        del model
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        segments = raw_segments
        # Phoneme alignment: skip for Vietnamese due to wav2vec2 CTC blank collapse on vi models
        if detected_lang not in ("vi", "vietnamese") and len(raw_segments) > 0:
            try:
                align_model, align_metadata = whisperx.load_align_model(
                    detected_lang, device
                )
                if align_model is not None:
                    result_aligned = whisperx.align(
                        raw_segments,
                        align_model,
                        align_metadata,
                        audio,
                        device,
                        return_char_alignments=False,
                    )
                    aligned_segs = result_aligned.get("segments", [])
                    # Sanity check: ensure aligned duration is not catastrophically shrunk
                    if aligned_segs and len(aligned_segs) == len(raw_segments):
                        orig_dur = sum(s.get("end", 0) - s.get("start", 0) for s in raw_segments)
                        align_dur = sum(s.get("end", 0) - s.get("start", 0) for s in aligned_segs)
                        if align_dur >= 0.5 * orig_dur:
                            segments = aligned_segs
                    del align_model
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
            except Exception as _align_err:
                print(f"[Transcriber] Alignment skipped/fallback: {_align_err}")

        _update_task(task_id, progress=80, message="Building subtitles...")
        final_segments = _split_long_segments(segments)
        subtitles = []
        for i, seg in enumerate(final_segments):
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

