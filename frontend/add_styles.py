import sys

file_path = 'F:\\WebEdit\\video-editor\\frontend\\app_v7.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update WAVE_STYLES
wave_target = '''  { id: 7, name: 'Ocean Wave', icon: 'ocean' },
];'''
wave_replace = '''  { id: 7, name: 'Ocean Wave', icon: 'ocean' },
  { id: 8, name: 'Circular Orbit', icon: 'orbit' },
  { id: 9, name: 'Matrix Drops', icon: 'matrix' },
  { id: 10, name: 'Cyber Polygon', icon: 'polygon' },
];'''
content = content.replace(wave_target, wave_replace)

# 2. Update renderWaveStyles
render_target = '''      case 'ocean':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 24 Q15 18 30 24 Q45 30 60 24" stroke="#3D5A80" fill="none" stroke-width="2"/><path d="M0 28 Q15 22 30 28 Q45 34 60 28" stroke="#DBA5A0" fill="none" stroke-width="1.5"/></svg>';
        break;'''
render_replace = '''      case 'ocean':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M0 24 Q15 18 30 24 Q45 30 60 24" stroke="#3D5A80" fill="none" stroke-width="2"/><path d="M0 28 Q15 22 30 28 Q45 34 60 28" stroke="#DBA5A0" fill="none" stroke-width="1.5"/></svg>';
        break;
      case 'orbit':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><circle cx="18" cy=\"18\" r=\"10\" stroke=\"#F4A261\" fill=\"none\" stroke-width=\"2\" stroke-dasharray=\"2 4\"/><circle cx=\"18\" cy=\"18\" r=\"5\" fill=\"#E07A5F\"/></svg>';
        break;
      case 'matrix':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><line x1=\"10\" y1=\"4\" x2=\"10\" y2=\"16\" stroke=\"#22c55e\" stroke-width=\"2\" stroke-linecap=\"round\"/><line x1=\"25\" y1=\"10\" x2=\"25\" y2=\"30\" stroke=\"#22c55e\" stroke-width=\"2\" stroke-linecap=\"round\"/><line x1=\"40\" y1=\"2\" x2=\"40\" y2=\"20\" stroke=\"#22c55e\" stroke-width=\"2\" stroke-linecap=\"round\"/><line x1=\"50\" y1=\"15\" x2=\"50\" y2=\"32\" stroke=\"#22c55e\" stroke-width=\"2\" stroke-linecap=\"round\"/></svg>';
        break;
      case 'polygon':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><polygon points=\"18,4 32,14 26,30 10,30 4,14\" stroke=\"#06b6d4\" fill=\"none\" stroke-width=\"2\"/><polygon points=\"18,8 28,15 24,26 12,26 8,15\" stroke=\"#d946ef\" fill=\"rgba(217,70,239,0.3)\" stroke-width=\"1\"/></svg>';
        break;'''
content = content.replace(render_target, render_replace)

# 3. Add drawing functions
functions_target = '''const DRAW_FUNCTIONS = ['''
functions_replace = '''function drawCircularOrbit(ctx, w, h, freqData, timeData, time, dur) {
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

const DRAW_FUNCTIONS = ['''
content = content.replace(functions_target, functions_replace)

draw_funcs_target = '''  drawNeonRetro, drawConfetti, drawSunset, drawOceanWave,
];'''
draw_funcs_replace = '''  drawNeonRetro, drawConfetti, drawSunset, drawOceanWave,
  drawCircularOrbit, drawMatrixDrops, drawCyberPolygon,
];'''
content = content.replace(draw_funcs_target, draw_funcs_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Added new wave styles successfully.")
