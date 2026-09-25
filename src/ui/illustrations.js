// Procedural isometric apartment "photos" for listings and your home.
import { RNG } from '../core/rng.js';

export function apartmentIllustration(listing, { width = 480, height = 300 } = {}) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = width * dpr;
  c.height = height * dpr;
  c.style.width = '100%';
  c.style.aspectRatio = `${width} / ${height}`;
  c.className = 'illus';
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const rng = new RNG(listing.seed || 1);
  const q = listing.quality || 3;
  const feats = new Set(listing.features || []);
  const night = false;

  // background
  g.fillStyle = '#efe7d8';
  g.fillRect(0, 0, width, height);

  // iso helpers: room of size (w, d), origin at the floor corner nearest the viewer
  const cx = width / 2;
  const cy = height * 0.78;
  const S = Math.min(width, height) * (listing.type === 'room' ? 0.48 : listing.type === 'studio' ? 0.56 : 0.62);
  const iso = (x, y, z) => [cx + (x - y) * S * 0.86, cy - (x + y) * S * 0.5 - z * S];
  const quad = (pts, fill, stroke) => {
    g.beginPath();
    pts.forEach((p, i) => {
      const [X, Y] = iso(...p);
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 1;
      g.stroke();
    }
  };
  const box = (x, y, z, w, d, hgt, top, left, right) => {
    quad([[x, y, z + hgt], [x + w, y, z + hgt], [x + w, y + d, z + hgt], [x, y + d, z + hgt]], top);
    quad([[x, y, z], [x + w, y, z], [x + w, y, z + hgt], [x, y, z + hgt]], left);
    quad([[x, y, z], [x, y + d, z], [x, y + d, z + hgt], [x, y, z + hgt]], right);
  };

  const wallH = 0.62;
  const wallA = ['#e9e1d3', '#e4ddd0', '#f1ece2', '#dfe7ea', '#efe2d2'][Math.floor(rng.next() * 5)];
  const floorC = q >= 4 ? '#b98a5a' : q >= 3 ? '#a8784c' : q >= 2 ? '#9a8f7e' : '#8c8578';
  // walls (back-left and back-right)
  quad([[1, 0, 0], [1, 1, 0], [1, 1, wallH], [1, 0, wallH]], shade(wallA, -0.04));
  quad([[0, 1, 0], [1, 1, 0], [1, 1, wallH], [0, 1, wallH]], wallA);
  if (feats.has('Exposed brick')) {
    for (let r = 0; r < 12; r++) {
      for (let k = 0; k < 10; k++) {
        const x0 = k / 10 + (r % 2 ? 0.05 : 0);
        const z0 = (r / 12) * wallH;
        if (x0 > 0.95) continue;
        quad([[x0, 1, z0], [Math.min(1, x0 + 0.09), 1, z0], [Math.min(1, x0 + 0.09), 1, z0 + wallH / 12 - 0.008], [x0, 1, z0 + wallH / 12 - 0.008]], rng.pick(['#a4533f', '#9b4a3c', '#b0604a', '#8c3f33']));
      }
    }
  }
  // floor with planks
  quad([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], floorC);
  g.globalAlpha = 0.18;
  for (let i = 1; i < 10; i++) quad([[i / 10, 0, 0.001], [i / 10 + 0.004, 0, 0.001], [i / 10 + 0.004, 1, 0.001], [i / 10, 1, 0.001]], '#3b2a1a');
  g.globalAlpha = 1;
  // windows on the right wall
  const nWin = q >= 4 ? 3 : q >= 2 ? 2 : 1;
  const view = feats.has('Skyline view');
  const shaft = feats.has('Faces an air shaft');
  for (let i = 0; i < nWin; i++) {
    const x0 = 0.12 + i * (0.8 / nWin);
    const x1 = x0 + 0.8 / nWin - 0.1;
    quad([[x0, 1, 0.18], [x1, 1, 0.18], [x1, 1, 0.52], [x0, 1, 0.52]], shaft ? '#8a8d90' : night ? '#23304a' : '#bcd9ee', '#6b6f75');
    if (view) {
      for (let k = 0; k < 6; k++) {
        const bx = x0 + ((x1 - x0) * k) / 6;
        const bh = 0.05 + rng.next() * 0.2;
        quad([[bx, 1, 0.18], [bx + (x1 - x0) / 6 - 0.005, 1, 0.18], [bx + (x1 - x0) / 6 - 0.005, 1, 0.18 + bh], [bx, 1, 0.18 + bh]], '#7f93a8');
      }
    }
    quad([[x0 + (x1 - x0) / 2 - 0.004, 1, 0.18], [x0 + (x1 - x0) / 2 + 0.004, 1, 0.18], [x0 + (x1 - x0) / 2 + 0.004, 1, 0.52], [x0 + (x1 - x0) / 2 - 0.004, 1, 0.52]], '#f4f4f4');
  }
  // radiator
  box(0.93, 0.25, 0, 0.05, 0.3, 0.14, '#e8e8e8', '#cfcfcf', '#dcdcdc');
  // rug
  quad([[0.25, 0.3, 0.002], [0.7, 0.3, 0.002], [0.7, 0.7, 0.002], [0.25, 0.7, 0.002]], rng.pick(['#c75b4a', '#3a6ea5', '#e2b43c', '#6b4a8a', '#2f6f4f']));
  // bed
  const bedC = rng.pick(['#f2f2f2', '#dfe7ea', '#f3e3d3']);
  box(0.05, 0.55, 0, 0.38, 0.4, 0.1, bedC, shade(bedC, -0.12), shade(bedC, -0.06));
  box(0.05, 0.88, 0.1, 0.38, 0.07, 0.05, '#ffffff', '#e6e6e6', '#eeeeee');
  box(0.05, 0.93, 0, 0.38, 0.05, 0.22, '#6b4a2e', '#5a3d25', '#634329');
  // kitchenette along the back-left wall
  const kitchenLen = feats.has('Tiny kitchen') ? 0.25 : feats.has('Renovated kitchen') ? 0.55 : 0.4;
  box(0.95 - 0.12, 0.05, 0, 0.12, kitchenLen, 0.2, '#d9d4cb', '#b8b2a6', '#c7c1b5');
  box(0.95 - 0.1, 0.07, 0.2, 0.08, 0.08, 0.003, '#333', '#333', '#333');
  if (listing.type !== 'room') {
    // sofa
    const sofa = rng.pick(['#3a6ea5', '#2f6f4f', '#8a3e52', '#6b6f75', '#c9a86a']);
    box(0.3, 0.05, 0, 0.35, 0.14, 0.1, sofa, shade(sofa, -0.15), shade(sofa, -0.08));
    box(0.3, 0.05, 0.1, 0.35, 0.04, 0.1, shade(sofa, 0.05), shade(sofa, -0.1), shade(sofa, -0.05));
  }
  // table + plant + lamp
  box(0.45, 0.45, 0, 0.12, 0.12, 0.12, '#8a6a4a', '#6b4f36', '#7a5c40');
  box(0.07, 0.07, 0, 0.06, 0.06, 0.07, '#b5523b', '#9b4a3c', '#a65a44');
  quad([[0.05, 0.05, 0.07], [0.15, 0.05, 0.07], [0.15, 0.15, 0.2], [0.05, 0.15, 0.2]], '#4f8a3c');
  if (feats.has('Private balcony')) quad([[1, 0.02, 0], [1, 0.12, 0], [1, 0.12, 0.5], [1, 0.02, 0.5]], '#bcd9ee', '#6b6f75');
  // roommate door
  if (listing.roommates) {
    quad([[0.6, 1, 0], [0.72, 1, 0], [0.72, 1, 0.42], [0.6, 1, 0.42]], '#8a6a4a', '#5a3d25');
  }
  // light & vignette
  const grad = g.createRadialGradient(width * 0.7, height * 0.2, 10, width / 2, height / 2, width * 0.7);
  grad.addColorStop(0, `rgba(255,245,220,${0.08 + q * 0.03})`);
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);
  return c;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let gg = (n >> 8) & 255;
  let b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  r = f(r);
  gg = f(gg);
  b = f(b);
  return `rgb(${r},${gg},${b})`;
}
