console.log("app.js loaded. Version: 1.1.0 (YouTube + WhisperX)");
const API = 'http://localhost:9090';
let currentVideoId = null;
let subtitles = [];
let subCounter = 0;
// --- DOM refs ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const videoSelect = document.getElementById('video-select');
const videoList = document.getElementById('video-list-section');
const playerArea = document.getElementById('player-area');
const renderArea = document.getElementById('render-area');

// Screen switching DOM refs
const startScreen = document.getElementById('start-screen');
const workspaceScreen = document.getElementById('workspace-screen');
const btnOpenProject = document.getElementById('btn-open-project');
const btnBackToStart = document.getElementById('btn-back-to-start');
const activeVideoName = document.getElementById('active-video-name');
const videoPlayer = document.getElementById('video-player');
const timeDisplay = document.getElementById('time-display');
const btnSetStart = document.getElementById('btn-set-start');
const btnSetEnd = document.getElementById('btn-set-end');
const subtitleList = document.getElementById('subtitle-list');
const btnAddSub = document.getElementById('btn-add-sub');
const btnImportSrt = document.getElementById('btn-import-srt');
const btnExportSrt = document.getElementById('btn-export-srt');
const btnStt = document.getElementById('btn-stt');
const srtInput = document.getElementById('srt-input');
const btnRender = document.getElementById('btn-render');
const btnRenderAudio = document.getElementById('btn-render-audio');
const voiceToggle = document.getElementById('voice-toggle');
const voiceLang = document.getElementById('voice-lang');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const sttLang = document.getElementById('stt-lang');
const sttProgress = document.getElementById('stt-progress');
const sttText = document.getElementById('stt-text');
const sttFill = document.getElementById('stt-fill');
const progressText = document.getElementById('progress-text');
const downloadArea = document.getElementById('download-area');

// --- Upload Progress DOM refs ---
const uploadProgressContainer = document.getElementById('upload-progress-container');
const uploadStatusText = document.getElementById('upload-status-text');
const uploadPercentage = document.getElementById('upload-percentage');
const uploadProgressFill = document.getElementById('upload-progress-fill');

// --- Upload ---
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) uploadVideo(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) {
    uploadVideo(fileInput.files[0]);
    fileInput.value = '';
  }
});

function uploadVideo(file) {
  const formData = new FormData();
  formData.append('file', file);

  uploadProgressContainer.style.display = 'block';
  uploadStatusText.textContent = "Đang tải lên...";
  uploadPercentage.textContent = "0%";
  uploadProgressFill.style.width = "0%";

  const xhr = new XMLHttpRequest();
  
  // Track upload progress
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      uploadPercentage.textContent = `${percent}%`;
      uploadProgressFill.style.width = `${percent}%`;
      if (percent === 100) {
        uploadStatusText.textContent = "Đang xử lý trên server...";
      }
    }
  });

  // Handle upload response
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        uploadStatusText.textContent = "Tải lên thành công!";
        setTimeout(() => {
          uploadProgressContainer.style.display = 'none';
        }, 1500);
        await loadVideoList();
        selectVideo(data.id);
      } catch (err) {
        uploadStatusText.textContent = "Lỗi phản hồi từ server";
        alert("Lỗi phân tích phản hồi: " + err.message);
      }
    } else {
      uploadStatusText.textContent = "Tải lên thất bại";
      alert(`Lỗi tải lên: ${xhr.status} ${xhr.statusText}`);
    }
  });

  // Handle network error
  xhr.addEventListener('error', () => {
    uploadStatusText.textContent = "Lỗi kết nối";
    alert("Không thể kết nối đến server để tải video.");
  });

  xhr.open('POST', `${API}/api/upload`);
  xhr.send(formData);
}

// --- Video list ---
async function loadVideoList() {
  const container = document.getElementById('recent-projects-container');
  if (!container) return;

  try {
    const res = await fetch(`${API}/api/videos`);
    const videos = await res.json();

    if (videos.length === 0) {
      container.innerHTML = `
        <div class="empty-projects">
          <div class="empty-icon">📁</div>
          <p>Chưa có dự án nào</p>
          <span>Tải video lên ở khung bên trái để bắt đầu biên tập</span>
        </div>
      `;
      return;
    }

    container.innerHTML = videos.map(v => `
      <div class="project-item-card" onclick="selectVideo('${v.id}')">
        <div class="project-preview">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="project-info">
          <h4 class="project-title" title="${escHtml(v.original_name || v.filename)}">${escHtml(v.original_name || v.filename)}</h4>
          <span class="project-meta">⏱ ${fmtDuration(v.duration)}</span>
        </div>
        <div class="project-actions">
          <button class="btn-action-icon btn-open" title="Mở dự án" onclick="selectVideo('${v.id}'); event.stopPropagation();">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
          <button class="btn-action-icon btn-delete" title="Xóa dự án" onclick="deleteVideoProject('${v.id}', event);">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Fallback sync for videoSelect if it still exists in DOM for backward compatibility
    const videoSelect = document.getElementById('video-select');
    if (videoSelect) {
      videoSelect.innerHTML = videos.map(v =>
        `<option value="${v.id}">${v.original_name || v.filename} (${fmtDuration(v.duration)})</option>`
      ).join('');
    }
  } catch (err) {
    console.error("Lỗi khi tải danh sách video:", err);
    container.innerHTML = `<div class="error-text">Không thể kết nối đến máy chủ.</div>`;
  }
}

async function deleteVideoProject(id, event) {
  if (event) event.stopPropagation();
  if (!confirm("Bạn có chắc chắn muốn xóa dự án này? Thao tác này không thể hoàn tác.")) return;
  try {
    const res = await fetch(`${API}/api/video/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadVideoList();
    } else {
      alert("Xóa dự án thất bại.");
    }
  } catch (err) {
    console.error("Lỗi khi xóa dự án:", err);
  }
}
window.deleteVideoProject = deleteVideoProject;

const videoLoadingOverlay = document.getElementById('video-loading-overlay');

function resetVideoPlayer() {
  try {
    videoPlayer.pause();
  } catch (e) {}
  videoPlayer.removeAttribute('src');
  videoPlayer.defaultPlaybackRate = 1.0;
  videoPlayer.playbackRate = 1.0;
}

async function selectVideoWithRetry(id, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${API}/api/video/${id}`);
      if (res.ok) {
        await selectVideo(id);
        return;
      }
      if (attempt === maxRetries) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      if (attempt === maxRetries) throw e;
    }
    await new Promise(r => setTimeout(r, 500 * attempt));
  }
}

async function selectVideo(id) {
  currentVideoId = id;
  try {
    const res = await fetch(`${API}/api/video/${id}`);
    if (!res.ok) {
      throw new Error(`Lỗi kết nối API (Status: ${res.status})`);
    }
    const video = await res.json();

    if (videoLoadingOverlay) videoLoadingOverlay.style.display = 'flex';
    resetVideoPlayer();
    videoPlayer.src = `${API}/api/download/${video.filename}`;
    videoPlayer.preload = 'metadata';
    videoPlayer.load();

    // Set active project name in workspace header
    if (activeVideoName) {
      activeVideoName.textContent = video.original_name || video.filename;
    }

    // Toggle screen views
    if (startScreen) startScreen.style.display = 'none';
    if (workspaceScreen) workspaceScreen.style.display = 'block';
    
    // Clear any residual display: none on child cards
    if (playerArea) playerArea.style.display = '';
    if (renderArea) renderArea.style.display = '';

    subtitles = video.subtitles || [];
    subCounter = subtitles.length;
    
    loadSubtitles();
    loadRefAudioStatus();
    if (videoSelect) videoSelect.value = id;
  } catch (err) {
    console.error("Lỗi mở dự án:", err);
    alert("Không thể tải thông tin dự án này. Chi tiết lỗi:\n" + err.message);
  }
}

videoPlayer.addEventListener('canplay', () => {
  if (videoLoadingOverlay) videoLoadingOverlay.style.display = 'none';
});
videoPlayer.addEventListener('waiting', () => {
  if (videoLoadingOverlay && videoPlayer.src) videoLoadingOverlay.style.display = 'flex';
});
videoPlayer.addEventListener('playing', () => {
  if (videoLoadingOverlay) videoLoadingOverlay.style.display = 'none';
});
videoPlayer.addEventListener('error', (e) => {
  if (videoLoadingOverlay) videoLoadingOverlay.style.display = 'none';
});

const timelinePlayhead = document.getElementById('timeline-playhead');
const videoSubtitleOverlay = document.getElementById('video-subtitle-overlay');
let lastActiveIdx = -1;
let timeupdateRAF = null;

function findActiveSub(time) {
  if (!subtitles.length) return -1;
  let lo = 0, hi = subtitles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const s = subtitles[mid];
    if (time < s.start) { hi = mid - 1; }
    else if (time > s.end) { lo = mid + 1; }
    else { return mid; }
  }
  return -1;
}

videoPlayer.addEventListener('timeupdate', () => {
  if (timeupdateRAF) return;
  timeupdateRAF = requestAnimationFrame(() => {
    timeupdateRAF = null;
    const currentTime = videoPlayer.currentTime;
    const duration = videoPlayer.duration || 1;
    
    // 1. Update playhead position on visual timeline
    if (timelinePlayhead) {
      timelinePlayhead.style.left = `${(currentTime / duration) * 100}%`;
    }
    
    // 2. Update time display text
    timeDisplay.textContent = `${currentTime.toFixed(2)}s / ${videoPlayer.duration ? videoPlayer.duration.toFixed(2) : '0.00'}s`;
    
    // 3. Find and display active subtitle overlay (binary search)
    const activeIdx = findActiveSub(currentTime);
    const activeSub = activeIdx >= 0 ? subtitles[activeIdx] : null;

    if (videoSubtitleOverlay) {
      if (activeSub) {
        if (videoSubtitleOverlay.textContent !== activeSub.text) {
          videoSubtitleOverlay.textContent = activeSub.text;
          videoSubtitleOverlay.style.display = 'block';
        }
      } else {
        if (videoSubtitleOverlay.style.display !== 'none') {
          videoSubtitleOverlay.textContent = '';
          videoSubtitleOverlay.style.display = 'none';
        }
      }
    }

    // 4. Highlight active subtitle in list and scroll to it (only if changed)
    if (activeIdx !== lastActiveIdx) {
      highlightSub(activeIdx);
      if (activeIdx !== -1) {
        scrollToActiveSub(activeIdx);
      }
      lastActiveIdx = activeIdx;
    }
  });
});

videoPlayer.addEventListener('loadedmetadata', () => {
  const durationLabel = document.getElementById('timeline-duration-label');
  if (durationLabel) {
    durationLabel.textContent = `${videoPlayer.duration.toFixed(2)}s`;
  }
  updateTimelineBlocks();
});

videoPlayer.addEventListener('error', () => {
  console.error("Video player error:", videoPlayer.error);
  let errorMsg = "Không thể tải hoặc phát video.";
  if (videoPlayer.error) {
    switch (videoPlayer.error.code) {
      case 1: errorMsg = "Yêu cầu tải video bị hủy."; break;
      case 2: errorMsg = "Lỗi mạng khi tải video."; break;
      case 3: errorMsg = "Trình duyệt không hỗ trợ định dạng/codec của video này (khuyên dùng MP4 codec H.264)."; break;
      case 4: errorMsg = "Không tìm thấy file video (Lỗi 404 từ API)."; break;
    }
  }
  alert(`⚠️ ${errorMsg}\n\nCách kiểm tra:\n1. Nhấn F12 chọn tab 'Console' hoặc 'Network' để xem chi tiết lỗi API.\n2. Đảm bảo video tải lên là định dạng chuẩn (MP4 H.264).`);
});

btnSetStart.addEventListener('click', () => {
  if (!subtitles.length) { addSubtitle(); }
  const idx = getActiveIndex();
  if (idx >= 0) {
    subtitles[idx].start = Math.round(videoPlayer.currentTime * 100) / 100;
    loadSubtitles();
    highlightSub(idx);
  }
});

btnSetEnd.addEventListener('click', () => {
  const idx = getActiveIndex();
  if (idx >= 0) {
    subtitles[idx].end = Math.round(videoPlayer.currentTime * 100) / 100;
    loadSubtitles();
    highlightSub(idx);
  }
});

function getActiveIndex() {
  const active = document.querySelector('.sub-item.active-sub');
  if (active) return parseInt(active.dataset.index);
  return subtitles.length > 0 ? 0 : -1;
}

let lastHighlightedEl = null;
function highlightSub(idx) {
  if (lastHighlightedEl) {
    lastHighlightedEl.classList.remove('active-sub');
    lastHighlightedEl = null;
  }
  if (idx < 0) return;
  const el = document.querySelector(`.sub-item[data-index="${idx}"]`);
  if (el) {
    el.classList.add('active-sub');
    lastHighlightedEl = el;
  }
}

// --- Subtitles ---
function addSubtitle(start, end, text) {
  let subStart = start;
  let subEnd = end;
  const subText = text || 'Phụ đề mới';

  // Sanitize NaN/non-finite values
  if (subStart === undefined || subStart === null || isNaN(subStart) || !isFinite(subStart)) {
    subStart = videoPlayer ? videoPlayer.currentTime : 0;
  }
  
  // Auto-calculate end time based on text length (speech rate approx 0.4s per word)
  if (subEnd === undefined || subEnd === null || isNaN(subEnd) || !isFinite(subEnd)) {
    const words = subText.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedDuration = Math.max(1.5, words * 0.4);
    subEnd = subStart + estimatedDuration;
  }

  const sub = {
    id: `sub_${++subCounter}`,
    start: Math.round(subStart * 100) / 100,
    end: Math.round(Math.min(subEnd, (videoPlayer && videoPlayer.duration) ? videoPlayer.duration : (subStart + 3.0)) * 100) / 100,
    text: subText,
    voice: voiceLang.value,
  };
  
  // Double safety check
  if (isNaN(sub.start)) sub.start = 0;
  if (isNaN(sub.end)) sub.end = 3.0;
  
  subtitles.push(sub);
  // Sort chronologically by start time
  subtitles.sort((a, b) => a.start - b.start);
  
  loadSubtitles();
  
  // Seek the video player to the start time of the newly added subtitle so it immediately overlays on the video
  if (videoPlayer && isFinite(sub.start)) {
    videoPlayer.currentTime = sub.start;
  }
  
  // Find the new sorted index of the added subtitle to highlight and scroll to it
  const newIdx = subtitles.findIndex(s => s.id === sub.id);
  highlightSub(newIdx);
  scrollToActiveSub(newIdx);
  
  // Autosave to backend
  saveSubtitlesToBackend();
}

async function saveSubtitlesToBackend() {
  if (!currentVideoId) return;
  const payload = {
    subtitles: subtitles.map(s => ({ ...s })),
    voice_enabled: voiceToggle.checked,
    voice_lang: voiceLang.value,
  };
  try {
    await fetch(`${API}/api/video/${currentVideoId}/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log("Dự án đã tự động lưu.");
  } catch (err) {
    console.error("Lỗi tự động lưu:", err);
  }
}

