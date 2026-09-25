// The logical city: turns hand-authored geography into blocks, lots, buildings, roads,
// sidewalks, traffic tracks, points of interest and colliders. Pure data (no three.js),
// so it can be unit tested and shared by the renderer, NPCs, map and simulation.

import { ISLANDS, GRIDS, BROADWAY, NEIGHBORHOODS, SKYLINE, PARKS, BRIDGES } from '../data/geography.js';
import { LANDMARKS } from '../data/landmarks.js';
import { PLACE_TYPES, PLACE_WEIGHTS, FIXED_PLACES, SPECIAL_PLACES } from '../data/places.js';
import { EMPLOYERS } from '../data/careers.js';
import { STATIONS, BUS_ROUTES } from '../data/transit.js';
import { STYLES, PALETTES, STYLE_PALETTE } from './buildingStyles.js';
import { RNG, hash2 } from '../core/rng.js';
import { clamp, lerp, pointInPolygon, polygonBounds, pointPolyline, rectsOverlap, rectContains, rectNearPolyline, smoothstep } from '../core/math.js';

export const SIDEWALK = 4.5; // block edge -> building face
const CHUNK = 400;

// ---------------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------------
function rectFromArr(a) {
  return { x0: a[0], x1: a[1], z0: a[2], z1: a[3] };
}

export function clipPolygonToRect(poly, r) {
  const clipEdge = (pts, inside, intersect) => {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      const cin = inside(cur);
      const pin = inside(prev);
      if (cin) {
        if (!pin) out.push(intersect(prev, cur));
        out.push(cur);
      } else if (pin) out.push(intersect(prev, cur));
    }
    return out;
  };
  const ix = (x) => (a, b) => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0] || 1e-9)];
  const iz = (z) => (a, b) => [a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1] || 1e-9), z];
  let pts = poly;
  pts = clipEdge(pts, (p) => p[0] >= r.x0, ix(r.x0));
  if (pts.length) pts = clipEdge(pts, (p) => p[0] <= r.x1, ix(r.x1));
  if (pts.length) pts = clipEdge(pts, (p) => p[1] >= r.z0, iz(r.z0));
  if (pts.length) pts = clipEdge(pts, (p) => p[1] <= r.z1, iz(r.z1));
  return pts;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

const lineName = (line, other) => (typeof line.name === 'function' ? line.name(other) : line.name);

// ---------------------------------------------------------------------------------
// Spatial hash for rect/circle colliders and generic point lookups
// ---------------------------------------------------------------------------------
export class SpatialHash {
  constructor(cell = 40) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) {
    return ix * 73856093 + iz * 19349663;
  }
  insertRect(item, x0, x1, z0, z1) {
    const c = this.cell;
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const k = this.key(ix, iz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(item);
      }
    }
  }
  insertPoint(item, x, z) {
    this.insertRect(item, x, x, z, z);
  }
  query(x0, x1, z0, z1, out = []) {
    const c = this.cell;
    const seen = new Set();
    for (let ix = Math.floor(x0 / c); ix <= Math.floor(x1 / c); ix++) {
      for (let iz = Math.floor(z0 / c); iz <= Math.floor(z1 / c); iz++) {
        const arr = this.map.get(this.key(ix, iz));
        if (!arr) continue;
        for (const it of arr) {
          if (!seen.has(it)) {
            seen.add(it);
            out.push(it);
          }
        }
      }
    }
    return out;
  }
  queryRadius(x, z, r, out = []) {
    return this.query(x - r, x + r, z - r, z + r, out);
  }
}

// ---------------------------------------------------------------------------------
// City model
// ---------------------------------------------------------------------------------
export class CityModel {
  constructor({ seed = 20260 } = {}) {
    this.seed = seed;
    this.rng = new RNG(seed);
  }

  generate() {
    const t0 = performance.now();
    this._prepIslands();
    this._prepParks();
    this._prepBridges();
    this._prepReserves();
    this._buildGrids();
    this._fillBlocks();
    this._buildBackdrops();
    this._placeStreetFurniture();
    this._placePOIs();
    this._buildSidewalkGraph();
    this._buildCarTracks();
    this._buildColliders();
    this.stats = {
      blocks: this.blocks.length,
      buildings: this.buildings.length,
      pois: this.pois.length,
      nodes: this.nodes.length,
      tracks: this.tracks.length,
      ms: Math.round(performance.now() - t0),
    };
    return this;
  }

  // -- islands --------------------------------------------------------------------
  _prepIslands() {
    this.islands = ISLANDS.map((i) => ({ ...i, bounds: polygonBounds(i.poly) }));
    this.islandById = Object.fromEntries(this.islands.map((i) => [i.id, i]));
  }

  islandAt(x, z, walkableOnly = true) {
    for (const isl of this.islands) {
      if (walkableOnly && !isl.walkable) continue;
      const b = isl.bounds;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (pointInPolygon(x, z, isl.poly)) return isl;
    }
    return null;
  }

  isLand(x, z) {
    return !!this.islandAt(x, z, true);
  }

  // -- parks ----------------------------------------------------------------------
  _prepParks() {
    this.parks = PARKS.map((p) => {
      let poly = p.poly || null;
      let rect = p.rect ? rectFromArr(p.rect) : polygonBounds(p.poly);
      if (p.clipToLand && p.rect) {
        let best = null;
        let bestA = 0;
        for (const isl of this.islands) {
          if (!isl.walkable) continue;
          if (!rectsOverlap(isl.bounds, rect)) continue;
          const c = clipPolygonToRect(isl.poly, rect);
          if (c.length >= 3) {
            const a = polyArea(c);
            if (a > bestA) {
              bestA = a;
              best = c;
            }
          }
        }
        poly = best;
        if (poly) rect = polygonBounds(poly);
      }
      const water = (p.water || []).map((w) => ({ ...w }));
      return { ...p, rect, poly, water, lawns: p.lawns || [], area: poly ? polyArea(poly) : (rect.x1 - rect.x0) * (rect.z1 - rect.z0) };
    }).filter((p) => !p.clipToLand || p.poly);
    this.parkById = Object.fromEntries(this.parks.map((p) => [p.id, p]));
  }

  parkAt(x, z, pad = 0) {
    for (const p of this.parks) {
      if (!rectContains(p.rect, x, z, pad)) continue;
      if (p.poly && !pointInPolygon(x, z, p.poly)) continue;
      return p;
    }
    return null;
  }

  /** Is (x,z) in a body of water inside a park (reservoir, lakes)? */
  parkWaterAt(x, z) {
    for (const p of this.parks) {
      if (!p.water.length || !rectContains(p.rect, x, z)) continue;
      for (const w of p.water) {
        const dx = (x - w.x) / w.rx;
        const dz = (z - w.z) / w.rz;
        if (dx * dx + dz * dz < 1) return w;
      }
    }
    return null;
  }

