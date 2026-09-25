// Cars on the street grid with signalized intersections, near the player only.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { createGlowMaterial, patchSurface } from './materials.js';
import { rectContains } from '../core/math.js';

const CYCLE = 34;
const tmp = new THREE.Object3D();
const col = new THREE.Color();

/** Signal state for an intersection: returns 'g' | 'y' | 'r' for the given travel axis. */
export function signalFor(it, axis, t) {
  const off = ((it.x * 0.031 + it.z * 0.047) % CYCLE + CYCLE) % CYCLE;
  const p = (t + off) % CYCLE;
  // 0-14 N-S green, 14-17 N-S yellow, 17-31 E-W green, 31-34 E-W yellow
  if (axis === 'x') return p < 14 ? 'g' : p < 17 ? 'y' : 'r';
  return p >= 17 && p < 31 ? 'g' : p >= 31 ? 'y' : 'r';
}

function carGeometry(kind) {
  const b = new GeometryBatch();
  const W = '#ffffff';
  const glass = '#27313a';
  const tire = '#1b1b1b';
  if (kind === 'bus') {
    b.box(-1.3, 1.3, 0.5, 3.1, -6, 6, W);
    b.box(-1.31, 1.31, 1.6, 2.5, -5.6, 5.2, glass);
    b.box(-1.2, 1.2, 3.1, 3.3, -4, 4, '#dcdcdc');
  } else if (kind === 'truck') {
    b.box(-1.15, 1.15, 0.5, 3.2, -3.4, 1.4, W);
    b.box(-1.1, 1.1, 0.5, 2.1, 1.4, 3.2, '#e8e8e8');
    b.box(-1.0, 1.0, 1.4, 2.0, 2.2, 3.22, glass);
  } else {
    const suv = kind === 'suv';
    const len = suv ? 2.45 : 2.3;
    b.box(-0.95, 0.95, 0.38, suv ? 1.15 : 1.0, -len, len, W);
    b.box(-0.85, 0.85, suv ? 1.15 : 1.0, suv ? 1.85 : 1.55, suv ? -1.7 : -1.2, suv ? 1.2 : 0.9, glass);
    b.box(-0.8, 0.8, suv ? 1.85 : 1.55, suv ? 1.9 : 1.6, suv ? -1.6 : -1.1, suv ? 1.1 : 0.8, W);
    if (kind === 'taxi') b.box(-0.35, 0.35, 1.6, 1.85, -0.3, 0.3, '#fff6c9');
  }
  const L = kind === 'bus' ? 4.5 : kind === 'truck' ? 2.4 : 1.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * (kind === 'bus' ? 1.32 : 0.98) - 0.12, sx * (kind === 'bus' ? 1.32 : 0.98) + 0.12, 0, 0.72, sz * L - 0.36, sz * L + 0.36, tire);
  return b.build();
}

const TYPES = [
  { kind: 'taxi', w: 0.42, colors: ['#f7c325'] },
  { kind: 'sedan', w: 0.3, colors: ['#1f1f24', '#e8e8e8', '#8a8f96', '#2f4f6f', '#7a2e3a', '#3d5a3d', '#c9b28a', '#2d3440'] },
  { kind: 'suv', w: 0.18, colors: ['#1f1f24', '#e8e8e8', '#5a5f66', '#2a3a55'] },
  { kind: 'truck', w: 0.06, colors: ['#e8e8e8', '#8a4a2a', '#2f5d8a'] },
  { kind: 'bus', w: 0.04, colors: ['#1b6fb6'] },
];

