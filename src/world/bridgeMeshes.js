// Walkable bridges: deck ribbons, towers, cables and support columns.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { patchSurface } from './materials.js';

const STYLE = {
  brooklyn: { deck: '#7d6a55', side: '#5c5146', tower: '#a79a86', towerH: 46, cable: '#3a3a3a' },
  manhattan: { deck: '#6d6f73', side: '#4d6f91', tower: '#5b83a8', towerH: 52, cable: '#2c3e50' },
  williamsburg: { deck: '#6d6f73', side: '#77797d', tower: '#8c8f93', towerH: 44, cable: '#3d3f42' },
  queensboro: { deck: '#6d6f73', side: '#7b7560', tower: '#9a9380', towerH: 24, cable: '#5d584c' },
  simple: { deck: '#6d6f73', side: '#5d6167', tower: '#8a8a8a', towerH: 0, cable: '#555' },
  highline: { deck: '#9a9384', side: '#3d3f42', tower: '#3d3f42', towerH: 0, cable: '#555' },
};

export class BridgeMeshes {
  constructor(scene, model) {
    this.group = new THREE.Group();
    this.group.name = 'bridges';
    scene.add(this.group);
    const solid = new GeometryBatch();
    const rails = new GeometryBatch();
    const lines = [];
    for (const b of model.bridges) this._build(b, model, solid, rails, lines);
    const solidMesh = new THREE.Mesh(solid.build(), patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { snowScale: 0.9, key: 'bridge' }));
    solidMesh.castShadow = true;
    solidMesh.receiveShadow = true;
    this.group.add(solidMesh);
    const railMesh = new THREE.Mesh(rails.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.group.add(railMesh);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.group.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#2f3134' })));
  }

