import os
import uuid
import json
import shutil
from pathlib import Path
from datetime import timedelta
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Header, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

UPLOAD_DIR = Path("uploads")
OUTPUT_DIR = Path("output")
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Video Editor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# File-based database persistence
DB_FILE = Path("projects.json")

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
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving database: {e}")

# Load video database from file
videos_db = load_db()


class SubtitleItem(BaseModel):
    id: str
    start: float
    end: float
    text: str
    voice: str = "vi"


class SubtitlesPayload(BaseModel):
    subtitles: List[SubtitleItem]
    voice_enabled: bool = True
    voice_lang: str = "vi"


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


@app.get("/api/videos")
def list_videos():
    return list(videos_db.values())


@app.get("/api/video/{video_id}")
def get_video(video_id: str):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    return video


@app.post("/api/video/{video_id}/subtitles")
def save_subtitles(video_id: str, payload: SubtitlesPayload):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
    video["subtitles"] = [s.model_dump() for s in payload.subtitles]
    video["voice_enabled"] = payload.voice_enabled
    video["voice_lang"] = payload.voice_lang
    save_db(videos_db)
    return {"status": "ok", "count": len(payload.subtitles)}


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
            progress_callback=progress_callback
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
        _generate_voice_only(subtitles, output_path, lang=voice_lang, video_duration=duration)
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
def download_file(filename: str, request: Request, range: Optional[str] = Header(None)):
    filepath = OUTPUT_DIR / filename
    if not filepath.exists():
        filepath = UPLOAD_DIR / filename
    if not filepath.exists():
        raise HTTPException(404, "File not found")

    file_size = filepath.stat().st_size
    
    # Range requests are essential for video streaming (seeking and loading in Chrome/Safari)
    if range and filename.lower().endswith((".mp4", ".webm", ".avi", ".mov", ".mkv", ".mp3", ".wav")):
        range_str = range.replace("bytes=", "")
        try:
            start_str, end_str = range_str.split("-")
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
        except ValueError:
            raise HTTPException(416, "Requested range not satisfiable")

        if start > end or start >= file_size:
            raise HTTPException(416, "Requested range not satisfiable")

        end = min(end, file_size - 1)
        chunk_size = 1024 * 1024  # 1MB chunks

        def file_generator():
            with open(filepath, "rb") as f:
                f.seek(start)
                pos = start
                while pos <= end:
                    read_len = min(chunk_size, end - pos + 1)
                    data = f.read(read_len)
                    if not data:
                        break
                    pos += len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(end - start + 1),
            "Content-Type": "video/mp4" if filename.lower().endswith(".mp4") else "application/octet-stream",
        }
        return StreamingResponse(file_generator(), status_code=206, headers=headers)

    return FileResponse(str(filepath), filename=filename)


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
    return {"status": "deleted"}


def _generate_voice_only(subtitles: list, output_path: str, lang: str = "vi", video_duration: float = 60.0):
    from gtts import gTTS
    from pydub import AudioSegment

    if not subtitles:
        raise Exception("No subtitles to generate voice")

    # Set up base silence segment based on video duration (+5s safety padding)
    total_duration_ms = int((video_duration or 60.0) * 1000) + 5000
    final = AudioSegment.silent(duration=total_duration_ms)

    for i, sub in enumerate(subtitles):
        text = sub["text"].strip()
        if not text:
            continue

        tts = gTTS(text=text, lang=lang, slow=False)
        audio_file = f"__temp_audio_{i}.mp3"
        tts.save(audio_file)

        seg = AudioSegment.from_mp3(audio_file)
        os.remove(audio_file)

        # Insert voice exactly at the start point of the text block
        start_ms = int(sub["start"] * 1000)
        final = final.overlay(seg, position=start_ms)

    # Export final mixed audio
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
    progress_callback = None
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
    _generate_voice_only(subtitles, temp_voice_path, lang=voice_lang, video_duration=video_duration)
    
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
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    cmd = [
        ffmpeg_bin, "-y",
        "-i", video_path,
        "-i", temp_final_audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
        "-shortest",
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


# Mount frontend files after all API endpoints
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
