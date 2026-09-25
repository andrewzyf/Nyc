// Subway routing (Dijkstra with transfers), bus rides, taxi fares, and delays.
import { STATIONS, LINES, BUS_ROUTES, FARE, WEEKLY_FARE_CAP, TAXI } from '../data/transit.js';
import { REAL_SCALE } from '../data/geography.js';

export const STATION_BY_ID = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
export const LINE_BY_ID = Object.fromEntries(LINES.map((l) => [l.id, l]));
export const BUS_BY_ID = Object.fromEntries(BUS_ROUTES.map((r) => [r.id, r]));

const TRAIN_SPEED = 480; // real meters per minute, incl. acceleration
const DWELL = 0.6;
const TRANSFER = 4;

export function linesAt(stationId) {
  return LINES.filter((l) => l.stations.includes(stationId));
}

function edgeMinutes(a, b) {
  const A = STATION_BY_ID[a];
  const B = STATION_BY_ID[b];
  return (Math.hypot(A.x - B.x, A.z - B.z) * REAL_SCALE) / TRAIN_SPEED + DWELL;
}

/** Build graph nodes keyed "station|line". */
function buildGraph() {
  const adj = new Map();
  const add = (u, v, w, meta) => {
    if (!adj.has(u)) adj.set(u, []);
    adj.get(u).push({ v, w, meta });
  };
  for (const line of LINES) {
    const st = line.stations;
    for (let i = 0; i < st.length - 1; i++) {
      const w = edgeMinutes(st[i], st[i + 1]);
      add(`${st[i]}|${line.id}`, `${st[i + 1]}|${line.id}`, w, { ride: line.id });
      add(`${st[i + 1]}|${line.id}`, `${st[i]}|${line.id}`, w, { ride: line.id });
    }
  }
  // transfers within the same station and to nearby stations (walkable complexes)
  for (const s of STATIONS) {
    const ls = linesAt(s.id);
    for (const a of ls) for (const b of ls) if (a !== b) add(`${s.id}|${a.id}`, `${s.id}|${b.id}`, TRANSFER, { transfer: true });
    for (const t of STATIONS) {
      if (t === s) continue;
      const d = Math.hypot(t.x - s.x, t.z - s.z);
      if (d > 140) continue;
      for (const a of ls) for (const b of linesAt(t.id)) add(`${s.id}|${a.id}`, `${t.id}|${b.id}`, TRANSFER + (d * REAL_SCALE) / 80, { transfer: true, walk: true });
    }
  }
  return adj;
}

let GRAPH = null;

export class Transit {
  constructor(game, state = null) {
    this.game = game;
    this.state = state || { rides: 0, taxiRides: 0, busRides: 0, delays: [] };
    GRAPH = GRAPH || buildGraph();
  }

  /** delays: [{line, extra, suspended, until, reason}] managed by events */
  lineDelay(lineId) {
    const now = this.game.clock.t;
    this.state.delays = this.state.delays.filter((d) => d.until > now);
    return this.state.delays.find((d) => d.line === lineId) || null;
  }

  addDelay(d) {
    this.state.delays.push(d);
  }

  /** Shortest trip between two stations. Returns {minutes, legs:[{line, from, to, stops}], transfers}. */
  route(fromId, toId) {
    if (fromId === toId) return { minutes: 0, legs: [], transfers: 0 };
    const dist = new Map();
    const prev = new Map();
    const pq = [];
    for (const l of linesAt(fromId)) {
      const k = `${fromId}|${l.id}`;
      const delay = this.lineDelay(l.id);
      if (delay?.suspended) continue;
      dist.set(k, 0);
      pq.push([0, k]);
    }
    let goal = null;
    while (pq.length) {
      pq.sort((a, b) => a[0] - b[0]);
      const [d, u] = pq.shift();
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (u.startsWith(`${toId}|`)) {
        goal = u;
        break;
      }
      for (const e of GRAPH.get(u) || []) {
        let w = e.w;
        if (e.meta.ride) {
          const delay = this.lineDelay(e.meta.ride);
          if (delay?.suspended) continue;
          if (delay) w += delay.extra / 6;
        }
        const nd = d + w;
        if (nd < (dist.get(e.v) ?? Infinity)) {
          dist.set(e.v, nd);
          prev.set(e.v, { u, meta: e.meta });
          pq.push([nd, e.v]);
        }
      }
    }
    if (!goal) return null;
    // reconstruct
    const path = [];
    let cur = goal;
    while (prev.has(cur)) {
      const p = prev.get(cur);
      path.unshift({ from: p.u, to: cur, meta: p.meta });
      cur = p.u;
    }
    const legs = [];
    for (const step of path) {
      if (!step.meta.ride) continue;
      const [fs] = step.from.split('|');
      const [ts] = step.to.split('|');
      const last = legs[legs.length - 1];
      if (last && last.line === step.meta.ride && last.to === fs) {
        last.to = ts;
        last.stops.push(ts);
      } else legs.push({ line: step.meta.ride, from: fs, to: ts, stops: [fs, ts] });
    }
    return { minutes: dist.get(goal), legs, transfers: Math.max(0, legs.length - 1) };
  }

