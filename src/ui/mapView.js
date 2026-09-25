// Interactive vector map of the city: pan/zoom, subway lines, landmarks, homes, jobs,
// events and the player. Click to inspect a spot and set a waypoint or hail a taxi.
import { h } from './dom.js';
import { LINES, STATIONS } from '../data/transit.js';
import { LANDMARKS } from '../data/landmarks.js';
import { NEIGHBORHOODS, BROADWAY } from '../data/geography.js';
import { STATION_BY_ID } from '../systems/transit.js';
import { EMPLOYER_BY_ID } from '../systems/career.js';

const COL = {
  water: '#a9cfe0',
  land: '#fbf8f1',
  backdrop: '#e3dfd2',
  block: '#e9e1d0',
  park: '#bddca4',
  plaza: '#e4d9c4',
  lake: '#a9cfe0',
  broadway: '#ffffff',
  bridge: '#8b8f96',
};

export class MapView {
  constructor(game, { height = '100%', onAction, compact = false } = {}) {
    this.game = game;
    this.onAction = onAction;
    this.layers = { subway: true, landmarks: true, homes: true, jobs: true, events: true };
    const p = game.player?.pos || { x: 0, z: 0 };
    this.cx = p.x;
    this.cz = p.z;
    this.scale = compact ? 0.35 : 0.5; // px per meter (CSS px)
    this.canvas = h('canvas');
    this.info = h('div.mapinfo.hidden');
    const toggle = (key, label) => {
      const b = h(`button.chip${this.layers[key] ? '.on' : ''}`, {
        onclick: () => {
          this.layers[key] = !this.layers[key];
          b.classList.toggle('on', this.layers[key]);
          this.draw();
        },
      }, label);
      return b;
    };
    const tools = h(
      'div.maptools',
      h('button.btn.small', { onclick: () => this.centerOnPlayer() }, '◎ Me'),
      h('button.btn.small.ghost', { style: { background: 'var(--card)' }, onclick: () => this.zoom(1.4) }, '+'),
      h('button.btn.small.ghost', { style: { background: 'var(--card)' }, onclick: () => this.zoom(1 / 1.4) }, '−'),
      game.waypoint ? h('button.btn.small.ghost', { style: { background: 'var(--card)' }, onclick: () => { game.setWaypoint(null); this.draw(); } }, 'Clear waypoint') : null,
    );
    const legend = h('div.maplegend', toggle('subway', '🚇 Subway'), toggle('landmarks', '🗽 Landmarks'), toggle('homes', '🏠 Homes'), toggle('jobs', '💼 Jobs'), toggle('events', '🎉 Events'));
    this.el = h('div.mapwrap', { style: { height } }, this.canvas, tools, legend, this.info);
    this._bind();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.el);
    this._timer = setInterval(() => this.draw(), 400);
  }

  destroy() {
    clearInterval(this._timer);
    this.ro.disconnect();
  }

  centerOnPlayer() {
    const p = this.game.player.pos;
    this.cx = p.x;
    this.cz = p.z;
    this.draw();
  }

  zoom(f, px, py) {
    const old = this.scale;
    this.scale = Math.max(0.06, Math.min(4, this.scale * f));
    if (px != null) {
      const W = this.canvas.clientWidth;
      const H = this.canvas.clientHeight;
      const wx = this.cx + (px - W / 2) / old;
      const wz = this.cz + (py - H / 2) / old;
      this.cx = wx - (px - W / 2) / this.scale;
      this.cz = wz - (py - H / 2) / this.scale;
    }
    this.draw();
  }

  toWorld(px, py) {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    return { x: this.cx + (px - W / 2) / this.scale, z: this.cz + (py - H / 2) / this.scale };
  }

  _bind() {
    const c = this.canvas;
    let drag = null;
    const pointers = new Map();
    c.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (pointers.size === 2) {
        const prev = [...pointers.values()];
        const d0 = Math.hypot(prev[0].x - prev[1].x, prev[0].y - prev[1].y);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const now = [...pointers.values()];
        const d1 = Math.hypot(now[0].x - now[1].x, now[0].y - now[1].y);
        if (d0 > 0) this.zoom(d1 / d0);
        drag = null;
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      this.cx = drag.cx - dx / this.scale;
      this.cz = drag.cz - dy / this.scale;
      this.draw();
    });
    c.addEventListener('pointerup', (e) => {
      pointers.delete(e.pointerId);
      if (drag && !drag.moved) {
        const r = c.getBoundingClientRect();
        this._click(e.clientX - r.left, e.clientY - r.top);
      }
      drag = null;
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = c.getBoundingClientRect();
        this.zoom(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false },
    );
  }

  _features() {
    const g = this.game;
    const f = [];
    if (this.layers.landmarks) for (const l of LANDMARKS) f.push({ x: l.x, z: l.z, kind: 'landmark', name: l.name, sub: l.blurb, found: g.discovery.state.landmarks.includes(l.id) });
    if (this.layers.subway) for (const s of STATIONS) {
      const e = g.model.poiById.get(`sub-${s.id}`);
      f.push({ x: e.x, z: e.z, kind: 'station', name: s.name, station: s.id });
    }
    if (this.layers.homes) for (const l of g.housing.state.listings) f.push({ x: l.x, z: l.z, kind: 'listing', name: `${l.typeLabel} · $${l.rent.toLocaleString()}/mo`, sub: `${l.address} · ${l.hoodName}`, listing: l });
    const h = g.housing.home;
    if (h?.x != null) f.push({ x: h.x, z: h.z, kind: 'home', name: 'Home', sub: g.housing.homeLabel() });
    if (g.career.job) {
      const w = g.model.poiById.get(`work-${g.career.job.employer}`);
      if (w) f.push({ x: w.x, z: w.z, kind: 'work', name: EMPLOYER_BY_ID[g.career.job.employer].name, sub: 'Your workplace' });
    }
    if (this.layers.jobs) {
      for (const a of g.career.state.applications) {
        if (a.status !== 'interview') continue;
        const w = g.model.poiById.get(`work-${a.employer}`);
        if (w) f.push({ x: w.x, z: w.z, kind: 'interview', name: `Interview: ${EMPLOYER_BY_ID[a.employer].name}`, sub: 'Scheduled interview' });
      }
    }
    if (this.layers.events) {
      for (const e of g.events.state.today) {
        const at = e.at || e.route?.[0];
        if (at) f.push({ x: at[0], z: at[1], kind: 'event', name: e.name, sub: e.desc, active: g.events.active().includes(e) });
      }
    }
    return f;
  }

  _click(px, py) {
    const g = this.game;
    const w = this.toWorld(px, py);
    let best = null;
    let bd = 14;
    for (const f of this._features()) {
      const sx = (f.x - w.x) * this.scale;
      const sy = (f.z - w.z) * this.scale;
      const d = Math.hypot(sx, sy);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    const target = best || { x: w.x, z: w.z, kind: 'spot', name: g.model.describe(w.x, w.z).place, sub: g.model.describe(w.x, w.z).hood };
    this.selected = target;
    const walkable = g.model.isWalkable(target.x, target.z) || best;
    this.info.classList.remove('hidden');
    this.info.replaceChildren(
      h('b', target.name),
      target.sub ? h('div', { style: { color: 'var(--muted)', fontSize: '12px', marginTop: '2px', lineHeight: 1.35 } }, target.sub) : null,
      walkable
        ? h(
            'div.row',
            { style: { marginTop: '8px', flexWrap: 'wrap' } },
            h('button.btn.small.yellow', { onclick: () => this._act('waypoint', target) }, '📍 Set waypoint'),
            h('button.btn.small', { onclick: () => this._act('taxi', target) }, '🚕 Taxi here'),
            target.listing ? h('button.btn.small.ghost', { onclick: () => this._act('listing', target) }, 'Details') : null,
          )
        : h('div', { style: { fontSize: '12px', marginTop: '6px' } }, 'That’s water. Even New Yorkers can’t walk on it.'),
    );
    this.draw();
  }

  _act(kind, t) {
    const g = this.game;
    if (kind === 'waypoint') {
      const spot = g.nearestWalkable(t.x, t.z);
      g.setWaypoint({ x: spot.x, z: spot.z, label: t.name, kind: t.kind === 'listing' ? 'view' : t.kind === 'work' || t.kind === 'interview' ? 'work' : t.kind === 'home' ? 'home' : 'waypoint' });
      g.ui.toast(`Waypoint set: ${t.name}`, { icon: '📍', duration: 2500 });
    }
    this.onAction?.(kind, t);
    this.draw();
  }

  draw() {
    const c = this.canvas;
    const W = c.clientWidth;
    const H = c.clientHeight;
    if (!W || !H) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = this.scale;
    const ox = W / 2 - this.cx * s;
    const oy = H / 2 - this.cz * s;
    const X = (x) => ox + x * s;
    const Y = (z) => oy + z * s;
    const view = { x0: this.cx - W / 2 / s, x1: this.cx + W / 2 / s, z0: this.cz - H / 2 / s, z1: this.cz + H / 2 / s };
    const vis = (r) => r.x1 >= view.x0 && r.x0 <= view.x1 && r.z1 >= view.z0 && r.z0 <= view.z1;
    const model = this.game.model;
    g.fillStyle = COL.water;
    g.fillRect(0, 0, W, H);
    const poly = (pts, fill) => {
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    for (const isl of model.islands) if (vis(isl.bounds)) poly(isl.poly, isl.walkable ? COL.land : COL.backdrop);
    g.fillStyle = COL.block;
    for (const b of model.blocks) {
      if (b.park || !vis(b)) continue;
      g.fillRect(X(b.x0), Y(b.z0), (b.x1 - b.x0) * s, (b.z1 - b.z0) * s);
    }
    for (const p of model.parks) {
      if (!vis(p.rect)) continue;
      const fill = p.kind === 'plaza' ? COL.plaza : COL.park;
      if (p.poly) poly(p.poly, fill);
      else {
        g.fillStyle = fill;
        g.fillRect(X(p.rect.x0), Y(p.rect.z0), (p.rect.x1 - p.rect.x0) * s, (p.rect.z1 - p.rect.z0) * s);
      }
      g.fillStyle = COL.lake;
      for (const w of p.water) {
        g.beginPath();
        g.ellipse(X(w.x), Y(w.z), w.rx * s, w.rz * s, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    // Broadway
    g.strokeStyle = COL.broadway;
    g.lineWidth = Math.max(1.5, BROADWAY.width * s * 0.8);
    g.beginPath();
    BROADWAY.points.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.stroke();
    // Bridges
    g.strokeStyle = COL.bridge;
    g.lineWidth = Math.max(2, 10 * s);
    for (const b of model.bridges) {
      g.beginPath();
      b.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
      g.stroke();
    }
    // Subway lines
    if (this.layers.subway) {
      g.lineWidth = Math.max(2, Math.min(5, 6 * s));
      g.lineCap = 'round';
      g.lineJoin = 'round';
      LINES.forEach((line, li) => {
        g.strokeStyle = line.color;
        g.globalAlpha = 0.85;
        g.beginPath();
        const off = (li % 3 - 1) * 2.2;
        line.stations.forEach((id, i) => {
          const st = STATION_BY_ID[id];
          i ? g.lineTo(X(st.x) + off, Y(st.z) + off) : g.moveTo(X(st.x) + off, Y(st.z) + off);
        });
        g.stroke();
      });
      g.globalAlpha = 1;
      if (s > 0.2) {
        for (const st of STATIONS) {
          g.beginPath();
          g.arc(X(st.x), Y(st.z), Math.max(2.5, 4 * Math.min(1, s * 2)), 0, Math.PI * 2);
          g.fillStyle = '#fff';
          g.fill();
          g.lineWidth = 1.5;
          g.strokeStyle = '#1d2433';
          g.stroke();
        }
      }
    }
    // Labels
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (s < 1.2) {
      g.font = `800 ${Math.round(Math.max(10, Math.min(15, 28 * s)))}px Inter, sans-serif`;
      for (const hd of NEIGHBORHOODS) {
        if (['manhattan', 'brooklyn', 'central-park'].includes(hd.id)) continue;
        const [x0, x1, z0, z1] = hd.rect;
        let cx = (x0 + x1) / 2;
        let cz = (z0 + z1) / 2;
        if (!model.isLand(cx, cz)) continue;
        g.fillStyle = 'rgba(29,36,51,0.55)';
        g.fillText(hd.name.toUpperCase(), X(cx), Y(cz));
      }
    }
    // Features
    const feats = this._features();
    for (const f of feats) {
      const x = X(f.x);
      const y = Y(f.z);
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (f.kind === 'station') continue;
      const icon = { landmark: f.found ? '★' : '☆', listing: '⌂', home: '🏠', work: '💼', interview: '💼', event: '🎉' }[f.kind];
      if (!icon) continue;
      if (f.kind === 'landmark') {
        g.font = `bold ${s > 0.6 ? 18 : 14}px Inter, sans-serif`;
        g.fillStyle = f.found ? '#d9a80f' : '#6b7384';
        g.fillText(icon, x, y);
        if (s > 0.7) {
          g.font = '600 11px Inter, sans-serif';
          g.fillStyle = '#1d2433';
          g.fillText(f.name, x, y + 14);
        }
      } else if (f.kind === 'listing') {
        g.fillStyle = '#7a4fbf';
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#fff';
        g.font = 'bold 9px Inter, sans-serif';
        g.fillText('⌂', x, y + 0.5);
      } else {
        g.font = `${f.kind === 'event' && f.active ? 22 : 18}px sans-serif`;
        g.fillText(icon, x, y);
      }
    }
    // Waypoint + gig
    const gg = this.game;
    const wp = gg.waypoint;
    if (wp) this._pin(g, X(wp.x), Y(wp.z), '#f7c325');
    const o = gg.gigs.order;
    if (o) this._pin(g, X(o.stage === 'pickup' ? o.pickup.x : o.dropoff.x), Y(o.stage === 'pickup' ? o.pickup.z : o.dropoff.z), '#ff8a3a');
    if (this.selected) {
      g.strokeStyle = '#1d2433';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(this.selected.x), Y(this.selected.z), 10, 0, Math.PI * 2);
      g.stroke();
    }
    // Player arrow
    const p = gg.player.pos;
    const px = X(p.x);
    const py = Y(p.z);
    const hd = gg.player.heading;
    g.save();
    g.translate(px, py);
    g.rotate(-hd + Math.PI);
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 9);
    g.lineTo(0, 4);
    g.lineTo(-8, 9);
    g.closePath();
    g.fillStyle = '#e63946';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.stroke();
    g.fill();
    g.restore();
    // scale bar
    const meters = s > 1 ? 50 : s > 0.4 ? 200 : s > 0.15 ? 500 : 1000;
    g.fillStyle = '#1d2433';
    g.fillRect(W - 20 - meters * s, H - 18, meters * s, 3);
    g.font = '600 11px Inter, sans-serif';
    g.textAlign = 'right';
    g.fillText(`${meters} m`, W - 20, H - 28);
  }

  _pin(g, x, y, color) {
    g.fillStyle = color;
    g.strokeStyle = '#1d2433';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(x, y - 14, 8, 0, Math.PI * 2);
    g.moveTo(x - 6, y - 10);
    g.lineTo(x, y);
    g.lineTo(x + 6, y - 10);
    g.fill();
    g.stroke();
  }
}
