// Ambient pedestrians. A pool of agents lives near the player, walking the sidewalk
// graph; they're drawn with a handful of InstancedMeshes (one per body part).
import * as THREE from 'three';
import { LINES } from '../data/dialogue.js';
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS } from '../player/characterModel.js';
import { clamp } from '../core/math.js';

const tmpM = new THREE.Matrix4();
const base = new THREE.Matrix4();
const out = new THREE.Matrix4();
const scaleV = new THREE.Vector3();
const col = new THREE.Color();
const eul = new THREE.Euler();

const BOTTOMS = ['#2d3440', '#1f1f24', '#3a4a6a', '#c9b28a', '#6b6f75', '#3d5a3d', '#5a3d2d'];
const WINTER_TOPS = ['#2a2d33', '#3b4a5a', '#5a3b3b', '#1f3a5f', '#6b6f75', '#8a6a4a', '#2f4f3f', '#b5382f'];
const UMBRELLAS = ['#1f1f24', '#1f3a5f', '#b5382f', '#e2b43c', '#2f6f4f', '#6b4a8a'];

export function timeDensity(minuteOfDay) {
  const h = minuteOfDay / 60;
  const pts = [
    [0, 0.3],
    [3, 0.12],
    [5.5, 0.2],
    [7.5, 0.95],
    [9, 1],
    [10.5, 0.7],
    [12.5, 0.95],
    [14.5, 0.72],
    [17.5, 1],
    [19.5, 0.85],
    [22, 0.55],
    [24, 0.3],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    if (h >= pts[i][0] && h <= pts[i + 1][0]) {
      const t = (h - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
      return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t;
    }
  }
  return 0.3;
}

export class Pedestrians {
  constructor(scene, model, { capacity = 220 } = {}) {
    this.model = model;
    this.capacity = capacity;
    this.agents = [];
    this.attractors = [];
    this.marchers = [];
    this.bubbles = [];
    this.barkCooldown = 0;
    this.spawnTimer = 0;
    this.season = 'summer';
    this.raining = false;
    const flat = (g) => g;
    const legGeo = flat(new THREE.BoxGeometry(0.13, 0.88, 0.15).translate(0, -0.44, 0));
    const torsoGeo = new THREE.CylinderGeometry(0.19, 0.16, 0.6, 7).scale(1, 1, 0.64).translate(0, 0.3, 0);
    const headGeo = new THREE.IcosahedronGeometry(0.12, 1).scale(1, 1.12, 1);
    const hairGeo = new THREE.IcosahedronGeometry(0.132, 0).scale(1.05, 0.85, 1.08);
    const armGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.6, 5).translate(0, -0.3, 0);
    const umbGeo = new THREE.ConeGeometry(0.6, 0.26, 8, 1, true).translate(0, 0.72, 0);
    const stickGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4).translate(0, 0.3, 0);
    const signGeo = new THREE.BoxGeometry(0.9, 0.55, 0.04).translate(0, 1.0, 0);
    const lam = (opts = {}) => new THREE.MeshLambertMaterial({ flatShading: true, ...opts });
    const defs = [
      ['legL', legGeo, lam(), true],
      ['legR', legGeo, lam(), true],
      ['torso', torsoGeo, lam(), true],
      ['head', headGeo, lam(), true],
      ['hair', hairGeo, lam(), false],
      ['armL', armGeo, lam(), false],
      ['armR', armGeo, lam(), false],
      ['umbrella', umbGeo, lam({ side: THREE.DoubleSide }), false],
      ['stick', stickGeo, lam({ color: '#2a2a2a' }), false],
      ['sign', signGeo, lam(), false],
    ];
    this.parts = {};
    for (const [name, geo, mat, shadow] of defs) {
      const m = new THREE.InstancedMesh(geo, mat, capacity);
      m.count = 0;
      m.castShadow = shadow;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (name !== 'stick') m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      scene.add(m);
      this.parts[name] = m;
    }
    for (let i = 0; i < capacity; i++) this.agents.push({ active: false, id: i });
  }

  setCapacityScale(s) {
    this.activeScale = s;
  }

  _appearance(agent, hood) {
    const r = Math.random;
    const pick = (a) => a[Math.floor(r() * a.length)];
    const winter = this.season === 'winter';
    const fall = this.season === 'fall';
    agent.skin = pick(SKIN_TONES);
    agent.hairColor = pick(HAIR_COLORS.slice(0, 7));
    agent.bald = r() < 0.08;
    const business = hood && ['midtown', 'financial-district', 'world-trade', 'civic-center', 'midtown-east'].includes(hood.id) && r() < 0.5;
    agent.top = business ? pick(['#1f1f24', '#2d3440', '#3b4a5a', '#f2f2f2', '#5a5f66']) : winter ? pick(WINTER_TOPS) : pick(CLOTH_COLORS);
    agent.bottom = business ? pick(['#1f1f24', '#2d3440', '#3b3b3b']) : pick(BOTTOMS);
    agent.sleeves = winter || fall || business || r() < 0.35;
    agent.height = 0.92 + r() * 0.16;
    agent.width = 0.86 + r() * 0.34;
    agent.umbrellaColor = pick(UMBRELLAS);
    agent.hasUmbrella = r() < 0.7;
    agent.tourist = hood?.id === 'times-square' && r() < 0.5;
  }

  _spawnAt(agent, nodeIdx, hood) {
    const n = this.model.nodes[nodeIdx];
    agent.active = true;
    agent.from = nodeIdx;
    agent.to = n.links[Math.floor(Math.random() * n.links.length)];
    agent.t = Math.random();
    agent.speed = 1.2 + Math.random() * 0.55;
    agent.lane = (Math.random() - 0.5) * 1.6;
    agent.phase = Math.random() * 10;
    agent.idle = 0;
    agent.mode = 'walk';
    agent.sign = false;
    agent.watch = null;
    agent.barkCd = 0;
    this._appearance(agent, hood);
    this._place(agent, 0);
  }

  _place(agent) {
    const nodes = this.model.nodes;
    const a = nodes[agent.from];
    const b = nodes[agent.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const px = -dz / len;
    const pz = dx / len;
    agent.x = a.x + dx * agent.t + px * agent.lane;
    agent.z = a.z + dz * agent.t + pz * agent.lane;
    agent.y = a.y + (b.y - a.y) * agent.t;
    if (!a.y && !b.y) agent.y = this.model.groundHeightAt(agent.x, agent.z);
    agent.heading = Math.atan2(dx, dz);
    agent.len = len;
  }

  /** Crowd hot spots from city events: {x, z, radius, count, kind: 'watch'} */
  setAttractors(list) {
    this.attractors = list;
  }

  /** Scripted marchers for parades/protests. */
  setMarchers(list) {
    this.marchers = list;
  }

  update(dt, ctx) {
    const { player, minuteOfDay, weather, camera, playerSpeed } = ctx;
    const hood = this.model.hoodAt(player.x, player.z);
    this.raining = weather.kind === 'rain' || weather.kind === 'storm';
    let weatherMul = { rain: 0.55, storm: 0.35, snow: 0.6, fog: 0.8, heat: 0.8 }[weather.kind] ?? 1;
    if (this.raining) weatherMul = Math.max(weatherMul, 0.5);
    const nightlife = hood.id === 'times-square' || hood.id === 'east-village' || hood.id === 'williamsburg' || hood.id === 'lower-east-side';
    let dens = hood.density * Math.max(nightlife ? 0.45 : 0, timeDensity(minuteOfDay)) * weatherMul;
    if (this.model.parkAt(player.x, player.z)) dens *= weather.kind === 'clear' ? 0.8 : 0.4;
    const extra = this.attractors.reduce((s, a) => s + (Math.hypot(a.x - player.x, a.z - player.z) < a.radius + 150 ? a.count : 0), 0);
    const want = Math.min(this.capacity, Math.round(this.capacity * clamp(dens, 0.06, 1) * (this.activeScale ?? 1)) + extra);

    // Despawn far agents
    let active = 0;
    for (const a of this.agents) {
      if (!a.active) continue;
      const d = Math.hypot(a.x - player.x, a.z - player.z);
      const stale = (a.mode === 'watch' && !this.attractors.includes(a.watch)) || (a.mode === 'march' && !this.marchers.includes(a.march));
      if (d > 240 || (a.mode === 'march' && a.done) || stale) a.active = false;
      else active++;
    }
    // Spawn
    this.spawnTimer -= dt;
    if (active < want && this.spawnTimer <= 0) {
      this.spawnTimer = 0.05;
      const burst = Math.min(want - active, active < want * 0.5 ? 25 : 4);
      for (let k = 0; k < burst; k++) this._spawnOne(player, hood);
    }
    if (active > want + 10) {
      // retire a few far ones
      for (const a of this.agents) {
        if (a.active && Math.hypot(a.x - player.x, a.z - player.z) > 120 && a.mode === 'walk') {
          a.active = false;
          if (--active <= want) break;
        }
      }
    }

    // Move
    const nodes = this.model.nodes;
    this.barkCooldown -= dt;
    for (const a of this.agents) {
      if (!a.active) continue;
      a.barkCd -= dt;
      if (a.mode === 'watch') {
        a.phase += dt * 2;
        a.cheer = Math.sin(a.phase * 1.3 + a.id) > 0.85;
      } else if (a.mode === 'march') {
        this._march(a, dt);
      } else if (a.idle > 0) {
        a.idle -= dt;
      } else {
        // yield to the player
        const pdx = player.x - a.x;
        const pdz = player.z - a.z;
        const pd = Math.hypot(pdx, pdz);
        let slow = 1;
        if (pd < 1.6) {
          const ahead = (pdx * Math.sin(a.heading) + pdz * Math.cos(a.heading)) / (pd || 1);
          if (ahead > 0.3) {
            slow = 0.15;
            a.lane = clamp(a.lane + dt * 1.5 * (a.lane >= 0 ? 1 : -1), -1.3, 1.3);
            if (playerSpeed > 5 && pd < 0.9) this._bark(a, 'bump');
          }
        }
        a.t += (a.speed * slow * dt) / a.len;
        a.phase += dt * a.speed * slow * 1.6;
        if (a.t >= 1) {
          const n = nodes[a.to];
          let next = n.links[Math.floor(Math.random() * n.links.length)];
          if (next === a.from && n.links.length > 1) next = n.links[(n.links.indexOf(next) + 1) % n.links.length];
          a.from = a.to;
          a.to = next;
          a.t = 0;
          if (Math.random() < 0.08) a.idle = 2 + Math.random() * 6;
        }
        this._place(a);
      }
      // ambient greetings
      if (this.barkCooldown <= 0 && a.barkCd <= 0) {
        const d = Math.hypot(player.x - a.x, player.z - a.z);
        if (d < 3.2 && Math.random() < 0.02) this._bark(a, this._contextLine(ctx, a));
      }
    }
    this._render(camera);
    // expire bubbles
    for (const b of this.bubbles) b.ttl -= dt;
    this.bubbles = this.bubbles.filter((b) => b.ttl > 0 && b.agent.active);
  }

  _spawnOne(player, hood) {
    const agent = this.agents.find((a) => !a.active);
    if (!agent) return;
    // Attractor watchers first
    for (const at of this.attractors) {
      if (at.kind !== 'watch') continue;
      const dp = Math.hypot(at.x - player.x, at.z - player.z);
      if (dp > at.radius + 180) continue;
      const watching = this.agents.filter((a) => a.active && a.watch === at).length;
      if (watching >= at.count) continue;
      const ang = Math.random() * Math.PI * 2;
      const r = at.inner + Math.random() * (at.radius - at.inner);
      const x = at.x + Math.cos(ang) * r;
      const z = at.z + Math.sin(ang) * r;
      if (!this.model.isWalkable(x, z)) continue;
      this._appearance(agent, hood);
      Object.assign(agent, { active: true, mode: 'watch', watch: at, x, z, y: this.model.groundHeightAt(x, z), heading: Math.atan2(at.x - x, at.z - z) + (Math.random() - 0.5) * 0.6, phase: Math.random() * 10, speed: 0, idle: 0, sign: false, barkCd: 3 });
      return;
    }
    // Marchers
    for (const m of this.marchers) {
      const active = this.agents.filter((a) => a.active && a.march === m).length;
      if (active >= m.count) continue;
      const near = m.route.some(([x, z]) => Math.hypot(x - player.x, z - player.z) < 260);
      if (!near) continue;
      this._appearance(agent, hood);
      if (m.colors) agent.top = m.colors[Math.floor(Math.random() * m.colors.length)];
      Object.assign(agent, { active: true, mode: 'march', march: m, s: Math.random() * m.length, lane: (Math.random() - 0.5) * m.width, speed: m.speed * (0.85 + Math.random() * 0.3), phase: Math.random() * 10, sign: !!m.signs && Math.random() < 0.6, signColor: m.signColor || '#f4efe2', done: false, barkCd: 2, watch: null });
      this._march(agent, 0);
      return;
    }
    // Regular walker
    const cands = this.model.nodesNear(player.x, player.z, 200);
    for (let tries = 0; tries < 6 && cands.length; tries++) {
      const idx = cands[Math.floor(Math.random() * cands.length)];
      const n = this.model.nodes[idx];
      const d = Math.hypot(n.x - player.x, n.z - player.z);
      if (d < 30 && Math.random() < 0.8) continue;
      this._spawnAt(agent, idx, hood);
      return;
    }
  }

  _march(a, dt) {
    const m = a.march;
    a.s += a.speed * dt;
    if (a.s > m.length) {
      if (m.loop) a.s = 0;
      else {
        a.done = true;
        return;
      }
    }
    let acc = 0;
    for (let i = 0; i < m.route.length - 1; i++) {
      const [ax, az] = m.route[i];
      const [bx, bz] = m.route[i + 1];
      const l = Math.hypot(bx - ax, bz - az);
      if (a.s <= acc + l) {
        const t = (a.s - acc) / l;
        const dx = (bx - ax) / l;
        const dz = (bz - az) / l;
        a.x = ax + (bx - ax) * t - dz * a.lane;
        a.z = az + (bz - az) * t + dx * a.lane;
        a.heading = Math.atan2(dx, dz);
        break;
      }
      acc += l;
    }
    a.y = this.model.groundHeightAt(a.x, a.z);
    a.phase += dt * a.speed * 1.6;
  }

  _contextLine(ctx, a) {
    const { weather, minuteOfDay, season, eventNearby } = ctx;
    const pool = [...LINES.greet];
    if (weather.kind === 'rain' || weather.kind === 'storm') pool.push(...LINES.rain, ...LINES.rain);
    if (weather.kind === 'snow') pool.push(...LINES.snow);
    if ((ctx.temperature ?? 60) > 86) pool.push(...LINES.heat);
    if (LINES[season]) pool.push(...LINES[season]);
    const h = minuteOfDay / 60;
    if (h < 10 && h > 5) pool.push(...LINES.morning);
    else if (h > 17 && h < 21) pool.push(...LINES.evening);
    else if (h >= 21 || h < 4) pool.push(...LINES.night);
    if (a.tourist) pool.push(...LINES.tourist, ...LINES.tourist);
    else pool.push(...LINES.local);
    if (eventNearby || a.mode === 'watch') pool.push(...LINES.event, ...LINES.event);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _bark(a, textOrKind) {
    if (a.barkCd > 0) return;
    const text = LINES[textOrKind] ? LINES[textOrKind][Math.floor(Math.random() * LINES[textOrKind].length)] : textOrKind;
    a.barkCd = 8;
    this.barkCooldown = 3.5;
    this.bubbles.push({ agent: a, text, ttl: 3.2 });
  }

  _render(camera) {
    const p = this.parts;
    let n = 0;
    let u = 0;
    let s = 0;
    const umbrellas = this.raining;
    for (const a of this.agents) {
      if (!a.active) continue;
      const moving = a.mode === 'march' || (a.mode === 'walk' && a.idle <= 0);
      const swing = moving ? Math.sin(a.phase * 2.2) * 0.55 : 0;
      const bob = moving ? Math.abs(Math.cos(a.phase * 2.2)) * 0.035 : 0;
      base.makeRotationY(a.heading);
      base.scale(scaleV.set(a.width, a.height, a.width));
      base.setPosition(a.x, a.y + bob, a.z);
      const set = (mesh, lx, ly, lz, rx, color, rz = 0) => {
        tmpM.makeRotationFromEuler(eul.set(rx, 0, rz));
        tmpM.setPosition(lx, ly, lz);
        out.multiplyMatrices(base, tmpM);
        mesh.setMatrixAt(n, out);
        if (color && mesh.instanceColor) mesh.setColorAt(n, col.set(color));
      };
      set(p.legL, -0.09, 0.9, 0, swing, a.bottom);
      set(p.legR, 0.09, 0.9, 0, -swing, a.bottom);
      set(p.torso, 0, 0.9, 0, 0, a.top);
      set(p.head, 0, 1.7, 0, 0, a.skin);
      if (a.bald) set(p.hair, 0, -100, 0, 0, a.hairColor);
      else set(p.hair, 0, 1.73, -0.01, 0, a.hairColor);
      const cheer = a.mode === 'watch' && a.cheer;
      const holdUmb = umbrellas && a.hasUmbrella && a.mode !== 'watch';
      set(p.armL, -0.24, 1.44, 0, cheer ? Math.PI : -swing * 0.9, a.sleeves ? a.top : a.skin, cheer ? 0.2 : 0.06);
      set(p.armR, 0.24, 1.44, 0, cheer || a.sign ? Math.PI : holdUmb ? -1.2 : swing * 0.9, a.sleeves ? a.top : a.skin, -0.06);
      if (holdUmb) {
        tmpM.makeTranslation(0.12, 1.62, 0.12);
        out.multiplyMatrices(base, tmpM);
        p.umbrella.setMatrixAt(u, out);
        p.umbrella.setColorAt(u, col.set(a.umbrellaColor));
        u++;
      }
      if (a.sign) {
        tmpM.makeTranslation(0.25, 1.5, 0.05);
        out.multiplyMatrices(base, tmpM);
        p.stick.setMatrixAt(s, out);
        p.sign.setMatrixAt(s, out);
        p.sign.setColorAt(s, col.set(a.signColor));
        s++;
      }
      n++;
    }
    for (const k of ['legL', 'legR', 'torso', 'head', 'hair', 'armL', 'armR']) {
      p[k].count = n;
      p[k].instanceMatrix.needsUpdate = true;
      if (p[k].instanceColor) p[k].instanceColor.needsUpdate = true;
    }
    p.umbrella.count = u;
    p.umbrella.instanceMatrix.needsUpdate = true;
    if (p.umbrella.instanceColor) p.umbrella.instanceColor.needsUpdate = true;
    p.stick.count = s;
    p.sign.count = s;
    p.stick.instanceMatrix.needsUpdate = true;
    p.sign.instanceMatrix.needsUpdate = true;
    if (p.sign.instanceColor) p.sign.instanceColor.needsUpdate = true;
    void camera;
  }

  /** Nearby agents as dynamic obstacles for the player. */
  obstaclesNear(x, z, r = 3, out = []) {
    out.length = 0;
    for (const a of this.agents) {
      if (!a.active) continue;
      if (Math.abs(a.x - x) < r && Math.abs(a.z - z) < r) out.push({ x: a.x, z: a.z, r: 0.26 });
    }
    return out;
  }

  clear() {
    for (const a of this.agents) a.active = false;
  }
}