export class Traffic {
  constructor(scene, model, { capacity = 60 } = {}) {
    this.model = model;
    this.capacity = capacity;
    this.cars = [];
    this.closures = [];
    this.time = 0;
    this.meshes = {};
    const bodyMat = patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { snowScale: 0.8, key: 'car' });
    for (const t of TYPES) {
      const m = new THREE.InstancedMesh(carGeometry(t.kind), bodyMat, capacity);
      m.count = 0;
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      scene.add(m);
      this.meshes[t.kind] = m;
    }
    const headGeo = new THREE.BoxGeometry(1.6, 0.18, 0.08);
    this.heads = new THREE.InstancedMesh(headGeo, createGlowMaterial('#fff2cc', { base: 0.1, night: 2.4, key: 'headlight' }), capacity);
    this.tails = new THREE.InstancedMesh(headGeo, createGlowMaterial('#ff2a2a', { base: 0.25, night: 2.0, key: 'taillight' }), capacity);
    for (const m of [this.heads, this.tails]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    for (let i = 0; i < capacity; i++) this.cars.push({ active: false, id: i });

    // Traffic signal heads near the player
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.12, 5.2, 6).translate(0, 2.6, 0);
    const armGeo = new THREE.BoxGeometry(0.12, 0.12, 5).translate(0, 5.1, -2.5);
    const lampGeo = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    this.sigCap = 260;
    this.poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: '#3a3f44' }), this.sigCap);
    this.arms = new THREE.InstancedMesh(armGeo, new THREE.MeshLambertMaterial({ color: '#3a3f44' }), this.sigCap);
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), this.sigCap * 2);
    this.lamps.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.sigCap * 2 * 3), 3);
    for (const m of [this.poles, this.arms, this.lamps]) {
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.sigItems = [];
    this.sigTimer = 0;
    this.lastSigX = Infinity;
    this.lastSigZ = Infinity;
  }

  setClosures(rects) {
    this.closures = rects;
  }

  _closedAt(x, z) {
    for (const c of this.closures) if (rectContains(c, x, z, 2)) return true;
    return false;
  }

  _spawn(car, px, pz) {
    const tracks = this.model.tracksNear(px, pz, 260);
    if (!tracks.length) return false;
    for (let tries = 0; tries < 5; tries++) {
      const tr = tracks[Math.floor(Math.random() * tracks.length)];
      // choose a spot on the track within range of the player
      const proj = tr.axis === 'x' ? pz : px;
      const lo = Math.max(tr.a + 8, proj - 220);
      const hi = Math.min(tr.b - 8, proj + 220);
      if (hi <= lo) continue;
      const along = lo + Math.random() * (hi - lo);
      const x = tr.axis === 'x' ? tr.p : along;
      const z = tr.axis === 'x' ? along : tr.p;
      const d = Math.hypot(x - px, z - pz);
      if (d < 45 || d > 240) continue;
      if (this._closedAt(x, z)) continue;
      // avoid spawning on top of another car
      if (this.cars.some((c) => c.active && c.track === tr && Math.abs(c.along - along) < 12)) continue;
      let r = Math.random();
      let type = TYPES[0];
      for (const t of TYPES) {
        if ((r -= t.w) <= 0) {
          type = t;
          break;
        }
      }
      if (type.kind === 'bus' && tr.w < 18) type = TYPES[1];
      Object.assign(car, {
        active: true,
        track: tr,
        along,
        speed: 6,
        max: (type.kind === 'bus' ? 8 : 10) + Math.random() * 3.5,
        type: type.kind,
        color: type.colors[Math.floor(Math.random() * type.colors.length)],
        half: type.kind === 'bus' ? 6.3 : type.kind === 'truck' ? 3.5 : 2.5,
        honk: 0,
      });
      return true;
    }
    return false;
  }

  update(dt, { player, timeSec, onHonk, active = true }) {
    this.time = timeSec;
    const px = player.x;
    const pz = player.z;
    // Spawn / despawn
    let count = 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      const x = c.track.axis === 'x' ? c.track.p : c.along;
      const z = c.track.axis === 'x' ? c.along : c.track.p;
      if (Math.hypot(x - px, z - pz) > 300 || c.along < c.track.a - 2 || c.along > c.track.b + 2) c.active = false;
      else count++;
    }
    const target = active ? this.capacity : 0;
    for (const c of this.cars) {
      if (count >= target) break;
      if (!c.active && this._spawn(c, px, pz)) count++;
    }
    // Group by track for following
    const byTrack = new Map();
    for (const c of this.cars) {
      if (!c.active) continue;
      if (!byTrack.has(c.track)) byTrack.set(c.track, []);
      byTrack.get(c.track).push(c);
    }
    for (const [tr, list] of byTrack) {
      list.sort((a, b) => (a.along - b.along) * tr.dir);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const ahead = list[i + 1];
        let limit = c.max;
        const dir = tr.dir;
        // car following
        if (ahead) {
          const gap = (ahead.along - c.along) * dir - ahead.half - c.half;
          if (gap < 14) limit = Math.min(limit, Math.max(0, (gap - 2.5) * 0.9));
        }
        // signals
        for (const st of tr.stops) {
          const stopLine = st.at - dir * (st.cross / 2 + 4.6);
          const dist = (stopLine - c.along) * dir - c.half;
          if (dist < -1 || dist > 40) continue;
          const sig = signalFor(st.it, tr.axis, timeSec);
          if (sig === 'r' || (sig === 'y' && dist > 6)) limit = Math.min(limit, Math.max(0, dist * 0.55));
          break;
        }
        // closures ahead
        for (let look = 6; look <= 30; look += 8) {
          const a2 = c.along + dir * (c.half + look);
          const x = tr.axis === 'x' ? tr.p : a2;
          const z = tr.axis === 'x' ? a2 : tr.p;
          if (this._closedAt(x, z)) {
            limit = Math.min(limit, Math.max(0, (look - 4) * 0.5));
            break;
          }
        }
        // player in the lane
        const cx = tr.axis === 'x' ? tr.p : c.along;
        const cz = tr.axis === 'x' ? c.along : tr.p;
        const rel = tr.axis === 'x' ? (pz - cz) * dir : (px - cx) * dir;
        const lat = tr.axis === 'x' ? Math.abs(px - cx) : Math.abs(pz - cz);
        if (lat < 1.9 && rel > 0 && rel < c.half + 11 && player.y < 2) {
          limit = Math.min(limit, Math.max(0, (rel - c.half - 2.5) * 0.6));
          c.honk -= dt;
          if (c.honk <= 0 && rel < c.half + 6) {
            c.honk = 4 + Math.random() * 4;
            onHonk?.(cx, cz);
          }
        }
        const accel = c.speed < limit ? 3.2 : -9;
        c.speed = Math.max(0, Math.min(limit, c.speed + accel * dt));
        if (c.speed > limit) c.speed = limit;
        c.along += dir * c.speed * dt;
      }
    }
    this._render();
    this._updateSignals(dt, px, pz, timeSec);
  }

  _render() {
    const counts = Object.fromEntries(TYPES.map((t) => [t.kind, 0]));
    let h = 0;
    for (const c of this.cars) {
      if (!c.active) continue;
      const tr = c.track;
      const x = tr.axis === 'x' ? tr.p : c.along;
      const z = tr.axis === 'x' ? c.along : tr.p;
      const rot = tr.axis === 'x' ? (tr.dir > 0 ? 0 : Math.PI) : tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      tmp.position.set(x, 0, z);
      tmp.rotation.set(0, rot, 0);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      const m = this.meshes[c.type];
      const i = counts[c.type]++;
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, col.set(c.color));
      // lights
      const fx = Math.sin(rot);
      const fz = Math.cos(rot);
      tmp.position.set(x + fx * (c.half + 0.03), 0.75, z + fz * (c.half + 0.03));
      tmp.updateMatrix();
      this.heads.setMatrixAt(h, tmp.matrix);
      tmp.position.set(x - fx * (c.half + 0.03), 0.85, z - fz * (c.half + 0.03));
      tmp.updateMatrix();
      this.tails.setMatrixAt(h, tmp.matrix);
      h++;
    }
    for (const t of TYPES) {
      const m = this.meshes[t.kind];
      m.count = counts[t.kind];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
    this.heads.count = this.tails.count = h;
    this.heads.instanceMatrix.needsUpdate = true;
    this.tails.instanceMatrix.needsUpdate = true;
  }

  _updateSignals(dt, px, pz, t) {
    if (Math.hypot(px - this.lastSigX, pz - this.lastSigZ) > 40) {
      this.lastSigX = px;
      this.lastSigZ = pz;
      this.sigItems = this.model.trafficLights.filter((s) => Math.abs(s.x - px) < 220 && Math.abs(s.z - pz) < 220).slice(0, this.sigCap);
      this.sigItems.forEach((s, i) => {
        tmp.position.set(s.x, 0.16, s.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        this.poles.setMatrixAt(i, tmp.matrix);
        this.arms.setMatrixAt(i, tmp.matrix);
      });
      this.poles.count = this.arms.count = this.sigItems.length;
      this.poles.instanceMatrix.needsUpdate = this.arms.instanceMatrix.needsUpdate = true;
    }
    this.sigTimer -= dt;
    if (this.sigTimer > 0) return;
    this.sigTimer = 0.25;
    const C = { g: '#39ff7a', y: '#ffc933', r: '#ff3b30' };
    let k = 0;
    for (const s of this.sigItems) {
      const nsSig = signalFor(s.it, 'x', t);
      const ewSig = signalFor(s.it, 'z', t);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(1, 1, 1);
      tmp.position.set(s.x, 5.0, s.z - 4.6);
      tmp.updateMatrix();
      this.lamps.setMatrixAt(k, tmp.matrix);
      this.lamps.setColorAt(k++, col.set(C[nsSig]));
      tmp.position.set(s.x - 0.4, 4.4, s.z);
      tmp.updateMatrix();
      this.lamps.setMatrixAt(k, tmp.matrix);
      this.lamps.setColorAt(k++, col.set(C[ewSig]));
    }
    this.lamps.count = k;
    this.lamps.instanceMatrix.needsUpdate = true;
    this.lamps.instanceColor.needsUpdate = true;
  }

  /** Obstacles for the player (two circles per car). */
  obstaclesNear(x, z, r, out) {
    for (const c of this.cars) {
      if (!c.active) continue;
      const tr = c.track;
      const cx = tr.axis === 'x' ? tr.p : c.along;
      const cz = tr.axis === 'x' ? c.along : tr.p;
      if (Math.abs(cx - x) > r + c.half || Math.abs(cz - z) > r + c.half) continue;
      const n = Math.max(2, Math.round(c.half / 1.1));
      for (let i = 0; i < n; i++) {
        const t = -c.half + 0.9 + ((c.half * 2 - 1.8) * i) / (n - 1);
        out.push({ x: tr.axis === 'x' ? cx : cx + t, z: tr.axis === 'x' ? cz + t : cz, r: c.type === 'bus' ? 1.35 : 1.0 });
      }
    }
    return out;
  }

  clear() {
    for (const c of this.cars) c.active = false;
  }
}
