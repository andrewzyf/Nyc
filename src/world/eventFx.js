// Visuals for live events: parade floats & balloons, stages, market tents, film sets,
// police cars at accidents, fireworks and confetti. Also feeds crowds + closures.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { createGlowMaterial, WORLD_UNIFORMS } from './materials.js';
import { makeSoftDot, makeTextTexture } from './textures.js';

const THEMES = {
  green: ['#1e9e4a', '#ffffff', '#f7c325'],
  pastel: ['#f7c6d9', '#c6e2f7', '#fff3b0', '#d9f7c6'],
  'puerto-rico': ['#ed1c24', '#ffffff', '#0050f0'],
  rainbow: ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'],
  caribbean: ['#ffd100', '#009b3a', '#ce1126', '#ff6f00', '#00b5e2'],
  halloween: ['#ff7518', '#1b1b1b', '#6b2fa0', '#39ff14'],
  balloons: ['#e63946', '#f1c40f', '#3498db', '#2ecc71', '#9b59b6'],
  lunar: ['#d62828', '#f7c325', '#ffffff'],
  marathon: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#17becf'],
  protest: ['#f4efe2', '#e8d5a8', '#ffffff'],
  holiday: ['#c0392b', '#27ae60', '#ffffff'],
  fair: ['#e74c3c', '#f1c40f', '#3498db', '#2ecc71', '#ffffff'],
  italian: ['#009246', '#ffffff', '#ce2b37'],
  concert: ['#ff4f81', '#6a00ff', '#00e5ff'],
  blockparty: ['#ff4f81', '#f1c40f', '#00e5ff', '#2ecc71'],
  filming: ['#ffffff'],
  nye: ['#ffd700', '#ffffff', '#ff4f81', '#00e5ff'],
};

function routeLength(route) {
  let L = 0;
  for (let i = 0; i < route.length - 1; i++) L += Math.hypot(route[i + 1][0] - route[i][0], route[i + 1][1] - route[i][1]);
  return L;
}

function routePoint(route, s) {
  let acc = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const [ax, az] = route[i];
    const [bx, bz] = route[i + 1];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= acc + l || i === route.length - 2) {
      const t = Math.max(0, Math.min(1, (s - acc) / l));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l };
    }
    acc += l;
  }
  return { x: route[0][0], z: route[0][1], dx: 0, dz: 1 };
}

