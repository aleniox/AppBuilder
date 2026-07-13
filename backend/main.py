import os
import sys
import time
import uuid
import json
import shutil
import asyncio
from pathlib import Path
from datetime import timedelta
from typing import List, Optional

# Fix Windows asyncio proactor bug: suppress ConnectionResetError in
# _ProactorBasePipeTransport._call_connection_lost when a client disconnects
# abruptly. See https://bugs.python.org/issue46805
if sys.platform == 'win32':
    from asyncio import proactor_events
    _original_call_connection_lost = proactor_events._ProactorBasePipeTransport._call_connection_lost
    def _patched_call_connection_lost(self, exc):
        try:
            _original_call_connection_lost(self, exc)
        except (ConnectionResetError, ConnectionAbortedError):
            pass
    proactor_events._ProactorBasePipeTransport._call_connection_lost = _patched_call_connection_lost

modules_dir = Path(__file__).parent.parent / "modules"
if str(modules_dir) not in sys.path:
    sys.path.insert(0, str(modules_dir))


from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
REF_AUDIO_DIR = Path("ref_audio")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)
REF_AUDIO_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Video Editor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File-based database persistence
import threading
DB_FILE = Path("projects.json")
db_lock = threading.Lock()

def load_db():
    if DB_FILE.exists():
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading database: {e}")
            return {}
    return {}

