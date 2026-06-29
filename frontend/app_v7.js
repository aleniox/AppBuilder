console.log("app.js loaded. Version: 1.0.7");
const API = 'http://localhost:8000';
let currentVideoId = null;
let subtitles = [];
let subCounter = 0;
let insertedClips = [];

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
const srtInput = document.getElementById('srt-input');
const btnRender = document.getElementById('btn-render');
const btnRenderAudio = document.getElementById('btn-render-audio');
const voiceToggle = document.getElementById('voice-toggle');
const voiceLang = document.getElementById('voice-lang');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
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

async function selectVideo(id) {
  currentVideoId = id;
  try {
    const res = await fetch(`${API}/api/video/${id}`);
    if (!res.ok) {
      throw new Error(`Lỗi kết nối API (Status: ${res.status})`);
    }
    const video = await res.json();
    
    videoPlayer.src = `${API}/api/download/${video.filename}?t=${Date.now()}`;
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
    insertedClips = video.inserted_clips || [];
    
    loadSubtitles();
    if (videoSelect) videoSelect.value = id;
  } catch (err) {
    console.error("Lỗi mở dự án:", err);
    alert("Không thể tải thông tin dự án này. Chi tiết lỗi:\n" + err.message);
  }
}

videoPlayer.addEventListener('timeupdate', () => {
  const currentTime = videoPlayer.currentTime;
  const duration = videoPlayer.duration || 1;
  
  // 1. Update playhead position on visual timeline
  const playhead = document.getElementById('timeline-playhead');
  if (playhead) {
    playhead.style.left = `${(currentTime / duration) * 100}%`;
  }
  
  // 2. Update time display text
  timeDisplay.textContent = `${currentTime.toFixed(2)}s / ${videoPlayer.duration ? videoPlayer.duration.toFixed(2) : '0.00'}s`;
  
  // 3. Find and display active subtitle overlay
  const activeSub = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);
  const subtitleOverlay = document.getElementById('video-subtitle-overlay');
  if (subtitleOverlay) {
    if (activeSub) {
      subtitleOverlay.textContent = activeSub.text;
      subtitleOverlay.style.display = 'block';
      
      // 4. Highlight active subtitle in list and scroll to it
      const activeIdx = subtitles.indexOf(activeSub);
      highlightSub(activeIdx);
      scrollToActiveSub(activeIdx);
    } else {
      subtitleOverlay.textContent = '';
      subtitleOverlay.style.display = 'none';
    }
  }
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

function highlightSub(idx) {
  document.querySelectorAll('.sub-item').forEach(el => el.classList.remove('active-sub'));
  const el = document.querySelector(`.sub-item[data-index="${idx}"]`);
  if (el) el.classList.add('active-sub');
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
        <button onclick="jumpToSub(${idx})" title="Nhảy tới">⏩</button>
        <button onclick="translateSub(${idx})" title="Dịch phụ đề">🌐</button>
        <button onclick="deleteSub(${idx})" title="Xóa">🗑</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.sub-item input, .sub-item textarea').forEach(el => {
    el.addEventListener('change', (e) => updateSubField(e, true)); // Save to backend on focus leave / enter
    el.addEventListener('input', (e) => updateSubField(e, false));  // Update timeline locally on input
  });

  document.querySelectorAll('.sub-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        const idx = parseInt(el.dataset.index);
        highlightSub(idx);
        if (videoPlayer) videoPlayer.currentTime = subtitles[idx].start;
      }
    });
  });

  updateTimelineBlocks();
}

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
    
    updateTimelineBlocks();
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
    insertedClips = [];
    if (fileInput) fileInput.value = '';
    if (workspaceScreen) workspaceScreen.style.display = 'none';
    if (startScreen) startScreen.style.display = 'flex';
    loadVideoList();
  });
}