export class EventFx {
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.groups = new Map();
    this.solidMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.redLight = createGlowMaterial('#ff2020', { base: 1.2, night: 2.4, key: 'police-r' });
    this.blueLight = createGlowMaterial('#2050ff', { base: 1.2, night: 2.4, key: 'police-b' });
    this.movers = [];
    this.policeLights = [];
    this._buildFireworks();
    this._buildConfetti();
    this.fireworksOn = false;
    this.confettiOn = false;
  }

  _group(key) {
    const g = new THREE.Group();
    g.name = `event-${key}`;
    this.scene.add(g);
    return g;
  }

  _addBatchMesh(group, batch, glow = false) {
    if (batch.empty) return null;
    const m = new THREE.Mesh(batch.build(), glow ? this.glowMat : this.solidMat);
    m.castShadow = !glow;
    group.add(m);
    return m;
  }

  /** Sync visuals with active events + incidents. Returns crowd/closure data. */
  sync(events, incidents) {
    const want = new Set();
    for (const e of events) want.add(e.key);
    for (const i of incidents) want.add(i.key);
    for (const [key, g] of this.groups) {
      if (!want.has(key)) {
        this.scene.remove(g.group);
        g.group.traverse((o) => o.geometry?.dispose?.());
        this.groups.delete(key);
      }
    }
    for (const e of events) if (!this.groups.has(e.key)) this.groups.set(e.key, this._build(e));
    for (const i of incidents) if (!this.groups.has(i.key)) this.groups.set(i.key, this._buildIncident(i));
    this.fireworksOn = events.some((e) => e.kind === 'fireworks');
    const nye = events.find((e) => e.kind === 'balldrop');
    this.confettiOn = !!nye;

    const attractors = [];
    const marchers = [];
    const closures = [];
    for (const g of this.groups.values()) {
      attractors.push(...g.crowd.attractors);
      marchers.push(...g.crowd.marchers);
      closures.push(...g.crowd.closures);
    }
    return { attractors, marchers, closures };
  }

  /** Crowd + closure data for one event (computed once so object identity is stable). */
  _crowdFor(e) {
    const attractors = [];
    const marchers = [];
    const closures = [];
    const theme = THEMES[e.theme] || THEMES.fair;
    if (e.route && ['parade', 'marathon', 'protest'].includes(e.kind)) {
      const L = routeLength(e.route);
      marchers.push({ route: e.route, length: L, width: e.kind === 'marathon' ? 12 : 14, speed: e.kind === 'marathon' ? 3.6 : 1.1, count: e.kind === 'protest' ? 45 : 40, colors: theme, signs: e.kind === 'protest', loop: true });
      const n = Math.max(2, Math.floor(L / 120));
      for (let k = 0; k <= n; k++) {
        const p = routePoint(e.route, (k / n) * L);
        for (const side of [-1, 1]) attractors.push({ x: p.x - p.dz * side * 14, z: p.z + p.dx * side * 14, radius: 5, inner: 0, count: 6, kind: 'watch' });
      }
      closures.push(...this._corridorRects(e.route, 13));
    } else if (e.route && (e.kind === 'fair' || e.theme === 'fair' || e.theme === 'italian')) {
      closures.push(...this._corridorRects(e.route, 11));
      const L = routeLength(e.route);
      marchers.push({ route: [...e.route, ...e.route.slice().reverse()], length: L * 2, width: 6, speed: 0.9, count: 30, loop: true });
    } else if (e.at) {
      const r = e.radius || 50;
      const count = e.kind === 'balldrop' ? 90 : e.kind === 'fireworks' ? 25 : ['concert', 'festival', 'movie', 'theater', 'blockparty'].includes(e.kind) ? 45 : 18;
      attractors.push({ x: e.at[0], z: e.at[1], radius: r * 0.8, inner: e.kind === 'filming' ? 8 : 10, count, kind: 'watch' });
      if (e.kind === 'skating') {
        const loop = [];
        for (let k = 0; k <= 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          loop.push([e.at[0] + Math.cos(a) * 18, e.at[1] + Math.sin(a) * 9]);
        }
        marchers.push({ route: loop, length: routeLength(loop), width: 6, speed: 2.2, count: 16, loop: true });
      }
    }
    return { attractors, marchers, closures };
  }

  _crowdForIncident(i) {
    const closures = i.kind === 'accident' ? [{ x0: i.x - 12, x1: i.x + 12, z0: i.z - 12, z1: i.z + 12 }] : [];
    return { attractors: [{ x: i.x + 14, z: i.z + 14, radius: 6, inner: 0, count: 5, kind: 'watch' }], marchers: [], closures };
  }

  _corridorRects(route, half) {
    const out = [];
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i];
      const [bx, bz] = route[i + 1];
      out.push({ x0: Math.min(ax, bx) - half, x1: Math.max(ax, bx) + half, z0: Math.min(az, bz) - half, z1: Math.max(az, bz) + half });
    }
    return out;
  }

  _barricades(batch, route, half) {
    const L = routeLength(route);
    for (let s = 0; s < L; s += 7) {
      const p = routePoint(route, s);
      for (const side of [-1, 1]) {
        const x = p.x - p.dz * side * half;
        const z = p.z + p.dx * side * half;
        batch.orientedBox(x, 0.2, z, 2.2, 0.9, 0.12, Math.atan2(p.dx, p.dz) + Math.PI / 2, '#2a5db0');
      }
    }
  }

  _build(e) {
    const group = this._group(e.key);
    const solid = new GeometryBatch();
    const glow = new GeometryBatch();
    const theme = THEMES[e.theme] || THEMES.fair;
    const entry = { group, event: e, movers: [], crowd: this._crowdFor(e) };
    if (e.route && ['parade', 'marathon', 'protest'].includes(e.kind)) {
      this._barricades(solid, e.route, 12);
      if (e.kind === 'parade') {
        const L = routeLength(e.route);
        const nFloats = Math.max(3, Math.floor(L / 90));
        for (let k = 0; k < nFloats; k++) {
          const fb = new GeometryBatch();
          const c = theme[k % theme.length];
          fb.box(-3, 3, 0.6, 3, -6, 6, c);
          fb.box(-2.4, 2.4, 3, 5 + (k % 3), -3, 3, theme[(k + 1) % theme.length]);
          fb.prism(0, 0, 5 + (k % 3), 7 + (k % 3), 1.8, 0.2, 6, theme[(k + 2) % theme.length]);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) fb.box(sx * 2.6 - 0.25, sx * 2.6 + 0.25, 0, 0.7, sz * 4.5 - 0.4, sz * 4.5 + 0.4, '#1b1b1b');
          const float = new THREE.Mesh(fb.build(), this.solidMat);
          float.castShadow = true;
          group.add(float);
          entry.movers.push({ obj: float, route: e.route, length: L, s: (k / nFloats) * L, speed: 1.3, y: 0 });
          if (e.balloons) {
            const bb = new GeometryBatch();
            const bc = THEMES.balloons[k % THEMES.balloons.length];
            bb.prism(0, 0, 0, 7, 3, 5.5, 10, bc);
            bb.prism(0, 0, 7, 12, 5.5, 2, 10, bc);
            bb.prism(0, 0, 12, 15, 2.6, 2.2, 10, '#ffe0c0');
            bb.box(-4.5, 4.5, 8, 9, -0.6, 0.6, bc);
            const balloon = new THREE.Mesh(bb.build(), this.solidMat);
            group.add(balloon);
            entry.movers.push({ obj: balloon, route: e.route, length: L, s: (k / nFloats) * L + 30, speed: 1.3, y: 18, bob: true });
          }
        }
      }
      if (e.kind === 'protest' || e.kind === 'marathon') {
        const car = this._policeCar(group, 0, 0, 0);
        const L = routeLength(e.route);
        entry.movers.push({ obj: car, route: e.route, length: L, s: 0, speed: e.kind === 'marathon' ? 3.6 : 1.1, y: 0 });
      }
      if (e.kind === 'marathon') {
        const p = routePoint(e.route, routeLength(e.route) * 0.5);
        solid.box(p.x + 12, p.x + 16, 0, 1, p.z - 4, p.z + 4, '#dddddd');
        for (let i = 0; i < 8; i++) solid.prism(p.x + 12.5 + (i % 4), p.z - 3 + Math.floor(i / 4) * 5, 1, 1.25, 0.1, 0.12, 6, '#e8f4ff');
      }
    } else if (e.at) {
      const [x, z] = e.at;
      const y0 = this.model.groundHeightAt(x, z);
      switch (e.kind) {
        case 'concert':
        case 'festival':
        case 'theater': {
          if (e.id === 'tree-lighting' || e.id === 'cherry-blossoms') break;
          // stage with truss and lights, audience faces +z
          solid.box(x - 10, x + 10, y0, y0 + 1.4, z - 16, z - 6, '#2b2b2b');
          solid.box(x - 10.3, x - 9.7, y0, y0 + 9, z - 16, z - 15.4, '#555');
          solid.box(x + 9.7, x + 10.3, y0, y0 + 9, z - 16, z - 15.4, '#555');
          solid.box(x - 10.3, x + 10.3, y0 + 8.6, y0 + 9.2, z - 16, z - 6, '#555');
          solid.box(x - 10, x + 10, y0 + 1.4, y0 + 8.5, z - 16.2, z - 15.8, '#141414');
          for (let i = 0; i < 6; i++) glow.box(x - 8 + i * 3.2, x - 7.2 + i * 3.2, y0 + 8.1, y0 + 8.6, z - 9, z - 8.2, theme[i % theme.length]);
          solid.box(x - 12, x - 10.5, y0, y0 + 4, z - 12, z - 9, '#1b1b1b');
          solid.box(x + 10.5, x + 12, y0, y0 + 4, z - 12, z - 9, '#1b1b1b');
          break;
        }
        case 'movie': {
          solid.box(x - 0.3, x + 0.3, y0, y0 + 9, z - 14, z - 13.4, '#333');
          glow.box(x - 9, x + 9, y0 + 2, y0 + 11, z - 13.3, z - 13.2, '#cfe6ff');
          break;
        }
        case 'market':
        case 'fair': {
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this._tent(solid, x + Math.cos(a) * 18, z + Math.sin(a) * 12, theme[i % theme.length], y0);
          }
          break;
        }
        case 'filming': {
          solid.box(x + 10, x + 13, y0, y0 + 3.4, z - 7, z + 5, '#f2f2f2');
          solid.box(x + 15, x + 18, y0, y0 + 3.4, z - 7, z + 5, '#f2f2f2');
          for (const [lx, lz] of [
            [-6, -4],
            [6, -5],
            [-5, 6],
          ]) {
            solid.prism(x + lx, z + lz, y0, y0 + 3.5, 0.05, 0.05, 4, '#222');
            glow.box(x + lx - 0.6, x + lx + 0.6, y0 + 3.4, y0 + 4.4, z + lz - 0.3, z + lz + 0.3, '#fffbe8');
          }
          for (let i = 0; i < 6; i++) solid.prism(x - 9 + i * 1.3, z + 9, y0, y0 + 0.7, 0.25, 0.05, 4, '#ff7a1a');
          this.text(group, 'QUIET ON SET', x + 11.5, y0 + 2.4, z + 5.05, 3, 0.8);
          break;
        }
        case 'blockparty': {
          solid.box(x - 1.2, x + 1.2, y0, y0 + 1, z - 0.6, z + 0.6, '#2b2b2b');
          solid.box(x - 1.8, x - 1.2, y0, y0 + 1.6, z - 0.5, z + 0.5, '#111');
          solid.box(x + 1.2, x + 1.8, y0, y0 + 1.6, z - 0.5, z + 0.5, '#111');
          solid.box(x + 8, x + 13, y0, y0 + 3, z - 3, z + 3, '#ff4f81');
          solid.box(x + 8.3, x + 12.7, y0 + 3, y0 + 4.5, z - 2.7, z + 2.7, '#f1c40f');
          solid.box(x - 10, x - 8.5, y0, y0 + 1, z - 1, z + 1, '#333');
          break;
        }
        case 'skating':
          break;
        case 'fleet': {
          const ship = new GeometryBatch();
          ship.box(-10, 10, -1, 6, -60, 60, '#7f8b95');
          ship.box(-7, 7, 6, 16, -20, 10, '#8e9aa3');
          ship.box(-2, 2, 16, 30, -8, -2, '#6f7a83');
          const m = new THREE.Mesh(ship.build(), this.solidMat);
          m.position.set(x, -0.8, z);
          group.add(m);
          break;
        }
        default:
          break;
      }
    }
    if (e.route && (e.kind === 'fair' || e.theme === 'fair' || e.theme === 'italian')) {
      const L = routeLength(e.route);
      for (let s = 6; s < L; s += 11) {
        const p = routePoint(e.route, s);
        for (const side of [-1, 1]) this._tent(solid, p.x - p.dz * side * 4.5, p.z + p.dx * side * 4.5, theme[Math.floor(s / 11) % theme.length], 0);
      }
    }
    this._addBatchMesh(group, solid);
    this._addBatchMesh(group, glow, true);
    this.movers.push(...entry.movers);
    return entry;
  }

  _tent(batch, x, z, color, y0) {
    for (const [dx, dz] of [
      [-1.4, -1.4],
      [1.4, -1.4],
      [-1.4, 1.4],
      [1.4, 1.4],
    ])
      batch.prism(x + dx, z + dz, y0, y0 + 2.3, 0.05, 0.05, 4, '#dddddd');
    batch.prism(x, z, y0 + 2.3, y0 + 3.3, 2.2, 0.05, 4, color, { rot: Math.PI / 4 });
    batch.box(x - 1.3, x + 1.3, y0 + 0.8, y0 + 0.95, z - 0.6, z + 0.6, '#f5f5f5');
  }

  text(group, str, x, y, z, w, h) {
    const tex = makeTextTexture(str, { width: 256, height: 64, color: '#111', bg: '#f4f4f4' });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(x, y, z);
    group.add(m);
  }

  _policeCar(group, x, y, z) {
    const b = new GeometryBatch();
    b.box(-0.95, 0.95, 0.38, 1.0, -2.3, 2.3, '#f4f4f4');
    b.box(-0.85, 0.85, 1.0, 1.55, -1.2, 0.9, '#27313a');
    b.box(-0.96, 0.96, 0.55, 0.75, -2.31, 2.31, '#1f4ea8');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.98 - 0.12, sx * 0.98 + 0.12, 0, 0.72, sz * 1.55 - 0.36, sz * 1.55 + 0.36, '#1b1b1b');
    const car = new THREE.Group();
    car.add(new THREE.Mesh(b.build(), this.solidMat));
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), this.redLight);
    red.position.set(-0.35, 1.64, 0);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.3), this.blueLight);
    blue.position.set(0.35, 1.64, 0);
    car.add(red, blue);
    car.position.set(x, y, z);
    group.add(car);
    this.policeLights.push({ red, blue });
    return car;
  }

  _buildIncident(i) {
    const group = this._group(i.key);
    const solid = new GeometryBatch();
    if (i.kind === 'accident') {
      solid.orientedBox(i.x - 1.5, 0.35, i.z + 0.5, 1.9, 1.1, 4.6, 0.5, '#8a8f96');
      solid.orientedBox(i.x + 1.8, 0.35, i.z - 0.8, 1.9, 1.1, 4.6, -0.9, '#f7c325');
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        solid.prism(i.x + Math.cos(a) * 9, i.z + Math.sin(a) * 9, 0, 0.75, 0.25, 0.04, 5, '#ff7a1a');
      }
      this._policeCar(group, i.x + 6, 0, i.z - 6);
    }
    this._addBatchMesh(group, solid);
    return { group, incident: i, movers: [], crowd: this._crowdForIncident(i) };
  }

  _buildFireworks() {
    const N = 1800;
    const g = new THREE.BufferGeometry();
    this.fwPos = new Float32Array(N * 3);
    this.fwVel = new Float32Array(N * 3);
    this.fwCol = new Float32Array(N * 3);
    this.fwLife = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.fwPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.fwCol, 3));
    const m = new THREE.PointsMaterial({ size: 4.5, vertexColors: true, map: makeSoftDot(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    this.fireworks = new THREE.Points(g, m);
    this.fireworks.frustumCulled = false;
    this.fireworks.visible = false;
    this.scene.add(this.fireworks);
    this.fwNext = 0;
    this.fwCursor = 0;
  }

  _buildConfetti() {
    const N = 1500;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      pos.set([-260 + Math.random() * 110, Math.random() * 60, -110 + Math.random() * 130], i * 3);
      c.set(THEMES.nye[i % THEMES.nye.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.35, vertexColors: true }));
    this.confetti.frustumCulled = false;
    this.confetti.visible = false;
    this.scene.add(this.confetti);
  }

  update(dt, { night, minuteOfDay }) {
    // movers
    for (const m of this.movers) {
      if (!m.obj.parent) continue;
      m.s = (m.s + m.speed * dt) % m.length;
      const p = routePoint(m.route, m.s);
      m.obj.position.set(p.x, (m.y || 0) + (m.bob ? Math.sin(performance.now() * 0.001 + m.s) * 0.8 : 0), p.z);
      m.obj.rotation.y = Math.atan2(p.dx, p.dz);
    }
    this.movers = this.movers.filter((m) => m.obj.parent);
    // police lights
    this.policeLights = this.policeLights.filter((p) => {
      let o = p.red;
      while (o.parent) o = o.parent;
      return o === this.scene;
    });
    const on = Math.floor(performance.now() / 250) % 2 === 0;
    for (const p of this.policeLights) {
      p.red.visible = on;
      p.blue.visible = !on;
    }
    // fireworks
    this.fireworks.visible = this.fireworksOn && night > 0.5;
    if (this.fireworks.visible) {
      this.fwNext -= dt;
      const N = this.fwLife.length;
      if (this.fwNext <= 0) {
        this.fwNext = 0.35 + Math.random() * 0.6;
        const cx = 600 + Math.random() * 250;
        const cy = 110 + Math.random() * 90;
        const cz = 700 + Math.random() * 500;
        const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
        const count = 120;
        for (let k = 0; k < count; k++) {
          const i = this.fwCursor;
          this.fwCursor = (this.fwCursor + 1) % N;
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          const sp = 18 + Math.random() * 10;
          this.fwPos.set([cx, cy, cz], i * 3);
          this.fwVel.set([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp], i * 3);
          this.fwCol.set([c.r, c.g, c.b], i * 3);
          this.fwLife[i] = 2.4;
        }
      }
      for (let i = 0; i < N; i++) {
        if (this.fwLife[i] <= 0) {
          this.fwPos[i * 3 + 1] = -500;
          continue;
        }
        this.fwLife[i] -= dt;
        this.fwVel[i * 3 + 1] -= 9 * dt;
        for (let k = 0; k < 3; k++) {
          this.fwVel[i * 3 + k] *= 1 - dt * 0.9;
          this.fwPos[i * 3 + k] += this.fwVel[i * 3 + k] * dt;
        }
        const f = Math.max(0, this.fwLife[i] / 2.4);
        this.fwCol[i * 3] *= 0.995 + f * 0.005;
      }
      this.fireworks.geometry.attributes.position.needsUpdate = true;
      this.fireworks.geometry.attributes.color.needsUpdate = true;
    }
    // Confetti around midnight on NYE
    this.confetti.visible = this.confettiOn && (minuteOfDay >= 1438 || minuteOfDay < 20);
    if (this.confetti.visible) {
      const pos = this.confetti.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - dt * (1.5 + (i % 7) * 0.2);
        if (y < 0) y = 60;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(WORLD_UNIFORMS.uTime.value + i) * dt * 0.8);
      }
      pos.needsUpdate = true;
    }
  }
}
