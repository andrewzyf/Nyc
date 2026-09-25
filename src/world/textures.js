// Canvas-generated textures: signs, neon text, billboard ad atlas.
import * as THREE from 'three';

export function makeTextTexture(text, { width = 512, height = 128, bg = null, color = '#ffffff', font = 'bold 72px "Bebas Neue", "Arial Narrow", Impact, sans-serif', glow = null, border = null, align = 'center', padding = 20, sub = null, subColor } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, width, height);
  }
  if (border) {
    g.strokeStyle = border;
    g.lineWidth = 8;
    g.strokeRect(4, 4, width - 8, height - 8);
  }
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.font = font;
  // Shrink to fit
  let size = parseInt(font.match(/(\d+)px/)?.[1] || '72', 10);
  while (g.measureText(text).width > width - padding * 2 && size > 10) {
    size -= 2;
    g.font = font.replace(/\d+px/, `${size}px`);
  }
  const x = align === 'center' ? width / 2 : padding;
  const y = sub ? height * 0.4 : height / 2;
  if (glow) {
    g.shadowColor = glow;
    g.shadowBlur = 18;
  }
  g.fillStyle = color;
  g.fillText(text, x, y);
  if (sub) {
    g.shadowBlur = 0;
    g.font = `600 ${Math.round(height * 0.2)}px "Inter", Arial, sans-serif`;
    g.fillStyle = subColor || color;
    g.fillText(sub, x, height * 0.78);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const ADS = [
  { bg: ['#ff3d6e', '#7a1fa2'], title: 'THE CATS OF QUEENS', sub: 'NOW PLAYING', fg: '#fff' },
  { bg: ['#0f2a5f', '#1fa2ff'], title: 'KNICKERBOCKER BANK', sub: 'SINCE 1874', fg: '#fff' },
  { bg: ['#ffe44d', '#ff8a00'], title: 'FIZZ', sub: 'TASTE THE CITY', fg: '#2a1400' },
  { bg: ['#111', '#333'], title: 'SUBWAY SERENADE', sub: 'A NEW MUSICAL', fg: '#ffd35a' },
  { bg: ['#00c38a', '#006b52'], title: 'DASHRUN', sub: 'WE DELIVER. FAST.', fg: '#fff' },
  { bg: ['#fff', '#dcdcdc'], title: 'HELLO, NEW YORK', sub: 'MAKE IT HERE', fg: '#e3262e' },
  { bg: ['#6a00ff', '#ff00c8'], title: 'PIGEON AI', sub: 'THINK LIKE A BIRD', fg: '#fff' },
  { bg: ['#ff5a1f', '#b3001e'], title: 'HAMLET ON ICE', sub: 'TO SKATE OR NOT', fg: '#fff' },
  { bg: ['#1b1b1b', '#3a2a10'], title: 'GOTHAM GAZETTE', sub: 'ALL THE NEWS', fg: '#f5d38a' },
  { bg: ['#0bd3d3', '#0a5d8c'], title: 'LOOP LABS', sub: 'WE’RE HIRING', fg: '#fff' },
  { bg: ['#f7c948', '#e39b00'], title: 'TAXI!', sub: 'FIVE BORO CAB CO.', fg: '#111' },
  { bg: ['#e8e1d0', '#b9ab8c'], title: 'FIFTH & MAIN', sub: 'THE BIG SALE', fg: '#1b1b1b' },
  { bg: ['#1a1a40', '#ff4f81'], title: 'PIGEON OPERA', sub: 'LIMITED RUN', fg: '#fff' },
  { bg: ['#2ecc71', '#145a32'], title: 'BODEGA CLOUD', sub: 'SMALL SHOPS, BIG TECH', fg: '#fff' },
  { bg: ['#ff2e2e', '#8a0000'], title: 'SALE 50% OFF', sub: 'STOOP & STYLE', fg: '#fff' },
  { bg: ['#000', '#152238'], title: 'BROADWAY WEEK', sub: '2-FOR-1 TICKETS', fg: '#7fd3ff' },
];

let atlasCache = null;
export function makeBillboardAtlas() {
  if (atlasCache) return atlasCache;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * 4;
  c.height = S * 4;
  const g = c.getContext('2d');
  ADS.forEach((ad, i) => {
    const x = (i % 4) * S;
    const y = Math.floor(i / 4) * S;
    const grad = g.createLinearGradient(x, y, x + S, y + S);
    grad.addColorStop(0, ad.bg[0]);
    grad.addColorStop(1, ad.bg[1]);
    g.fillStyle = grad;
    g.fillRect(x, y, S, S);
    // decorative shapes
    g.globalAlpha = 0.18;
    g.fillStyle = '#ffffff';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(x + ((k * 83) % S), y + ((k * 131) % S), 30 + k * 18, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = ad.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 58;
    g.font = `bold ${size}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
    const words = ad.title.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > S - 24 && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
    while (lines.some((l) => g.measureText(l).width > S - 20) && size > 20) {
      size -= 4;
      g.font = `bold ${size}px "Bebas Neue", Impact, "Arial Narrow", sans-serif`;
    }
    const lh = size * 0.95;
    const startY = y + S * 0.45 - ((lines.length - 1) * lh) / 2;
    lines.forEach((l, li) => g.fillText(l, x + S / 2, startY + li * lh));
    g.font = `600 20px Inter, Arial, sans-serif`;
    g.fillText(ad.sub, x + S / 2, y + S * 0.82);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  atlasCache = tex;
  return tex;
}

/** Soft round sprite for particles (snow, steam, sparks). */
export function makeSoftDot(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
