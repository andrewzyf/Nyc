// Weather: a queue of future segments (so the News app can show a real forecast),
// temperatures from monthly normals, snow cover and street wetness.
import { RNG } from '../core/rng.js';
import { seasonOfMonth } from './clock.js';

export const WEATHER_INFO = {
  clear: { label: 'Clear', icon: '☀️', night: '🌙', cloud: 0.05, dark: 0 },
  cloudy: { label: 'Partly cloudy', icon: '⛅', night: '☁️', cloud: 0.45, dark: 0.05 },
  overcast: { label: 'Overcast', icon: '☁️', night: '☁️', cloud: 0.85, dark: 0.2 },
  rain: { label: 'Rain', icon: '🌧️', night: '🌧️', cloud: 0.95, dark: 0.4 },
  storm: { label: 'Thunderstorm', icon: '⛈️', night: '⛈️', cloud: 1, dark: 0.6 },
  snow: { label: 'Snow', icon: '🌨️', night: '🌨️', cloud: 0.95, dark: 0.25 },
  fog: { label: 'Fog', icon: '🌫️', night: '🌫️', cloud: 0.7, dark: 0.15 },
  heat: { label: 'Hot & humid', icon: '🥵', night: '🌙', cloud: 0.2, dark: 0 },
};

const SEASON_WEIGHTS = {
  winter: { clear: 30, cloudy: 24, overcast: 16, snow: 16, rain: 8, fog: 6 },
  spring: { clear: 34, cloudy: 26, overcast: 10, rain: 20, storm: 3, fog: 7 },
  summer: { clear: 38, cloudy: 22, rain: 10, storm: 10, heat: 18, fog: 2 },
  fall: { clear: 38, cloudy: 25, overcast: 12, rain: 17, fog: 8 },
};

export class Weather {
  constructor(clock, { seed = 1, state = null } = {}) {
    this.clock = clock;
    this.rng = new RNG(seed);
    this.state = state || { segments: [], snowCover: 0, wetness: 0, dayOffsets: {} };
    this._ensure();
  }

  _dayOffset(dayIndex) {
    const k = String(dayIndex);
    if (this.state.dayOffsets[k] == null) {
      this.state.dayOffsets[k] = Math.round(this.rng.gauss(0, 5));
      // prune old
      const keys = Object.keys(this.state.dayOffsets);
      if (keys.length > 20) for (const old of keys.slice(0, keys.length - 20)) delete this.state.dayOffsets[old];
    }
    return this.state.dayOffsets[k];
  }

  _normalsAt(t) {
    const saved = this.clock.t;
    this.clock.t = t;
    const n = this.clock.normals();
    const month = this.clock.date.month;
    const day = this.clock.dayIndex;
    this.clock.t = saved;
    return { ...n, month, day };
  }

  _pickKind(t, prev) {
    const { month, high, day } = this._normalsAt(t);
    const season = seasonOfMonth(month);
    const w = { ...SEASON_WEIGHTS[season] };
    const hi = high + this._dayOffset(day);
    if (w.snow && hi > 40) {
      w.rain = (w.rain || 0) + w.snow;
      delete w.snow;
    }
    if (w.heat && hi < 84) delete w.heat;
    // persistence: tends to continue similar weather
    if (prev && w[prev]) w[prev] *= 1.8;
    if (prev === 'storm') w.rain = (w.rain || 0) + 30;
    return this.rng.weighted(Object.entries(w));
  }

  _ensure() {
    const segs = this.state.segments;
    const now = this.clock.t;
    while (segs.length && segs[0].end <= now) segs.shift();
    let last = segs[segs.length - 1];
    let t = last ? last.end : now - 60;
    while (t < now + 4 * 1440) {
      const kind = this._pickKind(t, last?.kind);
      const dur = kind === 'storm' ? this.rng.range(60, 180) : kind === 'fog' ? this.rng.range(120, 300) : this.rng.range(180, 540);
      const seg = { kind, start: t, end: t + dur, intensity: 0.45 + this.rng.next() * 0.55, wind: this.rng.range(1, kind === 'storm' ? 12 : 6) };
      segs.push(seg);
      last = seg;
      t = seg.end;
    }
  }