btnAddSub.addEventListener('click', () => addSubtitle());

function deleteSub(idx) {
  subtitles.splice(idx, 1);
  loadSubtitles();
  saveSubtitlesToBackend();
}

async function synthesizeSubAudio(idx) {
  const sub = subtitles[idx];
  if (!sub || !sub.text.trim()) return alert('Phụ đề trống, không thể chuyển giọng.');
  const btn = document.getElementById(`btn-tts-${idx}`);
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const res = await fetch(`${API}/api/video/${currentVideoId}/subtitle/${idx}/synthesize`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    sub.audio_path = data.audio_path;
    btn.textContent = '🔊';
    const playBtn = document.getElementById(`btn-play-${idx}`);
    if (playBtn) {
      playBtn.disabled = false;
      playBtn.classList.add('has-audio');
    }
  } catch (err) {
    console.error('Lỗi TTS:', err);
    alert('Chuyển giọng thất bại: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function playSubAudio(idx) {
  const sub = subtitles[idx];
  if (!sub || !sub.audio_path) return;
  const audioUrl = `${API}/api/download/${sub.audio_path}?t=${Date.now()}`;
  const audio = new Audio(audioUrl);
  audio.play().catch(e => alert('Không thể phát audio: ' + e.message));
}

function loadSubtitles() {
  subtitleList.innerHTML = subtitles.map((sub, idx) => `
    <div class="sub-item" data-index="${idx}">
      <div class="sub-time-row">
        <input type="number" step="0.1" min="0" value="${sub.start}" data-idx="${idx}" data-field="start">
        <span>→</span>
        <input type="number" step="0.1" min="0" value="${sub.end}" data-idx="${idx}" data-field="end">
        <span style="margin-left:auto;color:#555;font-size:11px">#${idx+1}</span>
      </div>
      <div class="sub-text-row">
        <textarea rows="1" data-idx="${idx}" data-field="text">${escHtml(sub.text)}</textarea>
      </div>
      <div class="sub-actions">
        <button class="sub-btn-jump" data-idx="${idx}" title="Nhảy tới">⏩</button>
        <button class="sub-btn-tts btn-tts" data-idx="${idx}" title="Chuyển giọng nói">🔊</button>
        <button class="sub-btn-play btn-play ${sub.audio_path ? 'has-audio' : ''}" data-idx="${idx}" title="Nghe thử giọng" ${sub.audio_path ? '' : 'disabled'}>▶️</button>
        <button class="sub-btn-translate" data-idx="${idx}" title="Dịch phụ đề">🌐</button>
        <button class="sub-btn-delete" data-idx="${idx}" title="Xóa">🗑</button>
      </div>
    </div>
  `).join('');
  updateTimelineBlocks();
}

// Event delegation for subtitle list
subtitleList.addEventListener('change', (e) => {
  if (e.target.matches('input, textarea')) updateSubField(e, true);
});
subtitleList.addEventListener('input', (e) => {
  if (e.target.matches('input, textarea')) updateSubField(e, false);
});
subtitleList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-idx]');
  if (btn) {
    const idx = parseInt(btn.dataset.idx);
    if (btn.classList.contains('sub-btn-jump')) jumpToSub(idx);
    else if (btn.classList.contains('sub-btn-tts')) synthesizeSubAudio(idx);
    else if (btn.classList.contains('sub-btn-play')) playSubAudio(idx);
    else if (btn.classList.contains('sub-btn-translate')) translateSub(idx);
    else if (btn.classList.contains('sub-btn-delete')) deleteSub(idx);
    return;
  }
  const item = e.target.closest('.sub-item');
  if (item && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
    const idx = parseInt(item.dataset.index);
    highlightSub(idx);
    if (videoPlayer) videoPlayer.currentTime = subtitles[idx].start;
  }
});

function updateSubField(e, isFinal) {
  const idx = parseInt(e.target.dataset.idx);
  const field = e.target.dataset.field;
  let val = field === 'text' ? e.target.value : parseFloat(e.target.value) || 0;
  
  if (subtitles[idx]) {
    subtitles[idx][field] = val;
    
    // Automatically recalculate and adjust end time in real-time as text is typed
    if (field === 'text') {
      const words = val.split(/\s+/).filter(w => w.length > 0).length;
      const estimatedDuration = Math.round(Math.max(1.5, words * 0.4) * 100) / 100;
      subtitles[idx].end = Math.round((subtitles[idx].start + estimatedDuration) * 100) / 100;
      
      // Sync DOM end time input field
      const endInput = document.querySelector(`.sub-item[data-index="${idx}"] input[data-field="end"]`);
      if (endInput) {
        endInput.value = subtitles[idx].end;
      }
    }
    
    // Targeted update to avoid rebuilding the entire timeline on every keystroke
    const duration = videoPlayer && videoPlayer.duration ? videoPlayer.duration : 1;
    const block = document.querySelector(`.timeline-sub-block[data-sub-index="${idx}"]`);
    if (block) {
      const sub = subtitles[idx];
      const left = (sub.start / duration) * 100;
      const width = ((sub.end - sub.start) / duration) * 100;
      const words = sub.text ? sub.text.split(/\s+/).filter(w => w.length > 0).length : 0;
      const estAudioDur = Math.max(1.5, words * 0.4);
      const audioPercentage = sub.end > sub.start ? (estAudioDur / (sub.end - sub.start)) * 100 : 0;
      
      block.style.left = `${left}%`;
      block.style.width = `${width}%`;
      block.title = `${sub.text} (Âm thanh thực tế: ~${estAudioDur.toFixed(1)}s)`;
      const span = block.querySelector('span');
      if (span) span.textContent = sub.text;
      const indicator = block.querySelector('.timeline-audio-indicator');
      if (indicator) indicator.style.width = `${audioPercentage}%`;
    } else {
      updateTimelineBlocks();
    }

    if (isFinal) {
      saveSubtitlesToBackend();
    }
  }
}

function jumpToSub(idx) {
  if (subtitles[idx] && videoPlayer) {
    videoPlayer.currentTime = subtitles[idx].start;
    videoPlayer.play();
    highlightSub(idx);
  }
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// --- SRT Import/Export ---
btnImportSrt.addEventListener('click', () => srtInput.click());
srtInput.addEventListener('change', () => {
  if (!srtInput.files.length) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const parsed = parseSRT(e.target.result);
    if (parsed.length) {
      subtitles = parsed;
      subCounter = subtitles.length;
      loadSubtitles();
    }
  };
  reader.readAsText(srtInput.files[0]);
  srtInput.value = '';
});

function parseSRT(text) {
  const blocks = text.trim().replace(/\r\n/g, '\n').split(/\n\n+/);
  const result = [];
  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;
    const timeMatch = lines[1].match(
      /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/
    );
    if (!timeMatch) continue;
    const start = toSeconds(timeMatch[1], timeMatch[2], timeMatch[3], timeMatch[4]);
    const end = toSeconds(timeMatch[5], timeMatch[6], timeMatch[7], timeMatch[8]);
    const text = lines.slice(2).join('\n').trim();
    result.push({
      id: `sub_${++subCounter}`,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      text,
      voice: voiceLang.value,
    });
  }
  return result;
}

function toSeconds(h, m, s, ms) {
  return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
}

btnExportSrt.addEventListener('click', () => {
  if (!subtitles.length) return alert('Không có phụ đề để export');
  const srt = subtitles.map((sub, i) => {
    const start = srtTime(sub.start);
    const end = srtTime(sub.end);
    return `${i + 1}\n${start} --> ${end}\n${sub.text}\n`;
  }).join('\n');

  const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'subtitles.srt';
  a.click();
  URL.revokeObjectURL(a.href);
});

