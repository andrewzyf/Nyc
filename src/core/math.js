export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** Ray-casting point in polygon; poly = [[x,z], ...] */
export function pointInPolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(poly) {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, x1, z0, z1 };
}

/** Distance from point to segment + param t along the segment. */
export function pointSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const len2 = abx * abx + abz * abz || 1e-9;
  let t = ((px - ax) * abx + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

/** Distance from point to polyline, returns {d, seg, t} */
export function pointPolyline(px, pz, pts) {
  let best = { d: Infinity, seg: 0, t: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const r = pointSegment(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best.d) best = { d: r.d, seg: i, t: r.t, cx: r.cx, cz: r.cz };
  }
  return best;
}

export function rectsOverlap(a, b, pad = 0) {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
}

export function rectContains(r, x, z, pad = 0) {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad;
}

/** Does segment intersect axis-aligned rect (with padding)? Uses distance of rect corners/center approx. */
export function rectNearPolyline(r, pts, halfWidth) {
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const hx = (r.x1 - r.x0) / 2;
  const hz = (r.z1 - r.z0) / 2;
  const probe = [
    [cx, cz],
    [r.x0, r.z0],
    [r.x1, r.z0],
    [r.x0, r.z1],
    [r.x1, r.z1],
    [cx, r.z0],
    [cx, r.z1],
    [r.x0, cz],
    [r.x1, cz],
  ];
  for (const [x, z] of probe) {
    if (pointPolyline(x, z, pts).d < halfWidth) return true;
  }
  // polyline vertices inside rect
  for (const [x, z] of pts) if (rectContains(r, x, z, 0)) return true;
  // segments crossing through a rect larger than the corridor: sample along segments
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.ceil(len / Math.max(4, Math.min(hx, hz)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      if (rectContains(r, ax + (bx - ax) * t, az + (bz - az) * t, halfWidth)) return true;
    }
  }
  return false;
}