  /** Full trip plan from the station you're at: includes the wait on the platform. */
  planSubway(fromId, toId) {
    const r = this.route(fromId, toId);
    if (!r) return null;
    const h = this.game.clock.hour;
    const night = h < 5.5 || h > 23;
    const peak = (h > 7 && h < 9.5) || (h > 16.5 && h < 19);
    const wait = night ? 12 : peak ? 3 : 6;
    let minutes = r.minutes + wait;
    if (this.game.profile?.background === 'local') minutes *= 0.85;
    const delays = r.legs.map((l) => this.lineDelay(l.line)).filter(Boolean);
    return { ...r, wait, minutes: Math.round(minutes), delays, fare: FARE };
  }

  payFare(desc) {
    return this.game.economy.payFare(FARE, WEEKLY_FARE_CAP, desc);
  }

  /** Taxi quote between two world points (game meters). */
  taxiQuote(ax, az, bx, bz) {
    const meters = Math.hypot(bx - ax, bz - az) * 1.25 * REAL_SCALE; // street-grid detour factor
    const miles = meters / 1609;
    const h = this.game.clock.hour;
    const rush = (h > 7 && h < 10) || (h > 16 && h < 19.5);
    const speed = rush ? 180 : 320; // meters per minute
    const minutes = meters / speed + 3;
    const inCongestion = (az > -1075 && ax < 700 && ax > -800 && az < 2200) || (bz > -1075 && bx < 700 && bx > -800 && bz < 2200);
    let fare = TAXI.base + Math.ceil(miles * 5) * TAXI.perFifthMile + (rush ? minutes * 0.3 : 0) * TAXI.perMinute + (inCongestion ? TAXI.congestion : 0) + 1.0;
    if (h >= 20 || h < 6) fare += 1;
    if (rush) fare += 2.5;
    const tip = fare * TAXI.tipRate;
    return { miles, minutes: Math.round(minutes), fare: Math.round(fare * 100) / 100, tip: Math.round(tip * 100) / 100, total: Math.round((fare + tip) * 100) / 100, rush };
  }

  busQuote(routeId, fromStop, toStop) {
    const r = BUS_BY_ID[routeId];
    let meters = 0;
    const a = Math.min(fromStop, toStop);
    const b = Math.max(fromStop, toStop);
    for (let i = a; i < b; i++) meters += Math.hypot(r.stops[i + 1][0] - r.stops[i][0], r.stops[i + 1][1] - r.stops[i][1]) * REAL_SCALE * 1.1;
    const h = this.game.clock.hour;
    const wait = h < 6 || h > 22 ? 18 : 8;
    const minutes = meters / 190 + (b - a) * 1.2 + wait;
    return { minutes: Math.round(minutes), fare: FARE, stops: b - a };
  }

  /** Walking time in game minutes for a distance in game meters. */
  walkMinutes(meters, walkSpeed = 4.2) {
    return (meters / walkSpeed) * this.game.clock.rate;
  }

  nearestStation(x, z) {
    let best = null;
    let bd = Infinity;
    for (const s of STATIONS) {
      const e = this.game.model.poiById.get(`sub-${s.id}`);
      const px = e ? e.x : s.x;
      const pz = e ? e.z : s.z;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = { station: s, x: px, z: pz, dist: d };
      }
    }
    return best;
  }

  serialize() {
    return this.state;
  }
}
