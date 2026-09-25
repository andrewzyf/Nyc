// Accumulates simple primitives into one BufferGeometry (one draw call).
import * as THREE from 'three';

const tmpColor = new THREE.Color();

export class GeometryBatch {
  /** extra: {name: itemSize} custom per-vertex attributes */
  constructor(extra = {}) {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.extra = extra;
    this.extraData = Object.fromEntries(Object.keys(extra).map((k) => [k, []]));
    this.idx = [];
    this.count = 0;
  }

  _color(c) {
    if (c instanceof THREE.Color) return c;
    return tmpColor.set(c);
  }

  _vert(x, y, z, nx, ny, nz, c, u = 0, v = 0, ex) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
    for (const k in this.extra) {
      const val = ex?.[k];
      const n = this.extra[k];
      if (Array.isArray(val)) for (let i = 0; i < n; i++) this.extraData[k].push(val[i] ?? 0);
      else for (let i = 0; i < n; i++) this.extraData[k].push(0);
    }
    return this.count++;
  }

  /** Quad from 4 points (counter-clockwise when seen from the normal side). */
  quad(p0, p1, p2, p3, normal, color, ex, uvs) {
    const c = this._color(color);
    const [nx, ny, nz] = normal;
    const u = uvs || [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const a = this._vert(p0[0], p0[1], p0[2], nx, ny, nz, c, u[0][0], u[0][1], ex);
    const b = this._vert(p1[0], p1[1], p1[2], nx, ny, nz, c, u[1][0], u[1][1], ex);
    const d = this._vert(p2[0], p2[1], p2[2], nx, ny, nz, c, u[2][0], u[2][1], ex);
    const e = this._vert(p3[0], p3[1], p3[2], nx, ny, nz, c, u[3][0], u[3][1], ex);
    // Auto-orient: make the winding agree with the supplied normal.
    const e1x = p1[0] - p0[0];
    const e1y = p1[1] - p0[1];
    const e1z = p1[2] - p0[2];
    let e2x = p2[0] - p0[0];
    let e2y = p2[1] - p0[1];
    let e2z = p2[2] - p0[2];
    let cx = e1y * e2z - e1z * e2y;
    let cy = e1z * e2x - e1x * e2z;
    let cz = e1x * e2y - e1y * e2x;
    if (Math.abs(cx) + Math.abs(cy) + Math.abs(cz) < 1e-9) {
      e2x = p3[0] - p0[0];
      e2y = p3[1] - p0[1];
      e2z = p3[2] - p0[2];
      cx = e1y * e2z - e1z * e2y;
      cy = e1z * e2x - e1x * e2z;
      cz = e1x * e2y - e1y * e2x;
    }
    if (cx * nx + cy * ny + cz * nz < 0) this.idx.push(a, d, b, a, e, d);
    else this.idx.push(a, b, d, a, d, e);
  }

  tri(p0, p1, p2, color, ex) {
    const c = this._color(color);
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const a = this._vert(p0[0], p0[1], p0[2], nx, ny, nz, c, 0, 0, ex);
    const b = this._vert(p1[0], p1[1], p1[2], nx, ny, nz, c, 1, 0, ex);
    const d = this._vert(p2[0], p2[1], p2[2], nx, ny, nz, c, 0, 1, ex);
    this.idx.push(a, b, d);
  }

  /** Horizontal rectangle facing up at height y. */
  flat(x0, x1, z0, z1, y, color, ex, uvScale) {
    const uvs = uvScale
      ? [
          [x0 * uvScale, z1 * uvScale],
          [x1 * uvScale, z1 * uvScale],
          [x1 * uvScale, z0 * uvScale],
          [x0 * uvScale, z0 * uvScale],
        ]
      : undefined;
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], color, ex, uvs);
  }

  /**
   * Axis-aligned box. opts.skip: {top, bottom, n, s, e, w} booleans.
   * opts.sideY0: {n,s,e,w} starting height of a side face (to hide party walls).
   * opts.colors: {top, side} overrides.
   */
  box(x0, x1, y0, y1, z0, z1, color, opts = {}) {
    const skip = opts.skip || {};
    const ex = opts.ex;
    const topC = opts.topColor ?? color;
    const sy = opts.sideY0 || {};
    if (!skip.top) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], topC, ex);
    if (!skip.bottom && opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], color, ex);
    // south (+z)
    if (!skip.s) {
      const b = Math.max(y0, sy.s ?? y0);
      if (b < y1) this.quad([x0, b, z1], [x1, b, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], color, ex);
    }
    // north (-z)
    if (!skip.n) {
      const b = Math.max(y0, sy.n ?? y0);
      if (b < y1) this.quad([x1, b, z0], [x0, b, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], color, ex);
    }
    // east (+x)
    if (!skip.e) {
      const b = Math.max(y0, sy.e ?? y0);
      if (b < y1) this.quad([x1, b, z1], [x1, b, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], color, ex);
    }
    // west (-x)
    if (!skip.w) {
      const b = Math.max(y0, sy.w ?? y0);
      if (b < y1) this.quad([x0, b, z0], [x0, b, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], color, ex);
    }
  }

  /** Box centered at (cx, cz) rotated around Y by angle. */
  orientedBox(cx, cy, cz, w, h, d, angle, color, ex) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const tf = (lx, ly, lz) => [cx + lx * c + lz * s, cy + ly, cz - lx * s + lz * c];
    const tn = (nx, nz) => [nx * c + nz * s, 0, -nx * s + nz * c];
    const hw = w / 2;
    const hd = d / 2;
    const y0 = 0;
    const y1 = h;
    this.quad(tf(-hw, y1, hd), tf(hw, y1, hd), tf(hw, y1, -hd), tf(-hw, y1, -hd), [0, 1, 0], color, ex);
    this.quad(tf(-hw, y0, hd), tf(hw, y0, hd), tf(hw, y1, hd), tf(-hw, y1, hd), tn(0, 1), color, ex);
    this.quad(tf(hw, y0, -hd), tf(-hw, y0, -hd), tf(-hw, y1, -hd), tf(hw, y1, -hd), tn(0, -1), color, ex);
    this.quad(tf(hw, y0, hd), tf(hw, y0, -hd), tf(hw, y1, -hd), tf(hw, y1, hd), tn(1, 0), color, ex);
    this.quad(tf(-hw, y0, -hd), tf(-hw, y0, hd), tf(-hw, y1, hd), tf(-hw, y1, -hd), tn(-1, 0), color, ex);
  }

  /** Oriented strip on the ground from a->b with width w (for roads, paths). */
  strip(ax, az, bx, bz, w, y, color, ex, uvLen = false) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * (w / 2);
    const pz = (dx / len) * (w / 2);
    const uvs = uvLen
      ? [
          [0, 0],
          [len, 0],
          [len, 1],
          [0, 1],
        ]
      : undefined;
    // Order so the face points up
    this.quad([ax + px, y, az + pz], [bx + px, y, bz + pz], [bx - px, y, bz - pz], [ax - px, y, az - pz], [0, 1, 0], color, ex, uvs);
    return len;
  }

  /** Flat polygon (x,z) points, triangulated, facing up. */
  polygon(points, y, color, ex) {
    const shapePts = points.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(shapePts, []);
    const c = this._color(color);
    const base = this.count;
    for (const [x, z] of points) this._vert(x, y, z, 0, 1, 0, c, x * 0.1, z * 0.1, ex);
    for (const [a, b, d] of tris) {
      // ensure upward winding
      const ax = points[a][0];
      const az = points[a][1];
      const cross = (points[b][0] - ax) * (points[d][1] - az) - (points[b][1] - az) * (points[d][0] - ax);
      if (cross < 0) this.idx.push(base + a, base + b, base + d);
      else this.idx.push(base + a, base + d, base + b);
    }
  }

  /** Ellipse disc facing up. */
  ellipse(cx, cz, rx, rz, y, color, segs = 24, ex) {
    const pts = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]);
    }
    this.polygon(pts, y, color, ex);
  }

  /** Vertical prism (cylinder-like) with n sides. */
  prism(cx, cz, y0, y1, r0, r1, sides, color, { cap = true, rot = 0, ex } = {}) {
    for (let i = 0; i < sides; i++) {
      const a0 = rot + (i / sides) * Math.PI * 2;
      const a1 = rot + ((i + 1) / sides) * Math.PI * 2;
      const p0 = [cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0];
      const p1 = [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0];
      const p2 = [cx + Math.cos(a1) * r1, y1, cz + Math.sin(a1) * r1];
      const p3 = [cx + Math.cos(a0) * r1, y1, cz + Math.sin(a0) * r1];
      const am = (a0 + a1) / 2;
      const n = [Math.cos(am), (r0 - r1) / Math.max(0.001, y1 - y0) * 0.5, Math.sin(am)];
      const l = Math.hypot(...n);
      this.quad(p1, p0, p3, p2, [n[0] / l, n[1] / l, n[2] / l], color, ex);
    }
    if (cap && r1 > 0.001) {
      const pts = [];
      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * r1, cz + Math.sin(a) * r1]);
      }
      this.polygon(pts, y1, color, ex);
    }
  }

  /** Merge an existing BufferGeometry (non-indexed or indexed) transformed by matrix. */
  mergeGeometry(geo, matrix, color, ex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const c = this._color(color).clone();
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const nv = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      const id = this._vert(v.x, v.y, v.z, nv.x, nv.y, nv.z, c, 0, 0, ex);
      this.idx.push(id);
    }
  }

  get empty() {
    return this.count === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    for (const k in this.extra) g.setAttribute(k, new THREE.Float32BufferAttribute(this.extraData[k], this.extra[k]));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
