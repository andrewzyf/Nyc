// Builds all static city geometry (ground, sidewalks, parks, roads, buildings, props)
// from the CityModel. Everything is batched into few draw calls or proximity-instanced.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { ProximityInstancer } from './instancer.js';
import { createBuildingMaterial, createMarkingMaterial, createGlowMaterial, createLightPoolMaterial, createWaterMaterial, patchSurface, lambert } from './materials.js';
import { BROADWAY } from '../data/geography.js';
import { CHUNK_SIZE } from './cityModel.js';

export const GROUND = { road: 0, sidewalk: 0.16, park: 0.24 };

const COLORS = {
  asphalt: '#5b5e64',
  seawall: '#8a8378',
  backdropLand: '#5d6258',
  sidewalk: '#c2bcb0',
  curb: '#a19b90',
  plaza: '#b9ae9c',
  timesSquare: '#8c5a58',
  path: '#d4c49f',
  white: '#ebe9e2',
  yellow: '#e2b43c',
};

export const SEASON_GRASS = {
  spring: new THREE.Color('#7db35a'),
  summer: new THREE.Color('#6a9a4c'),
  fall: new THREE.Color('#9a9a55'),
  winter: new THREE.Color('#8b8b72'),
};

export const SEASON_FOLIAGE = {
  spring: ['#8cc26a', '#9fd07a', '#79b85c'],
  summer: ['#4f8a3c', '#5e9a45', '#467f36', '#6aa04c'],
  fall: ['#d9822b', '#c8552e', '#e3b33b', '#a8452a', '#cf9a36'],
  winter: ['#6d6a5c'],
};

