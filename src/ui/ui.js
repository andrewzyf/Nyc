// UI root: HUD, toasts, prompts, fades, speech bubbles, panel management and
// keyboard shortcuts. Feature panels live in panels.js / phone.js / mapView.js.
import * as THREE from 'three';
import { h, clear } from './dom.js';
import { money, clockTime } from '../core/format.js';
import { MONTHS_SHORT, WEEKDAYS_SHORT, TIME_SPEEDS } from '../systems/clock.js';
import { LINE_BY_ID, STATION_BY_ID } from '../systems/transit.js';
import { EMPLOYER_BY_ID } from '../systems/career.js';
import { Phone } from './phone.js';
import { Panels } from './panels.js';
import { TitleScreen } from './title.js';
import { Creator } from './creator.js';

const v3 = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    game.ui = this;
    this.root = document.getElementById('ui');
    this.panelOpen = false;
    this.toasts = [];
    this.lastCash = null;
    this._build();
    this.phone = new Phone(this);
    this.panels = new Panels(this);
    this.title = new TitleScreen(this);
    this.creator = new Creator(this);
    this._keys();
  }

  _build() {
    const r = this.root;
    this.loading = h('div#loading', h('div.logo', 'NEW YORK', h('br'), h('span', 'MINUTE')), h('div.bar', (this.loadBar = h('div'))), (this.loadMsg = h('div.msg', 'Loading…')));
    this.hud = h('div#hud.hidden');
    this.hudTL = h('div.hud-tl', (this.hTime = h('div.time')), (this.hDate = h('div.date')), (this.hWx = h('div.wx')));
    this.hudTR = h('div.hud-tr', (this.hMoney = h('div.money')), (this.hJob = h('div.job')), (this.hDelta = h('div.delta')));
    this.hudBL = h('div.hud-bl', (this.hPlace = h('div.place')), (this.hHood = h('div.hood')));
    this.hudBR = h('div.hud-br');
    this.compass = h('div#compass.hidden', (this.cArrow = h('div.arrow', '↑')), (this.cText = h('span')));
    this.prompt = h('div#prompt.hidden', { onclick: () => this.game.interactTarget && this.game.interact(this.game.interactTarget) }, h('kbd', 'E'), (this.promptText = h('span')));
    this.fpsEl = h('div#fps.hidden');
    this.gigCard = h('div#gig-card.hidden');
    this.phoneBtn = h('button#phone-btn', { title: 'Phone (Tab)', onclick: () => this.phone.toggle() }, '📱', h('span.dot'));
    this.hud.append(this.hudTL, this.hudTR, this.hudBL, this.hudBR, this.compass, this.prompt, this.fpsEl, this.gigCard, this.phoneBtn);
    this.bubbles = h('div#bubbles');
    this.toastEl = h('div#toasts');
    this.panelLayer = h('div#panel-layer', {
      onpointerdown: (e) => {
        if (e.target === this.panelLayer && this._panelDismissable) this.closePanel();
      },
    });
    this.fadeEl = h('div#fade', (this.fadeLabel = h('div.label')), (this.fadeClock = h('div.clock')));
    r.append(this.loading, this.hud, this.bubbles, this.toastEl, this.panelLayer, this.fadeEl);
  }

  // Loading ---------------------------------------------------------------------
  setLoading(p, msg) {
    this.loadBar.style.width = `${Math.round(p * 100)}%`;
    if (msg) this.loadMsg.textContent = msg;
  }

  hideLoading() {
    this.loading.style.opacity = '0';
    setTimeout(() => this.loading.remove(), 700);
  }

  // Modes -----------------------------------------------------------------------
  enterPlay() {
    this.title.hide();
    this.creator.hide();
    this.hud.classList.remove('hidden');
    this.updateHud();
  }

  enterTitle() {
    this.hud.classList.add('hidden');
    this.phone.close();
    this.closePanel();
    this.title.show();
  }

  creatorViewport() {
    return this.creator.viewport;
  }

  // HUD --------------------------------------------------------------------------
  updateHud() {
    const g = this.game;
    if (g.mode !== 'play') return;
    const c = g.clock;
    const { month, day } = c.date;
    this.hTime.textContent = clockTime(c.minuteOfDay);
    if (g.clock.speed !== 'normal') this.hTime.append(h('span.speed', TIME_SPEEDS[g.clock.speed].label.toUpperCase()));
    this.hDate.textContent = `${WEEKDAYS_SHORT[c.weekday]}, ${MONTHS_SHORT[month]} ${day} · ${cap(c.season)}`;
    const snap = g.weather.snapshot();
    this.hWx.textContent = `${g.weather.icon(g.env.state.night > 0.5)} ${snap.temperature}°F · ${snap.label}`;
    const cash = g.economy.cash;
    this.hMoney.textContent = money(cash);
    this.hMoney.classList.toggle('neg', cash < 0);
    if (this.lastCash != null && Math.abs(cash - this.lastCash) >= 0.5) {
      const d = cash - this.lastCash;
      this.hDelta.textContent = `${d > 0 ? '+' : '−'}${money(Math.abs(d), { cents: Math.abs(d) < 100 })}`;
      this.hDelta.style.color = d > 0 ? '#9ff2b5' : '#ffb0a8';
      this.hDelta.style.opacity = '1';
      clearTimeout(this._deltaT);
      this._deltaT = setTimeout(() => (this.hDelta.style.opacity = '0'), 2200);
    }
    this.lastCash = cash;
    const j = g.career.job;
    this.hJob.textContent = j ? `${g.career.title()} · ${this.employerName(j.employer)}` : g.gigs.state.online ? 'DashRun courier' : 'Unemployed';
    const loc = g.model.describe(g.player.pos.x, g.player.pos.z);
    this.hPlace.textContent = loc.place;
    this.hHood.textContent = [loc.hood !== loc.place ? loc.hood : null, loc.borough].filter(Boolean).join(' · ');
    // Needs pills: only when relevant
    clear(this.hudBR);
    const n = g.needs.state;
    const pill = (icon, label, v, color) => h('div.need-pill', icon, label, h('div.b', h('i', { style: { width: `${v}%`, background: color } })));
    if (n.satiety < 35) this.hudBR.append(pill('🍕', 'Hungry', n.satiety, '#ffb74d'));
    if (n.energy < 30) this.hudBR.append(pill('😴', 'Tired', n.energy, '#90caf9'));
    if (n.mood < 30) this.hudBR.append(pill('🌧️', 'Low mood', n.mood, '#ce93d8'));
    if (snap.kind === 'rain' && !g.inventory.isEquipped('umbrella') && !g.ui.isBlocking()) this.hudBR.append(h('div.need-pill', '☔', 'Getting soaked'));
    // FPS
    this.fpsEl.classList.toggle('hidden', !g.settings.showFps);
    if (g.settings.showFps) this.fpsEl.textContent = `${Math.round(g.fps || 0)} fps · ${g.renderer.info.render.calls} draws · ${Math.round(g.renderer.info.render.triangles / 1000)}k tris`;
    this.phoneBtn.classList.toggle('alert', this.phone.hasAlerts());
    this._updateGigCard();
    g.checkWaypointArrival();
  }

  employerName(id) {
    return EMPLOYER_BY_ID[id]?.name || '';
  }

  updateFrame(dt) {
    const g = this.game;
    // Compass to waypoint / gig
    const target = g.gigs.order ? (g.gigs.order.stage === 'pickup' ? g.gigs.order.pickup : g.gigs.order.dropoff) : g.waypoint;
    if (target && !this.panelOpen && !this.phone.isOpen) {
      const p = g.player.pos;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const ang = Math.atan2(dx, dz) - g.rig.yaw;
      this.cArrow.style.transform = `rotate(${-ang}rad)`;
      const label = g.gigs.order ? (g.gigs.order.stage === 'pickup' ? `Pick up · ${g.gigs.order.pickup.name}` : `Deliver · ${g.gigs.order.dropoff.address}`) : target.label || 'Waypoint';
      const mins = Math.round(g.transit.walkMinutes(dist * 1.2));
      this.cText.textContent = `${label} · ${dist > 1000 ? `${(dist / 1000).toFixed(1)} km` : `${Math.round(dist)} m`} · ~${mins} min walk`;
      this.compass.classList.remove('hidden');
    } else this.compass.classList.add('hidden');
    this._updateBubbles();
  }

  _updateBubbles() {
    const g = this.game;
    const list = g.pedestrians.bubbles;
    const cam = g.camera;
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    this._bubbleEls = this._bubbleEls || new Map();
    const seen = new Set();
    for (const b of list) {
      const a = b.agent;
      v3.set(a.x, a.y + 2.25 * a.height, a.z).project(cam);
      if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) continue;
      let el = this._bubbleEls.get(b);
      if (!el) {
        el = h('div.bubble', b.text);
        this.bubbles.append(el);
        this._bubbleEls.set(b, el);
      }
      seen.add(b);
      el.style.left = `${((v3.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v3.y) / 2) * hgt}px`;
      el.style.opacity = Math.min(1, b.ttl);
    }
    for (const [b, el] of this._bubbleEls) {
      if (!seen.has(b)) {
        el.remove();
        this._bubbleEls.delete(b);
      }
    }
  }

  setPrompt(text) {
    if (!text || this.panelOpen || this.phone.isOpen) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.promptText.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  // Toasts ------------------------------------------------------------------------
  toast(text, { icon = 'ℹ️', kind = '', big = false, duration } = {}) {
    const el = h(`div.toast${big ? '.big' : ''}${kind ? `.${kind}` : ''}`, h('span.ic', icon), h('span', text));
    this.toastEl.append(el);
    while (this.toastEl.children.length > 3) this.toastEl.firstChild.remove();
    const ms = duration || Math.min(9000, 3200 + text.length * 35);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms);
    this.phone.pushNotification?.({ text, icon, t: this.game.clock?.t });
  }

  discover(l) {
    const el = h('div.discover', h('small', 'Discovered'), h('h3', l.name), h('p', l.blurb));
    this.root.append(el);
    setTimeout(() => el.remove(), 5600);
  }

  // Fades --------------------------------------------------------------------------
  fade(on, label = '') {
    return new Promise((resolve) => {
      if (on) {
        this.fadeLabel.textContent = label;
        this.fadeClock.textContent = '';
        clear(this.fadeEl).append(this.fadeLabel, this.fadeClock);
        this.fadeEl.classList.add('on');
        this._fadeTick = setInterval(() => {
          const c = this.game.clock;
          this.fadeClock.textContent = `${clockTime(c.minuteOfDay)} · ${c.label()}`;
        }, 60);
        setTimeout(resolve, 480);
      } else {
        clearInterval(this._fadeTick);
        setTimeout(() => {
          this.fadeEl.classList.remove('on');
          setTimeout(resolve, 450);
        }, 250);
      }
    });
  }

  /** Subway ride sequence: bullet + stops ticking by. Leaves the screen faded. */
  subwayRide(plan) {
    return new Promise((resolve) => {
      const leg = plan.legs[0];
      const line = LINE_BY_ID[leg.line];
      const ride = h('div.ride');
      const allStops = [];
      plan.legs.forEach((l, li) => {
        const ln = LINE_BY_ID[l.line];
        l.stops.forEach((s, si) => {
          if (li > 0 && si === 0) return;
          allStops.push({ name: STATION_BY_ID[s].name, color: ln.color, transfer: li > 0 && si === 1 ? ln : null });
        });
      });
      const head = h('div.head', h('span.bullet', { style: { background: line.color, color: line.text } }, line.name.split(' ')[0]), `${line.name.replace(/ /g, ' · ')} train`);
      const stopsEl = h('div.stops');
      const els = allStops.map((s) => h('div.stop', { style: { color: '#fff' } }, h('span.pip', { style: { color: s.color } }), s.name, s.transfer ? h('small', { style: { opacity: 0.7 } }, ` — transfer to the ${s.transfer.name}`) : null));
      stopsEl.append(...els);
      const announce = h('div.announce', plan.delays.length ? `We are delayed because of ${plan.delays[0].reason}. Thank you for your patience.` : 'Stand clear of the closing doors, please.');
      ride.append(head, stopsEl, announce, h('div.clock', { style: { marginTop: '10px', opacity: 0.6 } }, `${plan.minutes} min · ${plan.transfers} transfer${plan.transfers === 1 ? '' : 's'}`));
      clear(this.fadeEl).append(ride);
      this.fadeEl.classList.add('on');
      let i = 0;
      const step = Math.max(180, Math.min(520, 3200 / els.length));
      const tick = () => {
        els.forEach((e, k) => {
          e.classList.toggle('on', k === i);
          e.classList.toggle('past', k < i);
        });
        if (els[i]) els[i].scrollIntoView({ block: 'nearest' });
        i++;
        if (i < els.length) setTimeout(tick, step);
        else {
          this.game.audio.chime();
          setTimeout(resolve, 650);
        }
      };
      setTimeout(tick, 500);
    });
  }

  // Panels ----------------------------------------------------------------------------
  isBlocking() {
    return this.panelOpen || this.phone.isOpen || this.title.visible || this.creator.visible;
  }

  /** Open a modal card. */
  openPanel({ icon = '🗽', iconBg, title, sub, body, footer, wide = false, dismissable = true, onClose }) {
    this.closePanel();
    const close = h('button.close', { onclick: () => this.closePanel(), title: 'Close (Esc)' }, '✕');
    const head = h('div.ph', h('div.icon', { style: iconBg ? { background: iconBg } : null }, icon), h('div', h('h3', title), sub ? h('div.sub', sub) : null), dismissable ? close : null);
    const pb = h('div.pb', body);
    const panel = h(`div.panel${wide ? '.wide' : ''}`, head, pb, footer ? h('div.pf', footer) : null);
    this.panelLayer.append(panel);
    this.panelLayer.classList.add('open');
    this.panelOpen = true;
    this._panelDismissable = dismissable;
    this._onClose = onClose;
    this.prompt.classList.add('hidden');
    this.currentPanel = { panel, body: pb };
    return this.currentPanel;
  }

  setPanelBody(...nodes) {
    if (!this.currentPanel) return;
    clear(this.currentPanel.body).append(...nodes.flat().filter(Boolean));
  }

  closePanel(silent = false) {
    if (!this.panelOpen && !this.panelLayer.children.length) return;
    clear(this.panelLayer);
    this.panelLayer.classList.remove('open');
    this.panelOpen = false;
    this.currentPanel = null;
    const cb = this._onClose;
    this._onClose = null;
    if (!silent) cb?.();
  }

  // Delegates to feature modules
  showPlace(poi) {
    this.panels.place(poi);
  }
  showWorkplace(poi) {
    this.panels.workplace(poi);
  }
  showSubway(poi) {
    this.panels.subway(poi);
  }
  showBus(poi) {
    this.panels.bus(poi);
  }
  showHome() {
    this.panels.home();
  }
  showListing(l, opts) {
    this.panels.listing(l, opts);
  }
  showBench(it) {
    this.panels.bench(it);
  }
  showEventJoin(e) {
    this.panels.eventJoin(e);
  }
  showCourses(poi) {
    this.panels.courses(poi);
  }
  showWardrobe(opts) {
    this.panels.wardrobe(opts);
  }
  showAdvice() {
    this.panels.advice();
  }
  showCaseworker() {
    this.panels.caseworker();
  }
  offerGig(order) {
    this.pendingOffer = order;
    this._updateGigCard(true);
  }
  openMap(opts) {
    this.panels.map(opts);
  }

  _updateGigCard(force) {
    const g = this.game;
    const o = g.gigs.order;
    const offer = this.pendingOffer;
    if (!g.gigs.state.online || (!o && !offer)) {
      this.gigCard.classList.add('hidden');
      return;
    }
    if (!force && this._gigKey === (o ? `${o.id}-${o.stage}` : offer?.id)) return;
    this._gigKey = o ? `${o.id}-${o.stage}` : offer?.id;
    clear(this.gigCard);
    const card = h('div.card', { style: { boxShadow: 'var(--shadow)', color: 'var(--ink)', marginBottom: 0 } });
    if (o) {
      card.append(
        h('div.spread', h('b', '🛵 DashRun'), h('span.tag', o.stage === 'pickup' ? 'Go to pickup' : 'Deliver')),
        h('div', { style: { fontSize: '13px', marginTop: '6px', lineHeight: 1.4 } }, o.stage === 'pickup' ? `Pick up ${o.items} at ${o.pickup.name}` : `Drop off at ${o.dropoff.address} for ${o.customer}`),
        h('div.sub', `${money(o.pay + o.tip, { cents: true })} est. · ${o.limit} min window`),
        h('div.row', { style: { marginTop: '8px' } }, h('button.btn.small.ghost', { onclick: () => { g.gigs.cancel(); g._refreshMarkers(); this._updateGigCard(true); } }, 'Cancel order')),
      );
    } else {
      card.append(
        h('div.spread', h('b', '🛵 New order'), h('b', money(offer.pay + offer.tip, { cents: true }))),
        h('div', { style: { fontSize: '13px', marginTop: '6px', lineHeight: 1.4 } }, `${offer.items} · ${offer.pickup.name} → ${offer.dropoff.address}`),
        h('div.sub', `${offer.distance} m trip · ${offer.limit} min window`),
        h(
          'div.row',
          { style: { marginTop: '8px' } },
          h('button.btn.small.green', { onclick: () => { g.gigs.accept(offer); this.pendingOffer = null; g._refreshMarkers(); g.audio.notify(); this._updateGigCard(true); } }, 'Accept'),
          h('button.btn.small.ghost', { onclick: () => { this.pendingOffer = null; this._updateGigCard(true); } }, 'Decline'),
        ),
      );
    }
    this.gigCard.append(card);
    this.gigCard.classList.remove('hidden');
  }

  // Keyboard -------------------------------------------------------------------------
  _keys() {
    const g = this.game;
    g.input.on('key', ({ code, event }) => {
      if (g.mode !== 'play') {
        if (code === 'Escape' && this.creator.visible) this.creator.back();
        return;
      }
      if (g.busy) return;
      if (code === 'Escape') {
        if (this.panelOpen) this.closePanel();
        else if (this.phone.isOpen) this.phone.back();
        else this.phone.open('settings');
        return;
      }
      if (event.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      const appKeys = { KeyM: 'map', KeyJ: 'jobs', KeyH: 'homes', KeyB: 'bank', KeyC: 'me', KeyI: 'bag', KeyN: 'news', KeyT: 'transit', KeyG: 'gigs' };
      if (code === 'Tab' || code === 'KeyP') {
        this.closePanel();
        this.phone.toggle();
        return;
      }
      if (appKeys[code] && !this.panelOpen) {
        g.audio.init();
        if (code === 'KeyM') {
          this.phone.close();
          this.openMap();
        } else this.phone.open(appKeys[code]);
        return;
      }
      if (this.panelOpen || this.phone.isOpen) return;
      if (code === 'KeyV') {
        const fp = g.rig.toggleFirstPerson();
        this.toast(fp ? 'First-person view' : 'Third-person view', { icon: '🎥', duration: 1500 });
      }
      if (code === 'BracketRight' || code === 'BracketLeft') {
        const keys = Object.keys(TIME_SPEEDS);
        const i = keys.indexOf(g.clock.speed);
        const ni = Math.max(0, Math.min(keys.length - 1, i + (code === 'BracketRight' ? 1 : -1)));
        g.setTimeSpeed(keys[ni]);
        this.toast(`Time: ${TIME_SPEEDS[keys[ni]].label} (${TIME_SPEEDS[keys[ni]].desc})`, { icon: '⏱️', duration: 2000 });
        this.updateHud();
      }
    });
    // First user gesture unlocks audio
    const unlock = () => {
      g.audio.init();
      g.applySettings?.();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }
}

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}