btnStt.addEventListener('click', async () => {
  if (!currentVideoId) { alert('Chưa có video nào. Vui lòng tải video trước.'); return; }
  if (subtitles.length > 0) {
    if (!confirm('Thao tác này sẽ thay thế tất cả phụ đề hiện tại. Tiếp tục?')) return;
  }

  btnStt.disabled = true;
  sttProgress.style.display = 'block';
  sttText.textContent = 'Đang tạo phụ đề tự động...';
  sttFill.style.width = '0%';

  try {
    const lang = sttLang ? sttLang.value : 'en';
    const res = await fetch(`${API}/api/video/${currentVideoId}/transcribe?language=${lang}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const { task_id } = await res.json();

    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 600;
    const pollInterval = setInterval(async () => {
      pollAttempts++;
      try {
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          clearInterval(pollInterval);
          sttText.textContent = 'Lỗi: Quá thời gian chờ';
          btnStt.disabled = false;
          setTimeout(() => { sttProgress.style.display = 'none'; }, 3000);
          return;
        }

        const statusRes = await fetch(`${API}/api/video/${currentVideoId}/transcribe-status?task_id=${task_id}`);
        if (!statusRes.ok) {
          clearInterval(pollInterval);
          throw new Error(`HTTP ${statusRes.status}`);
        }
        const data = await statusRes.json();

        const progressVal = data.progress != null ? data.progress : 0;
        sttFill.style.width = `${progressVal}%`;
        sttText.textContent = data.message || `Đang xử lý... ${progressVal}%`;

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          sttFill.style.width = '100%';
          sttText.textContent = 'Hoàn tất!';
          btnStt.disabled = false;

          if (data.subtitles && data.subtitles.length > 0) {
            subtitles = data.subtitles;
            subCounter = subtitles.length;
            loadSubtitles();
            saveSubtitlesToBackend();
          }
          setTimeout(() => { sttProgress.style.display = 'none'; }, 2000);

        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          sttText.textContent = 'Lỗi: ' + (data.error || 'Lỗi không xác định');
          btnStt.disabled = false;
          setTimeout(() => { sttProgress.style.display = 'none'; }, 4000);
        }
      } catch (err) {
        clearInterval(pollInterval);
        sttText.textContent = 'Lỗi kết nối: ' + err.message;
        btnStt.disabled = false;
        setTimeout(() => { sttProgress.style.display = 'none'; }, 4000);
      }
    }, 1000);
  } catch (err) {
    sttText.textContent = 'Lỗi: ' + err.message;
    btnStt.disabled = false;
    setTimeout(() => { sttProgress.style.display = 'none'; }, 4000);
  }
});

function srtTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function pad(n, z = 2) { return String(n).padStart(z, '0'); }

// --- Render ---
async function saveAndRender(isAudio) {
  if (!currentVideoId || !subtitles.length) {
    return alert('Vui lòng thêm phụ đề trước khi render');
  }

  // Save subtitles to backend
  const payload = {
    subtitles: subtitles.map(s => ({ ...s })),
    voice_enabled: voiceToggle.checked,
    voice_lang: voiceLang.value,
  };

  try {
    await fetch(`${API}/api/video/${currentVideoId}/subtitles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return alert('Lưu phụ đề thất bại: ' + err.message);
  }

  progressBar.style.display = 'block';
  progressFill.style.width = '0%';
  progressFill.style.background = ''; // Reset to default style
  progressText.textContent = 'Khởi tạo render...';
  downloadArea.style.display = 'none';
  btnRender.disabled = true;
  btnRenderAudio.disabled = true;

  const endpoint = isAudio
    ? `${API}/api/video/${currentVideoId}/render-voice-only`
    : `${API}/api/video/${currentVideoId}/render`;

  try {
    const res = await fetch(endpoint, { method: 'POST' });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${res.status}`);
    }

    // Poll status every 1 second to update real-time progress
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch(`${API}/api/video/${currentVideoId}/render-status`);
        if (!statusRes.ok) {
          throw new Error(`Lỗi kết nối kiểm tra tiến trình (HTTP ${statusRes.status})`);
        }
        const data = await statusRes.json();
        
        if (data.status === "rendering") {
          progressFill.style.width = `${data.progress}%`;
          if (data.progress === 0) {
            progressText.textContent = `Đang chuẩn bị giọng đọc AI & tải tài nguyên video... (0%)`;
          } else {
            progressText.textContent = `Đang render video... ${data.progress}%`;
          }
        } else if (data.status === "completed") {
          clearInterval(pollInterval);
          progressFill.style.width = '100%';
          progressText.textContent = 'Hoàn thành!';
          btnRender.disabled = false;
          btnRenderAudio.disabled = false;

          downloadArea.style.display = 'block';
          const isAudio = data.output.endsWith('.mp3');
          const previewUrl = `${API}/api/download/${data.output}?t=${Date.now()}`;
          downloadArea.innerHTML = isAudio ? `
            <div class="preview-section">
              <h4 style="margin:0 0 8px 0; color:#e2e8f0; font-size:14px;">🎧 Nghe thử kết quả:</h4>
              <audio src="${previewUrl}" controls style="width:100%"></audio>
            </div>
            <a href="${previewUrl}" target="_blank" class="btn-primary" style="text-decoration:none; display:inline-block; margin-top:10px">
              ⬇ Tải xuống Audio
            </a>
          ` : `
            <div class="preview-section">
              <h4 style="margin:0 0 8px 0; color:#e2e8f0; font-size:14px;">🎬 Xem thử kết quả:</h4>
              <video src="${previewUrl}" controls style="width:100%; max-height:300px; border-radius:8px;"></video>
            </div>
            <a href="${previewUrl}" target="_blank" class="btn-primary" style="text-decoration:none; display:inline-block; margin-top:10px">
              ⬇ Tải xuống Video
            </a>
          `;
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
          throw new Error(data.error || 'Lỗi render trên server');
        }
      } catch (pollErr) {
        clearInterval(pollInterval);
        progressText.textContent = 'Lỗi: ' + pollErr.message;
        progressFill.style.width = '0%';
        progressFill.style.background = '#e94560';
        btnRender.disabled = false;
        btnRenderAudio.disabled = false;
      }
    }, 1000);

  } catch (err) {
    progressText.textContent = 'Lỗi: ' + err.message;
    progressFill.style.width = '0%';
    progressFill.style.background = '#e94560';
    btnRender.disabled = false;
    btnRenderAudio.disabled = false;
  }
}

btnRender.addEventListener('click', () => saveAndRender(false));
btnRenderAudio.addEventListener('click', () => saveAndRender(true));

// --- Init (Moved to end of file to prevent TDZ ReferenceError) ---

if (btnOpenProject) {
  btnOpenProject.addEventListener('click', () => {
    if (videoSelect.value) {
      selectVideo(videoSelect.value);
    } else {
      alert("Vui lòng chọn một dự án từ danh sách trước.");
    }
  });
}

if (videoSelect) {
  videoSelect.addEventListener('change', () => {
    if (videoSelect.value) {
      selectVideo(videoSelect.value);
    }
  });
}

if (btnBackToStart) {
  btnBackToStart.addEventListener('click', () => {
    try {
      videoPlayer.pause();
      videoPlayer.removeAttribute('src'); // remove source
      videoPlayer.load(); // force player to unload video stream
    } catch (e) {
      console.warn("Lỗi khi dừng video:", e);
    }
    currentVideoId = null;
    subtitles = [];
    subCounter = 0;
    if (fileInput) fileInput.value = '';
    if (workspaceScreen) workspaceScreen.style.display = 'none';
    if (startScreen) startScreen.style.display = 'flex';
    loadVideoList();
  });
}

// Autosave when voice settings change
if (voiceToggle) {
  voiceToggle.addEventListener('change', () => {
    saveSubtitlesToBackend();
    const refSection = document.querySelector('.ref-audio-section');
    if (refSection) refSection.style.display = voiceToggle.checked ? '' : 'none';
  });
}
if (voiceLang) {
  voiceLang.addEventListener('change', () => saveSubtitlesToBackend());
}

// --- Reference Audio Upload ---
const refAudioInput = document.getElementById('ref-audio-input');
const btnUploadRefAudio = document.getElementById('btn-upload-ref-audio');
const refAudioStatus = document.getElementById('ref-audio-status');

async function uploadRefAudio() {
  if (!currentVideoId) return alert('Vui lòng mở một dự án trước.');
  if (!refAudioInput.files.length) return alert('Vui lòng chọn file giọng mẫu.');

  const file = refAudioInput.files[0];
  const formData = new FormData();
  formData.append('file', file);

  refAudioStatus.textContent = 'Đang tải lên giọng mẫu...';
  refAudioStatus.className = 'ref-audio-status loading';

  try {
    const res = await fetch(`${API}/api/video/${currentVideoId}/ref-audio`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    refAudioStatus.textContent = `✅ Giọng mẫu: ${data.ref_audio}`;
    refAudioStatus.className = 'ref-audio-status success';
    refAudioInput.value = '';
  } catch (err) {
    refAudioStatus.textContent = `❌ Lỗi: ${err.message}`;
    refAudioStatus.className = 'ref-audio-status error';
  }
}

if (btnUploadRefAudio) {
  btnUploadRefAudio.addEventListener('click', uploadRefAudio);
}

async function loadRefAudioStatus() {
  if (!currentVideoId || !refAudioStatus) return;
  try {
    const res = await fetch(`${API}/api/video/${currentVideoId}`);
    if (!res.ok) return;
    const video = await res.json();
    if (video.ref_audio_path) {
      const name = video.ref_audio_path.split('/').pop() || video.ref_audio_path.split('\\').pop();
      refAudioStatus.textContent = `✅ Giọng mẫu: ${name}`;
      refAudioStatus.className = 'ref-audio-status success';
    } else {
      refAudioStatus.textContent = 'Chưa có giọng mẫu';
      refAudioStatus.className = 'ref-audio-status';
    }
  } catch (e) {
    console.error('Lỗi tải trạng thái giọng mẫu:', e);
  }
}

// --- Keyboard shortcuts ---
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'i' || e.key === 'I') { btnSetStart.click(); e.preventDefault(); }
  if (e.key === 'o' || e.key === 'O') { btnSetEnd.click(); e.preventDefault(); }
  if (e.key === 'Enter' && !e.shiftKey) { addSubtitle(); e.preventDefault(); }
});

function fmtDuration(sec) {
  if (!sec) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${pad(s)}`;
}

// --- Scrolling, Timeline Drawing, Drag-and-drop Helpers ---
let lastScrolledIdx = -1;
function scrollToActiveSub(idx) {
  if (idx === lastScrolledIdx) return;
  lastScrolledIdx = idx;
  const activeItem = document.querySelector(`.sub-item[data-index="${idx}"]`);
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

function updateTimelineBlocks() {
  const timelineSubsContainer = document.getElementById('timeline-subs-container');
  if (!timelineSubsContainer) return;
  const duration = videoPlayer.duration || 0;
  if (!duration) {
    timelineSubsContainer.innerHTML = '';
    return;
  }
  
  timelineSubsContainer.innerHTML = subtitles.map((sub, idx) => {
    const left = (sub.start / duration) * 100;
    const width = ((sub.end - sub.start) / duration) * 100;
    
    // Estimate speaking duration (approx 0.4s per word, min 1.5s)
    const words = sub.text ? sub.text.split(/\s+/).filter(w => w.length > 0).length : 0;
    const estAudioDur = Math.max(1.5, words * 0.4);
    const audioPercentage = sub.end > sub.start ? (estAudioDur / (sub.end - sub.start)) * 100 : 0;
    
    return `
      <div class="timeline-sub-block" 
           style="left: ${left}%; width: ${width}%;" 
           title="${escHtml(sub.text)} (Âm thanh thực tế: ~${estAudioDur.toFixed(1)}s)"
           data-sub-index="${idx}">
        <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; pointer-events: none;">
          ${escHtml(sub.text)}
        </span>
        <!-- Green indicator showing the exact voice duration relative to user-defined block width -->
        <div class="timeline-audio-indicator" style="width: ${audioPercentage}%;"></div>
      </div>
    `;
  }).join('');

}

const visualTimeline = document.getElementById('visual-timeline');
function setupTimelineEvents() {
  // Prevent default drag/drop behaviors globally (browser opening the text/file)
  window.addEventListener('dragover', (e) => {
    e.preventDefault();
  }, false);
  window.addEventListener('drop', (e) => {
    e.preventDefault();
  }, false);

  if (!visualTimeline) return;

  function seekFromEvent(e) {
    console.log("Timeline clicked! Duration:", videoPlayer.duration, "Current:", videoPlayer.currentTime);
    if (!videoPlayer.duration || videoPlayer.duration === Infinity) {
      console.warn("Video has no valid duration!");
      alert("Lỗi: Video chưa tải xong thời lượng (Duration: " + videoPlayer.duration + ")");
      return;
    }
    const rect = visualTimeline.getBoundingClientRect();
    let x = e.clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;
    const ratio = x / rect.width;
    console.log("Seeking to ratio:", ratio, "Target time:", ratio * videoPlayer.duration);
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  }

  let isDraggingTimeline = false;

  visualTimeline.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDraggingTimeline = true;
    seekFromEvent(e);
  });

  window.addEventListener('mousemove', (e) => {
    if (isDraggingTimeline) {
      seekFromEvent(e);
    }
  });

  window.addEventListener('mouseup', () => {
    isDraggingTimeline = false;
  });

  // --- Drag & Drop text selections / files onto visual timeline ---
  visualTimeline.addEventListener('dragover', (e) => {
    e.preventDefault();
    visualTimeline.style.borderColor = "#ec4899";
    visualTimeline.style.background = "rgba(236, 72, 153, 0.08)";
  });

  visualTimeline.addEventListener('dragleave', () => {
    visualTimeline.style.borderColor = "";
    visualTimeline.style.background = "";
  });

  visualTimeline.addEventListener('drop', (e) => {
    e.preventDefault();
    visualTimeline.style.borderColor = "";
    visualTimeline.style.background = "";

    if (!videoPlayer.duration) {
      return alert("Vui lòng tải video lên trước khi chèn phụ đề.");
    }

    const rect = visualTimeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    const dropTime = ratio * videoPlayer.duration;

    handleDroppedContent(e, dropTime);
  });

  // --- Drag & Drop text selections / files directly onto video player ---
  const videoWrapper = document.querySelector('.video-wrapper');
  if (videoWrapper) {
    videoWrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      videoWrapper.style.boxShadow = "0 0 20px rgba(236, 72, 153, 0.3)";
      videoWrapper.style.borderColor = "#ec4899";
    });

    videoWrapper.addEventListener('dragleave', () => {
      videoWrapper.style.boxShadow = "";
      videoWrapper.style.borderColor = "";
    });

    videoWrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      videoWrapper.style.boxShadow = "";
      videoWrapper.style.borderColor = "";

      if (!videoPlayer.duration) {
        return alert("Vui lòng tải video lên trước khi chèn phụ đề.");
      }

      // Drop on video player will insert text at the current playback position
      const dropTime = videoPlayer.currentTime;
      handleDroppedContent(e, dropTime);
    });
  }
}

// Common helper to handle dropped text/files
function handleDroppedContent(e, time) {
  // Cross-browser retrieval of text content
  let text = e.dataTransfer.getData('text') || e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('Text');

  // Try parsing file drop (like text/plain)
  if (!text && e.dataTransfer.files.length) {
    const file = e.dataTransfer.files[0];
    if (file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        addSubtitleAtTime(time, evt.target.result);
      };
      reader.readAsText(file);
      return;
    }
  }

  if (text) {
    addSubtitleAtTime(time, text.trim());
  } else {
    addSubtitleAtTime(time, "Phụ đề mới");
  }
}

function addSubtitleAtTime(time, text) {
  let t = parseFloat(time);
  if (isNaN(t) || !isFinite(t)) {
    t = videoPlayer ? videoPlayer.currentTime : 0;
  }
  const roundedStart = Math.round(t * 100) / 100;
  const duration = 3.0;
  const maxDur = (videoPlayer && videoPlayer.duration) ? videoPlayer.duration : (roundedStart + 3.0);
  const roundedEnd = Math.round(Math.min(roundedStart + duration, maxDur) * 100) / 100;
  addSubtitle(roundedStart, roundedEnd, text);
}