  // -- bridges --------------------------------------------------------------------
  _prepBridges() {
    this.bridges = BRIDGES.map((b) => {
      const pts = [b.a, ...(b.via || []), b.b];
      const segLen = [];
      let L = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        segLen.push(l);
        L += l;
      }
      return { ...b, pts, segLen, length: L };
    });
  }

  bridgeHeight(b, s) {
    const up = smoothstep(0, b.ramp, s);
    const down = smoothstep(0, b.ramp, b.length - s);
    const arch = b.style === 'simple' || b.style === 'highline' ? 0 : Math.sin(Math.PI * clamp(s / b.length, 0, 1)) * b.deck * 0.08;
    return b.deck * up * down + arch * up * down;
  }

  /** Point along bridge at distance s. */
  bridgePoint(b, s) {
    let acc = 0;
    for (let i = 0; i < b.segLen.length; i++) {
      const l = b.segLen[i];
      if (s <= acc + l || i === b.segLen.length - 1) {
        const t = clamp((s - acc) / l, 0, 1);
        const [ax, az] = b.pts[i];
        const [bx, bz] = b.pts[i + 1];
        return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / l, dz: (bz - az) / l };
      }
      acc += l;
    }
    return { x: b.pts[0][0], z: b.pts[0][1], dx: 1, dz: 0 };
  }

  /** Returns {bridge, s, lateral, h} if the point lies within a bridge corridor. */
  bridgeAt(x, z, pad = 0) {
    for (const b of this.bridges) {
      const r = pointPolyline(x, z, b.pts);
      if (r.d > b.width / 2 + pad) continue;
      let s = 0;
      for (let i = 0; i < r.seg; i++) s += b.segLen[i];
      s += r.t * b.segLen[r.seg];
      return { bridge: b, s, lateral: r.d, h: this.bridgeHeight(b, s) };
    }
    return null;
  }

  // -- reserves (areas where procedural lots are not allowed) --------------------
  _prepReserves() {
    this.reserves = [];
    for (const l of LANDMARKS) if (l.reserve) this.reserves.push({ ...rectFromArr(l.reserve), id: l.id });
    this.landmarks = LANDMARKS;
  }

  _lotBlocked(r) {
    for (const res of this.reserves) if (rectsOverlap(res, r, 0.5)) return true;
    for (const p of this.parks) {
      if (!rectsOverlap(p.rect, r, 0.5)) continue;
      if (!p.poly) return true;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      if (pointInPolygon(cx, cz, p.poly) || pointInPolygon(r.x0, r.z0, p.poly) || pointInPolygon(r.x1, r.z1, p.poly) || pointInPolygon(r.x0, r.z1, p.poly) || pointInPolygon(r.x1, r.z0, p.poly)) return true;
    }
    if (rectNearPolyline(r, BROADWAY.points, BROADWAY.width / 2 + 1.5)) return true;
    for (const b of this.bridges) if (rectNearPolyline(r, b.pts, b.width / 2 + 3)) return true;
    return false;
  }

  // -- neighborhoods ----------------------------------------------------------------
  hoodAt(x, z) {
    for (const h of NEIGHBORHOODS) {
      const [x0, x1, z0, z1] = h.rect;
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) {
        const isl = this.islandAt(x, z, true);
        if (isl && isl.name !== h.borough && !(isl.id === 'manhattan' && h.borough === 'Manhattan')) continue;
        return h;
      }
    }
    return NEIGHBORHOODS[NEIGHBORHOODS.length - 1];
  }

  skylineBoost(x, z) {
    let b = 1;
    for (const s of SKYLINE) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) b = Math.max(b, lerp(s.boost, 1, (d / s.r) ** 1.5));
    }
    return b;
  }

  // -- grids: roads, intersections, blocks ----------------------------------------
  _buildGrids() {
    this.blocks = [];
    this.roads = [];
    this.intersections = [];
    this.gridInfo = [];

    for (const grid of GRIDS) {
      const isl = this.islandById[grid.island];
      const xs = [...grid.xs].sort((a, b) => a.p - b.p);
      const zs = [...grid.zs].sort((a, b) => a.p - b.p);
      const info = {
        id: grid.id,
        island: grid.island,
        xs,
        zs,
        bounds: { x0: xs[0].p - 60, x1: xs[xs.length - 1].p + 60, z0: zs[0].p - 60, z1: zs[zs.length - 1].p + 60 },
      };
      this.gridInfo.push(info);
      const onLand = (x, z) => pointInPolygon(x, z, isl.poly);
      const activeX = (z) => xs.filter((l) => !l.range || (z >= l.range[0] && z <= l.range[1]));

      // Intersections & road segments along x-lines (avenues, running N-S)
      for (const xl of xs) {
        const zList = zs.filter((zl) => !xl.range || (zl.p >= xl.range[0] - 1 && zl.p <= xl.range[1] + 1));
        for (let j = 0; j < zList.length; j++) {
          const zl = zList[j];
          if (onLand(xl.p, zl.p)) {
            this.intersections.push({ x: xl.p, z: zl.p, wx: xl.w, wz: zl.w, grid: grid.id, xLine: xl, zLine: zl });
          }
          if (j < zList.length - 1) {
            const z0 = zl.p;
            const z1 = zList[j + 1].p;
            this._addRoad(grid, 'x', xl, xl.p, z0, z1, onLand);
          }
        }
      }
      // Road segments along z-lines (streets, running E-W)
      for (const zl of zs) {
        const xList = activeX(zl.p + 0.1);
        for (let i = 0; i < xList.length - 1; i++) {
          this._addRoad(grid, 'z', zl, zl.p, xList[i].p, xList[i + 1].p, onLand);
        }
      }
      // Blocks
      for (let j = 0; j < zs.length - 1; j++) {
        const zA = zs[j];
        const zB = zs[j + 1];
        const bz0 = zA.p + zA.w / 2;
        const bz1 = zB.p - zB.w / 2;
        const zMid = (bz0 + bz1) / 2;
        const ax = activeX(zMid);
        for (let i = 0; i < ax.length - 1; i++) {
          const xA = ax[i];
          const xB = ax[i + 1];
          const bx0 = xA.p + xA.w / 2;
          const bx1 = xB.p - xB.w / 2;
          if (bx1 - bx0 < 12 || bz1 - bz0 < 12) continue;
          const inset = 1.5;
          const cornersOn = [onLand(bx0 + inset, bz0 + inset), onLand(bx1 - inset, bz0 + inset), onLand(bx0 + inset, bz1 - inset), onLand(bx1 - inset, bz1 - inset)].filter(Boolean).length;
          const cx = (bx0 + bx1) / 2;
          const cz = (bz0 + bz1) / 2;
          let partialPoly = null;
          if (cornersOn < 4) {
            // Shoreline block: keep the part that's on land if it's big enough
            if (cornersOn < 1 && !onLand(cx, cz)) continue;
            const clip = clipPolygonToRect(isl.poly, { x0: bx0, x1: bx1, z0: bz0, z1: bz1 });
            if (clip.length < 3 || polyArea(clip) < 700) continue;
            partialPoly = clip;
          }
          const block = {
            id: this.blocks.length,
            grid: grid.id,
            island: grid.island,
            x0: bx0,
            x1: bx1,
            z0: bz0,
            z1: bz1,
            cx,
            cz,
            north: zA,
            south: zB,
            west: xA,
            east: xB,
            hood: this.hoodAt(cx, cz),
            park: null,
            poly: partialPoly,
          };
          // Blocks mostly covered by a park become part of the park
          const park = this.parkAt(cx, cz);
          if (park) {
            const ov = this._overlapFrac(block, park);
            if (ov > 0.55) block.park = park.id;
          }
          this.blocks.push(block);
        }
      }
    }
    this.blockHash = new SpatialHash(60);
    for (const b of this.blocks) this.blockHash.insertRect(b, b.x0, b.x1, b.z0, b.z1);
  }

  _overlapFrac(block, park) {
    // Sample a 5x5 grid of points
    let hit = 0;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const x = lerp(block.x0, block.x1, (i + 0.5) / 5);
        const z = lerp(block.z0, block.z1, (j + 0.5) / 5);
        if (rectContains(park.rect, x, z) && (!park.poly || pointInPolygon(x, z, park.poly))) hit++;
      }
    }
    return hit / 25;
  }

  _addRoad(grid, axis, line, p, a, b, onLand) {
    const mid = (a + b) / 2;
    const mx = axis === 'x' ? p : mid;
    const mz = axis === 'x' ? mid : p;
    if (!onLand(mx, mz)) return;
    const endA = axis === 'x' ? onLand(p, a) : onLand(a, p);
    const endB = axis === 'x' ? onLand(p, b) : onLand(b, p);
    if (!endA && !endB) return;
    const park = this.parkAt(mx, mz);
    const removed = !!park && !park.keepRoads && park.kind !== 'waterfront';
    this.roads.push({
      id: this.roads.length,
      grid: grid.id,
      axis,
      p,
      a,
      b,
      w: line.w,
      line,
      name: lineName(line, axis === 'x' ? mid : mid),
      removed,
      endA,
      endB,
    });
  }

  blockAt(x, z) {
    const arr = this.blockHash.query(x, x, z, z);
    for (const b of arr) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && (!b.poly || pointInPolygon(x, z, b.poly))) return b;
    return null;
  }

  // -- lots & buildings -------------------------------------------------------------
  _fillBlocks() {
    this.buildings = [];
    this.roofProps = []; // water towers, AC units
    this.stoops = [];
    this.awnings = [];
    this.fireEscapes = [];
    this.constructionSites = [];
    const rng = new RNG(this.seed + 7);
    for (const block of this.blocks) {
      if (block.park) continue;
      this._fillBlock(block, rng);
    }
    this.buildingHash = new SpatialHash(50);
    for (const b of this.buildings) this.buildingHash.insertRect(b, b.x0, b.x1, b.z0, b.z1);
  }

  _pickStyle(hood, rng) {
    const entries = Object.entries(hood.styles);
    return rng.weighted(entries);
  }

  _fillBlock(block, rng) {
    const hood = block.hood;
    const ix0 = block.x0 + SIDEWALK;
    const ix1 = block.x1 - SIDEWALK;
    const iz0 = block.z0 + SIDEWALK;
    const iz1 = block.z1 - SIDEWALK;
    const W = ix1 - ix0;
    const D = iz1 - iz0;
    if (W < 6 || D < 6) return;
    const dominant = this._pickStyle(hood, rng);
    const longX = W >= D;
    const short = longX ? D : W;
    const bigStyle = dominant === 'tower' || (dominant === 'modern' && rng.chance(0.5)) || (dominant === 'warehouse' && rng.chance(0.4));
    const rows = short >= 34 && !(bigStyle && rng.chance(0.65)) ? 2 : 1;
    const gap = rows === 2 ? (short > 44 ? rng.range(0, 4) : 0) : 0;
    const rowDepth = (short - gap) / rows;

    for (let r = 0; r < rows; r++) {
      // Row rect in "long" axis coordinates
      const s0 = r === 0 ? 0 : rowDepth + gap;
      const s1 = s0 + rowDepth;
      const along0 = longX ? ix0 : iz0;
      const along1 = longX ? ix1 : iz1;
      let pos = along0;
      const rowLots = [];
      while (pos < along1 - 1) {
        const style = rng.chance(0.72) ? dominant : this._pickStyle(hood, rng);
        const spec = STYLES[style];
        let w = rng.range(spec.lotW[0], spec.lotW[1]);
        if (along1 - (pos + w) < spec.lotW[0] * 0.6) w = along1 - pos;
        if (w > along1 - pos) w = along1 - pos;
        rowLots.push({ a: pos, b: pos + w, style });
        pos += w;
      }
      // Build lots
      let prevH = 0;
      const built = [];
      for (let k = 0; k < rowLots.length; k++) {
        const L = rowLots[k];
        const rect = longX
          ? { x0: L.a, x1: L.b, z0: iz0 + s0, z1: iz0 + s1 }
          : { x0: ix0 + s0, x1: ix0 + s1, z0: L.a, z1: L.b };
        // Facing: rows face the outer street. Single row: face the north/west or the busier street.
        let front;
        if (longX) front = rows === 1 ? (block.north.w >= block.south.w ? 'n' : 's') : r === 0 ? 'n' : 's';
        else front = rows === 1 ? (block.west.w >= block.east.w ? 'w' : 'e') : r === 0 ? 'w' : 'e';
        // Corner lots on a long block face the avenue
        const isEnd = k === 0 || k === rowLots.length - 1;
        if (isEnd && longX && (L.b - L.a) < 30 && rng.chance(0.5)) front = k === 0 ? 'w' : 'e';
        if (isEnd && !longX && (L.b - L.a) < 30 && rng.chance(0.5)) front = k === 0 ? 'n' : 's';
        if (this._lotBlocked(rect) || (block.poly && !this._rectOnLand(rect, block.island))) {
          prevH = 0;
          built.push(null);
          continue;
        }
        const b = this._makeBuilding(block, rect, L.style, front, rng, hood);
        built.push(b);
      }
      // Compute neighbor heights (for skipping hidden party walls)
      for (let k = 0; k < built.length; k++) {
        const b = built[k];
        if (!b) continue;
        const prev = built[k - 1];
        const next = built[k + 1];
        if (longX) {
          b.nbW = prev ? prev.baseH : 0;
          b.nbE = next ? next.baseH : 0;
        } else {
          b.nbN = prev ? prev.baseH : 0;
          b.nbS = next ? next.baseH : 0;
        }
      }
      void prevH;
    }
  }

  _rectOnLand(r, islandId) {
    const poly = this.islandById[islandId].poly;
    return pointInPolygon(r.x0, r.z0, poly) && pointInPolygon(r.x1, r.z0, poly) && pointInPolygon(r.x0, r.z1, poly) && pointInPolygon(r.x1, r.z1, poly);
  }

  _makeBuilding(block, rect, style, front, rng, hood) {
    const spec = STYLES[style];
    const boost = this.skylineBoost((rect.x0 + rect.x1) / 2, (rect.z0 + rect.z1) / 2);
    const [h0, h1] = hood.h;
    let targetH = lerp(h0, h1, Math.pow(rng.next(), style === 'tower' ? 1.1 : 1.6)) * boost;
    let floors = Math.round(targetH / spec.floorH);
    floors = clamp(floors, spec.floors[0], Math.round(spec.floors[1] * (style === 'tower' ? boost : 1)));
    let H = floors * spec.floorH + (style === 'tower' ? rng.range(0, 6) : 0.4);
    const paletteName = rng.pick(STYLE_PALETTE[style]);
    const color = rng.pick(PALETTES[paletteName]);
    const seed = rng.next() * 1000;
    const parts = [];
    const fy = spec.frontYard || 0;
    let r = { ...rect };
    if (fy) {
      if (front === 'n') r.z0 += fy;
      if (front === 's') r.z1 -= fy;
      if (front === 'w') r.x0 += fy;
      if (front === 'e') r.x1 -= fy;
    }
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cornice = !!spec.cornice;
    let baseH = H;
    if (style === 'tower') {
      const podiumH = Math.min(H * 0.22, rng.range(12, 26));
      parts.push({ ...r, y0: 0, y1: podiumH, win: 1, color: rng.pick(PALETTES.limestone) });
      const ins = Math.min(w, d) * rng.range(0.08, 0.2);
      const t = { x0: r.x0 + ins, x1: r.x1 - ins, z0: r.z0 + ins, z1: r.z1 - ins };
      const midH = rng.chance(spec.setback) ? H * rng.range(0.6, 0.8) : H;
      parts.push({ ...t, y0: podiumH, y1: midH, win: 0, color });
      if (midH < H) {
        const ins2 = Math.min(t.x1 - t.x0, t.z1 - t.z0) * rng.range(0.1, 0.2);
        parts.push({ x0: t.x0 + ins2, x1: t.x1 - ins2, z0: t.z0 + ins2, z1: t.z1 - ins2, y0: midH, y1: H, win: 0, color });
      }
      baseH = podiumH;
      if (rng.chance(spec.crown)) {
        const c = parts[parts.length - 1];
        const cw = (c.x1 - c.x0) * 0.3;
        const cd = (c.z1 - c.z0) * 0.3;
        const cx = (c.x0 + c.x1) / 2;
        const cz = (c.z0 + c.z1) / 2;
        parts.push({ x0: cx - cw, x1: cx + cw, z0: cz - cd, z1: cz + cd, y0: H, y1: H + rng.range(6, 16), win: 4, color: '#c9c3b6' });
      }
    } else if (style === 'prewar' && H > 36 && rng.chance(spec.setback)) {
      const sH = H * rng.range(0.75, 0.88);
      parts.push({ ...r, y0: 0, y1: sH, win: 1, color, cornice: false });
      const ins = Math.min(3.5, Math.min(w, d) * 0.15);
      parts.push({ x0: r.x0 + ins, x1: r.x1 - ins, z0: r.z0 + ins, z1: r.z1 - ins, y0: sH, y1: H, win: 1, color, cornice: true });
      baseH = sH;
    } else if (style === 'modern' && H > 40 && rng.chance(spec.setback)) {
      const sH = H * rng.range(0.25, 0.4);
      parts.push({ ...r, y0: 0, y1: sH, win: 0, color });
      const ins = Math.min(w, d) * 0.2;
      parts.push({ x0: r.x0 + ins, x1: r.x1 - ins, z0: r.z0 + ins * 0.5, z1: r.z1 - ins * 0.5, y0: sH, y1: H, win: 0, color });
      baseH = sH;
    } else {
      parts.push({ ...r, y0: 0, y1: H, win: spec.win, color, cornice });
    }

    const residential = rng.chance(spec.residential);
    // Ground floor shop if hood is commercial & lot faces a busy street
    const faceLine = front === 'n' ? block.north : front === 's' ? block.south : front === 'w' ? block.west : block.east;
    const busy = faceLine.w >= 16 ? 1 : 0.55;
    const shop = style !== 'rowhouse' && style !== 'brownstone' && rng.chance(hood.shops * busy);
    if (shop) parts[0].storefront = true;

    // Door / front point
    const door = this._frontPoint(r, front, 0.8);
    const b = {
      id: this.buildings.length,
      block: block.id,
      style,
      x0: rect.x0,
      x1: rect.x1,
      z0: rect.z0,
      z1: rect.z1,
      h: parts.reduce((m, p) => Math.max(m, p.y1), 0),
      baseH,
      parts,
      color,
      seed,
      front,
      door,
      hood: hood.id,
      residential,
      shop,
      faceLine,
      poi: null,
      nbW: 0,
      nbE: 0,
      nbN: 0,
      nbS: 0,
    };
    b.address = this._address(b, block);
    this.buildings.push(b);

    // Props
    if (spec.waterTower && rng.chance(spec.waterTower) && H < 110) {
      const top = parts[parts.length - 1];
      const px = lerp(top.x0 + 2.5, top.x1 - 2.5, rng.next());
      const pz = lerp(top.z0 + 2.5, top.z1 - 2.5, rng.next());
      if (top.x1 - top.x0 > 6 && top.z1 - top.z0 > 6) this.roofProps.push({ kind: 'watertower', x: px, z: pz, y: top.y1, s: rng.range(0.85, 1.25) });
    }
    if ((style === 'tower' || style === 'modern' || style === 'prewar' || style === 'warehouse') && rng.chance(0.6)) {
      const top = parts[parts.length - 1];
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const sx = rng.range(1.5, 4);
        const sz = rng.range(1.5, 4);
        if (top.x1 - top.x0 < sx * 2 + 2 || top.z1 - top.z0 < sz * 2 + 2) continue;
        this.roofProps.push({ kind: 'hvac', x: lerp(top.x0 + sx, top.x1 - sx, rng.next()), z: lerp(top.z0 + sz, top.z1 - sz, rng.next()), y: top.y1, sx, sz, sy: rng.range(1.2, 2.6) });
      }
    }
    if (spec.stoop && residential) this.stoops.push({ x: door.x, z: door.z, dir: front, h: 1.6 });
    if (shop && rng.chance(0.75)) {
      this.awnings.push({ ...this._frontPoint(r, front, 0), dir: front, w: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0, 10) * 0.8, color: rng.pick(['#b5382f', '#2f6f4f', '#1f4e79', '#e0a030', '#6b3a5a', '#2d2d2d', '#c85a2a', '#3a7a8a', '#f0e6d0']) });
    }
    if (spec.fireEscape && rng.chance(spec.fireEscape) && H < 30 && (front === 'n' || front === 's')) {
      this.fireEscapes.push({ ...this._frontPoint(r, front, 0), dir: front, y0: 4, y1: H - 1.5, w: Math.min(r.x1 - r.x0 - 2, 5) });
    }
    return b;
  }

  _frontPoint(r, dir, out = 0.8) {
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    switch (dir) {
      case 'n':
        return { x: cx, z: r.z0 - out, nx: 0, nz: -1 };
      case 's':
        return { x: cx, z: r.z1 + out, nx: 0, nz: 1 };
      case 'w':
        return { x: r.x0 - out, z: cz, nx: -1, nz: 0 };
      default:
        return { x: r.x1 + out, z: cz, nx: 1, nz: 0 };
    }
  }

  _address(b, block) {
    const line = b.faceLine;
    const axisX = b.front === 'n' || b.front === 's'; // faces an E-W street: number by x
    const along = axisX ? b.door.x : b.door.z;
    const name = lineName(line, along);
    const h = hash2(Math.round(b.x0), Math.round(b.z0), 3);
    const even = b.front === 's' || b.front === 'e' ? 0 : 1;
    const isl = block.island;
    let num;
    if (isl === 'manhattan') {
      if (axisX) num = Math.floor(Math.abs(b.door.x) * 0.4) + 1;
      else num = Math.floor(Math.max(0, 1000 - b.door.z) * 0.3) + 1;
    } else if (isl === 'queens') {
      const cross = 10 + Math.floor(Math.abs(axisX ? b.door.x - 800 : 440 - b.door.z) / 35);
      const house = 2 + Math.floor(h * 60) * 2 + even;
      return `${cross}-${String(house).padStart(2, '0')} ${name}`;
    } else {
      num = Math.floor(Math.abs(axisX ? b.door.x - 900 : b.door.z - 400) * 0.45) + 1;
    }
    num = num * 2 + even;
    return `${num} ${name}`;
  }

  buildingsNear(x, z, r) {
    return this.buildingHash.queryRadius(x, z, r);
  }

  // -- backdrop skylines (non-walkable land across the water) ---------------------
  _buildBackdrops() {
    this.backdrop = [];
    const rng = new RNG(this.seed + 99);
    for (const isl of this.islands) {
      if (isl.walkable) continue;
      const b = isl.bounds;
      const step = isl.backdrop ? 90 : 45;
      for (let x = b.x0 + step / 2; x < b.x1; x += step) {
        for (let z = b.z0 + step / 2; z < b.z1; z += step) {
          if (!pointInPolygon(x, z, isl.poly)) continue;
          // Distance from the walkable city fades density
          const n = isl.backdrop ? rng.int(1, 3) : rng.int(0, 2);
          for (let i = 0; i < n; i++) {
            const w = rng.range(14, 38);
            const d = rng.range(14, 38);
            const px = x + rng.range(-step / 2 + w / 2, step / 2 - w / 2);
            const pz = z + rng.range(-step / 2 + d / 2, step / 2 - d / 2);
            if (!pointInPolygon(px, pz, isl.poly)) continue;
            let h = rng.range(8, 26);
            if (isl.id === 'newjersey') {
              const jc = Math.hypot(px + 1150, pz - 1750);
              if (jc < 450) h = rng.range(40, 60) + (1 - jc / 450) * rng.range(40, 180);
              else if (pz > -200 && pz < 1000) h = rng.range(12, 30);
            }
            if (isl.id === 'bronx') h = rng.range(12, 55);
            if (isl.id === 'roosevelt') h = rng.range(15, 45);
            if (isl.id === 'liberty' || isl.id === 'ellis' || isl.id === 'governors') {
              if (isl.id !== 'ellis' && rng.chance(0.8)) continue;
              h = rng.range(8, 14);
            }
            const pal = h > 60 ? PALETTES.glass : rng.chance(0.5) ? PALETTES.brick : PALETTES.limestone;
            this.backdrop.push({ x0: px - w / 2, x1: px + w / 2, z0: pz - d / 2, z1: pz + d / 2, h, color: rng.pick(pal), win: h > 60 ? 0 : 1, seed: rng.next() * 1000 });
          }
        }
      }
    }
  }

  // -- street furniture -------------------------------------------------------------
  _placeStreetFurniture() {
    const rng = new RNG(this.seed + 31);
    this.streetLights = [];
    this.trees = [];
    this.hydrants = [];
    this.trashCans = [];
    this.benches = [];
    this.steamStacks = [];
    this.trafficLights = [];
    for (const block of this.blocks) {
      if (block.park) continue;
      const hood = block.hood;
      const edges = [
        { ax: block.x0, az: block.z0, bx: block.x1, bz: block.z0, nx: 0, nz: -1, line: block.north },
        { ax: block.x0, az: block.z1, bx: block.x1, bz: block.z1, nx: 0, nz: 1, line: block.south },
        { ax: block.x0, az: block.z0, bx: block.x0, bz: block.z1, nx: -1, nz: 0, line: block.west },
        { ax: block.x1, az: block.z0, bx: block.x1, bz: block.z1, nx: 1, nz: 0, line: block.east },
      ];
      for (const e of edges) {
        const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
        const dx = (e.bx - e.ax) / len;
        const dz = (e.bz - e.az) / len;
        // Street lights
        const nL = Math.max(1, Math.round(len / 38));
        for (let i = 0; i < nL; i++) {
          const t = (i + 0.5) / nL;
          const x = e.ax + dx * len * t - e.nx * 0.7;
          const z = e.az + dz * len * t - e.nz * 0.7;
          if (this._streetSpotBlocked(x, z) || (block.poly && !pointInPolygon(x, z, block.poly))) continue;
          this.streetLights.push({ x, z, nx: e.nx, nz: e.nz });
        }
        // Trees
        if (hood.trees > 0.05) {
          const spacing = 11;
          const nT = Math.floor(len / spacing);
          for (let i = 1; i < nT; i++) {
            if (!rng.chance(hood.trees * 0.8)) continue;
            const x = e.ax + dx * i * spacing - e.nx * 1.2;
            const z = e.az + dz * i * spacing - e.nz * 1.2;
            if (this._streetSpotBlocked(x, z) || (block.poly && !pointInPolygon(x, z, block.poly))) continue;
            this.trees.push({ x, z, s: rng.range(0.75, 1.15), kind: 0, seed: rng.next() });
          }
        }
        // Occasional steam stack on busy avenues in Manhattan
        if (block.island === 'manhattan' && e.line.w >= 18 && rng.chance(0.035)) {
          const t = rng.range(0.2, 0.8);
          this.steamStacks.push({ x: e.ax + dx * len * t + e.nx * (e.line.w / 2 - 3), z: e.az + dz * len * t + e.nz * (e.line.w / 2 - 3) });
        }
      }
      // Hydrant + trash can near a corner
      if (block.poly) continue;
      if (rng.chance(0.8)) this.hydrants.push({ x: block.x0 + 3.5, z: block.z0 + 0.8 });
      if (rng.chance(0.6)) this.trashCans.push({ x: block.x1 - 1, z: block.z1 - 1 });
      if (rng.chance(0.4)) this.trashCans.push({ x: block.x0 + 1, z: block.z1 - 1 });
    }
    // Traffic lights at intersections of avenues with streets (Manhattan + major Brooklyn/Queens)
    for (const it of this.intersections) {
      if (this.parkAt(it.x, it.z) && this.parkAt(it.x, it.z).kind !== 'waterfront') continue;
      this.trafficLights.push({ x: it.x + it.wx / 2 + 1, z: it.z + it.wz / 2 + 1, it });
    }
    // Park trees & benches
    for (const park of this.parks) {
      const r = park.rect;
      const area = (r.x1 - r.x0) * (r.z1 - r.z0);
      const density = park.kind === 'plaza' ? 0.0012 : park.kind === 'waterfront' ? 0.004 : 0.0075;
      const n = Math.floor(area * density * (park.trees ?? 0.5));
      for (let i = 0; i < n; i++) {
        const x = rng.range(r.x0 + 4, r.x1 - 4);
        const z = rng.range(r.z0 + 4, r.z1 - 4);
        if (park.poly && !pointInPolygon(x, z, park.poly)) continue;
        if (this.parkWaterAt(x, z) || this._inLawn(park, x, z)) continue;
        if (this._pathy(park, x, z)) continue;
        if (!this.isLand(x, z)) continue;
        const blossom = park.kind === 'park' && rng.chance(0.12);
        this.trees.push({ x, z, s: rng.range(0.9, 1.6), kind: blossom ? 2 : 1, seed: rng.next() });
      }
      const nb = Math.floor(Math.sqrt(area) / 18);
      for (let i = 0; i < nb; i++) {
        const x = rng.range(r.x0 + 6, r.x1 - 6);
        const z = rng.range(r.z0 + 6, r.z1 - 6);
        if (park.poly && !pointInPolygon(x, z, park.poly)) continue;
        if (this.parkWaterAt(x, z)) continue;
        this.benches.push({ x, z, rot: rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]) });
      }
    }
    this.treeHash = new SpatialHash(40);
    for (const t of this.trees) this.treeHash.insertPoint(t, t.x, t.z);
  }

  _inLawn(park, x, z) {
    for (const l of park.lawns) {
      const dx = (x - l.x) / l.rx;
      const dz = (z - l.z) / l.rz;
      if (dx * dx + dz * dz < 1) return true;
    }
    return false;
  }

  _pathy(park, x, z) {
    // Keep a clear cross of paths through the middle of rect parks
    const r = park.rect;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    return Math.abs(x - cx) < 3 || Math.abs(z - cz) < 3;
  }

  _streetSpotBlocked(x, z) {
    if (this.parkAt(x, z)) return true;
    if (pointPolyline(x, z, BROADWAY.points).d < BROADWAY.width / 2 + 1) return true;
    for (const res of this.reserves) if (rectContains(res, x, z, 1)) return true;
    return false;
  }

  // -- points of interest -----------------------------------------------------------
  _placePOIs() {
    this.pois = [];
    this.poiById = new Map();
    const rng = new RNG(this.seed + 55);
    const usedBuildings = new Set();

    const addPOI = (poi) => {
      poi.id = poi.id || `poi-${this.pois.length}`;
      this.pois.push(poi);
      this.poiById.set(poi.id, poi);
      return poi;
    };

    const findBuilding = (x, z, filter, maxR = 400) => {
      let best = null;
      let bestD = Infinity;
      for (let r = 60; r <= maxR; r *= 2) {
        for (const b of this.buildingHash.queryRadius(x, z, r)) {
          if (usedBuildings.has(b.id) || !filter(b)) continue;
          const d = Math.hypot(b.door.x - x, b.door.z - z);
          if (d < bestD) {
            bestD = d;
            best = b;
          }
        }
        if (best) break;
      }
      return best;
    };

    const attach = (b, props) => {
      usedBuildings.add(b.id);
      b.shop = true;
      b.parts[0].storefront = true;
      const poi = addPOI({
        x: b.door.x + b.door.nx * 1.2,
        z: b.door.z + b.door.nz * 1.2,
        doorX: b.door.x,
        doorZ: b.door.z,
        nx: b.door.nx,
        nz: b.door.nz,
        building: b.id,
        hood: b.hood,
        address: b.address,
        ...props,
      });
      b.poi = poi.id;
      return poi;
    };

    // Landmark doors
    for (const l of LANDMARKS) {
      if (!l.door) continue;
      const sp = l.poi ? SPECIAL_PLACES[l.poi] : null;
      addPOI({
        id: `lm-${l.id}`,
        kind: sp ? 'place' : 'landmark',
        type: l.poi || null,
        special: !!sp,
        name: sp ? sp.name : l.door.label,
        label: l.door.label,
        x: l.door.x,
        z: l.door.z,
        doorX: l.door.x,
        doorZ: l.door.z,
        landmark: l.id,
        hood: this.hoodAt(l.x, l.z).id,
        address: l.name,
        noSign: true,
      });
    }

    // Employers
    for (const e of EMPLOYERS) {
      if (e.at) {
        const l = LANDMARKS.find((q) => q.id === e.at);
        addPOI({ id: `work-${e.id}`, kind: 'work', employer: e.id, name: e.name, x: l.door.x + 6, z: l.door.z, doorX: l.door.x + 6, doorZ: l.door.z, hood: this.hoodAt(l.x, l.z).id, address: `${l.name}`, noSign: true, landmark: l.id });
        continue;
      }
      const filter = (b) => {
        if (e.kind === 'office') return b.h > 22 && !b.residential;
        if (e.kind === 'site') return b.h < 60;
        return b.parts[0].y1 >= 6;
      };
      const b = findBuilding(e.near[0], e.near[1], filter) || findBuilding(e.near[0], e.near[1], () => true, 800);
      if (!b) continue;
      if (e.kind === 'site') {
        b.construction = true;
        this.constructionSites.push({ building: b.id, x: (b.x0 + b.x1) / 2, z: (b.z0 + b.z1) / 2 });
      }
      attach(b, { id: `work-${e.id}`, kind: 'work', employer: e.id, name: e.name });
    }

    // Fixed service places
    for (const f of FIXED_PLACES) {
      const b = findBuilding(f.near[0], f.near[1], (q) => q.parts[0].y1 >= 6);
      if (!b) continue;
      attach(b, { kind: 'place', type: f.type, name: f.name });
    }

    // Procedural businesses along shop frontages
    const byHood = new Map();
    for (const b of this.buildings) {
      if (!b.shop || usedBuildings.has(b.id) || b.construction) continue;
      if (!byHood.has(b.hood)) byHood.set(b.hood, []);
      byHood.get(b.hood).push(b);
    }
    for (const [hoodId, list] of byHood) {
      const weights = { ...PLACE_WEIGHTS.default, ...(PLACE_WEIGHTS[hoodId] || {}) };
      const entries = Object.entries(weights).filter(([t]) => PLACE_TYPES[t]);
      rng.shuffle(list);
      const count = Math.min(list.length, Math.round(list.length * 0.22) + 2);
      const namesUsed = new Set();
      for (let i = 0; i < count; i++) {
        const b = list[i];
        const type = rng.weighted(entries);
        const def = PLACE_TYPES[type];
        let name = rng.pick(def.names);
        if (namesUsed.has(name)) name = rng.pick(def.names);
        namesUsed.add(name);
        attach(b, { kind: 'place', type, name });
      }
    }

    // Street carts at busy corners
    for (const it of this.intersections) {
      const hood = this.hoodAt(it.x, it.z);
      if (hood.density < 0.7 || !rng.chance(0.06 * hood.density)) continue;
      const cx = it.x + (it.wx / 2 + 2.2) * (rng.chance(0.5) ? 1 : -1);
      const cz = it.z + (it.wz / 2 + 2.2) * (rng.chance(0.5) ? 1 : -1);
      if (!this.blockAt(cx, cz) || this.parkAt(cx, cz)) continue;
      const def = PLACE_TYPES.cart;
      addPOI({ kind: 'place', type: 'cart', name: rng.pick(def.names), x: cx, z: cz, doorX: cx, doorZ: cz, cart: true, hood: hood.id, address: `${lineName(it.zLine, it.x)} & ${lineName(it.xLine, it.z)}`, noSign: true });
    }

    // Subway entrances
    this.stationEntrances = [];
    for (const s of STATIONS) {
      const spot = this._cornerSpot(s.x, s.z, 3.2);
      const poi = addPOI({ id: `sub-${s.id}`, kind: 'subway', station: s.id, name: s.name, x: spot.x, z: spot.z, doorX: spot.x, doorZ: spot.z, hood: this.hoodAt(spot.x, spot.z).id, noSign: true, facing: spot.facing });
      this.stationEntrances.push({ station: s.id, x: spot.x, z: spot.z, facing: spot.facing, poi: poi.id });
    }
    // Bus stops
    this.busStops = [];
    for (const route of BUS_ROUTES) {
      route.stops.forEach(([x, z], i) => {
        const spot = this._cornerSpot(x, z, 1.4);
        const id = `bus-${route.id}-${i}`;
        addPOI({ id, kind: 'bus', route: route.id, stop: i, name: `${route.id} bus stop`, x: spot.x, z: spot.z, doorX: spot.x, doorZ: spot.z, hood: this.hoodAt(spot.x, spot.z).id, noSign: true, facing: spot.facing });
        this.busStops.push({ route: route.id, stop: i, x: spot.x, z: spot.z, facing: spot.facing, poi: id });
      });
    }

    this.poiHash = new SpatialHash(40);
    for (const p of this.pois) this.poiHash.insertPoint(p, p.x, p.z);
  }

  /** Find a sidewalk spot near an intersection corner. */
  _cornerSpot(x, z, inset) {
    const it = this._nearestIntersection(x, z);
    const cx = it ? it.x : x;
    const cz = it ? it.z : z;
    const wx = it ? it.wx : 16;
    const wz = it ? it.wz : 12;
    const cands = [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (const [sx, sz] of cands) {
      const px = cx + sx * (wx / 2 + inset);
      const pz = cz + sz * (wz / 2 + 7);
      const blk = this.blockAt(px, pz);
      if (blk && !blk.park && !this.parkAt(px, pz) && !this.bridgeAt(px, pz, 2)) {
        return { x: px, z: pz, facing: sx > 0 ? 'e' : 'w' };
      }
    }
    for (const [sx, sz] of cands) {
      const px = cx + sx * (wx / 2 + inset);
      const pz = cz + sz * (wz / 2 + 7);
      if (this.isLand(px, pz)) return { x: px, z: pz, facing: 'e' };
    }
    return { x: cx + wx / 2 + inset, z: cz + wz / 2 + 7, facing: 'e' };
  }

  _nearestIntersection(x, z) {
    let best = null;
    let bd = Infinity;
    for (const it of this.intersections) {
      const d = Math.abs(it.x - x) + Math.abs(it.z - z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return bd < 120 ? best : null;
  }

  poisNear(x, z, r) {
    return this.poiHash.queryRadius(x, z, r).filter((p) => Math.hypot(p.x - x, p.z - z) <= r);
  }

  // -- pedestrian graph -------------------------------------------------------------
  _buildSidewalkGraph() {
    const nodes = [];
    const addNode = (x, z, y = 0, kind = 'walk', extra = {}) => {
      nodes.push({ x, z, y, kind, links: [], ...extra });
      return nodes.length - 1;
    };
    const link = (a, b) => {
      if (a === b || nodes[a].links.includes(b)) return;
      nodes[a].links.push(b);
      nodes[b].links.push(a);
    };
    const hash = new SpatialHash(30);
    const off = SIDEWALK / 2;
    for (const block of this.blocks) {
      if (block.park) continue;
      const pts = [
        [block.x0 + off, block.z0 + off],
        [block.x1 - off, block.z0 + off],
        [block.x1 - off, block.z1 - off],
        [block.x0 + off, block.z1 - off],
      ];
      const ok = pts.map(([x, z]) => !block.poly || pointInPolygon(x, z, block.poly));
      const c = pts.map(([x, z], k) => (ok[k] ? addNode(x, z, 0, 'walk', { block: block.id, hood: block.hood }) : -1));
      for (let k = 0; k < 4; k++) {
        const a2 = c[k];
        const b2 = c[(k + 1) % 4];
        if (a2 >= 0 && b2 >= 0) link(a2, b2);
      }
      for (const i of c) if (i >= 0) hash.insertPoint(i, nodes[i].x, nodes[i].z);
    }
    // Crosswalks
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const near = hash.queryRadius(n.x, n.z, 34);
      let bestX = -1;
      let bestXd = Infinity;
      let bestZ = -1;
      let bestZd = Infinity;
      for (const j of near) {
        if (j === i) continue;
        const m = nodes[j];
        if (m.block === n.block) continue;
        const dx = Math.abs(m.x - n.x);
        const dz = Math.abs(m.z - n.z);
        if (dz < 2.5 && dx < 34 && dx < bestXd) {
          bestXd = dx;
          bestX = j;
        }
        if (dx < 2.5 && dz < 34 && dz < bestZd) {
          bestZd = dz;
          bestZ = j;
        }
      }
      if (bestX >= 0 && this.isLand((n.x + nodes[bestX].x) / 2, n.z)) link(i, bestX);
      if (bestZ >= 0 && this.isLand(n.x, (n.z + nodes[bestZ].z) / 2)) link(i, bestZ);
    }
    // Park paths: a lattice of nodes, linked to nearby sidewalks
    for (const park of this.parks) {
      const r = park.rect;
      const step = park.kind === 'waterfront' ? 40 : 55;
      const ids = [];
      const cols = Math.max(1, Math.floor((r.x1 - r.x0) / step));
      const rows = Math.max(1, Math.floor((r.z1 - r.z0) / step));
      const grid = [];
      for (let a = 0; a <= cols; a++) {
        grid[a] = [];
        for (let b = 0; b <= rows; b++) {
          const x = lerp(r.x0 + 5, r.x1 - 5, cols ? a / cols : 0.5);
          const z = lerp(r.z0 + 5, r.z1 - 5, rows ? b / rows : 0.5);
          if ((park.poly && !pointInPolygon(x, z, park.poly)) || this.parkWaterAt(x, z) || !this.isLand(x, z)) {
            grid[a][b] = -1;
            continue;
          }
          const id = addNode(x, z, 0, 'park', { park: park.id, hood: this.hoodAt(x, z) });
          grid[a][b] = id;
          ids.push(id);
          hash.insertPoint(id, x, z);
        }
      }
      for (let a = 0; a <= cols; a++) {
        for (let b = 0; b <= rows; b++) {
          const id = grid[a][b];
          if (id < 0) continue;
          if (a < cols && grid[a + 1][b] >= 0) link(id, grid[a + 1][b]);
          if (b < rows && grid[a][b + 1] >= 0) link(id, grid[a][b + 1]);
        }
      }
      // Connect border nodes to nearest sidewalk corners
      for (const id of ids) {
        const n = nodes[id];
        let best = -1;
        let bd = 28;
        for (const j of hash.queryRadius(n.x, n.z, 28)) {
          if (nodes[j].kind !== 'walk') continue;
          const d = Math.hypot(nodes[j].x - n.x, nodes[j].z - n.z);
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        if (best >= 0) link(id, best);
      }
    }
    // Bridge walkways
    for (const b of this.bridges) {
      const n = Math.max(2, Math.round(b.length / 22));
      let prev = -1;
      const ids = [];
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * b.length;
        const p = this.bridgePoint(b, s);
        const id = addNode(p.x, p.z, this.bridgeHeight(b, s), 'bridge', { bridge: b.id });
        if (prev >= 0) link(prev, id);
        prev = id;
        ids.push(id);
      }
      for (const end of [ids[0], ids[ids.length - 1]]) {
        const e = nodes[end];
        let best = -1;
        let bd = 45;
        for (const j of hash.queryRadius(e.x, e.z, 45)) {
          if (nodes[j].kind === 'bridge') continue;
          const d = Math.hypot(nodes[j].x - e.x, nodes[j].z - e.z);
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        if (best >= 0) link(end, best);
      }
    }
    this.nodes = nodes.filter(() => true);
    this.nodeHash = new SpatialHash(40);
    this.nodes.forEach((n, i) => this.nodeHash.insertPoint(i, n.x, n.z));
  }

  nodesNear(x, z, r) {
    return this.nodeHash.queryRadius(x, z, r).filter((i) => {
      const n = this.nodes[i];
      return n.links.length && Math.hypot(n.x - x, n.z - z) <= r;
    });
  }

  // -- car tracks -------------------------------------------------------------------
  _buildCarTracks() {
    this.tracks = [];
    // Group road segments by line
    const lines = new Map();
    for (const r of this.roads) {
      const key = `${r.grid}|${r.axis}|${r.p}`;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push(r);
    }
    let lineIdx = 0;
    for (const [, segs] of lines) {
      segs.sort((a, b) => a.a - b.a);
      // Split into contiguous drivable runs
      const runs = [];
      let cur = null;
      for (const s of segs) {
        if (s.removed || !s.endA || !s.endB) {
          cur = null;
          continue;
        }
        if (cur && Math.abs(cur.b - s.a) < 0.5) cur.b = s.b;
        else {
          cur = { axis: s.axis, p: s.p, a: s.a, b: s.b, w: s.w, grid: s.grid, name: s.name };
          runs.push(cur);
        }
      }
      lineIdx++;
      for (const run of runs) {
        if (run.b - run.a < 60) continue;
        const twoWay = run.w === 18 || run.w === 26 || (run.w === 20 && lineIdx % 5 === 0);
        const dirs = twoWay ? [1, -1] : [lineIdx % 2 === 0 ? 1 : -1];
        const lanes = run.w >= 20 ? 2 : 1;
        for (const dir of dirs) {
          for (let lane = 0; lane < (twoWay ? 1 : lanes); lane++) {
            let offset;
            if (twoWay) offset = dir * (run.w * 0.22);
            else offset = lanes === 2 ? (lane === 0 ? -run.w * 0.2 : run.w * 0.2) : 0;
            // Right-hand traffic: +dir along axis => lane offset to the right
            const stops = this.intersections
              .filter((it) => it.grid === run.grid && (run.axis === 'x' ? it.x === run.p && it.z > run.a && it.z < run.b : it.z === run.p && it.x > run.a && it.x < run.b))
              .map((it) => ({ at: run.axis === 'x' ? it.z : it.x, cross: run.axis === 'x' ? it.wz : it.wx, it }));
            this.tracks.push({
              id: this.tracks.length,
              axis: run.axis,
              p: run.p + (run.axis === 'x' ? -offset : offset),
              a: run.a,
              b: run.b,
              dir,
              w: run.w,
              grid: run.grid,
              name: run.name,
              stops,
            });
          }
        }
      }
    }
    // Broadway (southbound, no signals modeled)
    const pts = BROADWAY.points;
    this.broadwayTrack = { pts, length: pts.slice(1).reduce((acc, p, i) => acc + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0) };
    this.trackHash = new SpatialHash(120);
    for (const t of this.tracks) {
      if (t.axis === 'x') this.trackHash.insertRect(t, t.p, t.p, t.a, t.b);
      else this.trackHash.insertRect(t, t.a, t.b, t.p, t.p);
    }
  }

  tracksNear(x, z, r) {
    return this.trackHash.queryRadius(x, z, r);
  }

  // -- colliders --------------------------------------------------------------------
  _buildColliders() {
    this.colliders = new SpatialHash(32);
    this.colliderList = [];
    for (const b of this.buildings) {
      for (const p of b.parts) {
        if (p.y0 > 3) continue;
        this.addCollider({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, y0: 0, y1: p.y1, building: b.id });
      }
    }
  }

  addCollider(c) {
    if (c.r != null) {
      c.x0 = c.x - c.r;
      c.x1 = c.x + c.r;
      c.z0 = c.z - c.r;
      c.z1 = c.z + c.r;
    }
    if (c.y0 == null) c.y0 = -5;
    if (c.y1 == null) c.y1 = 500;
    this.colliderList.push(c);
    this.colliders.insertRect(c, c.x0, c.x1, c.z0, c.z1);
  }

  collidersNear(x, z, r, out) {
    return this.colliders.queryRadius(x, z, r, out);
  }

  // -- walkability -----------------------------------------------------------------
  footbridgeAt(x, z) {
    for (const f of this.footbridges || []) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f;
    return null;
  }

  isWalkable(x, z) {
    if (!this.isLand(x, z)) return false;
    if (this.parkWaterAt(x, z) && !this.footbridgeAt(x, z)) return false;
    return true;
  }

  /** Height of the walking surface (sidewalk curbs, park lawns, footbridges). */
  groundHeightAt(x, z) {
    const fb = this.footbridgeAt(x, z);
    if (fb) return fb.y;
    const park = this.parkAt(x, z);
    if (park) return park.poly && park.kind === 'waterfront' ? 0.06 : 0.24;
    const blk = this.blockAt(x, z);
    if (blk && !blk.park) return 0.16;
    return 0;
  }

  // -- naming & queries ------------------------------------------------------------
  /** Human readable street location, e.g. "W 42nd St & 7th Ave". */
  streetNameAt(x, z) {
    const bw = pointPolyline(x, z, BROADWAY.points);
    let best = null;
    for (const g of this.gridInfo) {
      const b = g.bounds;
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
      if (!pointInPolygon(x, z, this.islandById[g.island].poly)) continue;
      best = g;
      break;
    }
    if (!best) return null;
    let nx = null;
    let dx = Infinity;
    for (const l of best.xs) {
      if (l.range && (z < l.range[0] - 30 || z > l.range[1] + 30)) continue;
      const d = Math.abs(l.p - x);
      if (d < dx) {
        dx = d;
        nx = l;
      }
    }
    let nz = null;
    let dz = Infinity;
    for (const l of best.zs) {
      const d = Math.abs(l.p - z);
      if (d < dz) {
        dz = d;
        nz = l;
      }
    }
    let xName = nx ? lineName(nx, z) : '';
    const zName = nz ? lineName(nz, x) : '';
    if (bw.d < 30 && best.island === 'manhattan') {
      if (bw.d < dx) xName = 'Broadway';
    }
    // Put the street you're closest to first
    return dx < dz ? `${xName} & ${zName}` : `${zName} & ${xName}`;
  }

  /** Location description for HUD. */
  describe(x, z) {
    const br = this.bridgeAt(x, z);
    if (br && br.h > 3) return { place: br.bridge.name, hood: br.bridge.name, borough: '' };
    const park = this.parkAt(x, z);
    const hood = this.hoodAt(x, z);
    const isl = this.islandAt(x, z, true);
    const street = this.streetNameAt(x, z);
    return {
      place: park && !park.hidden ? park.name : street || hood.name,
      hood: hood.name,
      borough: isl ? isl.name : 'East River',
      hoodId: hood.id,
      park: park && !park.hidden ? park.id : null,
    };
  }

  chunkKey(x, z) {
    return `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
  }
}

export const CHUNK_SIZE = CHUNK;