// Autosave when voice settings change
if (voiceToggle) {
  voiceToggle.addEventListener('change', () => saveSubtitlesToBackend());
}
if (voiceLang) {
  voiceLang.addEventListener('change', () => saveSubtitlesToBackend());
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
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function updateTimelineClips() {
  const container = document.getElementById('timeline-clips-container');
  if (!container) return;
  const duration = videoPlayer.duration || 0;
  if (!duration || !insertedClips || !insertedClips.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = insertedClips.map((clip, idx) => {
    const left = (clip.start / duration) * 100;
    const width = (clip.duration / duration) * 100;
    
    return `
      <div class="timeline-clip-block" 
           style="left: ${left}%; width: ${width}%;" 
           title="Clip video đã ghép (Bắt đầu: ${clip.start.toFixed(2)}s, Dài: ${clip.duration.toFixed(2)}s)"
           onclick="openManageClipModal(${idx}); event.stopPropagation();">
        <span>Clip ${idx + 1}</span>
      </div>
    `;
  }).join('');
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
           onclick="jumpToSub(${idx}); event.stopPropagation();">
        <span style="display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; pointer-events: none;">
          ${escHtml(sub.text)}
        </span>
        <!-- Green indicator showing the exact voice duration relative to user-defined block width -->
        <div class="timeline-audio-indicator" style="width: ${audioPercentage}%;"></div>
      </div>
    `;
  }).join('');

  updateTimelineClips();
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
    if (!videoPlayer.duration) return;
    const rect = visualTimeline.getBoundingClientRect();
    let x = e.clientX - rect.left;
    if (x < 0) x = 0;
    if (x > rect.width) x = rect.width;
    const ratio = x / rect.width;
    videoPlayer.currentTime = ratio * videoPlayer.duration;
  }

  let isDraggingTimeline = false;

  visualTimeline.addEventListener('mousedown', (e) => {
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
  const duration = 3.0; // default 3s subtitle duration
  const maxDur = (videoPlayer && videoPlayer.duration) ? videoPlayer.duration : (roundedStart + 3.0);
  const roundedEnd = Math.round(Math.min(roundedStart + duration, maxDur) * 100) / 100;
  addSubtitle(roundedStart, roundedEnd, text);
}

// --- Insert Clip Modal Logic ---
const btnInsertVideo = document.getElementById('btn-insert-video');
const insertClipModal = document.getElementById('insert-clip-modal');
const btnCancelInsert = document.getElementById('btn-cancel-insert');
const btnSubmitInsert = document.getElementById('btn-submit-insert');
const insertFileInput = document.getElementById('insert-file-input');
const insertTimeInput = document.getElementById('insert-time-input');
const mergeLoadingIndicator = document.getElementById('merge-loading-indicator');

if (btnInsertVideo) {
  console.log("btnInsertVideo found, binding click event listener.");
  btnInsertVideo.addEventListener('click', () => {
    console.log("btnInsertVideo clicked! currentVideoId =", currentVideoId);
    if (!currentVideoId) {
      alert("Vui lòng mở một dự án trước.");
      return;
    }
    try {
      videoPlayer.pause();
    } catch(e) {
      console.warn("Failed to pause video:", e);
    }
    if (insertTimeInput) {
      insertTimeInput.value = videoPlayer.currentTime.toFixed(2);
      console.log("Set insertTimeInput to", insertTimeInput.value);
    }
    if (insertClipModal) {
      insertClipModal.style.display = 'flex';
      console.log("Displayed insertClipModal. Element style display =", insertClipModal.style.display);
    } else {
      console.error("insertClipModal element not found in DOM!");
    }
  });
} else {
  console.error("btnInsertVideo element not found in DOM!");
}

if (btnCancelInsert) {
  btnCancelInsert.addEventListener('click', () => {
    if (insertClipModal) insertClipModal.style.display = 'none';
    if (insertFileInput) insertFileInput.value = '';
    if (mergeLoadingIndicator) mergeLoadingIndicator.style.display = 'none';
    btnSubmitInsert.disabled = false;
    btnCancelInsert.disabled = false;
  });
}

window.submitVideoMerge = async function() {
  if (!insertFileInput.files.length) {
    return alert("Vui lòng chọn một file video để chèn.");
  }
  const file = insertFileInput.files[0];
  const insertTime = parseFloat(insertTimeInput.value);
  
  if (isNaN(insertTime) || insertTime < 0) {
    return alert("Thời điểm chèn không hợp lệ.");
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('insert_time', insertTime);

  // Show loading state
  const mergeStatusText = document.getElementById('merge-status-text');
  const mergePercentage = document.getElementById('merge-percentage');
  const mergeProgressFill = document.getElementById('merge-progress-fill');

  if (mergeStatusText) mergeStatusText.textContent = "Đang tải clip lên...";
  if (mergePercentage) mergePercentage.textContent = "0%";
  if (mergeProgressFill) {
    mergeProgressFill.style.width = "0%";
    mergeProgressFill.style.background = ""; // Reset in case of prior errors
  }
  mergeLoadingIndicator.style.display = 'block';
  btnSubmitInsert.disabled = true;
  btnCancelInsert.disabled = true;

  const xhr = new XMLHttpRequest();

  // Track upload progress
  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      if (mergePercentage) mergePercentage.textContent = `${percent}%`;
      if (mergeProgressFill) mergeProgressFill.style.width = `${percent}%`;
      
      if (percent === 100) {
        if (mergeStatusText) mergeStatusText.textContent = "Đang xử lý ghép video & đồng bộ phụ đề...";
      }
    }
  });

  // Handle response
  xhr.addEventListener('load', async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const resData = JSON.parse(xhr.responseText);
        const taskId = resData.task_id;
        
        if (mergeStatusText) mergeStatusText.textContent = "Đang bắt đầu ghép video...";
        
        // Poll merge status
        const pollInterval = setInterval(async () => {
          try {
            const statusRes = await fetch(`${API}/api/video/merge-status/${taskId}`);
            if (!statusRes.ok) {
              throw new Error(`Lỗi kết nối server (HTTP ${statusRes.status})`);
            }
            const data = await statusRes.json();
            
            if (data.status === "processing") {
              if (mergeStatusText) mergeStatusText.textContent = data.status_text || "Đang xử lý...";
              if (mergePercentage) mergePercentage.textContent = `${data.progress}%`;
              if (mergeProgressFill) mergeProgressFill.style.width = `${data.progress}%`;
            } else if (data.status === "completed") {
              clearInterval(pollInterval);
              if (mergePercentage) mergePercentage.textContent = "100%";
              if (mergeProgressFill) mergeProgressFill.style.width = "100%";
              
              // Hide modal
              insertClipModal.style.display = 'none';
              insertFileInput.value = '';
              mergeLoadingIndicator.style.display = 'none';
              btnSubmitInsert.disabled = false;
              btnCancelInsert.disabled = false;
              
              alert("Ghép video thành công! Dự án mới đã được khởi tạo.");
              await loadVideoList();
              selectVideo(data.output_id);
            } else if (data.status === "failed") {
              clearInterval(pollInterval);
              throw new Error(data.error || "Gặp lỗi xử lý trên server");
            }
          } catch (pollErr) {
            clearInterval(pollInterval);
            alert("Ghép video thất bại: " + pollErr.message);
            mergeLoadingIndicator.style.display = 'none';
            btnSubmitInsert.disabled = false;
            btnCancelInsert.disabled = false;
            if (mergeStatusText) mergeStatusText.textContent = "Ghép video thất bại";
            if (mergeProgressFill) {
              mergeProgressFill.style.background = "#e94560";
            }
          }
        }, 1000);
        
      } catch (jsonErr) {
        console.error("Error parsing response:", jsonErr);
        alert("Lỗi phản hồi từ server.");
        btnSubmitInsert.disabled = false;
        btnCancelInsert.disabled = false;
      }
    } else {
      btnSubmitInsert.disabled = false;
      btnCancelInsert.disabled = false;
      let errorMsg = `HTTP ${xhr.status}`;
      try {
        const errData = JSON.parse(xhr.responseText);
        errorMsg = errData.detail || errorMsg;
      } catch(e) {}
      
      alert("Ghép video thất bại: " + errorMsg);
      if (mergeStatusText) mergeStatusText.textContent = "Ghép video thất bại";
      if (mergeProgressFill) {
        mergeProgressFill.style.background = "#e94560"; // Red color for error
      }
    }
  });

  // Handle connection error
  xhr.addEventListener('error', () => {
    alert("Lỗi kết nối khi gửi yêu cầu ghép video.");
    btnSubmitInsert.disabled = false;
    btnCancelInsert.disabled = false;
    if (mergeStatusText) mergeStatusText.textContent = "Lỗi kết nối";
    if (mergeProgressFill) {
      mergeProgressFill.style.background = "#e94560";
    }
  });

  // Handle timeout error
  xhr.timeout = 180000; // 3 minutes timeout for upload
  xhr.addEventListener('timeout', () => {
    alert("Yêu cầu tải video lên bị hết thời gian (timeout).");
    btnSubmitInsert.disabled = false;
    btnCancelInsert.disabled = false;
    if (mergeStatusText) mergeStatusText.textContent = "Hết thời gian (Timeout)";
    if (mergeProgressFill) {
      mergeProgressFill.style.background = "#e94560";
    }
  });

  xhr.open('POST', `${API}/api/video/${currentVideoId}/insert-clip`);
  xhr.send(formData);
};

if (btnSubmitInsert) {
  btnSubmitInsert.addEventListener('click', (e) => {
    if (e) e.preventDefault();
    submitVideoMerge();
  });
}

// --- Manage Spliced Clips Logic ---
let selectedClipIndex = null;

window.openManageClipModal = function(idx) {
  selectedClipIndex = idx;
  if (!insertedClips || !insertedClips[idx]) return;
  const clip = insertedClips[idx];

  const infoText = document.getElementById('manage-clip-info');
  const moveInput = document.getElementById('move-time-input');
  const modal = document.getElementById('manage-clip-modal');

  if (infoText) {
    infoText.textContent = `Clip #${idx + 1} - Bắt đầu từ giây ${clip.start.toFixed(2)}s, thời lượng ${clip.duration.toFixed(2)}s.`;
  }
  if (moveInput) {
    moveInput.value = clip.start.toFixed(2);
  }
  if (modal) {
    modal.style.display = 'flex';
  }
};

const manageClipModal = document.getElementById('manage-clip-modal');
const btnCancelManage = document.getElementById('btn-cancel-manage');
const btnDeleteClip = document.getElementById('btn-delete-clip');
const btnSubmitMove = document.getElementById('btn-submit-move');
const manageClipLoading = document.getElementById('manage-clip-loading');
const manageClipStatusText = document.getElementById('manage-clip-status-text');

if (btnCancelManage) {
  btnCancelManage.addEventListener('click', () => {
    if (manageClipModal) manageClipModal.style.display = 'none';
    if (manageClipLoading) manageClipLoading.style.display = 'none';
    if (btnDeleteClip) btnDeleteClip.disabled = false;
    if (btnSubmitMove) btnSubmitMove.disabled = false;
    if (btnCancelManage) btnCancelManage.disabled = false;
  });
}

if (btnDeleteClip) {
  btnDeleteClip.addEventListener('click', async () => {
    if (selectedClipIndex === null) return;
    if (!confirm("Bạn có chắc chắn muốn xóa đoạn video ghép này? Toàn bộ phụ đề đi kèm trong phân đoạn này cũng sẽ bị xóa và các phụ đề sau đó sẽ được dịch chuyển lùi lại.")) return;

    // Release the video lock in Brave browser so Windows OS allows file deletion/overwriting
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
    }
    // Wait 200ms to give Windows OS time to release the file handle
    await new Promise(resolve => setTimeout(resolve, 200));

    if (manageClipLoading) manageClipLoading.style.display = 'block';
    if (manageClipStatusText) manageClipStatusText.textContent = "Đang xóa clip...";
    btnDeleteClip.disabled = true;
    btnSubmitMove.disabled = true;
    btnCancelManage.disabled = true;

    try {
      const res = await fetch(`${API}/api/video/${currentVideoId}/delete-clip/${selectedClipIndex}`, {
        method: 'POST'
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const outputId = data.output_id;
      if (manageClipModal) manageClipModal.style.display = 'none';
      if (manageClipLoading) manageClipLoading.style.display = 'none';
      btnDeleteClip.disabled = false;
      btnSubmitMove.disabled = false;
      btnCancelManage.disabled = false;

      alert("Xóa clip video thành công!");
      await loadVideoList();
      selectVideo(outputId);

    } catch (err) {
      console.error("Lỗi xóa clip:", err);
      alert("Xóa clip thất bại: " + err.message);
      if (manageClipLoading) manageClipLoading.style.display = 'none';
      btnDeleteClip.disabled = false;
      btnSubmitMove.disabled = false;
      btnCancelManage.disabled = false;
      
      // Restore player state by reloading the video
      await selectVideo(currentVideoId);
    }
  });
}

if (btnSubmitMove) {
  btnSubmitMove.addEventListener('click', async () => {
    if (selectedClipIndex === null) return;
    const moveInput = document.getElementById('move-time-input');
    const newStart = parseFloat(moveInput.value);
    
    if (isNaN(newStart) || newStart < 0) {
      return alert("Thời điểm di chuyển không hợp lệ.");
    }

    // Release the video lock in Brave browser so Windows OS allows file deletion/overwriting
    if (videoPlayer) {
      videoPlayer.pause();
      videoPlayer.removeAttribute('src');
      videoPlayer.load();
    }
    // Wait 200ms to give Windows OS time to release the file handle
    await new Promise(resolve => setTimeout(resolve, 200));

    if (manageClipLoading) manageClipLoading.style.display = 'block';
    if (manageClipStatusText) manageClipStatusText.textContent = "Đang di chuyển clip...";
    btnDeleteClip.disabled = true;
    btnSubmitMove.disabled = true;
    btnCancelManage.disabled = true;

    try {
      const res = await fetch(`${API}/api/video/${currentVideoId}/move-clip/${selectedClipIndex}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_start: newStart })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const outputId = data.output_id;
      if (manageClipModal) manageClipModal.style.display = 'none';
      if (manageClipLoading) manageClipLoading.style.display = 'none';
      btnDeleteClip.disabled = false;
      btnSubmitMove.disabled = false;
      btnCancelManage.disabled = false;

      alert("Di chuyển clip video thành công!");
      await loadVideoList();
      selectVideo(outputId);

    } catch (err) {
      console.error("Lỗi di chuyển clip:", err);
      alert("Di chuyển clip thất bại: " + err.message);
      if (manageClipLoading) manageClipLoading.style.display = 'none';
      btnDeleteClip.disabled = false;
      btnSubmitMove.disabled = false;
      btnCancelManage.disabled = false;
      
      // Restore player state by reloading the video
      if (currentVideoId) await selectVideo(currentVideoId);
    }
  });
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

// --- Init ---
loadVideoList();
setupTimelineEvents();
loadSettings();