// ===== Settings & Translate =====
const btnOpenSettings = document.getElementById('btn-open-settings');
const settingsModal = document.getElementById('settings-modal');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnTestLlm = document.getElementById('btn-test-llm');
const settingsApiUrl = document.getElementById('settings-api-url');
const settingsModel = document.getElementById('settings-model');
const settingsSrcLang = document.getElementById('settings-src-lang');
const settingsDstLang = document.getElementById('settings-dst-lang');
const settingsTestResult = document.getElementById('settings-test-result');

async function loadSettings() {
  try {
    const res = await fetch(`${API}/api/settings`);
    const s = await res.json();
    if (settingsApiUrl) settingsApiUrl.value = s.api_url || 'http://localhost:8080';
    if (settingsModel) settingsModel.value = s.model || '';
    if (settingsSrcLang) settingsSrcLang.value = s.src_lang || '';
    if (settingsDstLang) settingsDstLang.value = s.dst_lang || 'vi';
  } catch (e) { console.error('Lỗi tải settings:', e); }
}

async function saveSettings() {
  const payload = {
    api_url: settingsApiUrl ? settingsApiUrl.value : 'http://localhost:8080',
    model: settingsModel ? settingsModel.value : '',
    src_lang: settingsSrcLang ? settingsSrcLang.value : '',
    dst_lang: settingsDstLang ? settingsDstLang.value : 'vi',
  };
  try {
    await fetch(`${API}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.error('Lỗi lưu settings:', e); }
}

if (btnOpenSettings) {
  btnOpenSettings.addEventListener('click', async () => {
    await loadSettings();
    if (settingsTestResult) settingsTestResult.style.display = 'none';
    if (settingsModal) settingsModal.style.display = 'flex';
  });
}

if (btnCancelSettings) {
  btnCancelSettings.addEventListener('click', () => {
    if (settingsModal) settingsModal.style.display = 'none';
  });
}

if (btnSaveSettings) {
  btnSaveSettings.addEventListener('click', async () => {
    await saveSettings();
    if (settingsModal) settingsModal.style.display = 'none';
  });
}

if (btnTestLlm) {
  btnTestLlm.addEventListener('click', async () => {
    const url = settingsApiUrl ? settingsApiUrl.value : 'http://localhost:8080';
    const model = settingsModel ? settingsModel.value : '';
    if (settingsTestResult) {
      settingsTestResult.style.display = 'block';
      settingsTestResult.textContent = 'Đang kiểm tra kết nối...';
      settingsTestResult.style.color = '#94a3b8';
    }
    try {
      const body = { messages: [{ role: 'user', content: 'Hi' }] };
      if (model) body.model = model;
      const res = await fetch(`${url.replace(/\/+$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || '(no content)';
      if (settingsTestResult) {
        settingsTestResult.textContent = `✅ Kết nối thành công! Phản hồi: "${reply.slice(0, 80)}..."`;
        settingsTestResult.style.color = '#10b981';
      }
      await saveSettings();
    } catch (e) {
      if (settingsTestResult) {
        settingsTestResult.textContent = `❌ Lỗi: ${e.message}`;
        settingsTestResult.style.color = '#fb7185';
      }
    }
  });
}

// Translate subtitle
window.translateSub = async function(idx) {
  if (!currentVideoId) return alert('Vui lòng mở dự án trước.');
  const sub = subtitles[idx];
  if (!sub || !sub.text.trim()) return;

  await loadSettings();
  const src = settingsSrcLang ? settingsSrcLang.value : '';
  const dst = settingsDstLang ? settingsDstLang.value : 'vi';

  const textarea = document.querySelector(`.sub-item[data-index="${idx}"] textarea`);
  const currentText = textarea ? textarea.value : sub.text;

  // --- Smart check: init, re-translate on lang change, or toggle ---

  // First time: save original + language
  if (textarea && !textarea.dataset.original) {
    textarea.dataset.original = currentText;
    textarea.dataset.originalPerm = currentText;
    textarea.dataset.originalSrc = src;
    textarea.dataset.originalDst = dst;
  }

  const prevSrc = textarea.dataset.originalSrc || '';
  const prevDst = textarea.dataset.originalDst || '';
  const langChanged = prevSrc !== src || prevDst !== dst;

  if (textarea && textarea.dataset.original && langChanged) {
    // Language changed → restore permanent original, re-translate
    textarea.dataset.original = textarea.dataset.originalPerm;
    textarea.value = textarea.dataset.originalPerm;
    textarea.dataset.originalSrc = src;
    textarea.dataset.originalDst = dst;
  } else if (textarea && textarea.dataset.original && textarea.value !== textarea.dataset.original) {
    // Same lang, already translated → toggle
    const temp = textarea.value;
    textarea.value = textarea.dataset.original;
    textarea.dataset.original = temp;
    sub.text = textarea.value;
    updateSubField({ target: textarea }, true);
    return;
  }

  const textToTranslate = textarea.dataset.originalPerm || currentText;
  const beforeText = textarea.value;

  textarea.disabled = true;
  textarea.value = 'Đang dịch...';

  try {
    const res = await fetch(`${API}/api/video/${currentVideoId}/translate-sub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textToTranslate, source_lang: src, target_lang: dst }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    const translated = data.translated;

    textarea.dataset.original = textToTranslate;
    textarea.value = translated;
    sub.text = translated;
    updateSubField({ target: textarea }, true);

    textarea.disabled = false;
  } catch (err) {
    console.error('Lỗi dịch:', err);
    textarea.value = beforeText;
    textarea.disabled = false;
    alert('Dịch thất bại: ' + err.message);
  }
};

// ==========================================================================
// YOUTUBE TAB
// ==========================================================================
const navYoutube = document.getElementById('nav-youtube');
const youtubeScreen = document.getElementById('youtube-screen');
const youtubeUrl = document.getElementById('youtube-url');
const btnYoutubeDownload = document.getElementById('btn-youtube-download');
const youtubeProgress = document.getElementById('youtube-progress');
const youtubeProgressText = document.getElementById('youtube-progress-text');
const youtubeProgressPct = document.getElementById('youtube-progress-pct');
const youtubeProgressFill = document.getElementById('youtube-progress-fill');
const youtubeInfo = document.getElementById('youtube-info');
const youtubeTitle = document.getElementById('youtube-title');
const youtubeDuration = document.getElementById('youtube-duration');
const youtubeActions = document.getElementById('youtube-actions');
const btnYoutubeTranscribe = document.getElementById('btn-youtube-transcribe');
const btnYoutubeEditor = document.getElementById('btn-youtube-editor');
const youtubePreview = document.getElementById('youtube-preview');
const youtubePreviewPlaceholder = document.getElementById('youtube-preview-placeholder');
const youtubeTranscribeProgress = document.getElementById('youtube-transcribe-progress');
const youtubeTranscribeText = document.getElementById('youtube-transcribe-text');
const youtubeTranscribeFill = document.getElementById('youtube-transcribe-fill');
const youtubeSubtitlesCard = document.getElementById('youtube-subtitles-card');
const youtubeSubtitlePreview = document.getElementById('youtube-subtitle-preview');
const youtubeSubCount = document.getElementById('youtube-sub-count');

let youtubeVideoId = null;
let youtubeTranscribeTaskId = null;

function showYouTubeScreen() {
  navYoutube.classList.add('active');
  navVideoEditor.classList.remove('active');
  navTts.classList.remove('active');
  navMusic.classList.remove('active');
  startScreen.style.display = 'none';
  workspaceScreen.style.display = 'none';
  ttsScreen.style.display = 'none';
  musicScreen.style.display = 'none';
  youtubeScreen.style.display = '';
}

navYoutube.addEventListener('click', showYouTubeScreen);

// YouTube download
btnYoutubeDownload.addEventListener('click', async () => {
  const url = youtubeUrl.value.trim();
  if (!url) {
    alert('Vui lòng nhập link YouTube');
    return;
  }

  btnYoutubeDownload.disabled = true;
  btnYoutubeDownload.textContent = 'Đang tải...';
  youtubeProgress.style.display = 'block';
  youtubeProgressText.textContent = 'Đang tải video...';
  youtubeProgressPct.textContent = '0%';
  youtubeProgressFill.style.width = '0%';
  youtubeInfo.style.display = 'none';
  youtubeActions.style.display = 'none';
  youtubeSubtitlesCard.style.display = 'none';
  youtubePreviewPlaceholder.style.display = 'flex';
  youtubePreview.style.display = 'none';

  const formData = new FormData();
  formData.append('url', url);

  try {
    const res = await fetch(`${API}/api/youtube-download`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    youtubeVideoId = data.id;

    youtubeProgressFill.style.width = '100%';
    youtubeProgressPct.textContent = '100%';
    youtubeProgressText.textContent = 'Tải xuống thành công!';

    // Show info
    youtubeInfo.style.display = 'block';
    youtubeTitle.textContent = data.title || 'Untitled';
    youtubeDuration.textContent = fmtDuration(data.duration);

    // Show preview
    const videoUrl = `${API}/api/download/${data.filename}`;
    youtubePreview.src = videoUrl;
    youtubePreview.load();
    youtubePreview.style.display = 'block';
    youtubePreviewPlaceholder.style.display = 'none';

    youtubeActions.style.display = 'flex';
    btnYoutubeDownload.disabled = false;
    btnYoutubeDownload.textContent = 'Tải xuống';

    setTimeout(() => {
      youtubeProgress.style.display = 'none';
    }, 2000);

  } catch (err) {
    console.error('YouTube download error:', err);
    youtubeProgressText.textContent = 'Lỗi: ' + err.message;
    youtubeProgressText.className = 'error-text';
    btnYoutubeDownload.disabled = false;
    btnYoutubeDownload.textContent = 'Tải xuống';
  }
});

// Auto-transcribe
btnYoutubeTranscribe.addEventListener('click', async () => {
  if (!youtubeVideoId) {
    alert('Chưa có video nào. Vui lòng tải video trước.');
    return;
  }

  btnYoutubeTranscribe.disabled = true;
  youtubeTranscribeProgress.style.display = 'block';
  youtubeTranscribeText.textContent = 'Đang tạo phụ đề...';
  youtubeTranscribeFill.style.width = '0%';

  try {
    const res = await fetch(`${API}/api/video/${youtubeVideoId}/transcribe`, {
      method: 'POST',
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const { task_id } = await res.json();
    youtubeTranscribeTaskId = task_id;

    // Poll for completion
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 600;
    const pollInterval = setInterval(async () => {
      pollAttempts++;
      try {
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          clearInterval(pollInterval);
          youtubeTranscribeText.textContent = 'Lỗi: Quá thời gian chờ';
          youtubeTranscribeText.className = 'error-text';
          btnYoutubeTranscribe.disabled = false;
          setTimeout(() => { youtubeTranscribeProgress.style.display = 'none'; }, 3000);
          return;
        }

        const statusRes = await fetch(`${API}/api/video/${youtubeVideoId}/transcribe-status?task_id=${task_id}`);
        if (!statusRes.ok) {
          clearInterval(pollInterval);
          youtubeTranscribeText.textContent = 'Lỗi: ' + `HTTP ${statusRes.status}`;
          youtubeTranscribeText.className = 'error-text';
          btnYoutubeTranscribe.disabled = false;
          setTimeout(() => { youtubeTranscribeProgress.style.display = 'none'; }, 3000);
          return;
        }
        const data = await statusRes.json();

        const progressVal = data.progress != null ? data.progress : 0;
        youtubeTranscribeFill.style.width = `${progressVal}%`;
        youtubeTranscribeText.textContent = data.message || `Đang tạo phụ đề... ${progressVal}%`;

        if (data.status === 'completed') {
          clearInterval(pollInterval);
          youtubeTranscribeFill.style.width = '100%';
          youtubeTranscribeText.textContent = 'Hoàn tất!';
          btnYoutubeTranscribe.disabled = false;

          if (data.subtitles && data.subtitles.length > 0) {
            youtubeSubtitlesCard.style.display = 'block';
            youtubeSubCount.textContent = `${data.subtitles.length} phụ đề`;

            youtubeSubtitlePreview.innerHTML = data.subtitles.map(sub => `
              <div class="youtube-sub-item">
                <span class="youtube-sub-time">${fmtDuration(sub.start)} - ${fmtDuration(sub.end)}</span>
                <span class="youtube-sub-text">${escHtml(sub.text)}</span>
              </div>
            `).join('');
          }

          setTimeout(() => {
            youtubeTranscribeProgress.style.display = 'none';
          }, 2000);

        } else if (data.status === 'failed') {
          clearInterval(pollInterval);
          youtubeTranscribeText.textContent = 'Lỗi: ' + (data.error || 'Lỗi không xác định');
          youtubeTranscribeText.className = 'error-text';
          btnYoutubeTranscribe.disabled = false;
          setTimeout(() => { youtubeTranscribeProgress.style.display = 'none'; }, 3000);
        }
      } catch (err) {
        clearInterval(pollInterval);
        console.error('Poll error:', err);
        youtubeTranscribeText.textContent = 'Lỗi kết nối: ' + err.message;
        youtubeTranscribeText.className = 'error-text';
        btnYoutubeTranscribe.disabled = false;
        setTimeout(() => { youtubeTranscribeProgress.style.display = 'none'; }, 3000);
      }
    }, 1000);

  } catch (err) {
    console.error('Transcribe error:', err);
    youtubeTranscribeText.textContent = 'Lỗi: ' + err.message;
    youtubeTranscribeText.className = 'error-text';
    btnYoutubeTranscribe.disabled = false;
  }
});

// Open in editor
btnYoutubeEditor.addEventListener('click', () => {
  if (!youtubeVideoId) {
    alert('Chưa có video nào.');
    return;
  }
  navYoutube.classList.remove('active');
  navVideoEditor.classList.add('active');
  selectVideo(youtubeVideoId);
});

// ==========================================================================
// TTS TAB
// ==========================================================================
const navVideoEditor = document.getElementById('nav-video-editor');
const navTts = document.getElementById('nav-tts');
const ttsScreen = document.getElementById('tts-screen');
const ttsTextInput = document.getElementById('tts-text-input');
const btnTtsLoadTxt = document.getElementById('btn-tts-load-txt');
const ttsTxtInput = document.getElementById('tts-txt-input');
const ttsFileName = document.getElementById('tts-file-name');
const ttsRefAudioInput = document.getElementById('tts-ref-audio-input');
const btnTtsUploadRef = document.getElementById('btn-tts-upload-ref');
const ttsRefStatus = document.getElementById('tts-ref-status');
const ttsTemperature = document.getElementById('tts-temperature');
const ttsTempVal = document.getElementById('tts-temp-val');
const ttsTopK = document.getElementById('tts-top-k');
const ttsMaxTokens = document.getElementById('tts-max-tokens');
const btnTtsGenerate = document.getElementById('btn-tts-generate');
const ttsProgress = document.getElementById('tts-progress');
const ttsProgressText = document.getElementById('tts-progress-text');
const ttsProgressFill = document.getElementById('tts-progress-fill');
const ttsResult = document.getElementById('tts-result');
const ttsAudioPlayer = document.getElementById('tts-audio-player');
const ttsDownloadLink = document.getElementById('tts-download-link');

function showVideoEditorScreen() {
  navVideoEditor.classList.add('active');
  navTts.classList.remove('active');
  navYoutube.classList.remove('active');
  navMusic.classList.remove('active');
  ttsScreen.style.display = 'none';
  musicScreen.style.display = 'none';
  youtubeScreen.style.display = 'none';
  startScreen.style.display = '';
  workspaceScreen.style.display = 'none';
}

function showTTSScreen() {
  navTts.classList.add('active');
  navVideoEditor.classList.remove('active');
  navYoutube.classList.remove('active');
  navMusic.classList.remove('active');
  startScreen.style.display = 'none';
  workspaceScreen.style.display = 'none';
  musicScreen.style.display = 'none';
  youtubeScreen.style.display = 'none';
  ttsScreen.style.display = '';
}

navVideoEditor.addEventListener('click', showVideoEditorScreen);
navTts.addEventListener('click', showTTSScreen);

// Load .txt file into textarea
btnTtsLoadTxt.addEventListener('click', () => ttsTxtInput.click());
ttsTxtInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    ttsTextInput.value = ev.target.result;
    ttsFileName.textContent = file.name;
    ttsFileName.style.color = 'var(--text-secondary)';
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});

// Temperature slider display
ttsTemperature.addEventListener('input', () => {
  ttsTempVal.textContent = parseFloat(ttsTemperature.value).toFixed(2);
});

// Upload reference audio for TTS
let ttsRefAudioUploaded = false;
if (btnTtsUploadRef) {
  btnTtsUploadRef.addEventListener('click', async () => {
    const file = ttsRefAudioInput.files[0];
    if (!file) {
      ttsRefStatus.textContent = 'Vui lòng chọn file audio trước';
      ttsRefStatus.className = 'ref-audio-status error';
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    ttsRefStatus.textContent = 'Đang tải lên...';
    ttsRefStatus.className = 'ref-audio-status loading';
    btnTtsUploadRef.disabled = true;
    try {
      const res = await fetch(`${API}/api/tts/ref-audio`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errBody}`);
      }
      const data = await res.json();
      ttsRefAudioUploaded = true;
      ttsRefStatus.textContent = '✓ Đã tải giọng mẫu thành công';
      ttsRefStatus.className = 'ref-audio-status success';
      ttsRefAudioInput.value = '';
    } catch (err) {
      console.error('Lỗi upload ref audio:', err);
      ttsRefStatus.textContent = '✗ Tải lên thất bại: ' + err.message;
      ttsRefStatus.className = 'ref-audio-status error';
    } finally {
      btnTtsUploadRef.disabled = false;
    }
  });
}

