// Modal panels for interacting with the world: businesses, workplaces, interviews,
// subway & bus, home, apartment viewings, benches, events, courses and the wardrobe.
import { h, bar } from './dom.js';
import { money, clockTime, duration, hourLabel } from '../core/format.js';
import { CAREERS, COURSES, COURSE_HOURS, SKILLS, SCHEDULES } from '../data/careers.js';
import { STATIONS, LINES, BUS_ROUTES } from '../data/transit.js';
import { ITEMS } from '../data/items.js';
import { EMPLOYER_BY_ID, levelInfo, certLabel } from '../systems/career.js';
import { LINE_BY_ID, STATION_BY_ID, linesAt, BUS_BY_ID } from '../systems/transit.js';
import { HOOD_BY_ID } from '../systems/housing.js';
import { apartmentIllustration } from './illustrations.js';
import { MapView } from './mapView.js';
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES, OUTFITS, FACIAL_HAIR, HATS } from '../player/characterModel.js';

const PLACE_ICONS = {
  bodega: '🥪', pizza: '🍕', coffee: '☕', bagel: '🥯', diner: '🍳', restaurant: '🍽️', fancy: '🥂', deli: '🥩', bakery: '🧁', bar: '🍺', rooftop: '🍸',
  grocery: '🛒', pharmacy: '💊', clothing: '👗', barber: '💈', gym: '🏋️', laundromat: '🧺', bookstore: '📚', electronics: '💻', library: '📖', hostel: '🛏️',
  shelter: '🏠', college: '🎓', theater: '🎭', comedy: '🎤', jazz: '🎷', cinema: '🎬', cart: '🌭', icecream: '🍦', bank: '🏦',
};

