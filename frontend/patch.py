import sys

file_path = 'F:\\WebEdit\\video-editor\\frontend\\app_v7.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add to musicState
state_target = '''  cachedImages: [],
};'''
state_replacement = '''  cachedImages: [],
  waveRect: { x: 0, y: 0.5, w: 1, h: 0.5 },
  isDraggingWave: false,
  isResizingWave: false,
  resizeHandle: null,
  dragStartX: 0,
  dragStartY: 0,
  dragStartRect: null
};'''
content = content.replace(state_target, state_replacement)

# 2. Add wrapper dragging
drag_target = '''musicImageZone.addEventListener('click', () => musicImageInput.click());'''
drag_replacement = '''const musicCanvasWrapper = document.querySelector('.music-canvas-wrapper');
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
    addMusicImages(e.dataTransfer.files);
  }
});

musicImageZone.addEventListener('click', () => musicImageInput.click());'''
content = content.replace(drag_target, drag_replacement)

# 3. Remove clearRect from draw functions
content = content.replace('ctx.clearRect(0, 0, w, h);', '// ctx.clearRect(0, 0, w, h);')

# 4. Update animateMusic and add interactive events
anim_target = '''  // Draw wave overlay
  const drawFn = DRAW_FUNCTIONS[musicState.styleId] || DRAW_FUNCTIONS[0];
  drawFn(ctx, w, h, musicState.freqArray || new Uint8Array(128), musicState.timeArray || new Uint8Array(128), currentTime, duration);'''

anim_replacement = '''  // Draw wave overlay
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
  }'''

content = content.replace(anim_target, anim_replacement)

# 5. Add render static frame and mouse events at the end of the file
events = '''

// --- Wave interactive controls ---
function renderMusicStaticFrame() {
  if (musicState.isPlaying || musicState.isRecording) return;
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
'''
content += events

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Modifications applied successfully.")