function showEl(el) {
  el.style.removeProperty('display');
}

function hideEl(el) {
  el.style.display = 'none';
}

// Generate TTS
btnTtsGenerate.addEventListener('click', async () => {
  const text = ttsTextInput.value.trim();
  if (!text) {
    alert('Vui lòng nhập văn bản cần chuyển thành giọng nói');
    return;
  }
  hideEl(ttsResult);
  showEl(ttsProgress);
  ttsProgressFill.style.width = '0%';
  ttsProgressFill.classList.remove('animated-stripes');
  ttsProgressText.textContent = 'Đang tạo giọng nói... 0%';
  ttsProgressText.className = '';
  btnTtsGenerate.disabled = true;
  try {
    const res = await fetch(`${API}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        temperature: parseFloat(ttsTemperature.value),
        top_k: parseInt(ttsTopK.value) || 50,
        top_p: 1.0,
        max_tokens: parseInt(ttsMaxTokens.value) || 3000,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `HTTP ${res.status}`);
    }
    const { task_id } = await res.json();
    let pollAttempts = 0;
    const MAX_POLL_ATTEMPTS = 600;
    const pollInterval = setInterval(async () => {
      pollAttempts++;
      try {
        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          clearInterval(pollInterval);
          ttsProgressText.textContent = 'Lỗi: Quá thời gian chờ';
          ttsProgressText.className = 'error-text';
          ttsProgressFill.style.width = '0%';
          btnTtsGenerate.disabled = false;
          return;
        }

        const statusRes = await fetch(`${API}/api/tts/synthesize/${task_id}/status`);
        if (!statusRes.ok) {
          clearInterval(pollInterval);
          ttsProgressText.textContent = 'Lỗi: ' + `HTTP ${statusRes.status}`;
          ttsProgressText.className = 'error-text';
          ttsProgressFill.style.width = '0%';
          btnTtsGenerate.disabled = false;
          return;
        }
        const data = await statusRes.json();
        if (data.status === "processing") {
          const pct = data.progress != null ? data.progress : 0;
          ttsProgressFill.style.width = `${pct}%`;
          ttsProgressText.textContent = `Đang tạo giọng nói... ${pct}%`;
        } else if (data.status === "completed") {
          clearInterval(pollInterval);
          ttsProgressFill.style.width = '100%';
          ttsProgressText.textContent = 'Đang tạo giọng nói... 100%';
          const audioUrl = `${API}${data.audio_url}`;
          ttsAudioPlayer.src = audioUrl;
          ttsAudioPlayer.load();
          ttsDownloadLink.href = audioUrl;
          showEl(ttsResult);
          hideEl(ttsProgress);
          btnTtsGenerate.disabled = false;
        } else if (data.status === "failed") {
          clearInterval(pollInterval);
          ttsProgressText.textContent = 'Lỗi: ' + (data.error || 'Lỗi không xác định');
          ttsProgressText.className = 'error-text';
          ttsProgressFill.style.width = '0%';
          btnTtsGenerate.disabled = false;
        }
      } catch (err) {
        clearInterval(pollInterval);
        console.error('TTS poll error:', err);
        ttsProgressText.textContent = 'Lỗi kết nối: ' + err.message;
        ttsProgressText.className = 'error-text';
        ttsProgressFill.style.width = '0%';
        btnTtsGenerate.disabled = false;
      }
    }, 500);
  } catch (err) {
    console.error('Lỗi TTS:', err);
    ttsProgressText.textContent = 'Lỗi: ' + err.message;
    ttsProgressText.className = 'error-text';
    ttsProgressFill.style.width = '0%';
    btnTtsGenerate.disabled = false;
  }
});

// ==========================================================================
// MUSIC VIDEO TAB
// ==========================================================================
const navMusic = document.getElementById('nav-music');
const musicScreen = document.getElementById('music-screen');

const musicImageZone = document.getElementById('music-image-zone');
const musicImageInput = document.getElementById('music-image-input');
const musicThumbnails = document.getElementById('music-thumbnails');
const musicAudioZone = document.getElementById('music-audio-zone');
const musicAudioInput = document.getElementById('music-audio-input');
const musicAudioInfo = document.getElementById('music-audio-info');
const musicAudioName = document.getElementById('music-audio-name');
const musicAudioPlayer = document.getElementById('music-audio-player');
const musicWaveGrid = document.getElementById('music-wave-grid');
const musicCanvas = document.getElementById('music-canvas');
const musicHint = document.getElementById('music-hint');
const btnMusicPlay = document.getElementById('btn-music-play');
const btnMusicPlayText = document.getElementById('btn-music-play-text');
const btnMusicExport = document.getElementById('btn-music-export');
const btnMusicReset = document.getElementById('btn-music-reset');
const musicExportProgress = document.getElementById('music-export-progress');
const musicExportText = document.getElementById('music-export-text');
const musicExportFill = document.getElementById('music-export-fill');

const musicState = {
  images: [],
  audioFile: null,
  audioUrl: null,
  audioCtx: null,
  analyser: null,
  source: null,
  gainNode: null,
  audioElement: null,
  freqArray: null,
  timeArray: null,
  styleId: 0,
  isPlaying: false,
  isRecording: false,
  animFrameId: null,
  mediaRecorder: null,
  recordedChunks: [],
  canvasReady: false,
  currentImageIdx: 0,
  imageTransition: 0,
  cachedImages: [],
  waveRect: { x: 0, y: 0.5, w: 1, h: 0.5 },
  isDraggingWave: false,
  isResizingWave: false,
  resizeHandle: null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartRect: null
};

const POSTCARD_COLORS = {
  cream: '#FDF6E3', ivory: '#F5F0E8', sepia: '#8B7355',
  terracotta: '#E07A5F', dustyRose: '#DBA5A0', teal: '#3D5A80',
  navy: '#1B2838', mustard: '#E6B956', sage: '#81A691',
  peach: '#F4A261', blush: '#F4D0C5', sunset: '#2D1B69',
};

const WAVE_STYLES = [
  { id: 0, name: 'Vintage Bars', icon: 'vbars' },
  { id: 1, name: 'Signature Line', icon: 'sig' },
  { id: 2, name: 'Satin Ribbon', icon: 'ribbon' },
  { id: 3, name: 'Postmark', icon: 'stamp' },
  { id: 4, name: 'Neon Retro', icon: 'neon' },
  { id: 5, name: 'Confetti', icon: 'confetti' },
  { id: 6, name: 'Sunset', icon: 'sunset' },
  { id: 7, name: 'Ocean Wave', icon: 'ocean' },
  { id: 8, name: 'Circular Orbit', icon: 'orbit' },
  { id: 9, name: 'Matrix Drops', icon: 'matrix' },
  { id: 10, name: 'Cyber Polygon', icon: 'polygon' },
  { id: 11, name: '3D Blocks', icon: 'block3d' },
];

// --- Tab switching ---
function showMusicScreen() {
  navMusic.classList.add('active');
  navVideoEditor.classList.remove('active');
  navTts.classList.remove('active');
  navYoutube.classList.remove('active');
  startScreen.style.display = 'none';
  workspaceScreen.style.display = 'none';
  ttsScreen.style.display = 'none';
  youtubeScreen.style.display = 'none';
  musicScreen.style.display = '';
  if (!musicState.canvasReady) {
    resizeMusicCanvas();
    musicState.canvasReady = true;
  }
  renderWaveStyles();
  renderMusicThumbnails();
}

// Update existing show functions to hide music and youtube screens
const origShowVideoEditor = showVideoEditorScreen;
showVideoEditorScreen = function() {
  navVideoEditor.classList.add('active');
  navTts.classList.remove('active');
  navYoutube.classList.remove('active');
  navMusic.classList.remove('active');
  ttsScreen.style.display = 'none';
  musicScreen.style.display = 'none';
  youtubeScreen.style.display = 'none';
  startScreen.style.display = '';
  workspaceScreen.style.display = 'none';
};

const origShowTTS = showTTSScreen;
showTTSScreen = function() {
  navTts.classList.add('active');
  navVideoEditor.classList.remove('active');
  navYoutube.classList.remove('active');
  navMusic.classList.remove('active');
  startScreen.style.display = 'none';
  workspaceScreen.style.display = 'none';
  musicScreen.style.display = 'none';
  youtubeScreen.style.display = 'none';
  ttsScreen.style.display = '';
};

navMusic.addEventListener('click', showMusicScreen);

function resizeMusicCanvas() {
  const rect = musicCanvas.parentElement.getBoundingClientRect();
  const w = Math.floor(rect.width * 2);
  const h = Math.floor(w / 16 * 9);
  musicCanvas.width = w;
  musicCanvas.height = h;
}

// --- Wave style selector ---
function renderWaveStyles() {
  musicWaveGrid.innerHTML = WAVE_STYLES.map(s => {
    let icon = '';
    switch (s.icon) {
      case 'vbars':
        const hs = [55, 85, 40, 75, 45];
        icon = hs.map(h => `<span style="height:${h}%;background:#E07A5F;border-radius:2px 2px 0 0"></span>`).join('');
        break;
      case 'sig':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 24 Q10 14 20 20 T40 16 T60 18" stroke="#8B7355" fill="none" stroke-width="2" stroke-linecap="round"/></svg>';
        break;
      case 'ribbon':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 18 Q10 8 20 16 T40 10 T60 18" stroke="#DBA5A0" fill="#F4D0C5" stroke-width="1"/><path d="M0 18 Q10 28 20 20 T40 26 T60 18" stroke="#E07A5F" fill="#F4D0C5" stroke-width="1"/></svg>';
        break;
      case 'stamp':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><circle cx="18" cy="18" r="12" stroke="#8B7355" fill="none" stroke-width="2" stroke-dasharray="3 3"/><circle cx="18" cy="18" r="7" stroke="#3D5A80" fill="none" stroke-width="1.5"/><circle cx="18" cy="18" r="2" fill="#1B2838"/></svg>';
        break;
      case 'neon':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><line x1="4" y1="30" x2="4" y2="20" stroke="#F4A261" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="30" x2="12" y2="6" stroke="#E07A5F" stroke-width="2" stroke-linecap="round"/><line x1="20" y1="30" x2="20" y2="14" stroke="#F4A261" stroke-width="2" stroke-linecap="round"/><line x1="28" y1="30" x2="28" y2="4" stroke="#E07A5F" stroke-width="2" stroke-linecap="round"/><line x1="36" y1="30" x2="36" y2="10" stroke="#F4A261" stroke-width="2" stroke-linecap="round"/><line x1="44" y1="30" x2="44" y2="16" stroke="#E07A5F" stroke-width="2" stroke-linecap="round"/><line x1="52" y1="30" x2="52" y2="8" stroke="#F4A261" stroke-width="2" stroke-linecap="round"/></svg>';
        break;
      case 'confetti':
        let dots = '';
        for (let i = 0; i < 10; i++) {
          const x = 3 + i * 6, y = 8 + Math.sin(i * 1.8) * 10;
          const colors = ['#E07A5F','#E6B956','#DBA5A0','#81A691','#F4A261'];
          dots += `<circle cx="${x}" cy="${y + 8}" r="${1.5 + (i % 3) * 0.5}" fill="${colors[i % 5]}"/>`;
        }
        icon = `<svg viewBox="0 0 60 36" style="width:100%;height:100%">${dots}</svg>`;
        break;
      case 'sunset':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 30 Q10 14 20 22 Q30 8 40 20 Q50 12 60 24 L60 36 L0 36Z" fill="#E07A5F"/><circle cx="45" cy="14" r="4" fill="#FEF08A"/></svg>';
        break;
      case 'ocean':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 24 Q15 18 30 24 Q45 30 60 24" stroke="#3D5A80" fill="none" stroke-width="2"/><path d="M0 28 Q15 22 30 28 Q45 34 60 28" stroke="#DBA5A0" fill="none" stroke-width="1.5"/></svg>';
        break;
      case 'orbit':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><circle cx="18" cy="18" r="10" stroke="#F4A261" fill="none" stroke-width="2" stroke-dasharray="2 4"/><circle cx="18" cy="18" r="5" fill="#E07A5F"/></svg>';
        break;
      case 'matrix':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><line x1="10" y1="4" x2="10" y2="16" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/><line x1="25" y1="10" x2="25" y2="30" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/><line x1="40" y1="2" x2="40" y2="20" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/><line x1="50" y1="15" x2="50" y2="32" stroke="#22c55e" stroke-width="2" stroke-linecap="round"/></svg>';
        break;
      case 'polygon':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><polygon points="18,4 32,14 26,30 10,30 4,14" stroke="#06b6d4" fill="none" stroke-width="2"/><polygon points="18,8 28,15 24,26 12,26 8,15" stroke="#d946ef" fill="rgba(217,70,239,0.3)" stroke-width="1"/></svg>';
        break;
      case 'block3d':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M10,25 L20,25 L25,20 L15,20 Z" fill="#F4A261"/><path d="M20,25 L20,15 L25,10 L25,20 Z" fill="#E07A5F"/><rect x="10" y="15" width="10" height="10" fill="#E6B956"/><path d="M30,25 L40,25 L45,20 L35,20 Z" fill="#4ade80"/><path d="M40,25 L40,8 L45,3 L45,20 Z" fill="#16a34a"/><rect x="30" y="8" width="10" height="17" fill="#22c55e"/></svg>';
        break;
    }
    return `
      <div class="wave-style-card ${s.id === musicState.styleId ? 'active' : ''}" data-style="${s.id}">
        <div class="wave-icon">${icon}</div>
        <div class="wave-label">${s.name}</div>
      </div>
    `;
  }).join('');
  musicWaveGrid.querySelectorAll('.wave-style-card').forEach(el => {
    el.addEventListener('click', () => {
      musicWaveGrid.querySelectorAll('.wave-style-card').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      musicState.styleId = parseInt(el.dataset.style);
    });
  });
}

// --- Image Management ---
const musicCanvasWrapper = document.querySelector('.music-canvas-wrapper');
musicCanvasWrapper.addEventListener('dragover', (e) => {
  e.preventDefault();
  musicCanvasWrapper.classList.add('dragover');
});
musicCanvasWrapper.addEventListener('dragleave', () => {
  musicCanvasWrapper.classList.remove('dragover');
});
musicCanvasWrapper.addEventListener('drop', (e) => {
  e.preventDefault();
  musicCanvasWrapper.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    const images = [];
    let audioFile = null;
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      const f = e.dataTransfer.files[i];
      if (f.type.startsWith('image/')) images.push(f);
      if (f.type.startsWith('audio/')) audioFile = f;
    }
    if (images.length > 0) addMusicImages(images);
    if (audioFile) loadMusicAudio(audioFile);
  }
});

musicImageZone.addEventListener('click', () => musicImageInput.click());
musicImageZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  musicImageZone.classList.add('dragover');
});
musicImageZone.addEventListener('dragleave', () => {
  musicImageZone.classList.remove('dragover');
});
musicImageZone.addEventListener('drop', (e) => {
  e.preventDefault();
  musicImageZone.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    addMusicImages(e.dataTransfer.files);
  }
});
musicImageInput.addEventListener('change', () => {
  if (musicImageInput.files.length) {
    addMusicImages(musicImageInput.files);
    musicImageInput.value = '';
  }
});

function addMusicImages(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    musicState.images.push({ file, url, name: file.name });
    musicState.cachedImages.push(img);
  }
  renderMusicThumbnails();
  updateMusicButtons();
}

function removeMusicImage(idx) {
  URL.revokeObjectURL(musicState.images[idx].url);
  musicState.images.splice(idx, 1);
  musicState.cachedImages.splice(idx, 1);
  renderMusicThumbnails();
  updateMusicButtons();
}

function renderMusicThumbnails() {
  if (!musicState.images.length) {
    musicThumbnails.style.display = 'none';
    return;
  }
  musicThumbnails.style.display = 'flex';
  musicThumbnails.innerHTML = musicState.images.map((img, i) => `
    <div class="music-thumb-item" draggable="true" data-idx="${i}">
      <img src="${img.url}" alt="${img.name}">
      <button class="thumb-del" data-idx="${i}">✕</button>
    </div>
  `).join('');

  musicThumbnails.querySelectorAll('.thumb-del').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeMusicImage(parseInt(btn.dataset.idx));
    });
  });

  // Basic drag reorder
  let dragSrc = null;
  musicThumbnails.querySelectorAll('.music-thumb-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      dragSrc = parseInt(el.dataset.idx);
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    el.addEventListener('dragover', (e) => e.preventDefault());
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const to = parseInt(el.dataset.idx);
      if (dragSrc !== null && dragSrc !== to) {
        const [item] = musicState.images.splice(dragSrc, 1);
        musicState.images.splice(to, 0, item);
        const [cached] = musicState.cachedImages.splice(dragSrc, 1);
        musicState.cachedImages.splice(to, 0, cached);
        renderMusicThumbnails();
      }
    });
  });
}

// --- Audio Management ---
musicAudioZone.addEventListener('click', () => musicAudioInput.click());
musicAudioInput.addEventListener('change', () => {
  if (musicAudioInput.files.length) {
    loadMusicAudio(musicAudioInput.files[0]);
    musicAudioInput.value = '';
  }
});

function loadMusicAudio(file) {
  if (musicState.audioUrl) {
    URL.revokeObjectURL(musicState.audioUrl);
  }
  musicState.audioFile = file;
  musicState.audioUrl = URL.createObjectURL(file);
  musicAudioPlayer.src = musicState.audioUrl;
  musicAudioName.textContent = file.name;
  musicAudioInfo.style.display = 'block';
  initWebAudio();
  updateMusicButtons();
}

let _webAudioInited = false;
function initWebAudio() {
  if (_webAudioInited) return;
  _webAudioInited = true;
  musicState.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  musicState.analyser = musicState.audioCtx.createAnalyser();
  musicState.analyser.fftSize = 256;
  musicState.gainNode = musicState.audioCtx.createGain();
  musicState.gainNode.gain.value = 1.0;
  musicState.source = musicState.audioCtx.createMediaElementSource(musicAudioPlayer);
  musicState.source.connect(musicState.analyser);
  musicState.analyser.connect(musicState.gainNode);
  musicState.gainNode.connect(musicState.audioCtx.destination);
  musicState.freqArray = new Uint8Array(musicState.analyser.frequencyBinCount);
  musicState.timeArray = new Uint8Array(musicState.analyser.frequencyBinCount);
}

function updateMusicButtons() {
  const hasAudio = musicState.audioFile !== null;
  const hasImages = musicState.images.length > 0;
  btnMusicPlay.disabled = !(hasAudio && hasImages);
  btnMusicExport.disabled = !(hasAudio && hasImages);
}

// --- Canvas Drawing (8 postcard styles) ---
function drawVintageBars(ctx, w, h, freqData, timeData, time, dur) {
  const barCount = freqData.length;
  const barW = w / barCount;
  // ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < barCount; i++) {
    const val = freqData[i] / 255;
    const barH = val * h * 0.7;
    const x = i * barW;
    const y = h - barH;
    const r = Math.floor(180 + val * 75);
    const g = Math.floor(90 + val * 30);
    const b = Math.floor(60 - val * 20);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    const radius = Math.min(barW * 0.3, 6);
    const bw = Math.max(2, barW - 3);
    ctx.beginPath();
    ctx.roundRect(x + 1.5, y, bw, barH, [radius, radius, 0, 0]);
    ctx.fill();
  }
}

function drawSignatureLine(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const len = timeData.length;
  ctx.beginPath();
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const damp = Math.sin((i / (len - 1)) * Math.PI);
    const val = ((timeData[i] / 255) - 0.5) * damp;
    const y = h / 2 + val * h * 0.3;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawSatinRibbon(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const len = timeData.length;
  const mid = h / 2;
  ctx.beginPath();
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const damp = Math.sin((i / (len - 1)) * Math.PI);
    const val = ((timeData[i] / 255) - 0.5) * damp;
    const y = mid + val * h * 0.25;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(w, mid);
  ctx.lineTo(0, mid);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, mid - h * 0.25, 0, mid + h * 0.25);
  grad.addColorStop(0, '#DBA5A0');
  grad.addColorStop(0.5, '#F4D0C5');
  grad.addColorStop(1, '#E07A5F');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = '#E07A5F';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawPostmark(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.3;
  const count = freqData.length;
  // Dotted circle border
  ctx.save();
  ctx.translate(cx, cy);
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = '#8B7355';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius + 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // Inner ring
  ctx.beginPath();
  ctx.arc(0, 0, radius + 8, 0, Math.PI * 2);
  ctx.strokeStyle = '#E6B956';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Radial bars
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const val = freqData[i] / 255;
    const barLen = val * radius * 0.7;
    ctx.fillStyle = '#3D5A80';
    ctx.save();
    ctx.rotate(angle);
    ctx.fillRect(radius - barLen, -1.5, barLen, 3);
    ctx.restore();
  }
  // Center circle
  ctx.beginPath();
  ctx.arc(0, 0, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#1B2838';
  ctx.fill();
  ctx.restore();
}

function drawNeonRetro(ctx, w, h, freqData, timeData, time, dur) {
  const barCount = freqData.length;
  const barW = w / barCount;
  for (let i = 0; i < barCount; i++) {
    const val = freqData[i] / 255;
    const barH = val * h * 0.6;
    const x = i * barW;
    const y = h - barH;
    
    // Draw the vertical semi-transparent body so it looks grounded to 0
    ctx.fillStyle = 'rgba(224, 122, 95, 0.2)';
    ctx.fillRect(x + 2, y + 3, Math.max(1, barW - 4), barH);

    // Draw the glowing top cap
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#E07A5F';
    ctx.fillStyle = '#F4A261';
    ctx.fillRect(x + 2, y, Math.max(1, barW - 4), 3);
    
    if (val > 0.3) {
      ctx.fillStyle = '#E07A5F';
      ctx.shadowColor = '#E07A5F';
      ctx.shadowBlur = 25;
      ctx.fillRect(x + 1, y - 2, Math.max(1, barW - 2), 2);
    }
    ctx.shadowBlur = 0;
  }
}

function drawConfetti(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const len = timeData.length;
  const colors = ['#E07A5F', '#E6B956', '#DBA5A0', '#81A691', '#F4A261', '#F4D0C5'];
  for (let i = 0; i < len; i++) {
    const val = timeData[i] / 255;
    const x = (i / len) * w;
    const y = val * h;
    const size = 3 + (freqData[Math.floor(i / len * freqData.length)] / 255) * 8;
    const hue = (i * 37 + time * 60) % 360;
    ctx.globalAlpha = 0.4 + (val * 0.5);
    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    if (i % 3 === 0) {
      // Circles
      ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
    } else if (i % 3 === 1) {
      // Squares
      ctx.fillRect(x - size * 0.4, y - size * 0.4, size * 0.8, size * 0.8);
    } else {
      // Triangles
      ctx.moveTo(x, y - size * 0.5);
      ctx.lineTo(x - size * 0.5, y + size * 0.5);
      ctx.lineTo(x + size * 0.5, y + size * 0.5);
      ctx.closePath();
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSunset(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const len = timeData.length;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#2D1B69');
  grad.addColorStop(0.3, '#E07A5F');
  grad.addColorStop(0.6, '#F4A261');
  grad.addColorStop(1, '#E6B956');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const damp = Math.sin((i / (len - 1)) * Math.PI);
    const dev = ((timeData[i] / 255) - 0.5) * 0.5 * damp;
    const val = 0.5 + dev;
    const y = h - val * h * 0.8;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Sun circle
  const sunY = h * 0.3;
  const sunR = Math.min(w, h) * 0.04;
  ctx.beginPath();
  ctx.arc(w * 0.75, sunY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = '#FEF08A';
  ctx.shadowBlur = 30;
  ctx.shadowColor = '#F4A261';
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawOceanWave(ctx, w, h, freqData, timeData, time, dur) {
  // ctx.clearRect(0, 0, w, h);
  const t = time || 0;
  const len = timeData.length;
  // Wave line
  ctx.beginPath();
  ctx.moveTo(0, h * 0.6);
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const damp = Math.sin((i / (len - 1)) * Math.PI);
    const val = freqData[Math.floor((i / len) * freqData.length)] / 255;
    const wave = Math.sin((i / len) * 10 + t * 1.5) * 15;
    const y = h * 0.6 + (val * 40 + wave) * damp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, h * 0.4, 0, h);
  grad.addColorStop(0, 'rgba(61, 90, 128, 0.7)');
  grad.addColorStop(0.5, 'rgba(27, 40, 56, 0.5)');
  grad.addColorStop(1, 'rgba(129, 166, 145, 0.3)');
  ctx.fillStyle = grad;
  ctx.fill();
  // Second wave
  ctx.beginPath();
  ctx.moveTo(0, h * 0.7);
  for (let i = 0; i < len; i++) {
    const x = (i / len) * w;
    const damp = Math.sin((i / (len - 1)) * Math.PI);
    const dev = ((timeData[i] / 255) - 0.5) * 0.5 * damp;
    const val = 0.25 + dev;
    const wave = Math.cos((i / len) * 8 + t * 2) * 12;
    const y = h * 0.7 + val * 30 + wave * damp;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad2 = ctx.createLinearGradient(0, h * 0.5, 0, h);
  grad2.addColorStop(0, 'rgba(219, 165, 160, 0.5)');
  grad2.addColorStop(1, 'rgba(244, 208, 197, 0.2)');
  ctx.fillStyle = grad2;
  ctx.fill();
}

function drawPostcardBorder(ctx, w, h) {
  const m = 16;
  ctx.strokeStyle = '#F5F0E8';
  ctx.lineWidth = 3;
  ctx.shadowBlur = 6;
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.strokeRect(m, m, w - m * 2, h - m * 2);
  ctx.shadowBlur = 0;
  // Inner thin line
  ctx.strokeStyle = 'rgba(139, 115, 85, 0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(m + 4, m + 4, w - m * 2 - 8, h - m * 2 - 8);
}

function drawCircularOrbit(ctx, w, h, freqData, timeData, time, dur) {
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.25;
  const count = freqData.length;
  
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.5); // Slow rotation
  
  // Outer orbit
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.5, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(244, 162, 97, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Inner lines
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const val = freqData[i] / 255;
    const barLen = val * radius * 1.2;
    
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(radius + barLen, 0);
    ctx.strokeStyle = `hsl(${(i/count)*360 + time*50}, 80%, 60%)`;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.stroke();
    
    // Draw dot at the end
    if (val > 0.1) {
      ctx.beginPath();
      ctx.arc(radius + barLen + 4, 0, 2 + val*3, 0, Math.PI*2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
    ctx.restore();
  }
  
  // Center pulse
  const avg = freqData.reduce((a,b)=>a+b, 0) / count;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.5 + (avg/255)*radius*0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(224, 122, 95, 0.8)';
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#E07A5F';
  ctx.fill();
  
  ctx.restore();
}

function drawMatrixDrops(ctx, w, h, freqData, timeData, time, dur) {
  const barCount = freqData.length;
  const barW = w / barCount;
  
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#22c55e';
  ctx.lineCap = 'round';
  
  for (let i = 0; i < barCount; i++) {
    const val = freqData[i] / 255;
    const x = i * barW + barW/2;
    
    // Create a falling effect using time and index
    const fall = (time * 150 + i * 25) % h;
    const height = val * h * 0.8 + 10;
    
    let y1 = fall - height;
    let y2 = fall;
    
    // Wrap around screen
    if (y1 < 0) {
      ctx.beginPath();
      ctx.moveTo(x, h + y1);
      ctx.lineTo(x, h);
      ctx.strokeStyle = `rgba(34, 197, 94, ${0.5 + val*0.5})`;
      ctx.lineWidth = Math.max(1, barW * 0.4);
      ctx.stroke();
      y1 = 0;
    }
    
    ctx.beginPath();
    ctx.moveTo(x, y1);
    ctx.lineTo(x, y2);
    ctx.strokeStyle = `rgba(34, 197, 94, ${0.5 + val*0.5})`;
    ctx.lineWidth = Math.max(1, barW * 0.4);
    ctx.stroke();
    
    // Bright tip
    ctx.beginPath();
    ctx.arc(x, y2, Math.max(1, barW * 0.3), 0, Math.PI*2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawCyberPolygon(ctx, w, h, freqData, timeData, time, dur) {
  const cx = w / 2, cy = h / 2;
  const radius = Math.min(w, h) * 0.3;
  
  // Number of polygon sides based on frequency points (reduced for clarity)
  const sides = 16; 
  const step = Math.floor(freqData.length / sides);
  
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * -0.2); // slowly rotate
  
  // Function to draw a dynamic polygon
  const drawPoly = (scale, color, shadow, width) => {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const val = freqData[i * step] / 255;
      const r = radius * scale + val * radius * 0.5;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowBlur = 15;
    ctx.shadowColor = shadow;
    ctx.stroke();
  };

  // Multiple layers
  drawPoly(1.0, '#06b6d4', '#06b6d4', 3);  // Cyan outer
  drawPoly(0.7, '#d946ef', '#d946ef', 2);  // Magenta middle
  drawPoly(0.4, '#fbbf24', '#fbbf24', 1);  // Yellow inner
  
  // Connection lines to center
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const val = freqData[i * step] / 255;
    if (val > 0.4) {
      const r = radius + val * radius * 0.5;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();
}

function draw3DBlocks(ctx, w, h, freqData, timeData, time, dur) {
  const barCount = Math.min(freqData.length, 64);
  const spacing = w / barCount;
  const barW = spacing * 0.55;
  const depth = barW * 0.8;
  
  for (let i = 0; i < barCount; i++) {
    const val = freqData[i] / 255;
    const barH = Math.max(5, val * h * 0.6);
    const x = i * spacing + (spacing - barW) / 2;
    const y = h * 0.8;

    const hue = (i / barCount) * 360 + time * 60;
    const frontColor = `hsl(${hue}, 80%, 60%)`;
    const topColor = `hsl(${hue}, 80%, 75%)`;
    const sideColor = `hsl(${hue}, 80%, 45%)`;

    ctx.fillStyle = sideColor;
    ctx.beginPath();
    ctx.moveTo(x + barW, y);
    ctx.lineTo(x + barW + depth, y - depth);
    ctx.lineTo(x + barW + depth, y - barH - depth);
    ctx.lineTo(x + barW, y - barH);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = topColor;
    ctx.beginPath();
    ctx.moveTo(x, y - barH);
    ctx.lineTo(x + barW, y - barH);
    ctx.lineTo(x + barW + depth, y - barH - depth);
    ctx.lineTo(x + depth, y - barH - depth);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = frontColor;
    ctx.fillRect(x, y - barH, barW, barH);
  }
}

const DRAW_FUNCTIONS = [
  drawVintageBars, drawSignatureLine, drawSatinRibbon, drawPostmark,
  drawNeonRetro, drawConfetti, drawSunset, drawOceanWave,
  drawCircularOrbit, drawMatrixDrops, drawCyberPolygon,
  draw3DBlocks,
];

// --- Animation Loop ---
function animateMusic() {
  if (!musicState.isPlaying && !musicState.isRecording) {
    musicState.animFrameId = null;
    return;
  }
  musicState.animFrameId = requestAnimationFrame(animateMusic);

  if (musicState.analyser) {
    musicState.analyser.getByteFrequencyData(musicState.freqArray);
    musicState.analyser.getByteTimeDomainData(musicState.timeArray);
  }

  const ctx = musicCanvas.getContext('2d');
  const w = musicCanvas.width;
  const h = musicCanvas.height;

  // Draw background image
  if (musicState.cachedImages.length > 0) {
    const imgIdx = getCurrentImageIndex();
    const img = musicState.cachedImages[imgIdx];
    if (img && img.complete) {
      ctx.drawImage(img, 0, 0, w, h);
    }
  } else {
    ctx.fillStyle = '#0e0e15';
    ctx.fillRect(0, 0, w, h);
  }

  // Draw current time
  const currentTime = musicAudioPlayer.currentTime || 0;
  const duration = musicAudioPlayer.duration || 1;

  // Draw wave overlay
  const drawFn = DRAW_FUNCTIONS[musicState.styleId] || DRAW_FUNCTIONS[0];
  const wr = musicState.waveRect;
  const wx = wr.x * w;
  const wy = wr.y * h;
  const ww = wr.w * w;
  const wh = wr.h * h;

  ctx.save();
  ctx.translate(wx, wy);
  
  let freq = musicState.freqArray;
  let timeD = musicState.timeArray;
  if (!musicState.isPlaying && !musicState.isRecording && (!freq || freq.every(v => v === 0))) {
     freq = new Uint8Array(128);
     timeD = new Uint8Array(128);
     for(let i=0; i<128; i++) {
        freq[i] = Math.random() * 100 + 50;
        timeD[i] = 128 + Math.sin(i*0.2)*40;
     }
  }

  drawFn(ctx, ww, wh, freq || new Uint8Array(128), timeD || new Uint8Array(128), currentTime, duration);
  ctx.restore();

  if (!musicState.isRecording) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    const hs = 8;
    ctx.fillRect(wx - hs/2, wy - hs/2, hs, hs);
    ctx.fillRect(wx + ww - hs/2, wy - hs/2, hs, hs);
    ctx.fillRect(wx - hs/2, wy + wh - hs/2, hs, hs);
    ctx.fillRect(wx + ww - hs/2, wy + wh - hs/2, hs, hs);
  }

  // Postcard border overlay
  if (musicState.images.length > 0) {
    drawPostcardBorder(ctx, w, h);
  }

  // Check if audio ended
  if (musicAudioPlayer.ended) {
    stopMusicPlayback();
  }
}

function getCurrentImageIndex() {
  if (!musicState.images.length) return 0;
  const dur = musicAudioPlayer.duration || 1;
  const perImage = dur / musicState.images.length;
  const currentTime = musicAudioPlayer.currentTime || 0;
  return Math.min(Math.floor(currentTime / perImage), musicState.images.length - 1);
}

function startMusicPlayback() {
  if (musicState.audioCtx && musicState.audioCtx.state === 'suspended') {
    musicState.audioCtx.resume();
  }
  musicState.isPlaying = true;
  btnMusicPlayText.textContent = 'Pause';
  musicHint.style.display = 'none';
  musicAudioPlayer.play();
  if (!musicState.animFrameId) {
    animateMusic();
  }
}

function stopMusicPlayback() {
  musicState.isPlaying = false;
  btnMusicPlayText.textContent = 'Play';
  if (musicState.animFrameId) {
    cancelAnimationFrame(musicState.animFrameId);
    musicState.animFrameId = null;
  }
}

btnMusicPlay.addEventListener('click', () => {
  if (musicState.isPlaying) {
    musicAudioPlayer.pause();
    stopMusicPlayback();
  } else {
    startMusicPlayback();
  }
});

musicAudioPlayer.addEventListener('play', () => {
  if (!musicState.isPlaying) {
    startMusicPlayback();
  }
});

musicAudioPlayer.addEventListener('pause', () => {
  if (!musicAudioPlayer.ended) {
    stopMusicPlayback();
  }
});

musicAudioPlayer.addEventListener('ended', () => {
  stopMusicPlayback();
});

// --- Export (MediaRecorder) ---
btnMusicExport.addEventListener('click', async () => {
  if (musicState.isRecording) return;

  musicExportProgress.style.display = 'block';
  musicExportFill.style.width = '0%';
  musicExportText.textContent = 'Đang xuất video...';
  btnMusicExport.disabled = true;

  try {
    musicState.isRecording = true;
    renderMusicStaticFrame();
    const stream = musicCanvas.captureStream(30);
    const audioStream = musicAudioPlayer.captureStream ? musicAudioPlayer.captureStream(30) : null;
    let finalStream = stream;

    if (audioStream) {
      const tracks = [...stream.getVideoTracks(), ...audioStream.getAudioTracks()];
      finalStream = new MediaStream(tracks);
    }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    musicState.recordedChunks = [];
    musicState.mediaRecorder = new MediaRecorder(finalStream, { mimeType });
    musicState.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) musicState.recordedChunks.push(e.data);
    };
    musicState.mediaRecorder.onstop = () => {
      const blob = new Blob(musicState.recordedChunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `music_video_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
      musicExportProgress.style.display = 'none';
      btnMusicExport.disabled = false;
      stopMusicPlayback();
    };

    musicState.mediaRecorder.start();
    musicAudioPlayer.currentTime = 0;
    startMusicPlayback();

    let lastProgress = 0;
    const pollInterval = setInterval(() => {
      if (musicAudioPlayer.duration) {
        const pct = Math.min(99, Math.floor((musicAudioPlayer.currentTime / musicAudioPlayer.duration) * 100));
        musicExportFill.style.width = pct + '%';
        if (pct > lastProgress) {
          lastProgress = pct;
        }
      }
    }, 200);

    musicAudioPlayer.onended = () => {
      clearInterval(pollInterval);
      setTimeout(() => {
        musicState.mediaRecorder.stop();
        musicState.isRecording = false;
        musicExportFill.style.width = '100%';
        musicExportText.textContent = 'Hoàn tất!';
      }, 500);
    };
  } catch (err) {
    console.error('Export error:', err);
    musicExportText.textContent = 'Lỗi: ' + err.message;
    btnMusicExport.disabled = false;
    musicState.isRecording = false;
    setTimeout(() => { musicExportProgress.style.display = 'none'; }, 2000);
  }
});

