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


merge_tasks = {}

def run_merge_task(task_id, video_id, insert_time, ins_filepath, merged_filepath, merged_id, new_original_name):
    import threading
    import os
    import re
    import subprocess
    import imageio_ffmpeg
    from moviepy.editor import VideoFileClip
    
    merge_tasks[task_id] = {
        "status": "processing",
        "progress": 5,
        "status_text": "Đang phân tích cấu trúc video...",
        "output_id": None,
        "error": None
    }
    
    processed_successfully = False
    
    try:
        video = videos_db.get(video_id)
        if not video:
            raise Exception("Video gốc không tồn tại")
            
        ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        
        # Open original
        orig_clip = VideoFileClip(video["path"])
        w, h = orig_clip.w, orig_clip.h
        fps = orig_clip.fps
        ar = orig_clip.audio.fps if orig_clip.audio else 44100
        duration = orig_clip.duration
        orig_clip.close()
        
        # Open insert clip to get its duration for progress calculation
        ins_clip = VideoFileClip(str(ins_filepath))
        ins_duration = ins_clip.duration
        ins_clip.close()
        
        ins_matched_path = UPLOAD_DIR / f"ins_matched_{task_id}.mp4"
        part1_path = UPLOAD_DIR / f"part1_{task_id}.mp4"
        part2_path = UPLOAD_DIR / f"part2_{task_id}.mp4"
        list_path = UPLOAD_DIR / f"list_{task_id}.txt"
        
        merge_tasks[task_id]["status_text"] = "Đang đồng bộ định dạng clip chèn (0%)..."
        merge_tasks[task_id]["progress"] = 10
        
        # 1. Re-encode insert clip to match original video properties
        reencode_cmd = [
            ffmpeg_bin, "-y",
            "-i", str(ins_filepath),
            "-vf", f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
            "-r", str(fps),
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-ar", str(ar),
            "-ac", "2",
            str(ins_matched_path)
        ]
        
        # Start reencode process and read progress from stderr/stdout
        process = subprocess.Popen(
            reencode_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            encoding="utf-8"
        )
        
        # Parse output for progress (reencoding accounts for 10% to 75% of total progress)
        time_pattern = re.compile(r"time=(\d+):(\d+):(\d+\.\d+)")
        for line in iter(process.stdout.readline, ""):
            match = time_pattern.search(line)
            if match and ins_duration > 0:
                hours, minutes, seconds = match.groups()
                elapsed = int(hours) * 3600 + int(minutes) * 60 + float(seconds)
                ratio = min(1.0, elapsed / ins_duration)
                merge_tasks[task_id]["progress"] = int(10 + ratio * 65)
                merge_tasks[task_id]["status_text"] = f"Đang đồng bộ định dạng clip chèn ({int(ratio * 100)}%)..."
                
        process.wait()
        if process.returncode != 0:
            raise Exception("Lỗi khi đồng bộ định dạng clip chèn")
            
        merge_tasks[task_id]["status_text"] = "Đang cắt nhỏ video gốc..."
        merge_tasks[task_id]["progress"] = 80
        
        # 2. Slice original video into part 1 and part 2 (using stream copy - instant!)
        split1_cmd = [
            ffmpeg_bin, "-y",
            "-i", video["path"],
            "-t", str(insert_time),
            "-c", "copy",
            "-map", "0",
            str(part1_path)
        ]
        split2_cmd = [
            ffmpeg_bin, "-y",
            "-ss", str(insert_time),
            "-i", video["path"],
            "-c", "copy",
            "-map", "0",
            str(part2_path)
        ]
        subprocess.run(split1_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        subprocess.run(split2_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        merge_tasks[task_id]["status_text"] = "Đang ghép nối các phần video..."
        merge_tasks[task_id]["progress"] = 90
        
        # 3. Write files list for concat demuxer
        with open(list_path, "w", encoding="utf-8") as f:
            f.write(f"file '{part1_path.name}'\n")
            f.write(f"file '{ins_matched_path.name}'\n")
            f.write(f"file '{part2_path.name}'\n")
            
        # 4. Concatenate using stream copy
        concat_cmd = [
            ffmpeg_bin, "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", list_path.name,
            "-c", "copy",
            merged_filepath.name
        ]
        subprocess.run(concat_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        # Cleanup temporary slice parts
        for temp_path in [ins_filepath, ins_matched_path, part1_path, part2_path, list_path]:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
                    
        processed_successfully = True
        
    except Exception as ffmpeg_err:
        print(f"Fast FFmpeg concatenate failed, falling back to MoviePy: {ffmpeg_err}")
        # Clean up any temp files that were created
        for temp_path in [UPLOAD_DIR / f"ins_matched_{task_id}.mp4", UPLOAD_DIR / f"part1_{task_id}.mp4", UPLOAD_DIR / f"part2_{task_id}.mp4", UPLOAD_DIR / f"list_{task_id}.txt"]:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass

    # 2. Fallback to MoviePy (slower, but full render safety)
    if not processed_successfully:
        try:
            merge_tasks[task_id]["status_text"] = "Đang ghép video qua MoviePy (chậm hơn)..."
            merge_tasks[task_id]["progress"] = 30
            
            from moviepy.editor import VideoFileClip, concatenate_videoclips
            
            orig_clip = VideoFileClip(video["path"])
            ins_clip = VideoFileClip(str(ins_filepath))
            
            w, h = orig_clip.w, orig_clip.h
            try:
                ins_clip_resized = ins_clip.resize(newsize=(w, h))
            except Exception:
                from moviepy.video.fx.all import resize
                ins_clip_resized = resize(ins_clip, newsize=(w, h))
                
            duration = orig_clip.duration
            ins_duration = ins_clip.duration
            
            if insert_time <= 0:
                final_clip = concatenate_videoclips([ins_clip_resized, orig_clip])
            elif insert_time >= duration:
                final_clip = concatenate_videoclips([orig_clip, ins_clip_resized])
            else:
                part1 = orig_clip.subclip(0, insert_time)
                part2 = orig_clip.subclip(insert_time, duration)
                final_clip = concatenate_videoclips([part1, ins_clip_resized, part2])
                
            final_clip.write_videofile(
                str(merged_filepath),
                codec="libx264",
                audio_codec="aac",
                temp_audiofile=f"__temp_audio_merge_{task_id}.m4a",
                remove_temp=True,
                verbose=False,
                logger=None
            )
            
            # Close files
            orig_clip.close()
            ins_clip.close()
            ins_clip_resized.close()
            final_clip.close()
            
            # Clean up the uploaded insert file
            if ins_filepath.exists():
                ins_filepath.unlink()
                
            processed_successfully = True
        except Exception as moviepy_err:
            if ins_filepath.exists():
                ins_filepath.unlink()
            if merged_filepath.exists():
                merged_filepath.unlink()
            merge_tasks[task_id]["status"] = "failed"
            merge_tasks[task_id]["error"] = f"MoviePy failed: {str(moviepy_err)}"
            merge_tasks[task_id]["status_text"] = f"Lỗi: {str(moviepy_err)}"
            return

    # Update database and complete task
    if processed_successfully:
        try:
            # Update database with the new video info
            merge_tasks[task_id]["status_text"] = "Đang cập nhật cơ sở dữ liệu phụ đề..."
            merge_tasks[task_id]["progress"] = 95
            
            try:
                clip = VideoFileClip(str(merged_filepath))
                new_duration = clip.duration
                clip.close()
            except Exception:
                new_duration = duration + ins_duration
                
            inserted_duration = new_duration - duration
            shifted_subtitles = []
            for sub in video.get("subtitles", []):
                new_sub = sub.copy()
                if sub["start"] >= insert_time:
                    new_sub["start"] = round(sub["start"] + inserted_duration, 2)
                    new_sub["end"] = round(sub["end"] + inserted_duration, 2)
                shifted_subtitles.append(new_sub)
                
            shifted_inserted_clips = []
            for ic in video.get("inserted_clips", []):
                new_ic = ic.copy()
                if ic["start"] >= insert_time:
                    new_ic["start"] = round(ic["start"] + inserted_duration, 2)
                shifted_inserted_clips.append(new_ic)
                
            shifted_inserted_clips.append({
                "start": insert_time,
                "duration": inserted_duration
            })
            
            videos_db[merged_id] = {
                "id": merged_id,
                "filename": merged_filepath.name,
                "original_name": new_original_name,
                "path": str(merged_filepath),
                "duration": new_duration,
                "subtitles": shifted_subtitles,
                "voice_enabled": video.get("voice_enabled", True),
                "voice_lang": video.get("voice_lang", "vi"),
                "inserted_clips": shifted_inserted_clips
            }
            save_db(videos_db)
            
            merge_tasks[task_id]["status"] = "completed"
            merge_tasks[task_id]["progress"] = 100
            merge_tasks[task_id]["status_text"] = "Ghép video thành công!"
            merge_tasks[task_id]["output_id"] = merged_id
            
        except Exception as db_err:
            merge_tasks[task_id]["status"] = "failed"
            merge_tasks[task_id]["error"] = str(db_err)
            merge_tasks[task_id]["status_text"] = f"Lỗi: {str(db_err)}"

@app.post("/api/video/{video_id}/insert-clip")
async def insert_video_clip(
    video_id: str,
    insert_time: float = Form(...),
    file: UploadFile = File(...)
):
    import uuid
    import threading
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")

    # 1. Save uploaded insert clip
    ins_id = str(uuid.uuid4())[:8]
    ins_ext = os.path.splitext(file.filename or "insert.mp4")[1] or ".mp4"
    ins_filename = f"insert_{ins_id}{ins_ext}"
    ins_filepath = UPLOAD_DIR / ins_filename

    with open(ins_filepath, "wb") as f:
        content = await file.read()
        f.write(content)

    # 2. Prepare output path
    merged_id = str(uuid.uuid4())[:8]
    merged_filename = f"{merged_id}.mp4"
    merged_filepath = UPLOAD_DIR / merged_filename

    orig_name = video.get("original_name", "video.mp4")
    name_wo_ext = os.path.splitext(orig_name)[0]
    new_original_name = f"{name_wo_ext}_inserted.mp4"

    # Start merge in background thread
    task_id = str(uuid.uuid4())[:8]
    thread = threading.Thread(
        target=run_merge_task,
        args=(task_id, video_id, insert_time, ins_filepath, merged_filepath, merged_id, new_original_name)
    )
    thread.daemon = True
    thread.start()

    return {"task_id": task_id}

@app.get("/api/video/merge-status/{task_id}")
async def get_merge_status(task_id: str):
    task = merge_tasks.get(task_id, {"status": "failed", "error": "Task not found"})
    return task

class MoveClipPayload(BaseModel):
    new_start: float

@app.post("/api/video/{video_id}/delete-clip/{clip_index}")
def delete_spliced_clip(video_id: str, clip_index: int):
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
        
    inserted_clips = video.get("inserted_clips", [])
    if clip_index < 0 or clip_index >= len(inserted_clips):
        raise HTTPException(400, "Invalid clip index")
        
    clip = inserted_clips[clip_index]
    clip_start = clip["start"]
    clip_duration = clip["duration"]
    clip_end = clip_start + clip_duration
    
    import subprocess
    import imageio_ffmpeg
    import uuid
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    
    temp_id = str(uuid.uuid4())[:8]
    part1_path = UPLOAD_DIR / f"part1_del_{temp_id}.mp4"
    part2_path = UPLOAD_DIR / f"part2_del_{temp_id}.mp4"
    list_path = UPLOAD_DIR / f"list_del_{temp_id}.txt"
    
    # Save output to a new filename to prevent Windows OS file lock issues
    new_filename = f"del_{temp_id}.mp4"
    new_filepath = UPLOAD_DIR / new_filename
    
    try:
        # Determine if we need to slice part 1 and part 2 (avoid tiny slices below 0.05s)
        need_part1 = clip_start > 0.05
        need_part2 = clip_end < (video.get("duration", 0) - 0.05)
        
        if need_part1 and need_part2:
            # 1. Slice part 1: 0 to clip_start
            split1_cmd = [
                ffmpeg_bin, "-y",
                "-i", video["path"],
                "-t", str(clip_start),
                "-c", "copy",
                "-map", "0",
                str(part1_path)
            ]
            # 2. Slice part 2: clip_end to end
            split2_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(clip_end),
                "-i", video["path"],
                "-c", "copy",
                "-map", "0",
                str(part2_path)
            ]
            subprocess.run(split1_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            subprocess.run(split2_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            # 3. Concatenate part 1 & part 2
            with open(list_path, "w", encoding="utf-8") as f:
                f.write(f"file '{part1_path.name}'\n")
                f.write(f"file '{part2_path.name}'\n")
                
            concat_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_path.name,
                "-c", "copy",
                new_filepath.name
            ]
            subprocess.run(concat_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_part1:
            # Spliced clip was at the very end, we only need part 1
            split_cmd = [
                ffmpeg_bin, "-y",
                "-i", video["path"],
                "-t", str(clip_start),
                "-c", "copy",
                "-map", "0",
                str(new_filepath)
            ]
            subprocess.run(split_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_part2:
            # Spliced clip was at the very beginning, we only need part 2
            split_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(clip_end),
                "-i", video["path"],
                "-c", "copy",
                "-map", "0",
                str(new_filepath)
            ]
            subprocess.run(split_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        else:
            raise Exception("Không thể xóa clip vì đây là phần nội dung duy nhất của video.")
            
        # Cleanup temp slicing files
        for temp_path in [part1_path, part2_path, list_path]:
            if temp_path.exists():
                temp_path.unlink()
                
        # Try to delete the old video file. If locked, ignore and let GC clean it later!
        old_path = Path(video["path"])
        if old_path.exists():
            try:
                old_path.unlink()
            except Exception as unlink_err:
                print(f"Warning: Could not delete old file {old_path}: {unlink_err}")
                
    except Exception as e:
        for temp_path in [part1_path, part2_path, list_path, new_filepath]:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
        raise HTTPException(500, f"Error processing clip deletion: {str(e)}")
        
    # Shift subtitles
    shifted_subtitles = []
    for sub in video.get("subtitles", []):
        s = sub["start"]
        e = sub["end"]
        
        # 1. Entirely inside deleted segment
        if s >= clip_start and e <= clip_end:
            continue
            
        new_sub = sub.copy()
        
        # 2. Entirely before
        if e <= clip_start:
            pass
        # 3. Entirely after
        elif s >= clip_end:
            new_sub["start"] = round(s - clip_duration, 2)
            new_sub["end"] = round(e - clip_duration, 2)
        # 4. Spans across the entire deleted segment
        elif s < clip_start and e > clip_end:
            new_sub["end"] = round(e - clip_duration, 2)
        # 5. Overlaps start of delete segment
        elif s < clip_start and e > clip_start:
            new_sub["end"] = clip_start
        # 6. Overlaps end of delete segment
        elif s >= clip_start and e > clip_end:
            new_sub["start"] = clip_start
            new_sub["end"] = round(e - clip_duration, 2)
            
        shifted_subtitles.append(new_sub)
        
    # Shift remaining inserted clips
    shifted_inserted_clips = []
    for idx, ic in enumerate(inserted_clips):
        if idx == clip_index:
            continue
        new_ic = ic.copy()
        if ic["start"] >= clip_end:
            new_ic["start"] = round(ic["start"] - clip_duration, 2)
        shifted_inserted_clips.append(new_ic)
        
    # Calculate new duration
    try:
        from moviepy.editor import VideoFileClip
        clip_obj = VideoFileClip(str(new_filepath))
        new_duration = clip_obj.duration
        clip_obj.close()
    except Exception:
        new_duration = max(0.0, video.get("duration", 0) - clip_duration)

    orig_name = video.get("original_name", "video.mp4")
    name_wo_ext = os.path.splitext(orig_name)[0]
    new_original_name = f"{name_wo_ext}_deleted.mp4"
    
    # Update current database entry
    video["path"] = str(new_filepath)
    video["filename"] = new_filename
    video["original_name"] = new_original_name
    video["duration"] = new_duration
    video["subtitles"] = shifted_subtitles
    video["inserted_clips"] = shifted_inserted_clips
    
    videos_db[video_id] = video
    save_db(videos_db)
    
    return {"status": "success", "output_id": video_id}

@app.post("/api/video/{video_id}/move-clip/{clip_index}")
def move_spliced_clip(video_id: str, clip_index: int, payload: MoveClipPayload):
    new_start = payload.new_start
    video = videos_db.get(video_id)
    if not video:
        raise HTTPException(404, "Video not found")
        
    inserted_clips = video.get("inserted_clips", [])
    if clip_index < 0 or clip_index >= len(inserted_clips):
        raise HTTPException(400, "Invalid clip index")
        
    clip = inserted_clips[clip_index]
    clip_start = clip["start"]
    clip_duration = clip["duration"]
    clip_end = clip_start + clip_duration
    
    import subprocess
    import imageio_ffmpeg
    import uuid
    ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
    
    temp_id = str(uuid.uuid4())[:8]
    extracted_clip_path = UPLOAD_DIR / f"clip_ext_{temp_id}.mp4"
    part1_del_path = UPLOAD_DIR / f"part1_del_{temp_id}.mp4"
    part2_del_path = UPLOAD_DIR / f"part2_del_{temp_id}.mp4"
    list_del_path = UPLOAD_DIR / f"list_del_{temp_id}.txt"
    recovered_orig_path = UPLOAD_DIR / f"recovered_{temp_id}.mp4"
    
    partA_path = UPLOAD_DIR / f"partA_{temp_id}.mp4"
    partB_path = UPLOAD_DIR / f"partB_{temp_id}.mp4"
    list_move_path = UPLOAD_DIR / f"list_move_{temp_id}.txt"
    
    # Save output to a new filename to prevent Windows OS file lock issues
    new_filename = f"move_{temp_id}.mp4"
    new_filepath = UPLOAD_DIR / new_filename
    
    try:
        # Step 1: Extract the inserted clip segment
        extract_cmd = [
            ffmpeg_bin, "-y",
            "-ss", str(clip_start),
            "-i", video["path"],
            "-t", str(clip_duration),
            "-c", "copy",
            "-map", "0",
            str(extracted_clip_path)
        ]
        subprocess.run(extract_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        
        # Step 2: Remove the clip segment from compiled video to get recovered_orig
        need_part1 = clip_start > 0.05
        need_part2 = clip_end < (video.get("duration", 0) - 0.05)
        
        if need_part1 and need_part2:
            split1_cmd = [
                ffmpeg_bin, "-y",
                "-i", video["path"],
                "-t", str(clip_start),
                "-c", "copy",
                "-map", "0",
                str(part1_del_path)
            ]
            split2_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(clip_end),
                "-i", video["path"],
                "-c", "copy",
                "-map", "0",
                str(part2_del_path)
            ]
            subprocess.run(split1_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            subprocess.run(split2_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            with open(list_del_path, "w", encoding="utf-8") as f:
                f.write(f"file '{part1_del_path.name}'\n")
                f.write(f"file '{part2_del_path.name}'\n")
                
            concat_del_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_del_path.name,
                "-c", "copy",
                recovered_orig_path.name
            ]
            subprocess.run(concat_del_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_part1:
            split_cmd = [
                ffmpeg_bin, "-y",
                "-i", video["path"],
                "-t", str(clip_start),
                "-c", "copy",
                "-map", "0",
                str(recovered_orig_path)
            ]
            subprocess.run(split_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_part2:
            split_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(clip_end),
                "-i", video["path"],
                "-c", "copy",
                "-map", "0",
                str(recovered_orig_path)
            ]
            subprocess.run(split_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        else:
            raise Exception("Không thể di chuyển clip vì đây là phần nội dung duy nhất của video.")
            
        # Step 3: Split recovered_orig at new_start into partA and partB
        from moviepy.editor import VideoFileClip
        rec_clip = VideoFileClip(str(recovered_orig_path))
        rec_duration = rec_clip.duration
        rec_clip.close()
        
        target_start = min(rec_duration, max(0.0, new_start))
        
        need_partA = target_start > 0.05
        need_partB = target_start < (rec_duration - 0.05)
        
        if need_partA and need_partB:
            splitA_cmd = [
                ffmpeg_bin, "-y",
                "-i", str(recovered_orig_path),
                "-t", str(target_start),
                "-c", "copy",
                "-map", "0",
                str(partA_path)
            ]
            splitB_cmd = [
                ffmpeg_bin, "-y",
                "-ss", str(target_start),
                "-i", str(recovered_orig_path),
                "-c", "copy",
                "-map", "0",
                str(partB_path)
            ]
            subprocess.run(splitA_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            subprocess.run(splitB_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            with open(list_move_path, "w", encoding="utf-8") as f:
                f.write(f"file '{partA_path.name}'\n")
                f.write(f"file '{extracted_clip_path.name}'\n")
                f.write(f"file '{partB_path.name}'\n")
                
            concat_move_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_move_path.name,
                "-c", "copy",
                new_filepath.name
            ]
            subprocess.run(concat_move_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_partA:
            # Move to the very end
            with open(list_move_path, "w", encoding="utf-8") as f:
                f.write(f"file '{recovered_orig_path.name}'\n")
                f.write(f"file '{extracted_clip_path.name}'\n")
                
            concat_move_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_move_path.name,
                "-c", "copy",
                new_filepath.name
            ]
            subprocess.run(concat_move_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        elif need_partB:
            # Move to the very beginning
            with open(list_move_path, "w", encoding="utf-8") as f:
                f.write(f"file '{extracted_clip_path.name}'\n")
                f.write(f"file '{recovered_orig_path.name}'\n")
                
            concat_move_cmd = [
                ffmpeg_bin, "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_move_path.name,
                "-c", "copy",
                new_filepath.name
            ]
            subprocess.run(concat_move_cmd, cwd=str(UPLOAD_DIR), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
        else:
            raise Exception("Độ dài video quá ngắn.")
            
        # Try to delete the old video file. If locked, ignore and let GC clean it later!
        old_path = Path(video["path"])
        if old_path.exists():
            try:
                old_path.unlink()
            except Exception as unlink_err:
                print(f"Warning: Could not delete old file {old_path}: {unlink_err}")
                
        # Cleanup temp
        for temp_path in [extracted_clip_path, part1_del_path, part2_del_path, list_del_path, recovered_orig_path, partA_path, partB_path, list_move_path]:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
                
    except Exception as e:
        for temp_path in [extracted_clip_path, part1_del_path, part2_del_path, list_del_path, recovered_orig_path, partA_path, partB_path, list_move_path, new_filepath]:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
        raise HTTPException(500, f"Error processing clip move: {str(e)}")
        
    # --- SUBTITLE SHIFTING FOR MOVE ---
    # First: simulate deletion of the clip
    temp_subs = []
    for sub in video.get("subtitles", []):
        s = sub["start"]
        e = sub["end"]
        if s >= clip_start and e <= clip_end:
            continue
        new_sub = sub.copy()
        if e <= clip_start:
            pass
        elif s >= clip_end:
            new_sub["start"] = round(s - clip_duration, 2)
            new_sub["end"] = round(e - clip_duration, 2)
        elif s < clip_start and e > clip_end:
            new_sub["end"] = round(e - clip_duration, 2)
        elif s < clip_start and e > clip_start:
            new_sub["end"] = clip_start
        elif s >= clip_start and e > clip_end:
            new_sub["start"] = clip_start
            new_sub["end"] = round(e - clip_duration, 2)
        temp_subs.append(new_sub)
        
    # Second: simulate insertion of the clip at target_start
    shifted_subtitles = []
    for sub in temp_subs:
        s = sub["start"]
        e = sub["end"]
        new_sub = sub.copy()
        if s >= target_start:
            new_sub["start"] = round(s + clip_duration, 2)
            new_sub["end"] = round(e + clip_duration, 2)
        elif s < target_start and e > target_start:
            new_sub["end"] = target_start
        shifted_subtitles.append(new_sub)
        
    # --- INSERTED CLIPS SHIFTING FOR MOVE ---
    temp_clips = []
    for idx, ic in enumerate(inserted_clips):
        if idx == clip_index:
            continue
        new_ic = ic.copy()
        if ic["start"] >= clip_end:
            new_ic["start"] = round(ic["start"] - clip_duration, 2)
        temp_clips.append(new_ic)
        
    shifted_inserted_clips = []
    for ic in temp_clips:
        new_ic = ic.copy()
        if ic["start"] >= target_start:
            new_ic["start"] = round(ic["start"] + clip_duration, 2)
        shifted_inserted_clips.append(new_ic)
        
    shifted_inserted_clips.append({
        "start": target_start,
        "duration": clip_duration
    })
    
    shifted_inserted_clips.sort(key=lambda x: x["start"])
    
    # Update project
    try:
        from moviepy.editor import VideoFileClip
        clip_obj = VideoFileClip(str(new_filepath))
        new_duration = clip_obj.duration
        clip_obj.close()
    except Exception:
        new_duration = video.get("duration", 0)

    orig_name = video.get("original_name", "video.mp4")
    name_wo_ext = os.path.splitext(orig_name)[0]
    new_original_name = f"{name_wo_ext}_moved.mp4"
    
    # Update current database entry
    video["path"] = str(new_filepath)
    video["filename"] = new_filename
    video["original_name"] = new_original_name
    video["duration"] = new_duration
    video["subtitles"] = shifted_subtitles
    video["inserted_clips"] = shifted_inserted_clips
    
    videos_db[video_id] = video
    save_db(videos_db)
    
    return {"status": "success", "output_id": video_id}


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


# Mount frontend files after all API endpoints
frontend_dir = Path(__file__).parent.parent / "frontend"
if frontend_dir.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
