// Deterministic random helpers. The city layout is generated from a fixed seed so
// building ids, addresses and landmarks stay stable between sessions and saves.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Cheap 2D integer hash -> [0,1). */
export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class RNG {
  constructor(seed = 1) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    this._next = mulberry32(this.seed);
  }
  next() {
    return this._next();
  }
  range(min, max) {
    return min + (max - min) * this._next();
  }
  int(min, max) {
    // inclusive
    return Math.floor(min + (max - min + 1) * this._next());
  }
  chance(p) {
    return this._next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this._next() * arr.length)];
  }
  /** Pick from [{w, ...}] or [[item, weight]] */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += Array.isArray(e) ? e[1] : e.w;
    let r = this._next() * total;
    for (const e of entries) {
      const w = Array.isArray(e) ? e[1] : e.w;
      if ((r -= w) <= 0) return Array.isArray(e) ? e[0] : e;
    }
    const last = entries[entries.length - 1];
    return Array.isArray(last) ? last[0] : last;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this._next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  /** Approximately normal distribution (Irwin–Hall). */
  gauss(mean = 0, sd = 1) {
    let s = 0;
    for (let i = 0; i < 6; i++) s += this._next();
    return mean + (s - 3) * sd * 0.7071;
  }
}

/** Smooth value noise for skyline shaping. */
export function valueNoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