// --- Reset ---
btnMusicReset.addEventListener('click', () => {
  if (musicState.isPlaying) {
    musicAudioPlayer.pause();
    stopMusicPlayback();
  }
  if (musicState.isRecording) {
    musicState.mediaRecorder.stop();
    musicState.isRecording = false;
  }
  musicAudioPlayer.currentTime = 0;
  musicAudioPlayer.pause();
  musicHint.style.display = 'flex';
  const ctx = musicCanvas.getContext('2d');
  ctx.clearRect(0, 0, musicCanvas.width, musicCanvas.height);
  ctx.fillStyle = '#0e0e15';
  ctx.fillRect(0, 0, musicCanvas.width, musicCanvas.height);
});

// Init
function initMusicTab() {
  resizeMusicCanvas();
  renderWaveStyles();
}

// --- Init ---
loadVideoList();
setupTimelineEvents();
loadSettings();
initMusicTab();


// --- Wave interactive controls ---
function renderMusicStaticFrame() {
  if (musicState.isPlaying) return;
  const ctx = musicCanvas.getContext('2d');
  const w = musicCanvas.width;
  const h = musicCanvas.height;

  if (musicState.cachedImages.length > 0) {
    const imgIdx = getCurrentImageIndex();
    const img = musicState.cachedImages[imgIdx];
    if (img && img.complete) {
      ctx.drawImage(img, 0, 0, w, h);
    }
  } else {
    ctx.fillStyle = '#0e0e15';
    ctx.fillRect(0, 0, w, h);
  }

  const currentTime = musicAudioPlayer.currentTime || 0;
  const duration = musicAudioPlayer.duration || 1;

  const drawFn = DRAW_FUNCTIONS[musicState.styleId] || DRAW_FUNCTIONS[0];
  const wr = musicState.waveRect;
  const wx = wr.x * w;
  const wy = wr.y * h;
  const ww = wr.w * w;
  const wh = wr.h * h;

  ctx.save();
  ctx.translate(wx, wy);
  let freq = musicState.freqArray;
  let timeD = musicState.timeArray;
  if (!freq || freq.every(v => v === 0)) {
     freq = new Uint8Array(128);
     timeD = new Uint8Array(128);
     for(let i=0; i<128; i++) {
        freq[i] = Math.random() * 100 + 50;
        timeD[i] = 128 + Math.sin(i*0.2)*40;
     }
  }
  drawFn(ctx, ww, wh, freq, timeD, currentTime, duration);
  ctx.restore();

  if (musicState.images.length > 0) {
    drawPostcardBorder(ctx, w, h);
  }

  if (!musicState.isRecording) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(wx, wy, ww, wh);
    ctx.setLineDash([]);
    ctx.fillStyle = '#fff';
    const hs = 8;
    ctx.fillRect(wx - hs/2, wy - hs/2, hs, hs);
    ctx.fillRect(wx + ww - hs/2, wy - hs/2, hs, hs);
    ctx.fillRect(wx - hs/2, wy + wh - hs/2, hs, hs);
    ctx.fillRect(wx + ww - hs/2, wy + wh - hs/2, hs, hs);
  }
}

