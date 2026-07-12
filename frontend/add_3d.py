import sys

file_path = 'F:\\WebEdit\\video-editor\\frontend\\app_v7.js'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update WAVE_STYLES
wave_target = '''  { id: 10, name: 'Cyber Polygon', icon: 'polygon' },
];'''
wave_replace = '''  { id: 10, name: 'Cyber Polygon', icon: 'polygon' },
  { id: 11, name: '3D Blocks', icon: 'block3d' },
];'''
content = content.replace(wave_target, wave_replace)

# 2. Update renderWaveStyles
render_target = '''      case 'polygon':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><polygon points="18,4 32,14 26,30 10,30 4,14" stroke="#06b6d4" fill="none" stroke-width="2"/><polygon points="18,8 28,15 24,26 12,26 8,15" stroke="#d946ef" fill="rgba(217,70,239,0.3)" stroke-width="1"/></svg>';
        break;'''
render_replace = '''      case 'polygon':
        icon = '<svg viewBox="0 0 36 36" style="width:100%;height:100%"><polygon points="18,4 32,14 26,30 10,30 4,14" stroke="#06b6d4" fill="none" stroke-width="2"/><polygon points="18,8 28,15 24,26 12,26 8,15" stroke="#d946ef" fill="rgba(217,70,239,0.3)" stroke-width="1"/></svg>';
        break;
      case 'block3d':
        icon = '<svg viewBox="0 0 60 36" style="width:100%;height:100%"><path d="M10,25 L20,25 L25,20 L15,20 Z" fill="#F4A261"/><path d="M20,25 L20,15 L25,10 L25,20 Z" fill="#E07A5F"/><rect x="10" y="15" width="10" height="10" fill="#E6B956"/><path d="M30,25 L40,25 L45,20 L35,20 Z" fill="#4ade80"/><path d="M40,25 L40,8 L45,3 L45,20 Z" fill="#16a34a"/><rect x="30" y="8" width="10" height="17" fill="#22c55e"/></svg>';
        break;'''
content = content.replace(render_target, render_replace)

# 3. Add drawing function
funcs_target = '''const DRAW_FUNCTIONS = ['''
funcs_replace = '''function draw3DBlocks(ctx, w, h, freqData, timeData, time, dur) {
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

const DRAW_FUNCTIONS = ['''
content = content.replace(funcs_target, funcs_replace)

# 4. Add to array
draw_array_target = '''  drawCircularOrbit, drawMatrixDrops, drawCyberPolygon,
];'''
draw_array_replace = '''  drawCircularOrbit, drawMatrixDrops, drawCyberPolygon,
  draw3DBlocks,
];'''
content = content.replace(draw_array_target, draw_array_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('3D block style added successfully.')