  current() {
    this._ensure();
    const t = this.clock.t;
    return this.state.segments.find((s) => s.start <= t && s.end > t) || this.state.segments[0];
  }

  /** Temperature in °F right now. */
  temperature(t = this.clock.t) {
    const { high, low, day } = this._normalsAt(t);
    const off = this._dayOffset(day);
    const m = ((t % 1440) + 1440) % 1440;
    // warmest ~3pm, coldest ~6am
    const phase = Math.cos(((m / 60 - 15) / 24) * Math.PI * 2);
    let temp = low + (high - low) * (0.5 + 0.5 * phase) + off;
    const seg = this.state.segments.find((s) => s.start <= t && s.end > t);
    if (seg) {
      if (seg.kind === 'rain' || seg.kind === 'storm') temp -= 4;
      if (seg.kind === 'heat') temp += 5;
      if (seg.kind === 'snow') temp = Math.min(temp, 33);
    }
    return Math.round(temp);
  }

  /** Called every frame with elapsed game minutes. */
  update(gameMinutes) {
    const seg = this.current();
    const hours = gameMinutes / 60;
    const temp = this.temperature();
    if (seg.kind === 'snow') this.state.snowCover = Math.min(1, this.state.snowCover + hours * 0.35 * seg.intensity);
    else if (temp > 33) this.state.snowCover = Math.max(0, this.state.snowCover - hours * 0.02 * (temp - 31));
    if (seg.kind === 'rain' || seg.kind === 'storm') this.state.wetness = Math.min(1, this.state.wetness + hours * 2);
    else this.state.wetness = Math.max(0, this.state.wetness - hours * (seg.kind === 'clear' || seg.kind === 'heat' ? 0.35 : 0.15));
  }

  /** Snapshot for renderers. */
  snapshot() {
    const seg = this.current();
    const info = WEATHER_INFO[seg.kind];
    // blend cloud cover toward the next segment near the boundary
    const t = this.clock.t;
    const idx = this.state.segments.indexOf(seg);
    const next = this.state.segments[idx + 1];
    let cloud = info.cloud;
    let dark = info.dark;
    if (next) {
      const k = Math.max(0, 1 - (seg.end - t) / 45);
      cloud += (WEATHER_INFO[next.kind].cloud - cloud) * k;
      dark += (WEATHER_INFO[next.kind].dark - dark) * k;
    }
    return {
      kind: seg.kind,
      label: info.label,
      intensity: seg.intensity,
      wind: seg.wind,
      cloudCover: cloud,
      darkness: dark,
      snowCover: this.state.snowCover,
      wetness: this.state.wetness,
      temperature: this.temperature(),
    };
  }

  icon(night) {
    const k = this.current().kind;
    return night ? WEATHER_INFO[k].night : WEATHER_INFO[k].icon;
  }

  /** Daily forecast for the next n days: dominant kind + high/low. */
  forecast(days = 3) {
    this._ensure();
    const out = [];
    const start = this.clock.dayIndex;
    for (let d = 0; d < days; d++) {
      const day = start + d;
      const t0 = day * 1440;
      const t1 = t0 + 1440;
      const tally = {};
      for (const s of this.state.segments) {
        const ov = Math.min(t1, s.end) - Math.max(t0 + 360, s.start);
        if (ov > 0) tally[s.kind] = (tally[s.kind] || 0) + ov * (s.kind === 'rain' || s.kind === 'snow' || s.kind === 'storm' ? 1.6 : 1);
      }
      const kind = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || 'clear';
      let hi = -Infinity;
      let lo = Infinity;
      for (let m = 0; m < 1440; m += 120) {
        const tt = this.temperature(t0 + m);
        hi = Math.max(hi, tt);
        lo = Math.min(lo, tt);
      }
      out.push({ day, kind, label: WEATHER_INFO[kind].label, icon: WEATHER_INFO[kind].icon, high: hi, low: lo });
    }
    return out;
  }

  serialize() {
    return this.state;
  }
}