export class CityMeshes {
  constructor(scene, model, { quality = 'medium' } = {}) {
    this.scene = scene;
    this.model = model;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.instancers = [];
    this.season = 'summer';

    this.materials = {
      ground: patchSurface(new THREE.MeshLambertMaterial({ color: COLORS.asphalt }), { snowScale: 0.55, wetScale: 1.2, key: 'road' }),
      seawall: lambert(COLORS.seawall),
      backdropLand: patchSurface(new THREE.MeshLambertMaterial({ color: COLORS.backdropLand }), { snowScale: 1, key: 'bland' }),
      sidewalk: patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true }), { snowScale: 1, key: 'walk' }),
      grass: patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true, color: SEASON_GRASS.summer.clone() }), { snowScale: 1.1, wetScale: 0.5, key: 'grass' }),
      marking: createMarkingMaterial(),
      building: createBuildingMaterial(),
      water: createWaterMaterial(true),
    };

    this._buildWater();
    this._buildIslands();
    this._buildSidewalks();
    this._buildParks();
    this._buildRoadMarkings();
    this._buildBroadway();
    this._buildBuildings();
    this._buildBackdrop();
    this._buildStaticProps();
    this._buildInstancedProps();
  }

  _mesh(geo, mat, { shadow = false, receive = true, name } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    if (name) m.name = name;
    this.group.add(m);
    return m;
  }

  // ---------------------------------------------------------------------------
  _buildWater() {
    const geo = new THREE.PlaneGeometry(16000, 16000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const m = this._mesh(geo, this.materials.water, { receive: false, name: 'water' });
    m.position.set(1000, -0.8, 800);
    m.updateMatrix();
    this.water = m;
  }

  _buildIslands() {
    for (const isl of this.model.islands) {
      const shape = new THREE.Shape(isl.poly.map(([x, z]) => new THREE.Vector2(x, z)));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 4, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(Math.PI / 2);
      const top = isl.walkable ? this.materials.ground : this.materials.backdropLand;
      this._mesh(geo, [top, this.materials.seawall], { name: `island-${isl.id}` });
    }
  }

  _buildSidewalks() {
    const batch = new GeometryBatch();
    const top = new THREE.Color(COLORS.sidewalk);
    const curb = new THREE.Color(COLORS.curb);
    for (const b of this.model.blocks) {
      if (b.park) continue;
      if (b.poly) batch.polygon(b.poly, GROUND.sidewalk, top);
      else batch.box(b.x0, b.x1, 0, GROUND.sidewalk, b.z0, b.z1, curb, { topColor: top });
    }
    this._mesh(batch.build(), this.materials.sidewalk, { name: 'sidewalks' });
  }

  _buildParks() {
    const grass = new GeometryBatch();
    const paved = new GeometryBatch();
    const waterB = new GeometryBatch();
    const pathB = new GeometryBatch();
    const g = new THREE.Color(1, 1, 1);
    const lawn = new THREE.Color(1.18, 1.22, 1.1);
    const plaza = new THREE.Color(COLORS.plaza);
    const curb = new THREE.Color(COLORS.curb);
    for (const p of this.model.parks) {
      const isPaved = p.kind === 'plaza';
      const target = isPaved ? paved : grass;
      const col = isPaved ? (p.id === 'times-square' ? new THREE.Color(COLORS.timesSquare) : plaza) : g;
      if (p.poly) {
        const y = p.kind === 'waterfront' ? 0.06 : GROUND.park;
        target.polygon(p.poly, y, col);
        if (p.kind === 'waterfront') {
          // Promenade strip of pavers along the water edge feel
          const r = p.rect;
          const alongX = r.x1 - r.x0 > r.z1 - r.z0;
          const mid = alongX ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
          void mid;
        }
      } else {
        const r = p.rect;
        target.box(r.x0, r.x1, 0, GROUND.park, r.z0, r.z1, isPaved ? curb : new THREE.Color(0.75, 0.72, 0.66), { topColor: col });
      }
      for (const l of p.lawns) target.ellipse(l.x, l.z, l.rx, l.rz, GROUND.park + 0.01, lawn, 28);
      for (const w of p.water) {
        waterB.ellipse(w.x, w.z, w.rx, w.rz, GROUND.park + 0.02, '#ffffff', 36);
        // stone rim
        paved.ellipse(w.x, w.z, w.rx + 2.2, w.rz + 2.2, GROUND.park + 0.012, '#9c968a', 36);
      }
    }
    // Paths along the park lattice
    const nodes = this.model.nodes;
    const pathC = new THREE.Color(COLORS.path);
    const seen = new Set();
    nodes.forEach((n, i) => {
      if (n.kind !== 'park') return;
      for (const j of n.links) {
        const m = nodes[j];
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const park = this.model.parkById[n.park];
        const y = (park && park.kind === 'waterfront' ? 0.07 : GROUND.park) + 0.015;
        pathB.strip(n.x, n.z, m.x, m.z, m.kind === 'park' ? 3.2 : 2.6, y, pathC);
      }
    });
    this._mesh(grass.build(), this.materials.grass, { name: 'park-grass' });
    if (!paved.empty) this._mesh(paved.build(), this.materials.sidewalk, { name: 'plazas' });
    if (!pathB.empty) this._mesh(pathB.build(), this.materials.sidewalk, { name: 'park-paths' });
    if (!waterB.empty) this._mesh(waterB.build(), this.materials.water, { receive: false, name: 'park-water' });
  }

  _buildRoadMarkings() {
    const batch = new GeometryBatch({ aMark: 3 });
    const white = new THREE.Color(COLORS.white);
    const yellow = new THREE.Color(COLORS.yellow);
    const itMap = new Map();
    for (const it of this.model.intersections) itMap.set(`${it.grid}|${it.x}|${it.z}`, it);
    const y = 0.025;
    for (const r of this.model.roads) {
      if (r.removed || !r.endA || !r.endB) continue;
      const isX = r.axis === 'x';
      const itA = itMap.get(isX ? `${r.grid}|${r.p}|${r.a}` : `${r.grid}|${r.a}|${r.p}`);
      const itB = itMap.get(isX ? `${r.grid}|${r.p}|${r.b}` : `${r.grid}|${r.b}|${r.p}`);
      const cwA = itA ? (isX ? itA.wz : itA.wx) : 0;
      const cwB = itB ? (isX ? itB.wz : itB.wx) : 0;
      const s0 = r.a + cwA / 2 + 4.2;
      const s1 = r.b - cwB / 2 - 4.2;
      const P = (along, lat) => (isX ? [r.p + lat, along] : [along, r.p + lat]);
      const line = (lat, width, color, kind) => {
        if (s1 - s0 < 2) return;
        const [ax, az] = P(s0, lat);
        const [bx, bz] = P(s1, lat);
        batch.strip(ax, az, bx, bz, width, y, color, { aMark: [kind, 0, 0] }, true);
      };
      // Fix per-vertex along coordinate for dashes: strip() with uvLen puts length in uv.x;
      // we instead encode along in aMark.y below by writing a dedicated quad.
      const dashLine = (lat, width, color) => {
        if (s1 - s0 < 2) return;
        const [ax, az] = P(s0, lat);
        const [bx, bz] = P(s1, lat);
        const hw = width / 2;
        const px = isX ? hw : 0;
        const pz = isX ? 0 : hw;
        const exA = { aMark: [1, s0, 0] };
        const exB = { aMark: [1, s1, 0] };
        // manual quad with differing extra attrs per vertex
        const c = color;
        const base = batch.count;
        const verts = [
          [ax + (isX ? -px : 0), az + (isX ? 0 : pz), exA],
          [bx + (isX ? -px : 0), bz + (isX ? 0 : pz), exB],
          [bx + (isX ? px : 0), bz + (isX ? 0 : -pz), exB],
          [ax + (isX ? px : 0), az + (isX ? 0 : -pz), exA],
        ];
        for (const [vx, vz, ex] of verts) batch._vert(vx, y, vz, 0, 1, 0, c, 0, 0, ex);
        // winding: ensure up-facing
        const ux = verts[1][0] - verts[0][0];
        const uz = verts[1][1] - verts[0][1];
        const wx = verts[2][0] - verts[0][0];
        const wz = verts[2][1] - verts[0][1];
        const yc = uz * wx - ux * wz;
        if (yc > 0) batch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        else batch.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      };
      if (r.w === 18) {
        line(-0.22, 0.14, yellow, 0);
        line(0.22, 0.14, yellow, 0);
      } else if (r.w >= 20) {
        dashLine(-r.w / 6, 0.16, white);
        dashLine(r.w / 6, 0.16, white);
        if (r.w >= 26) dashLine(0, 0.16, white);
      } else if (r.w >= 14) {
        dashLine(0, 0.14, white);
      }
      // Crosswalks + stop lines at both ends
      const zebra = (endS, dir, cw) => {
        const c0 = endS + dir * (cw / 2 + 0.6);
        const c1 = endS + dir * (cw / 2 + 3.6);
        const half = r.w / 2 - 0.4;
        const [x0, z0] = P(Math.min(c0, c1), -half);
        const [x1, z1] = P(Math.max(c0, c1), half);
        const ax0 = Math.min(x0, x1);
        const ax1 = Math.max(x0, x1);
        const az0 = Math.min(z0, z1);
        const az1 = Math.max(z0, z1);
        // along coordinate = lateral (stripes across the road width)
        const base = batch.count;
        const pts = [
          [ax0, az1],
          [ax1, az1],
          [ax1, az0],
          [ax0, az0],
        ];
        for (const [vx, vz] of pts) batch._vert(vx, y + 0.002, vz, 0, 1, 0, white, 0, 0, { aMark: [2, isX ? vx : vz, 0] });
        batch.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        // stop line
        const s = endS + dir * (cw / 2 + 4.1);
        const [sx0, sz0] = P(s - 0.2, -half);
        const [sx1, sz1] = P(s + 0.2, half);
        batch.flat(Math.min(sx0, sx1), Math.max(sx0, sx1), Math.min(sz0, sz1), Math.max(sz0, sz1), y, white, { aMark: [0, 0, 0] });
      };
      if (itA) zebra(r.a, 1, cwA);
      if (itB) zebra(r.b, -1, cwB);
    }
    this._mesh(batch.build(), this.materials.marking, { name: 'markings' });
  }

  _buildBroadway() {
    const pts = BROADWAY.points;
    const road = new GeometryBatch();
    const marks = new GeometryBatch({ aMark: 3 });
    const asphalt = new THREE.Color(COLORS.asphalt).multiplyScalar(1.05);
    const tsq = new THREE.Color(COLORS.timesSquare);
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.ceil(len / 30));
      for (let k = 0; k < n; k++) {
        const t0 = k / n;
        const t1 = (k + 1) / n;
        const x0 = ax + (bx - ax) * t0;
        const z0 = az + (bz - az) * t0;
        const x1 = ax + (bx - ax) * t1;
        const z1 = az + (bz - az) * t1;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;
        const park = this.model.parkAt(mx, mz);
        if (park && park.kind !== 'plaza') continue;
        if (!this.model.isLand(mx, mz)) continue;
        const inTSq = mz > -118 && mz < 26 && mx < -150 && mx > -300;
        road.strip(x0, z0, x1, z1, BROADWAY.width, 0.185, inTSq ? tsq : asphalt);
        if (!inTSq) {
          marks.strip(x0, z0, x1, z1, 0.15, 0.195, new THREE.Color(COLORS.white), { aMark: [0, 0, 0] });
        }
      }
    }
    this.materials.broadway = patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true }), { snowScale: 0.55, wetScale: 1.2, key: 'bway' });
    this._mesh(road.build(), this.materials.broadway, { name: 'broadway' });
    this._mesh(marks.build(), this.materials.marking, { name: 'broadway-marks' });
  }

  // ---------------------------------------------------------------------------
  _buildBuildings() {
    const chunks = new Map();
    const getChunk = (x, z) => {
      const k = `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
      if (!chunks.has(k)) chunks.set(k, new GeometryBatch({ aBld: 4 }));
      return chunks.get(k);
    };
    const color = new THREE.Color();
    for (const b of this.model.buildings) {
      const batch = getChunk((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      if (b.construction) {
        this._constructionSite(batch, b);
        continue;
      }
      b.parts.forEach((p, i) => {
        color.set(p.color || b.color);
        const flags = (p.cornice ? 1 : 0) + (p.storefront ? 2 : 0);
        const ex = { aBld: [p.win ?? 1, Math.round(b.seed + i * 7.3), p.y1, flags] };
        const first = i === 0;
        batch.box(p.x0, p.x1, p.y0, p.y1, p.z0, p.z1, color, {
          ex,
          sideY0: first ? { w: b.nbW, e: b.nbE, n: b.nbN, s: b.nbS } : undefined,
        });
      });
    }
    this.buildingMeshes = [];
    for (const [key, batch] of chunks) {
      const m = this._mesh(batch.build(), this.materials.building, { shadow: this.quality !== 'low', name: `bld-${key}` });
      this.buildingMeshes.push(m);
    }
  }

  _constructionSite(batch, b) {
    const H = Math.max(18, b.h * 0.6);
    const concrete = new THREE.Color('#a8a49c');
    const floors = Math.floor(H / 4);
    const ex = { aBld: [4, 0, H, 0] };
    const x0 = b.x0 + 1;
    const x1 = b.x1 - 1;
    const z0 = b.z0 + 1;
    const z1 = b.z1 - 1;
    // floor slabs and columns
    for (let f = 0; f <= floors; f++) batch.box(x0, x1, f * 4, f * 4 + 0.4, z0, z1, concrete, { ex, bottom: true });
    const cols = [
      [x0, z0],
      [x1 - 0.6, z0],
      [x0, z1 - 0.6],
      [x1 - 0.6, z1 - 0.6],
      [(x0 + x1) / 2, (z0 + z1) / 2],
    ];
    for (const [cx, cz] of cols) batch.box(cx, cx + 0.6, 0, floors * 4, cz, cz + 0.6, concrete, { ex });
    // core
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    batch.box(cx - 3, cx + 3, 0, H + 4, cz - 3, cz + 3, new THREE.Color('#948f86'), { ex });
    // tower crane
    const yellow = new THREE.Color('#e8b322');
    batch.box(x1 + 1, x1 + 3, 0, H + 30, z0 + 2, z0 + 4, yellow, { ex });
    batch.box(x1 - 30, x1 + 12, H + 30, H + 32, z0 + 2.2, z0 + 3.8, yellow, { ex });
    batch.box(x1 + 6, x1 + 11, H + 26, H + 30, z0 + 1.5, z0 + 4.5, new THREE.Color('#77736b'), { ex });
    // plywood fence
    batch.box(b.x0 - 0.4, b.x1 + 0.4, 0, 2.4, b.z0 - 0.4, b.z0, new THREE.Color('#5a7a4a'), { ex });
    batch.box(b.x0 - 0.4, b.x1 + 0.4, 0, 2.4, b.z1, b.z1 + 0.4, new THREE.Color('#5a7a4a'), { ex });
    b.renderH = H;
  }

  _buildBackdrop() {
    const batch = new GeometryBatch({ aBld: 4 });
    const color = new THREE.Color();
    for (const b of this.model.backdrop) {
      color.set(b.color);
      batch.box(b.x0, b.x1, 0, b.h, b.z0, b.z1, color, { ex: { aBld: [b.win, Math.round(b.seed), b.h, b.h < 30 ? 1 : 0] } });
    }
    this._mesh(batch.build(), this.materials.building, { name: 'backdrop' });
  }

  // ---------------------------------------------------------------------------
  _buildStaticProps() {
    const model = this.model;
    const solid = new GeometryBatch();
    const glowG = new GeometryBatch();
    const green = new THREE.Color('#1f5e3b');
    const metal = new THREE.Color('#2e3236');
    // Subway entrances: railings on three sides + green globe lamps
    for (const e of model.stationEntrances) {
      const { x, z } = e;
      const hw = 1.3;
      const hl = 2.6;
      solid.box(x - hw, x + hw, 0, 0.16, z - hl, z + hl, new THREE.Color('#3a3a3a'));
      solid.box(x - hw - 0.08, x - hw, 0.16, 1.15, z - hl, z + hl, green);
      solid.box(x + hw, x + hw + 0.08, 0.16, 1.15, z - hl, z + hl, green);
      solid.box(x - hw, x + hw, 0.16, 1.15, z - hl - 0.08, z - hl, green);
      solid.box(x - hw - 0.05, x - hw + 0.05, 0.16, 2.3, z + hl - 0.2, z + hl - 0.1, metal);
      solid.box(x + hw - 0.05, x + hw + 0.05, 0.16, 2.3, z + hl - 0.2, z + hl - 0.1, metal);
      glowG.prism(x - hw, z + hl - 0.15, 2.3, 2.7, 0.22, 0.22, 8, '#ffffff');
      glowG.prism(x + hw, z + hl - 0.15, 2.3, 2.7, 0.22, 0.22, 8, '#ffffff');
      model.addCollider({ x0: x - hw - 0.1, x1: x + hw + 0.1, z0: z - hl - 0.1, z1: z + hl - 0.4, y0: -1, y1: 1.2 });
    }
    // Bus stops: pole + blue sign + shelter
    for (const s of model.busStops) {
      const { x, z } = s;
      solid.box(x - 0.05, x + 0.05, 0, 3, z - 0.05, z + 0.05, metal);
      solid.box(x - 0.35, x + 0.35, 2.4, 3.1, z - 0.04, z + 0.04, new THREE.Color('#1b6fb6'));
      solid.box(x + 0.8, x + 1.0, 0, 2.5, z - 1.6, z + 1.6, new THREE.Color('#7f9aa8'));
      solid.box(x + 0.6, x + 2.2, 2.5, 2.6, z - 1.7, z + 1.7, metal);
    }
    // Street carts (umbrella + cart)
    for (const p of model.pois) {
      if (!p.cart) continue;
      solid.box(p.x - 1.1, p.x + 1.1, 0.4, 1.4, p.z - 0.7, p.z + 0.7, new THREE.Color('#c9ced3'));
      solid.prism(p.x, p.z, 0, 0.4, 0.2, 0.2, 6, metal);
      solid.box(p.x - 0.03, p.x + 0.03, 1.4, 2.4, p.z - 0.03, p.z + 0.03, metal);
      solid.prism(p.x, p.z, 2.3, 2.7, 1.5, 0.05, 8, p.name.includes('Halal') || p.name.includes('Rice') ? '#e3b23c' : p.name.includes('Dogs') ? '#2f6fb6' : '#c53b32');
      model.addCollider({ x0: p.x - 1.1, x1: p.x + 1.1, z0: p.z - 0.7, z1: p.z + 0.7, y0: -1, y1: 1.5 });
    }
    // Steam stacks: orange and white striped chimneys
    for (const s of model.steamStacks) {
      for (let i = 0; i < 4; i++) solid.prism(s.x, s.z, i * 0.9, (i + 1) * 0.9, 0.55, 0.55, 10, i % 2 ? '#f2f2ef' : '#e56a1e', { cap: i === 3 });
      model.addCollider({ x: s.x, z: s.z, r: 0.7, y0: -1, y1: 3.6 });
    }
    this._mesh(solid.build(), lambert('#ffffff', { flat: true }).clone(), { shadow: false, name: 'street-static' }).material.vertexColors = true;
    const glowMat = createGlowMaterial('#6cff9a', { base: 0.4, night: 1.6, key: 'subway-globe' });
    glowMat.vertexColors = false;
    this._mesh(glowG.build(), glowMat, { name: 'subway-globes' });
  }

  _buildInstancedProps() {
    const model = this.model;
    const scene = this.group;
    const q = this.quality;
    const mul = q === 'low' ? 0.6 : q === 'high' ? 1.25 : 1;

    // Street lights -----------------------------------------------------------
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.14, 7.5, 6).translate(0, 3.75, 0);
    const armGeo = new THREE.BoxGeometry(1.8, 0.14, 0.14).translate(0.9, 7.4, 0);
    const headGeo = new THREE.BoxGeometry(0.7, 0.16, 0.36).translate(1.7, 7.28, 0);
    const lampMat = createGlowMaterial('#ffd79a', { base: 0.02, night: 2.2, key: 'lamp' });
    const lights = new ProximityInstancer(scene, {
      items: model.streetLights,
      radius: 420 * mul,
      capacity: Math.round(3000 * mul),
      name: 'streetlights',
      parts: [
        { geometry: poleGeo, material: lambert('#35393d') },
        { geometry: armGeo, material: lambert('#35393d') },
        { geometry: headGeo, material: lampMat },
      ],
      place: (it, d) => {
        d.position.y = GROUND.sidewalk;
        d.rotation.y = Math.atan2(-it.nz, it.nx);
      },
    });
    this.instancers.push(lights);

    // Ground light pools
    const poolGeo = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2);
    const pools = new ProximityInstancer(scene, {
      items: model.streetLights,
      radius: 260 * mul,
      capacity: Math.round(1500 * mul),
      name: 'lightpools',
      parts: [{ geometry: poolGeo, material: createLightPoolMaterial() }],
      place: (it, d) => {
        d.position.set(it.x + it.nx * 1.8, 0.21, it.z + it.nz * 1.8);
      },
    });
    pools.meshes[0].renderOrder = 2;
    this.instancers.push(pools);
    this.lightPools = pools;

    // Trees ---------------------------------------------------------------------
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 3.2, 5).translate(0, 1.6, 0);
    const branchGeo = (() => {
      const b = new GeometryBatch();
      const m = new THREE.Matrix4();
      const cyl = new THREE.CylinderGeometry(0.05, 0.09, 2.2, 4).translate(0, 1.1, 0);
      for (let i = 0; i < 5; i++) {
        m.makeRotationY((i / 5) * Math.PI * 2).multiply(new THREE.Matrix4().makeRotationZ(0.65)).premultiply(new THREE.Matrix4().makeTranslation(0, 2.9, 0));
        b.mergeGeometry(cyl, m, '#ffffff');
      }
      const g = b.build();
      g.deleteAttribute('color');
      return g;
    })();
    const canopyGeo = new THREE.IcosahedronGeometry(2.5, 0).translate(0, 5.0, 0);
    const canopy2Geo = new THREE.IcosahedronGeometry(1.8, 0).translate(0.9, 6.2, 0.4);
    const canopyMat = patchSurface(new THREE.MeshLambertMaterial({ flatShading: true }), { snowScale: 0.8, key: 'canopy' });
    const trunkMat = lambert('#5e4636');
    this.treeInstancer = new ProximityInstancer(scene, {
      items: model.trees,
      radius: 480 * mul,
      capacity: Math.round(5200 * mul),
      name: 'trees',
      parts: [
        { geometry: trunkGeo, material: trunkMat, castShadow: q !== 'low' },
        { geometry: branchGeo, material: trunkMat },
        { geometry: canopyGeo, material: canopyMat, castShadow: q !== 'low', colored: true },
        { geometry: canopy2Geo, material: canopyMat, castShadow: false, colored: true },
      ],
      place: (it, d, part) => {
        const base = model.parkAt(it.x, it.z) ? GROUND.park : GROUND.sidewalk;
        d.position.y = base;
        d.rotation.y = it.seed * 6.28;
        const s = it.s;
        d.scale.set(s, s, s);
        // bare branches only matter when the leaves are gone
        if (part === 1 && this.season !== 'winter') return false;
        if (part >= 2) {
          const winter = this.season === 'winter' && it.kind !== 3;
          if (winter) return false;
          d.scale.set(s * (0.85 + it.seed * 0.3), s * (0.9 + it.seed * 0.2), s * (0.85 + (1 - it.seed) * 0.3));
        }
        return true;
      },
      color: (it, part, c) => {
        const pal = it.kind === 2 && this.season === 'spring' ? ['#f2b8c8', '#f7cad6', '#eea5bb'] : SEASON_FOLIAGE[this.season];
        const idx = Math.floor(it.seed * 997 + part) % pal.length;
        return c.set(pal[idx]);
      },
    });
    this.instancers.push(this.treeInstancer);

    // Rooftop water towers & HVAC -------------------------------------------------
    const towers = model.roofProps.filter((p) => p.kind === 'watertower');
    const hvac = model.roofProps.filter((p) => p.kind === 'hvac');
    const tankGeo = new THREE.CylinderGeometry(1.7, 1.75, 3.2, 8).translate(0, 4.4, 0);
    const coneGeo = new THREE.ConeGeometry(1.95, 1.5, 8).translate(0, 6.75, 0);
    const legsGeo = (() => {
      const b = new GeometryBatch();
      for (const [lx, lz] of [
        [-1.2, -1.2],
        [1.2, -1.2],
        [-1.2, 1.2],
        [1.2, 1.2],
      ])
        b.box(lx - 0.1, lx + 0.1, 0, 2.8, lz - 0.1, lz + 0.1, '#ffffff');
      b.box(-1.6, 1.6, 2.6, 2.8, -1.6, 1.6, '#ffffff');
      const g = b.build();
      g.deleteAttribute('color');
      return g;
    })();
    const woodMat = patchSurface(new THREE.MeshLambertMaterial({ color: '#7a5a42', flatShading: true }), { snowScale: 1, key: 'wood' });
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: towers,
        radius: 650 * mul,
        capacity: 1800,
        name: 'watertowers',
        parts: [
          { geometry: legsGeo, material: lambert('#3b3b3b') },
          { geometry: tankGeo, material: woodMat, castShadow: q === 'high' },
          { geometry: coneGeo, material: woodMat },
        ],
        place: (it, d) => {
          d.position.y = it.y;
          d.scale.setScalar(it.s);
        },
      }),
    );
    const unitBox = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: hvac,
        radius: 600,
        capacity: 3000,
        name: 'hvac',
        parts: [{ geometry: unitBox, material: patchSurface(new THREE.MeshLambertMaterial({ color: '#9ea3a6' }), { key: 'hvac' }) }],
        place: (it, d) => {
          d.position.y = it.y;
          d.scale.set(it.sx, it.sy, it.sz);
        },
      }),
    );

    // Brownstone stoops ------------------------------------------------------------
    const stoopGeo = (() => {
      const b = new GeometryBatch();
      for (let i = 0; i < 5; i++) b.box(-1.1, 1.1, 0, 0.32 * (i + 1), -0.35 * (5 - i) - 0.6, -0.6, '#ffffff');
      for (let i = 0; i < 5; i++) {
        const z0 = -0.35 * (5 - i) - 0.6;
        for (const sx of [-1.3, 1.1]) b.box(sx, sx + 0.2, 0, 0.32 * (i + 1) + 0.55, z0, z0 + 0.35, '#b8b0a4');
      }
      return b.build();
    })();
    const stoopMat = patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true, color: '#8a5a45' }), { key: 'stoop' });
    const dirRot = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: model.stoops,
        radius: 240,
        capacity: 1400,
        name: 'stoops',
        parts: [{ geometry: stoopGeo, material: stoopMat, castShadow: q === 'high' }],
        place: (it, d) => {
          d.position.set(it.x - (it.dir === 'w' ? -0.8 : it.dir === 'e' ? 0.8 : 0), GROUND.sidewalk, it.z - (it.dir === 'n' ? -0.8 : it.dir === 's' ? 0.8 : 0));
          d.rotation.y = dirRot[it.dir];
        },
      }),
    );

    // Awnings ----------------------------------------------------------------------
    const awningGeo = (() => {
      const g = new THREE.BoxGeometry(1, 0.12, 1.6);
      g.translate(0, 0, -0.8);
      g.rotateX(-0.35);
      g.translate(0, 3.6, 0);
      return g;
    })();
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: model.awnings,
        radius: 260,
        capacity: 1600,
        name: 'awnings',
        parts: [{ geometry: awningGeo, material: patchSurface(new THREE.MeshLambertMaterial({ flatShading: true }), { key: 'awning' }), colored: true, castShadow: q === 'high' }],
        place: (it, d) => {
          d.position.y = GROUND.sidewalk;
          d.rotation.y = dirRot[it.dir];
          d.scale.set(it.w, 1, 1);
        },
        color: (it, p, c) => c.set(it.color),
      }),
    );

    // Fire escapes (one unit per floor) ------------------------------------------
    const feItems = [];
    for (const f of model.fireEscapes) {
      for (let y = f.y0; y < f.y1; y += 3.2) feItems.push({ x: f.x, z: f.z, y, dir: f.dir, w: f.w });
    }
    const feGeo = (() => {
      const b = new GeometryBatch();
      b.box(-0.5, 0.5, 0, 0.06, -1.0, 0, '#fff'); // platform
      b.box(-0.5, 0.5, 0.9, 0.96, -1.02, -0.96, '#fff'); // rail
      b.box(-0.5, -0.46, 0, 0.96, -1.0, -0.96, '#fff');
      b.box(0.46, 0.5, 0, 0.96, -1.0, -0.96, '#fff');
      b.box(0.2, 0.26, -3.1, 0, -0.75, -0.7, '#fff'); // ladder
      const g = b.build();
      g.deleteAttribute('color');
      return g;
    })();
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: feItems,
        radius: 200,
        capacity: 2500,
        name: 'fire-escapes',
        parts: [{ geometry: feGeo, material: lambert('#2b2b2e') }],
        place: (it, d) => {
          d.position.set(it.x, it.y, it.z);
          d.rotation.y = dirRot[it.dir];
          d.scale.set(it.w, 1, 1);
        },
      }),
    );

    // Hydrants, trash cans, benches ---------------------------------------------
    const hydrantGeo = (() => {
      const b = new GeometryBatch();
      b.prism(0, 0, 0, 0.6, 0.16, 0.14, 7, '#fff');
      b.prism(0, 0, 0.6, 0.78, 0.14, 0.05, 7, '#fff');
      b.box(-0.24, 0.24, 0.35, 0.45, -0.05, 0.05, '#fff');
      const g = b.build();
      g.deleteAttribute('color');
      return g;
    })();
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: model.hydrants,
        radius: 180,
        capacity: 600,
        name: 'hydrants',
        parts: [{ geometry: hydrantGeo, material: lambert('#c9352b') }],
        place: (it, d) => {
          d.position.y = GROUND.sidewalk;
        },
      }),
    );
    const canGeo = new THREE.CylinderGeometry(0.32, 0.28, 0.95, 8).translate(0, 0.475, 0);
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: model.trashCans,
        radius: 180,
        capacity: 800,
        name: 'trash',
        parts: [{ geometry: canGeo, material: lambert('#2f5d3f') }],
        place: (it, d) => {
          d.position.y = GROUND.sidewalk;
        },
      }),
    );
    const benchGeo = (() => {
      const b = new GeometryBatch();
      b.box(-0.9, 0.9, 0.42, 0.5, -0.25, 0.25, '#fff');
      b.box(-0.9, 0.9, 0.5, 0.95, 0.2, 0.26, '#fff');
      b.box(-0.8, -0.72, 0, 0.42, -0.2, 0.2, '#fff');
      b.box(0.72, 0.8, 0, 0.42, -0.2, 0.2, '#fff');
      const g = b.build();
      g.deleteAttribute('color');
      return g;
    })();
    this.instancers.push(
      new ProximityInstancer(scene, {
        items: model.benches,
        radius: 260,
        capacity: 400,
        name: 'benches',
        parts: [{ geometry: benchGeo, material: lambert('#3c5a3a') }],
        place: (it, d) => {
          d.position.y = GROUND.park;
          d.rotation.y = it.rot;
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  setSeason(season) {
    if (season === this.season) return;
    this.season = season;
    this.materials.grass.color.copy(SEASON_GRASS[season]);
    this.treeInstancer.update(this.treeInstancer.lastX, this.treeInstancer.lastZ, true);
  }

  update(x, z) {
    for (const inst of this.instancers) inst.update(x, z);
  }

  setShadows(on) {
    for (const m of this.buildingMeshes) m.castShadow = on;
  }
}
