// Fully procedural audio (no asset files): city hum, rain, wind, birds, horns,
// sirens, footsteps, UI sounds and a soft generative lo-fi jazz loop.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volumes = { master: 0.8, ambience: 0.7, sfx: 0.8, music: 0.35 };
    this.state = { density: 0.5, rain: 0, wind: 0.2, park: 0, night: 0, indoors: false, speed: 0 };
    this.musicOn = true;
    this._stepPhase = 0;
  }

  /** Must be called from a user gesture. */
  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.bus = {};
    for (const k of ['ambience', 'sfx', 'music']) {
      this.bus[k] = c.createGain();
      this.bus[k].connect(this.master);
    }
    this._applyVolumes();
    this.noise = this._noiseBuffer(2);
    this.brown = this._noiseBuffer(3, true);
    // City hum
    this.hum = this._loop(this.brown, 'lowpass', 420, this.bus.ambience);
    // Rain
    this.rain = this._loop(this.noise, 'bandpass', 2600, this.bus.ambience, 0.6);
    // Wind
    this.wind = this._loop(this.noise, 'lowpass', 500, this.bus.ambience);
    this.ready = true;
    this._schedule();
  }

  _applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.volumes.master;
    this.bus.ambience.gain.value = this.volumes.ambience;
    this.bus.sfx.gain.value = this.volumes.sfx;
    this.bus.music.gain.value = this.musicOn ? this.volumes.music : 0;
  }

  setVolume(k, v) {
    this.volumes[k] = v;
    this._applyVolumes();
  }

  setMusic(on) {
    this.musicOn = on;
    this._applyVolumes();
  }

  _noiseBuffer(seconds, brown = false) {
    const c = this.ctx;
    const len = c.sampleRate * seconds;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _loop(buffer, type, freq, dest, q = 0.7) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(dest);
    src.start();
    return { src, filter: f, gain: g };
  }

  _env(node, t, a, peak, d) {
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _tone(freq, dur, { type = 'sine', vol = 0.2, dest = this.bus.sfx, attack = 0.01, when = 0, glide = null } = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    const g = c.createGain();
    o.connect(g).connect(dest);
    this._env(g, t, attack, vol, dur);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  _noiseBurst(dur, { freq = 1200, type = 'bandpass', vol = 0.2, dest = this.bus.sfx, when = 0, q = 1 } = {}) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    s.connect(f).connect(g).connect(dest);
    this._env(g, t, 0.005, vol, dur);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  // UI & gameplay sounds --------------------------------------------------------
  click() {
    this._tone(900, 0.04, { type: 'triangle', vol: 0.06 });
  }
  open() {
    this._tone(520, 0.08, { type: 'sine', vol: 0.08 });
    this._tone(780, 0.1, { type: 'sine', vol: 0.06, when: 0.05 });
  }
  cash() {
    this._tone(1318, 0.09, { type: 'square', vol: 0.05 });
    this._tone(1760, 0.18, { type: 'square', vol: 0.05, when: 0.08 });
  }
  notify() {
    this._tone(880, 0.12, { vol: 0.08 });
    this._tone(1175, 0.2, { vol: 0.07, when: 0.1 });
  }
  error() {
    this._tone(180, 0.18, { type: 'sawtooth', vol: 0.06 });
  }
  chime() {
    // "Stand clear of the closing doors" two-tone
    this._tone(659, 0.35, { type: 'sine', vol: 0.14 });
    this._tone(523, 0.6, { type: 'sine', vol: 0.14, when: 0.38 });
  }
  achievement() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.25, { type: 'triangle', vol: 0.08, when: i * 0.09 }));
  }
  horn(distance = 30) {
    const v = Math.max(0.02, 0.16 - distance / 400);
    this._tone(415, 0.28, { type: 'square', vol: v });
    this._tone(349, 0.28, { type: 'square', vol: v * 0.8 });
  }
  thunder() {
    this._noiseBurst(2.8, { freq: 120, type: 'lowpass', vol: 0.5, dest: this.bus.ambience });
    this._noiseBurst(1.2, { freq: 300, type: 'lowpass', vol: 0.25, dest: this.bus.ambience, when: 0.15 });
  }
  footstep(surface = 'concrete') {
    if (!this.ready) return;
    this._noiseBurst(0.05, { freq: surface === 'grass' ? 500 : surface === 'snow' ? 700 : 1600, vol: surface === 'snow' ? 0.05 : 0.035, q: 1.5 });
  }

  // Ambience scheduling ------------------------------------------------------------
  setScene(s) {
    Object.assign(this.state, s);
  }

  update(dt) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = this.state;
    const hum = (0.1 + s.density * 0.35) * (1 - s.night * 0.35) * (s.indoors ? 0.3 : 1);
    this.hum.gain.gain.setTargetAtTime(hum, t, 0.8);
    this.rain.gain.gain.setTargetAtTime(s.rain * 0.22, t, 0.8);
    this.wind.gain.gain.setTargetAtTime(0.02 + s.wind * 0.08, t, 1.2);
    this.wind.filter.frequency.setTargetAtTime(300 + Math.sin(t * 0.3) * 150 + s.wind * 200, t, 0.5);
    // footsteps
    if (s.speed > 0.3) {
      this._stepPhase += dt * s.speed * 0.55;
      if (this._stepPhase > 1) {
        this._stepPhase -= 1;
        this.footstep(s.surface);
      }
    }
  }

  _schedule() {
    const tick = () => {
      if (!this.ready) return;
      const s = this.state;
      const r = Math.random();
      if (!s.indoors) {
        if (r < 0.12 * s.density * (1 - s.night * 0.5)) this.horn(20 + Math.random() * 200);
        else if (r < 0.14 && s.density > 0.4) this._siren();
        if (s.park > 0.3 && s.night < 0.5 && s.rain < 0.2 && Math.random() < 0.45) this._bird();
        if (Math.random() < 0.25 * s.density) this._noiseBurst(1.4, { freq: 600, type: 'lowpass', vol: 0.05 + s.density * 0.05, dest: this.bus.ambience });
      }
      this._timer = setTimeout(tick, 1200 + Math.random() * 2600);
    };
    tick();
    this._musicLoop();
  }

  _siren() {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    const g = c.createGain();
    o.connect(g).connect(this.bus.ambience);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.035, t + 1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    for (let i = 0; i < 12; i++) {
      o.frequency.setValueAtTime(700, t + i * 0.5);
      o.frequency.linearRampToValueAtTime(1150, t + i * 0.5 + 0.25);
    }
    o.start(t);
    o.stop(t + 6.2);
  }

  _bird() {
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this._tone(base, 0.07, { vol: 0.025, when: i * 0.12, glide: base * (1.2 + Math.random() * 0.4), dest: this.bus.ambience });
  }

  // Generative lo-fi jazz ------------------------------------------------------------
  _musicLoop() {
    const PROGS = [
      [
        [62, 65, 69, 72, 76],
        [55, 59, 65, 69, 74],
        [60, 64, 67, 71, 74],
        [57, 61, 64, 67, 70],
      ],
      [
        [53, 57, 60, 64, 67],
        [52, 55, 59, 62, 67],
        [50, 53, 57, 60, 64],
        [55, 59, 62, 65, 69],
      ],
    ];
    let bar = 0;
    let prog = PROGS[0];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const playBar = () => {
      if (!this.ready) return;
      const night = this.state.night;
      const bpm = 74 - night * 8;
      const beat = 60 / bpm;
      if (bar % 16 === 0) prog = PROGS[Math.floor(Math.random() * PROGS.length)];
      const chord = prog[bar % prog.length];
      if (this.musicOn && this.volumes.music > 0) {
        // soft electric piano chord (sine + triangle), gently strummed
        chord.forEach((m, i) => {
          this._tone(mtof(m), beat * 3.2, { type: 'sine', vol: 0.028, dest: this.bus.music, attack: 0.03, when: i * 0.025 });
          this._tone(mtof(m + 12), beat * 1.6, { type: 'triangle', vol: 0.007, dest: this.bus.music, attack: 0.02, when: i * 0.025 });
        });
        // walking bass
        const root = chord[0] - 12;
        [0, 7, 12, 10].forEach((iv, k) => this._tone(mtof(root + iv), beat * 0.9, { type: 'triangle', vol: 0.05, dest: this.bus.music, when: k * beat, attack: 0.01 }));
        // brushes + soft kick
        for (let k = 0; k < 4; k++) {
          this._noiseBurst(0.09, { freq: 7000, type: 'highpass', vol: 0.012, dest: this.bus.music, when: k * beat + beat * 0.5 });
          if (k % 2 === 0) this._tone(90, 0.18, { vol: 0.07, dest: this.bus.music, when: k * beat, glide: 45 });
        }
        // occasional melody note
        if (Math.random() < 0.6) {
          const scale = chord.slice(1).map((m) => m + 12);
          const n = scale[Math.floor(Math.random() * scale.length)];
          this._tone(mtof(n), beat * 1.5, { type: 'sine', vol: 0.02, dest: this.bus.music, when: beat * (1 + Math.floor(Math.random() * 3)), attack: 0.02 });
        }
      }
      bar++;
      this._musicTimer = setTimeout(playBar, beat * 4 * 1000);
    };
    playBar();
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }
}