function getWaveHandle(x, y, w, h) {
  const wr = musicState.waveRect;
  const wx = wr.x * w;
  const wy = wr.y * h;
  const ww = wr.w * w;
  const wh = wr.h * h;
  const hs = 15;
  if (Math.abs(x - wx) < hs && Math.abs(y - wy) < hs) return 'tl';
  if (Math.abs(x - (wx + ww)) < hs && Math.abs(y - wy) < hs) return 'tr';
  if (Math.abs(x - wx) < hs && Math.abs(y - (wy + wh)) < hs) return 'bl';
  if (Math.abs(x - (wx + ww)) < hs && Math.abs(y - (wy + wh)) < hs) return 'br';
  if (x >= wx && x <= wx + ww && y >= wy && y <= wy + wh) return 'body';
  return null;
}

musicCanvas.addEventListener('mousedown', (e) => {
  const rect = musicCanvas.getBoundingClientRect();
  const scaleX = musicCanvas.width / rect.width;
  const scaleY = musicCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const handle = getWaveHandle(x, y, musicCanvas.width, musicCanvas.height);
  if (handle) {
    if (handle === 'body') {
      musicState.isDraggingWave = true;
    } else {
      musicState.isResizingWave = true;
      musicState.resizeHandle = handle;
    }
    musicState.dragStartX = x;
    musicState.dragStartY = y;
    musicState.dragStartRect = { ...musicState.waveRect };
  }
});