export function lineBullet(line, size = 22) {
  return h('span.bullet', { style: { background: line.color, color: line.text, width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.55)}px` } }, line.name.split(' ')[0]);
}

export class Panels {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
  }

  _result(r) {
    if (!r || r.silent) return;
    this.ui.toast(r.msg || (r.ok ? 'Done.' : 'Can’t do that.'), { icon: r.ok ? '✅' : '⚠️', duration: 3500 });
    if (!r.ok) this.game.audio.error();
  }

  // Businesses ------------------------------------------------------------------
  place(poi) {
    const g = this.game;
    const def = g.placeDef(poi);
    if (!def) return;
    const render = () => {
      const open = g.isOpen(poi);
      const [o, c] = def.hours || [0, 24];
      const hours = o === 0 && c === 24 ? 'Open 24 hours' : `${hourLabel(o)} – ${hourLabel(c % 24)}`;
      const show = def.shows ? def.shows[Math.abs(hashStr(poi.id)) % def.shows.length] : null;
      const actions = (def.actions || []).filter((a) => !a.seasons || a.seasons.includes(g.clock.season));
      return [
        !open ? h('div.note.warn', `Closed right now. ${hours}.`) : null,
        show ? h('div.note', `Now playing: “${show}”. Curtain at 7:30 PM.`) : null,
        poi.type === 'bodega' ? h('div.note', 'A cat is asleep on the bread. This is normal.') : null,
        h(
          'div.actions',
          actions.map((a) => {
            const needs = a.requires && !g.inventory.has(a.requires);
            return h(
              'button.action',
              {
                disabled: !open || needs,
                onclick: async () => {
                  const r = await g.doPlaceAction(poi, a);
                  this._result(r);
                  if (this.ui.currentPanel && this.ui.currentPanel.poi === poi) this.ui.setPanelBody(render());
                },
              },
              h('div.t', a.label, h('small', [a.minutes ? duration(a.minutes) : null, a.effects?.satiety ? '🍴 filling' : null, a.effects?.energy > 0 ? '⚡ energy' : null, a.effects?.mood >= 8 ? '😊 mood boost' : null, needs ? `needs ${ITEMS[a.requires].name.toLowerCase()}` : null].filter(Boolean).join(' · '))),
              h(`div.p${a.price ? '' : '.free'}`, a.price ? money(a.price, { cents: a.price % 1 !== 0 }) : 'Free'),
            );
          }),
        ),
        h('div.note', { style: { marginTop: '14px' } }, `You have ${money(g.economy.cash, { cents: true })} in checking.`),
      ];
    };
    const p = this.ui.openPanel({ icon: PLACE_ICONS[poi.type] || '🏙️', iconBg: def.color ? `${def.color}33` : null, title: poi.name, sub: `${def.label} · ${poi.address || ''}`, body: render() });
    p.poi = poi;
  }

  // Workplaces --------------------------------------------------------------------
  workplace(poi) {
    const g = this.game;
    const emp = EMPLOYER_BY_ID[poi.employer];
    const career = CAREERS[emp.career];
    const job = g.career.job;
    const body = [h('div.note', emp.blurb)];
    const footer = [];
    if (job && job.employer === emp.id) {
      const st = g.career.shiftStatus();
      const L = levelInfo(job.career, job.level);
      body.push(
        h('dl.kv', h('dt', 'Role'), h('dd', L.title), h('dt', 'Schedule'), h('dd', SCHEDULES[L.schedule].label), h('dt', 'Performance'), h('dd', bar(job.performance / 100, job.performance > 65 ? 'var(--green)' : job.performance < 30 ? 'var(--red)' : null)), h('dt', 'Earned this period'), h('dd', money(job.pending, { cents: true }))),
      );
      if (st.can) {
        if (st.late > 0) body.push(h('div.note.warn', `You're ${st.late} minutes late. Your manager noticed.`));
        body.push(h('div.h4', 'Clock in'));
        const effort = (id, label, sub) =>
          h(
            'button.action',
            {
              onclick: async () => {
                this.ui.closePanel();
                const r = await g.work(id);
                if (r.ok) this.shiftSummary(r.res);
                else this._result(r);
              },
            },
            h('div.t', label, h('small', sub)),
          );
        body.push(
          h(
            'div.actions',
            effort('coast', '😌 Coast through it', 'Less tiring. Your manager might notice.'),
            effort('normal', '💼 Work steadily', 'A solid day’s work.'),
            effort('hard', '🔥 Go above & beyond', 'Exhausting, but promotions come faster.'),
          ),
        );
      } else {
        body.push(h('div.note', st.reason + (st.next ? `. Next shift: ${this._dayLabel(st.next.day)} at ${clockTime(st.next.start)}.` : '.')));
        if (st.early) {
          footer.push(
            h('button.btn.ghost', {
              onclick: async () => {
                const s = g.career.schedule();
                const wait = s.start * 60 - 15 - g.clock.minuteOfDay;
                if (wait > 0 && wait < 8 * 60) {
                  this.ui.closePanel();
                  await g.advanceTime(wait, { label: 'Waiting for your shift…' });
                  this.workplace(poi);
                }
              },
            }, 'Wait for my shift'),
          );
        }
      }
      footer.push(
        h('button.btn.red.small', {
          onclick: () => this.confirm('Quit your job?', `You'll receive your final pay for work already done (${money(job.pending, { cents: true })}).`, () => {
            const pending = g.career.quit('Quit');
            if (pending > 0) g.economy.payroll(pending, L.salary, emp.name);
            this.ui.toast(`You quit ${emp.name}.`, { icon: '👋' });
            this.ui.closePanel();
          }),
        }, 'Quit job'),
      );
    }
    // Interviews here
    const app = g.career.state.applications.find((a) => a.employer === emp.id && a.status === 'interview');
    if (app) {
      const w = g.career.interviewWindow(app);
      const now = g.clock.t;
      const L = levelInfo(app.career, app.level);
      if (now < w.from) {
        body.push(h('div.note', `Your interview for ${L.title} is ${this._dayLabel(app.day)} at ${clockTime(app.start)}. Come back then.`));
        if (app.day === g.clock.dayIndex && w.from - now < 6 * 60)
          footer.push(
            h('button.btn.ghost', {
              onclick: async () => {
                this.ui.closePanel();
                await g.advanceTime(w.from - now + 5, { label: 'Waiting in the lobby…' });
                this.workplace(poi);
              },
            }, 'Wait in the lobby'),
          );
      } else {
        body.push(h('div.note.good', `You're here for your ${L.title} interview.`));
        footer.push(h('button.btn.green', { onclick: () => this.interview(app, Math.max(0, now - w.at)) }, 'Start interview'));
      }
    }
    // Openings
    const openings = g.career.listings().filter((l) => l.employer.id === emp.id);
    if (openings.length && !(job && job.employer === emp.id)) {
      body.push(h('div.h4', 'Openings'));
      for (const o of openings) body.push(this.jobCard(o, { inPerson: true, poi }));
    } else if (!app && !(job && job.employer === emp.id)) body.push(h('div.note', 'No openings posted right now. Listings refresh weekly.'));
    this.ui.openPanel({ icon: career.icon, title: emp.name, sub: `${career.name} · ${poi.address || ''}`, body, footer: footer.length ? footer : null });
  }

  jobCard(o, { inPerson = false, poi } = {}) {
    const g = this.game;
    const q = o.qualified;
    const card = h(
      'div.card',
      h('div.spread', h('h4', o.title), h('b', `${money(o.salary)}/yr`)),
      h('div.sub', `${o.employer.name} · ${o.schedule.label}`),
      q.ok ? h('div.tags', { style: { marginTop: '6px' } }, h('span.tag.good', 'You qualify')) : h('div.tags', { style: { marginTop: '6px' } }, q.missing.map((m) => h('span.tag.bad', `Needs ${m}`))),
    );
    const btns = h('div.row', { style: { marginTop: '10px' } });
    if (o.applied) btns.append(h('span.tag', 'Application sent — interview scheduled'));
    else {
      const walkIn = inPerson && o.level === 0 && g.clock.weekday >= 1 && g.clock.weekday <= 5 && g.clock.hour >= 9 && g.clock.hour < 18;
      if (walkIn)
        btns.append(
          h('button.btn.small.green', {
            onclick: () => {
              const app = g.career.apply(o.employer.id, o.level);
              app.day = g.clock.dayIndex;
              app.start = Math.floor(g.clock.minuteOfDay);
              this.interview(app, 0);
            },
          }, 'Interview on the spot'),
        );
      btns.append(
        h('button.btn.small', {
          onclick: () => {
            const app = g.applyForJob(o.employer.id, o.level);
            this.ui.toast(`Interview scheduled: ${this._dayLabel(app.day)} at ${clockTime(app.start)} at ${o.employer.name}. Waypoint set.`, { icon: '📅', duration: 7000 });
            g.audio.notify();
            if (poi) this.workplace(poi);
            else this.ui.phone.refresh();
          },
        }, 'Apply'),
      );
    }
    card.append(btns);
    return card;
  }

  _dayLabel(day) {
    const g = this.game;
    if (day === g.clock.dayIndex) return 'today';
    if (day === g.clock.dayIndex + 1) return 'tomorrow';
    const d = g.clock.dateOf(day);
    return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][g.clock.weekdayOf(day)]} ${d.month + 1}/${d.day}`;
  }

  interview(app, lateMinutes = 0) {
    const g = this.game;
    const emp = EMPLOYER_BY_ID[app.employer];
    const L = levelInfo(app.career, app.level);
    const questions = g.career.questionsFor(app.career, 3);
    const scores = [];
    let i = 0;
    const step = () => {
      if (i >= questions.length) return finish();
      const q = questions[i];
      this.ui.setPanelBody(
        h('div.sub', `Question ${i + 1} of ${questions.length}`),
        h('div.question', `“${q.q}”`),
        h(
          'div.actions',
          q.a.map((a) =>
            h('button.action', {
              onclick: () => {
                scores.push(a.score);
                i++;
                g.audio.click();
                step();
              },
            }, h('div.t', a.text)),
          ),
        ),
      );
    };
    const finish = async () => {
      const res = g.career.interview(app, scores, { mood: g.needs.mood, energy: g.needs.energy, suit: g.inventory.has('suit'), lateMinutes });
      g.clock.advance(45);
      if (res.hired) {
        g.career.hire(app.employer, app.level);
        g.audio.achievement();
        g.discovery.log(g.clock.dayIndex, `Hired as ${L.title} at ${emp.name}.`);
        g.setWaypoint(null);
        const next = g.career.nextShift();
        this.ui.setPanelBody(
          h('div.bigstat', '🎉 Hired!'),
          h('p', res.feedback),
          h('dl.kv', h('dt', 'Role'), h('dd', L.title), h('dt', 'Salary'), h('dd', `${money(L.salary)}/yr`), h('dt', 'Schedule'), h('dd', SCHEDULES[L.schedule].label), h('dt', 'First shift'), h('dd', next ? `${this._dayLabel(next.day)} at ${clockTime(next.start)}` : 'Soon')),
          h('div.note', 'Show up at the door and press E to clock in. Being on time matters.'),
          h('button.btn.block', { onclick: () => this.ui.closePanel() }, 'Continue'),
        );
      } else {
        g.needs.apply({ mood: -4 });
        this.ui.setPanelBody(h('div.bigstat', 'Not this time'), h('p', res.feedback), h('div.note', 'Tip: a good night’s sleep, a decent meal and an interview suit all help.'), h('button.btn.block', { onclick: () => this.ui.closePanel() }, 'Continue'));
      }
    };
    this.ui.openPanel({ icon: '🤝', title: `Interview — ${emp.name}`, sub: `${L.title} · ${money(L.salary)}/yr`, body: h('div'), dismissable: false });
    this.ui.currentPanel.panel.querySelector('.pb').append(h('div.note', lateMinutes > 0 ? `You're ${Math.round(lateMinutes)} min late. Not a great start.` : 'The hiring manager shakes your hand and offers you a seat.'));
    setTimeout(step, 50);
  }

  shiftSummary(res) {
    const body = [
      h('dl.kv', h('dt', 'Earned'), h('dd', money(res.pay, { cents: true })), h('dt', 'Performance'), h('dd', `${Math.round(res.perf)} / 100 (${res.delta >= 0 ? '+' : ''}${res.delta.toFixed(1)})`)),
      ...res.events.map((e) => h('div.note', e)),
      res.late ? h('div.note.warn', `You clocked in ${res.lateMinutes} min late.`) : null,
      res.promoted ? h('div.note.good', `🎉 Promotion! You're now ${res.promoted.title} (${money(res.promoted.salary)}/yr).`) : null,
      h('div.sub', { style: { marginTop: '10px' } }, 'Wages are paid on payday with taxes withheld.'),
    ];
    this.ui.openPanel({ icon: res.promoted ? '🏆' : '💼', title: res.promoted ? 'Promoted!' : 'Shift complete', sub: this.game.career.title(), body });
  }

  confirm(title, text, onYes) {
    this.ui.openPanel({
      icon: '❓',
      title,
      body: h('p', text),
      footer: [h('button.btn.ghost', { onclick: () => this.ui.closePanel() }, 'Cancel'), h('button.btn', { onclick: () => { this.ui.closePanel(); onYes(); } }, 'Confirm')],
    });
  }

  // Transit ---------------------------------------------------------------------------
  subway(poi) {
    const g = this.game;
    const from = poi.station;
    const lines = linesAt(from);
    let query = '';
    const quick = [];
    const nearestTo = (x, z) => g.transit.nearestStation(x, z)?.station;
    const home = g.housing.home;
    if (home?.x != null) quick.push({ label: '🏠 Home', st: nearestTo(home.x, home.z) });
    if (g.career.job) {
      const w = g.model.poiById.get(`work-${g.career.job.employer}`);
      if (w) quick.push({ label: '💼 Work', st: nearestTo(w.x, w.z) });
    }
    if (g.waypoint) quick.push({ label: '📍 Waypoint', st: nearestTo(g.waypoint.x, g.waypoint.z) });
    const delays = lines.map((l) => g.transit.lineDelay(l.id)).filter(Boolean);
    const list = h('div.list');
    const detail = h('div');
    const renderList = () => {
      list.replaceChildren(
        ...STATIONS.filter((s) => s.id !== from && (!query || s.name.toLowerCase().includes(query) || g.model.hoodAt(s.x, s.z).name.toLowerCase().includes(query)))
          .map((s) =>
            h(
              'div.li',
              { style: { cursor: 'pointer' }, onclick: () => showPlan(s.id) },
              h('div.row', { style: { gap: '3px', minWidth: '70px', flexWrap: 'wrap' } }, linesAt(s.id).map((l) => lineBullet(l, 18))),
              h('div', { style: { flex: 1 } }, h('b', s.name), h('div.sub', `${g.model.hoodAt(s.x, s.z).name}`)),
            ),
          ),
      );
    };
    const showPlan = (to) => {
      const plan = g.transit.planSubway(from, to);
      if (!plan) {
        detail.replaceChildren(h('div.note.warn', 'No route right now — service is suspended on a line you need.'));
        return;
      }
      detail.replaceChildren(
        h(
          'div.card',
          h('div.spread', h('h4', `To ${STATION_BY_ID[to].name}`), h('b', `${plan.minutes} min`)),
          h('div.sub', `${plan.transfers} transfer${plan.transfers === 1 ? '' : 's'} · ~${plan.wait} min wait · $2.90 (capped at $34/week)`),
          h(
            'div',
            { style: { marginTop: '8px' } },
            plan.legs.map((l) => h('div.row', { style: { margin: '4px 0' } }, lineBullet(LINE_BY_ID[l.line]), h('span', `${STATION_BY_ID[l.from].name} → ${STATION_BY_ID[l.to].name} (${l.stops.length - 1} stops)`))),
          ),
          plan.delays.length ? h('div.note.warn', `Delays: ${plan.delays[0].reason}.`) : null,
          h('button.btn.yellow.block', {
            style: { marginTop: '10px' },
            onclick: async () => {
              this.ui.closePanel();
              const r = await g.rideSubway(from, to);
              this._result(r);
            },
          }, 'Tap in & ride'),
        ),
      );
      detail.scrollIntoView({ block: 'nearest' });
    };
    renderList();
    const search = h('input', { type: 'text', placeholder: 'Search stations or neighborhoods…', oninput: (e) => { query = e.target.value.toLowerCase(); renderList(); } });
    this.ui.openPanel({
      icon: '🚇',
      iconBg: '#1d2433',
      title: poi.name,
      sub: h('span.row', { style: { gap: '4px', display: 'inline-flex' } }, lines.map((l) => lineBullet(l))),
      body: [
        delays.length ? h('div.note.warn', delays.map((d) => `${LINE_BY_ID[d.line].name} ${d.suspended ? 'suspended' : 'delayed'}: ${d.reason}.`).join(' ')) : null,
        quick.length ? h('div.row', { style: { flexWrap: 'wrap', marginBottom: '10px' } }, quick.filter((q) => q.st && q.st.id !== from).map((q) => h('button.chip', { onclick: () => showPlan(q.st.id) }, `${q.label} · ${q.st.name}`))) : null,
        detail,
        h('div.field', { style: { marginTop: '10px' } }, search),
        list,
      ],
    });
  }

  bus(poi) {
    const g = this.game;
    const route = BUS_BY_ID[poi.route];
    const from = poi.stop;
    const body = [h('div.note', `${route.id} — ${route.desc}. Slower than the subway, but it goes places trains don't. $2.90, same fare cap.`), h('div.h4', 'Ride to')];
    const acts = h('div.actions');
    route.stops.forEach(([x, z], i) => {
      if (i === from) return;
      const q = g.transit.busQuote(route.id, from, i);
      acts.append(
        h(
          'button.action',
          {
            onclick: async () => {
              this.ui.closePanel();
              this._result(await g.rideBus(route.id, from, i));
            },
          },
          h('div.t', g.model.streetNameAt(x, z) || `Stop ${i + 1}`, h('small', `${g.model.hoodAt(x, z).name} · ${q.stops} stops`)),
          h('div.p', `${q.minutes} min`),
        ),
      );
    });
    body.push(acts);
    this.ui.openPanel({ icon: '🚌', iconBg: '#1b6fb633', title: `${route.id} bus`, sub: poi.name, body });
  }

  // Home ---------------------------------------------------------------------------------
  home() {
    const g = this.game;
    const hm = g.housing.home;
    const acts = h('div.actions');
    const add = (label, sub, fn, disabled = false) => acts.append(h('button.action', { disabled, onclick: fn }, h('div.t', label, h('small', sub))));
    const sleepTo = (m, label) =>
      add(`😴 Sleep until ${label}`, `Energy now ${Math.round(g.needs.energy)}/100`, async () => {
        this.ui.closePanel();
        this._result(await g.sleepAt('home', null, 0, m));
      });
    if (g.clock.hour > 18 || g.clock.hour < 5) {
      sleepTo(5 * 60, '5 AM');
      sleepTo(6 * 60, '6 AM');
      sleepTo(7 * 60, '7 AM');
      sleepTo(8 * 60 + 30, '8:30 AM');
      sleepTo(10 * 60, '10 AM');
    } else {
      add('💤 Take a nap (2 hours)', `Energy now ${Math.round(g.needs.energy)}/100`, async () => {
        this.ui.closePanel();
        await g.advanceTime(120, { asleep: true, sleepQuality: 1, label: 'Napping…' });
      });
    }
    const groceries = g.inventory.count('groceries');
    add(`🍳 Cook a meal`, groceries ? `${groceries} meal${groceries === 1 ? '' : 's'} of groceries left` : 'Buy groceries at a grocery store or bodega', () => {
      this._result(g.useItem('groceries'));
      this.home();
    }, !groceries);
    add('📺 Watch TV (1 hour)', 'Relax on the couch', async () => {
      this.ui.closePanel();
      await g.advanceTime(60, { label: 'Watching a show…' });
      g.applyEffects({ mood: 7, energy: 2 });
    });
    if (g.inventory.has('laptop'))
      add('💻 Study online (2 hours)', 'Improve the skill for your career', async () => {
        this.ui.closePanel();
        await g.advanceTime(120, { label: 'Studying…' });
        g.career.addSkill(g.studySkill(), 1.8);
        g.applyEffects({ energy: -6 });
        this.ui.toast(`Your ${SKILLS[g.studySkill()]} skill improved.`, { icon: '📈' });
      });
    add('👕 Change outfit', 'Mix and match your clothes', () => this.wardrobe({ clothesOnly: true }));
    add('💾 Save game', 'Your progress also autosaves every morning', () => g.save());
    const body = [];
    if (hm.kind === 'lease') {
      body.push(apartmentIllustration({ ...hm, features: hm.features || [] }));
      body.push(h('div.row', { style: { margin: '8px 0', flexWrap: 'wrap' } }, h('span.tag', `${money(hm.rent)}/mo`), h('span.tag', '★'.repeat(hm.quality || 3)), h('span.tag', `Lease through ${this._dayLabel(hm.leaseEnd)}`)));
    }
    if (g.housing.state.arrears > 0) body.push(h('div.note.warn', `You owe ${money(g.housing.state.arrears)} in back rent.`, h('button.btn.small.red', { style: { marginLeft: '8px' }, onclick: () => { const r = g.housing.payArrears(); this.ui.toast(r > 0 ? `Paid ${money(r)} in back rent.` : 'Not enough money.', { icon: '🏠' }); this.home(); } }, 'Pay now')));
    body.push(acts);
    this.ui.openPanel({ icon: '🏠', title: 'Home', sub: g.housing.homeLabel(), body });
  }

  // Apartment listing ----------------------------------------------------------------------
  listing(l, { inPerson = false } = {}) {
    const g = this.game;
    const hood = HOOD_BY_ID[l.hood];
    const el = g.housing.eligibility(l);
    const body = [apartmentIllustration(l)];
    body.push(
      h('div.spread', { style: { marginTop: '10px' } }, h('div.bigstat', `${money(l.rent)}`), h('div', { style: { textAlign: 'right' } }, h('b', l.typeLabel), h('div.sub', `${l.sqft} sq ft · Floor ${l.floor}${l.elevator ? ' · Elevator' : ''}`))),
      h('div.tags', { style: { margin: '8px 0' } }, l.features.map((f) => h(`span.tag${isBad(f) ? '.bad' : '.good'}`, f))),
      h('p', { style: { fontSize: '14px', lineHeight: 1.5 } }, `${hood?.vibe || ''} ${l.roommates ? `You'd share with ${l.roommateBlurb}.` : ''}`),
      h('dl.kv', h('dt', 'Address'), h('dd', `${l.address}, Apt ${l.unit}`), h('dt', 'Neighborhood'), h('dd', `${l.hoodName}, ${l.borough}`), h('dt', 'Landlord'), h('dd', l.landlord), h('dt', 'Move-in cost'), h('dd', `${money(l.rent * 2 + 20)} (first month + 1 month deposit + $20 application)`), h('dt', 'Broker fee'), h('dd', 'None (FARE Act)')),
    );
    const commute = this._commute(l);
    if (commute) body.push(h('div.note', commute));
    if (!el.viewed) {
      body.push(h('div.note', 'You need to see it in person before you can apply. Most landlords won’t sign a lease sight-unseen.'));
    } else {
      body.push(h('div.h4', 'Apply & sign'));
      body.push(h('div.sub', `Landlords want income of ${el.mult}× the monthly rent (${money(el.need)}/yr). Yours: ${money(el.salary)}/yr.`));
      const acts = h('div.actions', { style: { marginTop: '8px' } });
      for (const o of el.options) {
        acts.append(
          h(
            'button.action',
            {
              disabled: !o.affordable,
              onclick: () =>
                this.confirm(`Sign the lease at ${l.address}?`, `${o.label}. You'll pay ${money(o.cost)} today. Rent of ${money(l.rent)} is due on the 1st of every month.`, () => {
                  const r = g.housing.sign(l, o.id);
                  if (r.ok) {
                    g.audio.achievement();
                    g.discovery.log(g.clock.dayIndex, `Signed a lease at ${l.address} (${l.hoodName}).`);
                    this.ui.toast(`🔑 You got the apartment! Welcome home to ${l.hoodName}.`, { big: true, icon: '🏠' });
                    g.setWaypoint({ x: l.x, z: l.z, label: 'Your new home', kind: 'home' });
                  } else this._result({ ok: false, msg: r.reason });
                }),
            },
            h('div.t', o.label, h('small', o.note)),
            h('div.p', money(o.cost)),
          ),
        );
      }
      body.push(acts);
    }
    const footer = [];
    if (!inPerson)
      footer.push(
        h('button.btn.yellow', {
          onclick: () => {
            g.setWaypoint({ x: l.x, z: l.z, label: `Viewing: ${l.address}`, kind: 'view' });
            this.ui.toast('Waypoint set. Walk to the door and press E to view.', { icon: '📍' });
            this.ui.closePanel();
            this.ui.phone.close();
          },
        }, '📍 Go see it'),
      );
    this.ui.openPanel({ icon: '🔑', title: l.headline, sub: `${l.typeLabel} · ${l.hoodName}${inPerson ? ' · You’re here for a viewing' : ''}`, body, footer: footer.length ? footer : null });
  }

  _commute(l) {
    const g = this.game;
    if (!g.career.job) return null;
    const w = g.model.poiById.get(`work-${g.career.job.employer}`);
    if (!w) return null;
    const a = g.transit.nearestStation(l.x, l.z);
    const b = g.transit.nearestStation(w.x, w.z);
    const plan = a && b && a.station.id !== b.station.id ? g.transit.planSubway(a.station.id, b.station.id) : null;
    const walk = Math.round(g.transit.walkMinutes(Math.hypot(w.x - l.x, w.z - l.z) * 1.2));
    return `Commute to work: ~${plan ? `${plan.minutes + Math.round(g.transit.walkMinutes(a.dist + b.dist))} min by subway` : 'short'} · ${walk} min on foot.`;
  }

  // Bench, events, courses --------------------------------------------------------------------
  bench(it) {
    const g = this.game;
    const night = g.clock.hour >= 22 || g.clock.hour < 5;
    const acts = h('div.actions');
    acts.append(
      h('button.action', {
        onclick: async () => {
          this.ui.closePanel();
          await g.advanceTime(30, { label: 'People-watching…', indoors: false });
          g.applyEffects({ mood: 5, energy: 3 });
          this.ui.toast(['A dog in a raincoat walked by. Perfect.', 'Someone is playing saxophone nearby.', 'A pigeon made eye contact. Respect.', 'The city hums along. You feel part of it.'][Math.floor(Math.random() * 4)], { icon: '🪑' });
        },
      }, h('div.t', 'Sit and people-watch', h('small', '30 min · a little mood & rest'))),
    );
    if (night)
      acts.append(
        h('button.action', {
          onclick: async () => {
            this.ui.closePanel();
            this._result(await g.sleepAt('bench', null, 0, 6 * 60 + 30));
          },
        }, h('div.t', 'Sleep on the bench', h('small', 'Cold and uncomfortable. A shelter is safer and free.'))),
      );
    this.ui.openPanel({ icon: '🪑', title: 'Park bench', sub: g.model.describe(it.x, it.z).place, body: acts });
  }

  eventJoin(e) {
    const g = this.game;
    const skating = e.kind === 'skating';
    this.ui.openPanel({
      icon: '🎉',
      title: e.name,
      sub: `${hourLabel(e.start / 60)} – ${hourLabel((e.end / 60) % 24)}`,
      body: [h('p', e.desc)],
      footer: [
        h('button.btn.yellow', {
          onclick: async () => {
            if (skating && !g.economy.spend(15, 'Skate rental', 'fun')) return this._result({ ok: false, msg: 'Skate rental is $15.' });
            this.ui.closePanel();
            const mins = Math.min(90, Math.max(20, e.end - g.clock.minuteOfDay));
            await g.advanceTime(mins, { label: skating ? 'Skating…' : 'Enjoying the show…', indoors: false });
            g.applyEffects({ mood: Math.round(e.mood * 0.8), energy: -5 });
            if (e.experience) g.discovery.experience(e.experience);
            this.ui.toast(skating ? 'You only fell twice. Magical.' : 'What a night. This is why you moved here.', { icon: '✨' });
          },
        }, skating ? 'Rent skates ($15)' : 'Stay for it'),
      ],
    });
  }

  courses(poi) {
    const g = this.game;
    const c = g.clock;
    const inClassTime = COURSE_HOURS.days.includes(c.weekday) && c.hour >= COURSE_HOURS.start && c.hour < COURSE_HOURS.end - 1;
    const body = [h('div.note', 'Evening classes Mon–Thu, 6–9 PM. Pay once, then attend sessions to earn the certificate.')];
    for (const course of COURSES) {
      const st = g.career.courseStatus(course.id);
      const prereq = course.requires && !g.career.hasCert(course.requires);
      const card = h('div.card', h('div.spread', h('h4', course.name), h('b', money(course.cost))), h('div.sub', course.blurb));
      const row = h('div.row', { style: { marginTop: '8px', flexWrap: 'wrap' } });
      if (st?.done) row.append(h('span.tag.good', `Completed — ${certLabel(course.cert)}`));
      else if (st) {
        row.append(h('div', { style: { flex: 1 } }, bar(st.sessions / st.total, 'var(--green)'), h('div.sub', `${st.sessions}/${st.total} sessions`)));
        row.append(
          h('button.btn.small.green', {
            disabled: !inClassTime || st.lastDay === c.dayIndex,
            onclick: async () => {
              this.ui.closePanel();
              await g.advanceTime(COURSE_HOURS.end * 60 - g.clock.minuteOfDay, { label: `Class: ${course.name}…` });
              const r = g.career.attend(course.id);
              g.applyEffects({ energy: -10, mood: 1 });
              if (r?.completed) {
                g.audio.achievement();
                this.ui.toast(`🎓 You completed ${course.name}! Earned: ${certLabel(course.cert)}.`, { big: true, icon: '🎓' });
                g.discovery.log(g.clock.dayIndex, `Completed ${course.name}.`);
              } else if (r) this.ui.toast(`Class done — ${Math.round(r.progress * 100)}% through ${course.name}.`, { icon: '🎓' });
            },
          }, st.lastDay === c.dayIndex ? 'Attended today' : inClassTime ? 'Attend class (until 9 PM)' : 'Come back 6–8 PM Mon–Thu'),
        );
      } else {
        row.append(
          h('button.btn.small', {
            disabled: prereq || !g.economy.canAfford(course.cost),
            onclick: () => {
              if (!g.economy.spend(course.cost, `Tuition — ${course.name}`, 'education')) return;
              g.career.enroll(course.id);
              g.audio.cash();
              this.ui.toast(`Enrolled in ${course.name}. Classes Mon–Thu 6–9 PM.`, { icon: '🎓' });
              this.courses(poi);
            },
          }, prereq ? `Requires ${certLabel(course.requires)}` : 'Enroll'),
        );
      }
      card.append(row);
      body.push(card);
    }
    this.ui.openPanel({ icon: '🎓', title: poi.name, sub: 'Community college · Continuing education', body });
  }

  advice() {
    const g = this.game;
    const salary = g.career.salary();
    const rent = g.housing.home.rent || 0;
    const tips = [];
    if (salary && rent) {
      const ratio = (rent * 12) / salary;
      tips.push(ratio > 0.4 ? `Your rent is ${Math.round(ratio * 100)}% of your gross pay. Most planners say keep it under 30–40%.` : `Your rent is ${Math.round(ratio * 100)}% of gross income — nicely manageable.`);
    }
    tips.push(`Keep 3 months of expenses in savings. Your savings earn ${(4.1).toFixed(1)}% APY in the Bank app.`);
    tips.push('OMNY caps subway & bus fares at $34 a week — ride as much as you like after that.');
    tips.push('NYC has its own income tax (≈3–3.9%) on top of state and federal. Your paystub shows the breakdown.');
    tips.push('Landlords usually want income of 40× the monthly rent. A guarantor company can help if you fall short.');
    this.ui.openPanel({ icon: '🏦', title: 'Financial advisor', sub: 'Knickerbocker Bank', body: tips.map((t) => h('div.note', t)) });
  }

  caseworker() {
    const g = this.game;
    const body = [h('div.note', 'The caseworker walks you through your options with a tired but kind smile.')];
    const cheap = g.housing.refreshListings().filter((l) => l.rent < 1400).slice(0, 4);
    if (g.housing.state.arrears > 0 && !g.housing.state.oneShotUsed) {
      body.push(
        h('div.note.good', 'You may qualify for a one-time emergency grant to cover back rent.'),
        h('button.btn.green', {
          onclick: () => {
            const amt = Math.min(2500, g.housing.state.arrears);
            g.economy.earn(amt, 'Emergency rent assistance', 'assistance');
            g.housing.payArrears();
            g.housing.state.oneShotUsed = true;
            this.ui.toast(`Your back rent (${money(amt)}) was covered. Stay on top of next month!`, { icon: '🤝' });
            this.ui.closePanel();
          },
        }, 'Apply for emergency assistance'),
      );
    }
    body.push(h('div.h4', 'Affordable rooms right now'));
    for (const l of cheap) body.push(h('div.card.click', { onclick: () => this.listing(l) }, h('div.spread', h('h4', l.typeLabel), h('b', `${money(l.rent)}/mo`)), h('div.sub', `${l.address} · ${l.hoodName}`)));
    body.push(h('div.note', 'Shelters are always free for the night. DashRun deliveries pay same-day if you need cash fast.'));
    this.ui.openPanel({ icon: '🤝', title: 'Housing caseworker', sub: 'Borough Shelter Intake', body });
  }

  // Wardrobe (live on the player) ------------------------------------------------------------
  wardrobe({ hairOnly = false, clothesOnly = false } = {}) {
    const g = this.game;
    const a = { ...g.profile.appearance };
    const apply = () => {
      g.player.setAppearance(a);
      g.profile.appearance = { ...a };
    };
    const rig = g.rig;
    const saved = { d: rig.targetDistance, pitch: rig.pitch, yaw: rig.yaw };
    rig.targetDistance = 3.2;
    rig.pitch = 0.12;
    rig.yaw = g.player.heading + Math.PI;
    const sw = (key, colors) => h('div.swatches', colors.map((c) => h(`button.swatch${a[key] === c ? '.on' : ''}`, { style: { background: c }, onclick: (e) => { a[key] = c; apply(); e.target.parentElement.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on')); e.target.classList.add('on'); } })));
    const chips = (key, opts) => h('div.chips', opts.map((o) => h(`button.chip${a[key] === o ? '.on' : ''}`, { onclick: (e) => { a[key] = o; apply(); e.target.parentElement.querySelectorAll('.chip').forEach((s) => s.classList.remove('on')); e.target.classList.add('on'); } }, o)));
    const body = [];
    if (!clothesOnly) {
      body.push(h('div.field', h('label', 'Hair'), chips('hair', HAIR_STYLES)), h('div.field', h('label', 'Hair color'), sw('hairColor', HAIR_COLORS)), h('div.field', h('label', 'Facial hair'), chips('facialHair', FACIAL_HAIR)));
    }
    if (!hairOnly) {
      body.push(
        h('div.field', h('label', 'Style'), chips('style', OUTFITS)),
        h('div.field', h('label', 'Top'), sw('top', CLOTH_COLORS)),
        h('div.field', h('label', 'Bottom'), sw('bottom', CLOTH_COLORS)),
        h('div.field', h('label', 'Shoes'), sw('shoes', ['#f2f2f2', '#1f1f24', '#6b4a2e', '#b5382f', '#e2b43c', '#3a6ea5'])),
        h('div.field', h('label', 'Accent (hat, scarf, umbrella)'), sw('accent', CLOTH_COLORS)),
        h('div.field', h('label', 'Hat'), chips('hat', HATS)),
      );
    }
    this.ui.openPanel({
      icon: hairOnly ? '💈' : '👕',
      title: hairOnly ? 'New look' : 'Wardrobe',
      body,
      onClose: () => {
        rig.targetDistance = saved.d;
        rig.pitch = saved.pitch;
        g.save(true);
      },
      footer: [h('button.btn', { onclick: () => this.ui.closePanel() }, 'Looks good')],
    });
    void SKIN_TONES;
  }

  // Big map ------------------------------------------------------------------------------------
  map() {
    const g = this.game;
    const mv = new MapView(g, {
      height: 'min(70vh, 720px)',
      onAction: async (kind, t) => {
        if (kind === 'taxi') {
          const q = g.transit.taxiQuote(g.player.pos.x, g.player.pos.z, t.x, t.z);
          this.confirm(`Take a taxi to ${t.name}?`, `About ${q.minutes} min and ${money(q.total, { cents: true })} including an 18% tip${q.rush ? ' (rush hour!)' : ''}.`, async () => {
            this._result(await g.takeTaxi(t.x, t.z, t.name));
          });
        } else if (kind === 'listing') this.listing(t.listing);
      },
    });
    this.ui.openPanel({ icon: '🗺️', title: 'Map', sub: 'Drag to pan · scroll to zoom · click a place for options', body: mv.el, wide: true, onClose: () => mv.destroy() });
    requestAnimationFrame(() => mv.draw());
    this.ui.currentPanel.panel.querySelector('.pb').style.padding = '0';
  }
}

function isBad(f) {
  return /walk-up|Tiny|air shaft|clanks|bar|Shared|Mouse|Window AC|Long walk|barely/.test(f);
}

function hashStr(s) {
  let h2 = 0;
  for (let i = 0; i < s.length; i++) h2 = (h2 * 31 + s.charCodeAt(i)) | 0;
  return h2;
}

export { PLACE_ICONS };
void LINES;
void BUS_ROUTES;
