# Video Editor

Công cụ chỉnh sửa video tích hợp AI: **Speech-to-Text** (WhisperX), **Text-to-Speech** (Spark-TTS tiếng Việt), tải & transcribe YouTube.

## Yêu cầu hệ thống

- Python 3.12, CUDA 12.x (GPU NVIDIA khuyến nghị), ffmpeg (trong PATH)

## Cài đặt nhanh

```bash
```bash
git clone <url> && cd video-editor
uv sync                              # Tất cả deps (torch, whisperx, yt-dlp, spark-tts...)
```

Sửa đường dẫn LoRA trong `backend/main.py` nếu cần:
```python
_TTS_LORA_PATH = r"F:\WebEdit\video-editor\modules\spark_tts_lora"
```
```

## Chạy

```bash
# Windows
start.bat

# Thủ công
cd backend && uv run python main.py
# → http://localhost:9090/
```

## Cấu trúc

| Thư mục | Nội dung |
|---------|----------|
| `backend/` | FastAPI server (endpoints, transcriber) |
| `frontend/` | index.html + app_v7.js + style.css |
| `modules/whisperx/` | Speech-to-text engine |
| `modules/Spark-TTS-0.5B/` + `sparktts_infer.py` | Text-to-speech engine |
| `modules/spark_tts_lora/` | LoRA fine-tuned voice |
| `uploads/` | Video files |
| `outputs/` | Audio output |

## Tính năng

### Video Editor
- Upload video, edit subtitle, timeline
- **Speech to Text** (WhisperX, 13 ngôn ngữ)
- TTS từng câu (Spark-TTS giọng Việt)
- Xuất/nhập SRT
- Render video hoàn chỉnh

### YouTube
- Nhập link → tải video → auto-transcribe → mở trong Editor

### Text to Speech
- TTS văn bản dài, voice cloning (reference audio)

## API chính

| Method | Endpoint | Chức năng |
|--------|----------|-----------|
| POST | `/api/upload` | Upload video |
| POST | `/api/video/{id}/transcribe` | Speech-to-text |
| GET | `/api/video/{id}/transcribe-status` | Poll transcription |
| POST | `/api/youtube-download` | Tải YouTube |
| POST | `/api/tts/synthesize` | TTS |
| GET | `/api/tts/synthesize/{task_id}/status` | Poll TTS |

## Xử lý lỗi thường gặp

**`cublas64_12.dll not found`**
```bash
set PATH=%PATH%;.venv\Lib\site-packages\nvidia\cublas\bin;.venv\Lib\site-packages\nvidia\cudnn\bin;.venv\Lib\site-packages\nvidia\cuda_nvrtc\bin
```

**TTS treo lần 2** — model bị unload sau 5 phút idle. Backend đã fix auto-reload.