window.addEventListener('mousemove', (e) => {
  if (musicScreen.style.display === 'none') return;

  if (!musicState.isDraggingWave && !musicState.isResizingWave) {
    const rect = musicCanvas.getBoundingClientRect();
    const scaleX = musicCanvas.width / rect.width;
    const scaleY = musicCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const handle = getWaveHandle(x, y, musicCanvas.width, musicCanvas.height);
    if (handle === 'tl' || handle === 'br') musicCanvas.style.cursor = 'nwse-resize';
    else if (handle === 'tr' || handle === 'bl') musicCanvas.style.cursor = 'nesw-resize';
    else if (handle === 'body') musicCanvas.style.cursor = 'move';
    else musicCanvas.style.cursor = 'default';
    return;
  }
  
  const rect = musicCanvas.getBoundingClientRect();
  const scaleX = musicCanvas.width / rect.width;
  const scaleY = musicCanvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  const dx = (x - musicState.dragStartX) / musicCanvas.width;
  const dy = (y - musicState.dragStartY) / musicCanvas.height;
  
  const sr = musicState.dragStartRect;
  
  if (musicState.isDraggingWave) {
    musicState.waveRect.x = Math.max(0, Math.min(1 - sr.w, sr.x + dx));
    musicState.waveRect.y = Math.max(0, Math.min(1 - sr.h, sr.y + dy));
  } else if (musicState.isResizingWave) {
    if (musicState.resizeHandle === 'br') {
      musicState.waveRect.w = Math.max(0.05, Math.min(1 - sr.x, sr.w + dx));
      musicState.waveRect.h = Math.max(0.05, Math.min(1 - sr.y, sr.h + dy));
    } else if (musicState.resizeHandle === 'tl') {
      const nw = Math.max(0.05, sr.w - dx);
      const nh = Math.max(0.05, sr.h - dy);
      if (sr.x + sr.w - nw >= 0 && sr.y + sr.h - nh >= 0) {
        musicState.waveRect.w = nw;
        musicState.waveRect.h = nh;
        musicState.waveRect.x = sr.x + sr.w - nw;
        musicState.waveRect.y = sr.y + sr.h - nh;
      }
    } else if (musicState.resizeHandle === 'tr') {
      musicState.waveRect.w = Math.max(0.05, Math.min(1 - sr.x, sr.w + dx));
      const nh = Math.max(0.05, sr.h - dy);
      if (sr.y + sr.h - nh >= 0) {
        musicState.waveRect.h = nh;
        musicState.waveRect.y = sr.y + sr.h - nh;
      }
    } else if (musicState.resizeHandle === 'bl') {
      const nw = Math.max(0.05, sr.w - dx);
      if (sr.x + sr.w - nw >= 0) {
        musicState.waveRect.w = nw;
        musicState.waveRect.x = sr.x + sr.w - nw;
      }
      musicState.waveRect.h = Math.max(0.05, Math.min(1 - sr.y, sr.h + dy));
    }
  }
  
  if (!musicState.isPlaying) {
     renderMusicStaticFrame();
  }
});

window.addEventListener('mouseup', () => {
  musicState.isDraggingWave = false;
  musicState.isResizingWave = false;
});

const origAddMusicImages = addMusicImages;
addMusicImages = function(files) {
  origAddMusicImages(files);
  if (!musicState.isPlaying) renderMusicStaticFrame();
}
const origRenderWaveStyles = renderWaveStyles;
renderWaveStyles = function() {
  origRenderWaveStyles();
  setTimeout(() => {
    musicWaveGrid.querySelectorAll('.wave-style-card').forEach(el => {
      el.addEventListener('click', () => {
        if (!musicState.isPlaying) renderMusicStaticFrame();
      });
    });
  }, 100);
}

// --- Main Video Play/Pause Logic ---
const btnPlayPause = document.getElementById('btn-play-pause');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const textPlayPause = document.getElementById('text-play-pause');

function togglePlayPause() {
  if (!videoPlayer || !videoPlayer.src) return;
  if (videoPlayer.paused || videoPlayer.ended) {
    videoPlayer.play().catch(e => console.warn('Could not play video:', e));
  } else {
    videoPlayer.pause();
  }
}

if (btnPlayPause) {
  btnPlayPause.addEventListener('click', togglePlayPause);
}

// Allow clicking on the video wrapper/video to toggle play/pause
if (videoPlayer) {
  videoPlayer.addEventListener('click', togglePlayPause);
  // Also add to subtitle overlay so clicking subtitles also pauses/plays
  const subtitleOverlay = document.getElementById('video-subtitle-overlay');
  if (subtitleOverlay) {
    subtitleOverlay.addEventListener('click', togglePlayPause);
  }
  
  videoPlayer.addEventListener('play', () => {
    if (iconPlay) iconPlay.style.display = 'none';
    if (iconPause) iconPause.style.display = 'block';
    if (textPlayPause) textPlayPause.textContent = 'Dừng';
  });
  
  videoPlayer.addEventListener('pause', () => {
    if (iconPlay) iconPlay.style.display = 'block';
    if (iconPause) iconPause.style.display = 'none';
    if (textPlayPause) textPlayPause.textContent = 'Phát';
  });
}