  _build(b, model, solid, rails, lines) {
    const st = STYLE[b.style] || STYLE.simple;
    const W = b.width;
    const step = 6;
    const n = Math.max(2, Math.ceil(b.length / step));
    const samples = [];
    for (let i = 0; i <= n; i++) {
      const s = (i / n) * b.length;
      const p = model.bridgePoint(b, s);
      samples.push({ s, x: p.x, z: p.z, dx: p.dx, dz: p.dz, px: -p.dz, pz: p.dx, h: model.bridgeHeight(b, s) + 0.02 });
    }
    const deckC = new THREE.Color(st.deck);
    const sideC = new THREE.Color(st.side);
    const thick = b.style === 'highline' ? 1.1 : 1.6;
    for (let i = 0; i < samples.length - 1; i++) {
      const a = samples[i];
      const c = samples[i + 1];
      const L = (p, sgn, y) => [p.x + p.px * (W / 2) * sgn, y, p.z + p.pz * (W / 2) * sgn];
      // top
      solid.quad(L(a, 1, a.h), L(c, 1, c.h), L(c, -1, c.h), L(a, -1, a.h), [0, 1, 0], deckC);
      // make sure the top faces up (fix winding by checking)
      // sides
      solid.quad(L(a, -1, a.h - thick), L(c, -1, c.h - thick), L(c, -1, c.h), L(a, -1, a.h), [-a.px, 0, -a.pz], sideC);
      solid.quad(L(c, 1, c.h - thick), L(a, 1, a.h - thick), L(a, 1, a.h), L(c, 1, c.h), [a.px, 0, a.pz], sideC);
      // underside
      solid.quad(L(a, -1, a.h - thick), L(a, 1, a.h - thick), L(c, 1, c.h - thick), L(c, -1, c.h - thick), [0, -1, 0], sideC);
      // railings (double sided)
      for (const sgn of [1, -1]) {
        const r0 = L(a, sgn, a.h);
        const r1 = L(c, sgn, c.h);
        rails.quad(r0, r1, [r1[0], r1[1] + 1.15, r1[2]], [r0[0], r0[1] + 1.15, r0[2]], [a.px * sgn, 0, a.pz * sgn], b.style === 'highline' ? '#3d3f42' : '#4a4d52');
      }
      // High Line planting beds
      if (b.style === 'highline' && i % 2 === 0) {
        const mx = (a.x + c.x) / 2;
        const mz = (a.z + c.z) / 2;
        const off = W / 2 - 1.4;
        solid.box(mx + a.px * off - 1.2, mx + a.px * off + 1.2, a.h, a.h + 0.6, mz + a.pz * off - 1.2, mz + a.pz * off + 1.2, '#5f8a45');
      }
    }
    // Support columns over land (collidable)
    for (let s = 20; s < b.length - 10; s += b.style === 'highline' ? 18 : 30) {
      const p = model.bridgePoint(b, s);
      const h = model.bridgeHeight(b, s);
      if (h < 3.5 || !model.isLand(p.x, p.z)) continue;
      const offs = b.style === 'highline' ? [W / 2 - 1, -(W / 2 - 1)] : [0];
      for (const o of offs) {
        const cx = p.x - p.dz * o;
        const cz = p.z + p.dx * o;
        solid.box(cx - 0.9, cx + 0.9, 0, h - thick, cz - 0.9, cz + 0.9, st.side === '#3d3f42' ? '#3d3f42' : '#8a8378');
        model.addCollider({ x: cx, z: cz, r: 1.0, y0: -1, y1: h - thick - 0.5 });
      }
    }
    if (!st.towerH) return;
    // Towers
    const towerTops = [];
    for (const t of b.towers) {
      const s = t * b.length;
      const p = model.bridgePoint(b, s);
      const h = model.bridgeHeight(b, s);
      const H = h + st.towerH;
      const ax = p.dx;
      const az = p.dz;
      const px = -az;
      const pz = ax;
      const tower = (lat0, lat1, along0, along1, y0, y1, color) => {
        // oriented box from lateral/along ranges
        const P = (lat, al, y) => [p.x + px * lat + ax * al, y, p.z + pz * lat + az * al];
        const c = new THREE.Color(color);
        solid.quad(P(lat0, along1, y1), P(lat1, along1, y1), P(lat1, along0, y1), P(lat0, along0, y1), [0, 1, 0], c);
        solid.quad(P(lat0, along1, y0), P(lat1, along1, y0), P(lat1, along1, y1), P(lat0, along1, y1), [ax, 0, az], c);
        solid.quad(P(lat1, along0, y0), P(lat0, along0, y0), P(lat0, along0, y1), P(lat1, along0, y1), [-ax, 0, -az], c);
        solid.quad(P(lat1, along1, y0), P(lat1, along0, y0), P(lat1, along0, y1), P(lat1, along1, y1), [px, 0, pz], c);
        solid.quad(P(lat0, along0, y0), P(lat0, along1, y0), P(lat0, along1, y1), P(lat0, along0, y1), [-px, 0, -pz], c);
      };
      const half = W / 2;
      if (b.style === 'brooklyn') {
        tower(-half - 10, half + 10, -9, 9, -1.5, h - 3, '#8f846f');
        tower(-half - 7, -half, -6, 6, h - 3, H, st.tower);
        tower(half, half + 7, -6, 6, h - 3, H, st.tower);
        tower(-half, half, -6, 6, h + 24, H, st.tower);
        tower(-half * 0.3, half * 0.3, -6, 6, h + 18, h + 24, st.tower);
        tower(-half - 7.5, half + 7.5, -6.5, 6.5, H - 3, H - 2, '#968a74');
        // pointed arch windows (dark)
        tower(-half * 0.8, -half * 0.35, -6.05, 6.05, h + 25, h + 38, '#3f3a33');
        tower(half * 0.35, half * 0.8, -6.05, 6.05, h + 25, h + 38, '#3f3a33');
      } else if (b.style === 'queensboro') {
        tower(-half - 4, half + 4, -8, 8, -1.5, h - 2, '#8f846f');
        for (const lat of [-half - 1.5, half + 1.5]) {
          for (const al of [-5, 5]) tower(lat - 1, lat + 1, al - 1, al + 1, h - 2, H, st.tower);
        }
        tower(-half - 2.5, half + 2.5, -6, 6, H - 3, H - 1.5, st.tower);
      } else {
        tower(-half - 4, half + 4, -6, 6, -1.5, h - 2, '#7d7a72');
        tower(-half - 2.5, -half, -2, 2, h - 2, H, st.tower);
        tower(half, half + 2.5, -2, 2, h - 2, H, st.tower);
        tower(-half - 2.5, half + 2.5, -2, 2, H - 3, H, st.tower);
        for (let y = h + 8; y < H - 6; y += 12) tower(-half, half, -1.2, 1.2, y, y + 1.2, st.tower);
      }
      towerTops.push({ s, H });
    }
    // Cables
    const pushLine = (a, c) => lines.push(a[0], a[1], a[2], c[0], c[1], c[2]);
    if (b.style === 'queensboro') {
      for (const sgn of [1, -1]) {
        let prev = null;
        for (let s = 0; s <= b.length; s += 8) {
          const p = model.bridgePoint(b, s);
          const h = model.bridgeHeight(b, s);
          let bump = 6;
          for (const t of towerTops) bump = Math.max(bump, 22 - Math.abs(s - t.s) * 0.35);
          const top = [p.x - p.dz * sgn * (W / 2 + 0.5), h + bump, p.z + p.dx * sgn * (W / 2 + 0.5)];
          const bot = [top[0], h, top[2]];
          if (h > 4) pushLine(top, bot);
          if (prev) {
            pushLine(prev.top, top);
            if (h > 4) pushLine(prev.top, bot);
          }
          prev = { top, bot };
        }
      }
      return;
    }
    const cableY = (s) => {
      const t0 = towerTops[0];
      const t1 = towerTops[towerTops.length - 1];
      const h = model.bridgeHeight(b, s);
      if (s <= t0.s) return h + 1.5 + (t0.H - 2 - h - 1.5) * Math.pow(s / t0.s, 1.6);
      if (s >= t1.s) return h + 1.5 + (t1.H - 2 - h - 1.5) * Math.pow((b.length - s) / (b.length - t1.s), 1.6);
      const u = (s - t0.s) / (t1.s - t0.s);
      const sag = 4 * u * (1 - u);
      return t0.H - 2 - (t0.H - 2 - h - 3) * sag;
    };
    for (const sgn of [1, -1]) {
      let prev = null;
      for (let s = 0; s <= b.length; s += 6) {
        const p = model.bridgePoint(b, s);
        const h = model.bridgeHeight(b, s);
        const lat = sgn * (W / 2 + 0.3);
        const top = [p.x - p.dz * lat, cableY(s), p.z + p.dx * lat];
        if (prev) pushLine(prev, top);
        if (h > 3) pushLine(top, [top[0], h + 0.2, top[2]]);
        prev = top;
      }
      if (b.style === 'brooklyn') {
        // Diagonal stays fanning from tower tops
        for (const t of towerTops) {
          const tp = model.bridgePoint(b, t.s);
          const lat = sgn * (W / 2 + 0.3);
          const top = [tp.x - tp.dz * lat, t.H - 3, tp.z + tp.dx * lat];
          for (let d = -90; d <= 90; d += 12) {
            if (d === 0) continue;
            const s = t.s + d;
            if (s < 0 || s > b.length) continue;
            const p = model.bridgePoint(b, s);
            pushLine(top, [p.x - p.dz * lat, model.bridgeHeight(b, s) + 0.3, p.z + p.dx * lat]);
          }
        }
      }
    }
  }
}
