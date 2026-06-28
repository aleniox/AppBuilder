const API = 'http://localhost:8000';
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
  if (fileInput.files.length) uploadVideo(fileInput.files[0]);
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
  try {
    const res = await fetch(`${API}/api/videos`);
    const videos = await res.json();
    videoSelect.innerHTML = videos.map(v =>
      `<option value="${v.id}">${v.original_name || v.filename} (${fmtDuration(v.duration)})</option>`
    ).join('');
    if (videos.length) {
      videoList.style.display = 'block';
    } else {
      videoList.style.display = 'none';
    }
  } catch (err) { console.error(err); }
}

async function selectVideo(id) {
  alert("Chẩn đoán: Bắt đầu mở dự án với ID = " + id);
  currentVideoId = id;
  try {
    const res = await fetch(`${API}/api/video/${id}`);
    if (!res.ok) {
      throw new Error(`Lỗi kết nối API (Status: ${res.status})`);
    }
    const video = await res.json();
    alert("Chẩn đoán: Đã nhận dữ liệu từ server. File video: " + video.filename);
    
    videoPlayer.src = `${API}/api/download/${video.filename}`;
    videoPlayer.load();

    // Set active project name in workspace header
    if (activeVideoName) {
      activeVideoName.textContent = video.original_name || video.filename;
    }

    alert("Chẩn đoán: Bắt đầu ẩn màn hình chính & hiện Workspace...");
    // Toggle screen views
    if (startScreen) startScreen.style.display = 'none';
    if (workspaceScreen) workspaceScreen.style.display = 'block';
    
    // Clear any residual display: none on child cards
    if (playerArea) playerArea.style.display = '';
    if (renderArea) renderArea.style.display = '';

    subtitles = video.subtitles || [];
    subCounter = subtitles.length;
    
    alert("Chẩn đoán: Bắt đầu vẽ " + subtitles.length + " phụ đề lên danh sách & timeline...");
    loadSubtitles();
    videoSelect.value = id;
    alert("Chẩn đoán: Đã mở dự án thành công!");
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
        <button onclick="jumpToSub(${idx})">⏩</button>
        <button onclick="deleteSub(${idx})">🗑</button>
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
          downloadArea.innerHTML = `
            <a href="${API}/api/download/${data.output}" target="_blank" class="btn-primary" style="text-decoration:none">
              ⬇ Tải xuống ${data.output.endsWith('.mp3') ? 'Audio' : 'Video'}
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

// --- Init ---
loadVideoList();
setupTimelineEvents();

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
    videoPlayer.pause();
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