def save_db(db):
    with db_lock:
        try:
            with open(DB_FILE, "w", encoding="utf-8") as f:
                json.dump(db, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving database: {e}")

# Load video database from file
videos_db = load_db()

# In-memory TTS task progress (no file persistence needed)
tts_tasks: dict[str, dict] = {}
tts_tasks_lock = threading.Lock()


class SubtitleItem(BaseModel):
    id: str
    start: float
    end: float
    text: str
    voice: str = "vi"
    audio_path: Optional[str] = None


class SubtitlesPayload(BaseModel):
    subtitles: List[SubtitleItem]
    voice_enabled: bool = True
    voice_lang: str = "vi"


class TTSSynthesizePayload(BaseModel):
    text: str
    temperature: float = 0.8
    top_k: int = 50
    top_p: float = 1.0
    max_tokens: int = 3000


@app.get("/api/status")
def status():
    return {"status": "ok", "message": "Video Editor API running"}


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    video_id = str(uuid.uuid4())[:8]
    ext = os.path.splitext(file.filename or "video.mp4")[1] or ".mp4"
    filename = f"{video_id}{ext}"
    filepath = UPLOAD_DIR / filename

    with open(filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    try:
        from moviepy.editor import VideoFileClip
        clip = VideoFileClip(str(filepath))
        duration = clip.duration
        clip.close()
    except Exception:
        duration = 0

    videos_db[video_id] = {
        "id": video_id,
        "filename": filename,
        "original_name": file.filename,
        "path": str(filepath),
        "duration": duration,
    }
    save_db(videos_db)

    return {"id": video_id, "filename": filename, "duration": duration}


@app.post("/api/youtube-download")
async def youtube_download(url: str = Form(...)):
    import yt_dlp
    video_id = str(uuid.uuid4())[:8]
    ext = ".mp4"
    filename = f"{video_id}{ext}"
    filepath = UPLOAD_DIR / filename

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        "outtmpl": str(filepath),
        "merge_output_format": "mp4",
        "quiet": True,
        "no_warnings": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "Untitled")
            duration = info.get("duration", 0)
    except Exception as e:
        raise HTTPException(400, f"YouTube download failed: {str(e)}")

    videos_db[video_id] = {
        "id": video_id,
        "filename": filename,
        "original_name": title,
        "path": str(filepath),
        "duration": duration,
        "youtube_url": url,
    }
    save_db(videos_db)

    return {"id": video_id, "filename": filename, "duration": duration, "title": title}


@app.post("/api/video/{video_id}/transcribe")
def transcribe_video(video_id: str, background_tasks: BackgroundTasks):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    video_path = video.get("path")
    if not video_path or not os.path.isfile(video_path):
        raise HTTPException(400, "Video file not found")

    # Extract audio to temp file
    temp_audio = f"__temp_transcribe_{uuid.uuid4().hex[:8]}.wav"
    try:
        from moviepy.editor import VideoFileClip
        clip = VideoFileClip(video_path)
        clip.audio.write_audiofile(temp_audio, logger=None)
        clip.close()
    except Exception as e:
        raise HTTPException(500, f"Failed to extract audio: {str(e)}")

    task_id = uuid.uuid4().hex[:12]

    from transcriber import _TRANSCRIBE_TASKS, _TRANSCRIBE_LOCK, transcribe_video_background
    with _TRANSCRIBE_LOCK:
        _TRANSCRIBE_TASKS[task_id] = {
            "status": "queued",
            "progress": 0,
            "message": "Queued",
            "subtitles": None,
            "language": None,
            "error": None,
            "video_id": video_id,
            "temp_audio": temp_audio,
        }

    background_tasks.add_task(
        transcribe_video_background,
        task_id,
        temp_audio,
        model_name="medium",
        language="en",
    )

    return {"task_id": task_id}


@app.get("/api/video/{video_id}/transcribe-status")
def get_transcribe_status(video_id: str, task_id: str):
    from transcriber import _TRANSCRIBE_TASKS
    task = _TRANSCRIBE_TASKS.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    result = {
        "status": task.get("status", "unknown"),
        "progress": task.get("progress", 0),
        "message": task.get("message", ""),
        "error": task.get("error"),
    }

    if task.get("status") == "completed":
        subtitles = task.get("subtitles", [])
        detected_lang = task.get("language", "en")
        result["subtitles"] = subtitles
        result["language"] = detected_lang

        # Save subtitles to project
        video = videos_db.get(video_id)
        if video:
            video["subtitles"] = subtitles
            save_db(videos_db)

        # Clean up temp audio
        temp_audio = task.get("temp_audio")
        if temp_audio and os.path.isfile(temp_audio):
            try:
                os.remove(temp_audio)
            except Exception:
                pass

        # Clean up task after returning result
        from transcriber import _TRANSCRIBE_LOCK
        with _TRANSCRIBE_LOCK:
            _TRANSCRIBE_TASKS.pop(task_id, None)

    if task.get("status") in ("failed", "unknown"):
        from transcriber import _TRANSCRIBE_LOCK
        with _TRANSCRIBE_LOCK:
            _TRANSCRIBE_TASKS.pop(task_id, None)

    return result


@app.get("/api/videos")
def list_videos():
    return list(videos_db.values())


@app.get("/api/video/{video_id}")
def get_video(video_id: str):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return video


@app.post("/api/video/{video_id}/ref-audio")
async def upload_ref_audio(video_id: str, file: UploadFile = File(...)):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    ext = os.path.splitext(file.filename or "ref.wav")[1] or ".wav"
    ref_filename = f"ref_{video_id}{ext}"
    ref_path = REF_AUDIO_DIR / ref_filename
    with open(ref_path, "wb") as f:
        content = await file.read()
        f.write(content)
    video["ref_audio_path"] = str(ref_path)
    save_db(videos_db)
    # Update reference audio without reloading the model
    _ensure_ref_audio(video_id)
    return {"status": "ok", "ref_audio": ref_filename}


@app.post("/api/video/{video_id}/subtitles")
def save_subtitles(video_id: str, payload: SubtitlesPayload):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    old_subs = {s["id"]: s for s in video.get("subtitles", [])}
    new_subs = []
    for s in payload.subtitles:
        sub = s.model_dump()
        old = old_subs.get(sub["id"])
        if old is not None and old.get("text") == sub["text"]:
            sub["audio_path"] = old.get("audio_path")
        else:
            sub["audio_path"] = None
        new_subs.append(sub)
    video["subtitles"] = new_subs
    video["voice_enabled"] = payload.voice_enabled
    video["voice_lang"] = payload.voice_lang
    save_db(videos_db)
    return {"status": "ok", "count": len(payload.subtitles)}


@app.post("/api/video/{video_id}/subtitle/{sub_index}/synthesize")
def synthesize_subtitle(video_id: str, sub_index: int):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    subs = video.get("subtitles", [])
    if sub_index < 0 or sub_index >= len(subs):
        raise HTTPException(404, "Subtitle not found")
    sub = subs[sub_index]
    text = sub.get("text", "").strip()
    if not text:
        raise HTTPException(400, "Subtitle text is empty")
    engine = _ensure_ref_audio(video_id)
    out_dir = engine.synthesize_to_folder(text, base_dir=str(OUTPUT_DIR))
    full_wav = os.path.join(out_dir, "full.wav")
    if not os.path.isfile(full_wav):
        raise HTTPException(500, "TTS returned empty audio")
    audio_filename = f"sub_audio_{video_id}_{sub['id']}.wav"
    shutil.copy2(full_wav, str(OUTPUT_DIR / audio_filename))
    sub["audio_path"] = audio_filename
    save_db(videos_db)
    return {"status": "ok", "audio_path": audio_filename}


@app.get("/api/video/{video_id}/render-status")
def get_render_status(video_id: str):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return {
        "status": video.get("render_status", "idle"),
        "progress": video.get("render_progress", 0),
        "error": video.get("render_error", None),
        "output": video.get("output", None)
    }


def _background_render_task(video_id: str, video_path: str, subtitles: list, output_path: str, voice_enabled: bool, voice_lang: str):
    try:
        def progress_callback(percent):
            if video_id in videos_db:
                videos_db[video_id]["render_progress"] = min(99, percent)

        _render_video_with_subtitles_and_voice(
            video_path, subtitles, output_path,
            voice_enabled=voice_enabled, voice_lang=voice_lang,
            progress_callback=progress_callback, video_id=video_id,
        )
        if video_id in videos_db:
            videos_db[video_id]["render_status"] = "completed"
            videos_db[video_id]["render_progress"] = 100
            videos_db[video_id]["output"] = Path(output_path).name
            save_db(videos_db)
    except Exception as e:
        print(f"Background render error for {video_id}: {e}")
        if video_id in videos_db:
            videos_db[video_id]["render_status"] = "failed"
            videos_db[video_id]["render_error"] = str(e)
            save_db(videos_db)


def _background_render_voice_task(video_id: str, subtitles: list, output_path: str, voice_lang: str, duration: float):
    try:
        if video_id in videos_db:
            videos_db[video_id]["render_progress"] = 30
        _generate_voice_only(subtitles, output_path, lang=voice_lang, video_duration=duration, video_id=video_id)
        if video_id in videos_db:
            videos_db[video_id]["render_status"] = "completed"
            videos_db[video_id]["render_progress"] = 100
            videos_db[video_id]["output"] = Path(output_path).name
            save_db(videos_db)
    except Exception as e:
        print(f"Background audio render error for {video_id}: {e}")
        if video_id in videos_db:
            videos_db[video_id]["render_status"] = "failed"
            videos_db[video_id]["render_error"] = str(e)
            save_db(videos_db)


@app.post("/api/video/{video_id}/render")
def render_video(video_id: str, background_tasks: BackgroundTasks):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    subtitles = video.get("subtitles", [])
    if not subtitles:
        raise HTTPException(400, "No subtitles to render")

    # Set background state
    video["render_status"] = "rendering"
    video["render_progress"] = 0
    video["render_error"] = None
    save_db(videos_db)

    voice_enabled = video.get("voice_enabled", True)
    voice_lang = video.get("voice_lang", "vi")
    video_path = video["path"]
    output_filename = f"output_{video_id}.mp4"
    output_path = str(OUTPUT_DIR / output_filename)

    background_tasks.add_task(
        _background_render_task,
        video_id, video_path, subtitles, output_path, voice_enabled, voice_lang
    )
    return {"status": "started"}


@app.post("/api/video/{video_id}/render-voice-only")
def render_voice_only(video_id: str, background_tasks: BackgroundTasks):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    subtitles = video.get("subtitles", [])
    if not subtitles:
        raise HTTPException(400, "No subtitles")

    # Set background state
    video["render_status"] = "rendering"
    video["render_progress"] = 0
    video["render_error"] = None
    save_db(videos_db)

    voice_lang = video.get("voice_lang", "vi")
    output_filename = f"audio_{video_id}.mp3"
    output_path = str(OUTPUT_DIR / output_filename)

    background_tasks.add_task(
        _background_render_voice_task,
        video_id, subtitles, output_path, voice_lang, video.get("duration", 60.0)
    )
    return {"status": "started"}


@app.get("/api/download/{filename}")
def download_file(filename: str, request: Request):
    filepath = OUTPUT_DIR / filename
    if not filepath.exists():
        filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")

    stat = filepath.stat()
    file_size = stat.st_size
    mtime = stat.st_mtime
    etag = f'"{int(mtime)}-{file_size}"'

    # ETag / If-None-Match → 304 Not Modified
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('" ') == etag.strip('" '):
        return Response(status_code=304)

    _MIME_MAP = {
        ".mp4": "video/mp4", ".webm": "video/webm", ".avi": "video/x-msvideo",
        ".mov": "video/quicktime", ".mkv": "video/x-matroska",
        ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
        ".m4a": "audio/mp4", ".aac": "audio/aac", ".flac": "audio/flac",
    }
    ext = Path(filename).suffix.lower()
    content_type = _MIME_MAP.get(ext, "application/octet-stream")

    return FileResponse(
        path=str(filepath), 
        filename=filename, 
        media_type=content_type, 
        headers={
            "ETag": etag,
            "Cache-Control": "public, max-age=31536000, immutable",
            "Accept-Ranges": "bytes"
        }
    )


@app.delete("/api/video/{video_id}")
def delete_video(video_id: str):
    video = videos_db.pop(video_id, None)
    if not video:
        raise HTTPException(404, "Video not found")
    save_db(videos_db)
    p = Path(video["path"])
    if p.exists():
        p.unlink()
    out = video.get("output")
    if out:
        op = OUTPUT_DIR / out
        if op.exists():
            op.unlink()
    ref = video.get("ref_audio_path")
    if ref:
        rp = Path(ref)
        if rp.exists():
            rp.unlink()
    return {"status": "deleted"}


_TTS_REF_AUDIO_PATH = None


@app.post("/api/tts/ref-audio")
def tts_upload_ref_audio(file: UploadFile = File(...)):
    global _TTS_REF_AUDIO_PATH
    ext = os.path.splitext(file.filename or "ref.wav")[1] or ".wav"
    ref_filename = f"tts_ref_{uuid.uuid4().hex[:8]}{ext}"
    ref_path = REF_AUDIO_DIR / ref_filename
    content = file.file.read()
    with open(ref_path, "wb") as f:
        f.write(content)
    _TTS_REF_AUDIO_PATH = str(ref_path)
    engine = _ensure_ref_audio()
    engine.load_reference(_TTS_REF_AUDIO_PATH)
    return {"status": "ok", "filename": ref_filename}


@app.post("/api/tts/synthesize")
def tts_synthesize(payload: TTSSynthesizePayload, background_tasks: BackgroundTasks):
    task_id = uuid.uuid4().hex[:12]
    with tts_tasks_lock:
        tts_tasks[task_id] = {
            "status": "processing",
            "progress": 0,
            "error": None,
            "audio_url": None,
        }
    background_tasks.add_task(_background_tts_task, task_id, payload)
    return {"task_id": task_id}


@app.get("/api/tts/synthesize/{task_id}/status")
def tts_status(task_id: str):
    with tts_tasks_lock:
        task = tts_tasks.get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    return task


def _background_tts_task(task_id: str, payload: TTSSynthesizePayload):
    try:
        engine = _ensure_ref_audio()
        
        def progress_callback(pct):
            with tts_tasks_lock:
                if task_id in tts_tasks:
                    tts_tasks[task_id]["progress"] = min(pct, 99)
        
        out_dir = engine.synthesize_to_folder(
            payload.text,
            ref_audio=_TTS_REF_AUDIO_PATH,
            temperature=payload.temperature,
            top_k=payload.top_k,
            top_p=payload.top_p,
            max_tokens=payload.max_tokens,
            base_dir=str(OUTPUT_DIR),
            progress_callback=progress_callback,
        )
        full_wav = os.path.join(out_dir, "full.wav")
        if not os.path.isfile(full_wav):
            raise Exception("TTS returned empty audio")
        audio_filename = f"tts_{uuid.uuid4().hex[:8]}.wav"
        shutil.copy2(full_wav, str(OUTPUT_DIR / audio_filename))
        with tts_tasks_lock:
            if task_id in tts_tasks:
                tts_tasks[task_id]["status"] = "completed"
                tts_tasks[task_id]["progress"] = 100
                tts_tasks[task_id]["audio_url"] = f"/api/download/{audio_filename}"
    except Exception as e:
        print(f"Background TTS error for {task_id}: {e}")
        with tts_tasks_lock:
            if task_id in tts_tasks:
                tts_tasks[task_id]["status"] = "failed"
                tts_tasks[task_id]["error"] = str(e)


_tts_engine = None
_TTS_LORA_PATH = r"F:\WebEdit\video-editor\modules\spark_tts_lora"
_TTS_IDLE_TIMEOUT = 300  # seconds before unloading model from GPU
_tts_last_used = 0.0
_TTS_LOCK = threading.Lock()
_tts_loaded = threading.Event()

def _init_tts_engine():
    global _tts_engine, _tts_last_used
    with _TTS_LOCK:
        if _tts_engine is not None:
            _tts_loaded.set()
            return
        from sparktts_infer import get_engine
        print("[TTS] Pre-loading model (LLM + audio tokenizer)...")
        _tts_engine = get_engine(lora_path=_TTS_LORA_PATH)
        _tts_last_used = time.time()
        _tts_loaded.set()
        print("[TTS] Model loaded.")

def _ensure_ref_audio(video_id: str = None):
    global _tts_engine, _tts_last_used
    _tts_loaded.wait()
    with _TTS_LOCK:
        if _tts_engine is None:
            from sparktts_infer import get_engine
            print("[TTS] Loading model...")
            _tts_engine = get_engine(lora_path=_TTS_LORA_PATH)
            _tts_loaded.set()
        _tts_last_used = time.time()
        engine = _tts_engine
    if video_id:
        video = videos_db.get(video_id, {})
        ref_audio = video.get("ref_audio_path")
        if ref_audio and os.path.isfile(ref_audio):
            engine.load_reference(ref_audio)
    return engine

def _tts_sleep():
    global _tts_engine, _tts_last_used
    with _TTS_LOCK:
        if _tts_engine is None:
            return
        print("[TTS] Unloading model from GPU (idle timeout)...")
        del _tts_engine
        _tts_engine = None
        _tts_last_used = 0.0
        _tts_loaded.clear()
        import gc
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except ImportError:
            pass
        print("[TTS] Model unloaded, VRAM freed.")

def _tts_sleep_monitor():
    global _tts_engine, _tts_last_used
    while True:
        time.sleep(30)
        if _tts_engine is not None and time.time() - _tts_last_used > _TTS_IDLE_TIMEOUT:
            _tts_sleep()


def _generate_voice_only(subtitles: list, output_path: str, lang: str = None, video_duration: float = 60.0, video_id: str = None):
    from pydub import AudioSegment

    if not subtitles:
        raise Exception("No subtitles to generate voice")

    total_duration_ms = int((video_duration or 60.0) * 1000) + 5000
    final = AudioSegment.silent(duration=total_duration_ms)

    engine = _ensure_ref_audio(video_id)

    for i, sub in enumerate(subtitles):
        text = sub["text"].strip()
        if not text:
            continue

        # Use pre-generated audio if available
        audio_fn = sub.get("audio_path")
        if audio_fn:
            audio_full = str(OUTPUT_DIR / audio_fn)
        else:
            audio_full = None
        if audio_full and os.path.isfile(audio_full):
            seg = AudioSegment.from_file(audio_full)
        else:
            out_dir = engine.synthesize_to_folder(text, base_dir=str(OUTPUT_DIR))
            full_wav = os.path.join(out_dir, "full.wav")
            if not os.path.isfile(full_wav):
                continue
            seg = AudioSegment.from_file(full_wav)
            # Save audio for future reuse
            audio_fn = f"sub_audio_{video_id}_{sub['id']}.wav"
            shutil.copy2(full_wav, str(OUTPUT_DIR / audio_fn))
            sub["audio_path"] = audio_fn

        start_ms = int(sub["start"] * 1000)
        final = final.overlay(seg, position=start_ms)

    # Persist updated audio_path info
    if video_id and video_id in videos_db:
        save_db(videos_db)

    final.export(output_path, format="mp3")


def create_pillow_text_clip(text, duration, video_width, video_height, font_size=None, color="white", stroke_color="black", stroke_width=2):
    from PIL import Image, ImageDraw, ImageFont
    import numpy as np
    from moviepy.editor import ImageClip

    # Create RGBA frame matching video resolution
    img = Image.new("RGBA", (video_width, video_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Proportional font size (approx 5% of video height)
    if font_size is None:
        font_size = max(24, int(video_height * 0.05))

    # Load font
    font = None
    for font_name in ["arial.ttf", "calibri.ttf", "segoeui.ttf", "tahoma.ttf"]:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except IOError:
            continue
    if font is None:
        font = ImageFont.load_default()

    # Calculate text size and position (bottom center)
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (video_width - text_width) // 2
    y = video_height - text_height - int(video_height * 0.08)  # Position 8% from bottom

    # Draw text with outline
    draw.text(
        (x, y),
        text,
        font=font,
        fill=color,
        stroke_width=stroke_width,
        stroke_fill=stroke_color
    )

    # Convert to moviepy ImageClip with alpha mask
    img_np = np.array(img)
    rgb_frame = img_np[:, :, :3]
    alpha_mask = img_np[:, :, 3] / 255.0

    clip = ImageClip(rgb_frame).set_duration(duration)
    mask_clip = ImageClip(alpha_mask, ismask=True).set_duration(duration)
    clip = clip.set_mask(mask_clip)

    return clip


def _render_video_with_subtitles_and_voice(
    video_path: str, subtitles: list, output_path: str,
    voice_enabled: bool = True, voice_lang: str = "vi",
    progress_callback = None, video_id: str = None
):
    import subprocess
    import imageio_ffmpeg
    import shutil
    from pydub import AudioSegment
    from moviepy.editor import VideoFileClip

    # If voice is disabled or there are no subtitles, we just copy the original video directly
    if (not voice_enabled) or (not subtitles):
        shutil.copy2(video_path, output_path)
        if progress_callback:
            progress_callback(100)
        return

    if progress_callback:
        progress_callback(10)

    # 1. Get video duration
    video = VideoFileClip(video_path)
    video_duration = video.duration
    video.close()  # Close immediately to release file lock

    if progress_callback:
        progress_callback(25)

    # 2. Extract original audio or initialize silent track
    try:
        original_audio = AudioSegment.from_file(video_path)
    except Exception:
        original_audio = AudioSegment.silent(duration=int(video_duration * 1000))

    if progress_callback:
        progress_callback(40)

    # 3. Generate AI TTS audio mix and overlay onto original audio
    temp_voice_path = f"__temp_voice_mix_{uuid.uuid4().hex[:8]}.mp3"
    _generate_voice_only(subtitles, temp_voice_path, lang=voice_lang, video_duration=video_duration, video_id=video_id)
    
    voice_audio = AudioSegment.from_file(temp_voice_path)
    final_audio = original_audio.overlay(voice_audio, position=0)

    # Clean up temp voice mix file
    try:
        os.remove(temp_voice_path)
    except Exception:
        pass

    if progress_callback:
        progress_callback(65)

    # Export mixed audio
    temp_final_audio_path = f"__temp_final_audio_{uuid.uuid4().hex[:8]}.mp3"
    final_audio.export(temp_final_audio_path, format="mp3")

    if progress_callback:
        progress_callback(80)

    # 4. Merge audio and video using FFmpeg stream copy (no video re-encoding!)
    # Use apad to pad audio to exactly match video duration, avoiding -shortest
    # which cuts video at a non-keyframe and causes frozen frame on playback.
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", video_path,
        "-i", temp_final_audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-af", f"apad=whole_dur={video_duration}",
        "-max_muxing_queue_size", "1024",
        output_path
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    # Clean up temporary final audio
    try:
        os.remove(temp_final_audio_path)
    except Exception:
        pass

    if result.returncode != 0:
        raise Exception(f"FFmpeg audio merger failed: {result.stderr}")

    if progress_callback:
        progress_callback(100)


# ===== Settings & Translation =====
SETTINGS_FILE = Path("settings.json")

def load_settings():
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {"api_url": "http://localhost:8080", "model": ""}

def save_settings(s):
    with db_lock:
        try:
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump(s, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"Error saving settings: {e}")

@app.get("/api/settings")
def get_settings():
    return load_settings()

@app.post("/api/settings")
def update_settings(settings: dict):
    current = load_settings()
    current.update(settings)
    save_settings(current)
    return {"status": "ok"}

class TranslateSubPayload(BaseModel):
    text: str
    source_lang: str = ""
    target_lang: str = "vi"

@app.post("/api/video/{video_id}/translate-sub")
def translate_subtitle(video_id: str, payload: TranslateSubPayload):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    settings = load_settings()
    api_url = settings.get("api_url", "http://localhost:8080")
    model = settings.get("model", "")

    if not api_url:
        raise HTTPException(400, "Chưa cấu hình API URL trong Settings")

    import httpx
    source = payload.source_lang or "auto"
    target = payload.target_lang or "vi"

    prompt = f"Dịch văn bản sau từ '{source}' sang '{target}'. CHỈ trả về kết quả dịch, không giải thích gì thêm.\n\nVăn bản: {payload.text}"

    messages = [{"role": "user", "content": prompt}]
    body = {"messages": messages}
    if model:
        body["model"] = model

    try:
        resp = httpx.post(
            f"{api_url.rstrip('/')}/v1/chat/completions",
            json=body,
            timeout=60
        )
        resp.raise_for_status()
        result = resp.json()
        translated = result["choices"][0]["message"]["content"].strip()
        # Clean up any lingering quotes/formatting
        translated = translated.strip('"\'.,;: ')
        return {"translated": translated}
    except httpx.TimeoutException:
        raise HTTPException(408, "LLM API timeout - vui lòng kiểm tra server")
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"LLM API lỗi HTTP {e.response.status_code}: {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(500, f"Lỗi gọi LLM API: {str(e)}")


# Pre-load TTS model in background so UI loads immediately
@app.on_event("startup")
async def _preload_tts():
    # Start idle monitor right away
    t = threading.Thread(target=_tts_sleep_monitor, daemon=True)
    t.start()
    print(f"[TTS] Idle monitor started (timeout={_TTS_IDLE_TIMEOUT}s)")
    # Load model in background, doesn't block server startup
    thread = threading.Thread(target=_init_tts_engine, daemon=True)
    thread.start()

@app.get("/api/tts/status")
def tts_model_status():
    return {"model_loaded": _tts_engine is not None}

# Mount frontend files after all API endpoints
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
