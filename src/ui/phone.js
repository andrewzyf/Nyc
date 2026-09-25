// The in-game smartphone: home screen + apps.
import { h, clear, bar } from './dom.js';
import { money, clockTime, duration, hourLabel } from '../core/format.js';
import { CAREERS, SKILLS, COURSES, SCHEDULES } from '../data/careers.js';
import { LANDMARKS } from '../data/landmarks.js';
import { NEWS_FILLER } from '../data/dialogue.js';
import { EMPLOYER_BY_ID, levelInfo, certLabel } from '../systems/career.js';
import { annualTax } from '../systems/economy.js';
import { LINE_BY_ID } from '../systems/transit.js';
import { EXPERIENCE_LABELS } from '../systems/discovery.js';
import { TIME_SPEEDS, WEEKDAYS_SHORT, MONTHS_SHORT } from '../systems/clock.js';
import { BACKGROUNDS } from '../data/backgrounds.js';
import { LINES } from '../data/transit.js';
import { deleteSave } from '../systems/save.js';
import { lineBullet } from './panels.js';

const APPS = [
  { id: 'map', name: 'Map', icon: '🗺️', bg: '#dff1e6' },
  { id: 'jobs', name: 'Hired', icon: '💼', bg: '#dfe9f7' },
  { id: 'homes', name: 'StoopFinder', icon: '🔑', bg: '#efe1f7' },
  { id: 'bank', name: 'Bank', icon: '🏦', bg: '#e3ecf5' },
  { id: 'me', name: 'Me', icon: '🙂', bg: '#fdf0cf' },
  { id: 'bag', name: 'Bag', icon: '🎒', bg: '#f7e4d7' },
  { id: 'news', name: 'Daily Minute', icon: '📰', bg: '#f1ede4' },
  { id: 'transit', name: 'Transit', icon: '🚇', bg: '#1d2433', fg: '#fff' },
  { id: 'gigs', name: 'DashRun', icon: '🛵', bg: '#d8f5e9' },
  { id: 'settings', name: 'Settings', icon: '⚙️', bg: '#e6e6e6' },
];

export class Phone {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.isOpen = false;
    this.app = null;
    this.state = {};
    this.notifications = [];
    this.seenListings = new Set();
    this.el = h('div#phone.hidden');
    this.screen = h('div.screen');
    this.el.append(this.screen, h('div.homebar'));
    ui.root.append(this.el);
  }

  hasAlerts() {
    const g = this.game;
    if (!g.career) return false;
    return g.career.state.applications.some((a) => a.status === 'interview' && a.day === g.clock.dayIndex);
  }

  pushNotification(n) {
    this.notifications.unshift(n);
    if (this.notifications.length > 30) this.notifications.length = 30;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(app = null) {
    if (this.game.mode !== 'play') return;
    this.ui.closePanel();
    if (app === 'map') {
      this.close();
      this.ui.openMap();
      return;
    }
    this.isOpen = true;
    this.app = app;
    this.el.classList.remove('hidden');
    this.game.audio.open();
    this.render();
  }

  close() {
    this.isOpen = false;
    this.app = null;
    this.el.classList.add('hidden');
  }

  back() {
    if (this.app) {
      this.app = null;
      this.render();
    } else this.close();
  }

  refresh() {
    if (this.isOpen) this.render();
  }

  render() {
    const g = this.game;
    const s = this.screen;
    clear(s);
    const c = g.clock;
    s.append(h('div.status', h('span', clockTime(c.minuteOfDay)), h('span', `${g.weather.icon(g.env.state.night > 0.5)} ${g.weather.temperature()}°  🔋`)));
    if (!this.app) {
      s.append(...this._home().filter(Boolean));
      return;
    }
    const def = APPS.find((a) => a.id === this.app);
    const content = h('div.content');
    s.append(h('div.appbar', h('button.back', { onclick: () => this.back() }, '‹'), h('h2', def.name), h('button.back', { onclick: () => this.close(), title: 'Close' }, '✕')), content);
    const fn = this[`_${this.app}`];
    if (fn) content.append(...[fn.call(this)].flat().filter(Boolean));
  }

  _home() {
    const g = this.game;
    const c = g.clock;
    const life = g.lifeSummary();
    const widget = h(
      'div.widget',
      h('div.spread', h('div', h('div.big', clockTime(c.minuteOfDay)), h('div', { style: { fontSize: '13px', opacity: 0.8 } }, `${WEEKDAYS_SHORT[c.weekday]}, ${MONTHS_SHORT[c.date.month]} ${c.date.day} · ${c.season}`)), h('div', { style: { textAlign: 'right' } }, h('div.big', money(g.economy.cash)), h('div', { style: { fontSize: '12px', opacity: 0.8 } }, `Net worth ${money(life.netWorth)}`))),
    );
    const next = this._nextUp();
    const grid = h(
      'div.home-grid',
      APPS.map((a) =>
        h(
          'button.app-icon',
          { onclick: () => this.open(a.id) },
          h('div.ico', { style: { background: a.bg, color: a.fg || 'inherit' } }, a.icon),
          a.name,
          a.id === 'jobs' && this.hasAlerts() ? h('span.badge', '!') : null,
          a.id === 'homes' && ['none', 'shelter', 'hostel'].includes(g.housing.home.kind) ? h('span.badge', g.housing.state.listings.length) : null,
        ),
      ),
    );
    return [widget, next ? h('div.card', { style: { margin: '12px 16px 0' } }, h('div.sub', 'Up next'), h('b', next)) : null, grid];
  }

  _nextUp() {
    const g = this.game;
    const app = g.career.state.applications.filter((a) => a.status === 'interview').sort((a, b) => a.day - b.day || a.start - b.start)[0];
    if (app) return `Interview at ${EMPLOYER_BY_ID[app.employer].name} — ${this.ui.panels._dayLabel(app.day)} ${clockTime(app.start)}`;
    const n = g.career.nextShift();
    if (n) return `Shift at ${EMPLOYER_BY_ID[g.career.job.employer].name} — ${this.ui.panels._dayLabel(n.day)} ${clockTime(n.start)}`;
    const h2 = g.housing.home;
    if (h2.kind === 'couch' || h2.kind === 'sublet') return `${h2.until - g.clock.dayIndex} days left at your ${h2.kind === 'couch' ? 'friend’s' : 'sublet'}`;
    if (['none', 'hostel', 'shelter'].includes(h2.kind)) return 'Find a place to live — check StoopFinder';
    if (!g.career.job) return 'Find a job — check Hired';
    return null;
  }

  _seg(key, options, onChange) {
    const cur = this.state[key] ?? options[0][0];
    return h(
      'div.segmented',
      options.map(([id, label]) =>
        h(`button${cur === id ? '.on' : ''}`, {
          onclick: () => {
            this.state[key] = id;
            onChange?.(id);
            this.render();
          },
        }, label),
      ),
    );
  }

  // Jobs ---------------------------------------------------------------------------
  _jobs() {
    const g = this.game;
    const tab = this.state.jobsTab || 'openings';
    const out = [this._seg('jobsTab', [['openings', 'Openings'], ['myjob', 'My job'], ['apps', 'Interviews'], ['skills', 'Skills']])];
    if (tab === 'openings') {
      const filter = this.state.jobFilter || 'all';
      const careers = Object.entries(CAREERS);
      out.push(
        h('div.chips', { style: { marginBottom: '10px' } }, [['all', 'All'], ['qualified', 'I qualify'], ...careers.map(([id, c]) => [id, `${c.icon} ${c.name}`])].map(([id, label]) => h(`button.chip${filter === id ? '.on' : ''}`, { onclick: () => { this.state.jobFilter = id; this.render(); } }, label))),
      );
      let list = g.career.listings();
      if (filter === 'qualified') list = list.filter((l) => l.qualified.ok);
      else if (filter !== 'all') list = list.filter((l) => l.career === filter);
      out.push(h('div.sub', { style: { marginBottom: '8px' } }, `${list.length} openings · new postings every week · or deliver food with DashRun anytime`));
      for (const o of list) out.push(this.ui.panels.jobCard(o));
    } else if (tab === 'myjob') {
      const j = g.career.job;
      if (!j) {
        out.push(h('div.note', 'You’re between jobs. Check Openings, or pick up DashRun deliveries for quick cash.'));
      } else {
        const L = levelInfo(j.career, j.level);
        const next = levelInfo(j.career, j.level + 1);
        const emp = EMPLOYER_BY_ID[j.employer];
        const ns = g.career.nextShift();
        const skill = CAREERS[j.career].skill;
        out.push(
          h('div.card', h('h4', L.title), h('div.sub', `${emp.name} · ${money(L.salary)}/yr (${money(g.career.shiftPay(), { cents: true })} per shift)`), h('div.sub', SCHEDULES[L.schedule].label)),
          h('div.h4', 'Performance'),
          bar(j.performance / 100, j.performance > 65 ? 'var(--green)' : j.performance < 30 ? 'var(--red)' : null),
          h('div.sub', `${Math.round(j.performance)}/100 · ${j.totalDays} shifts worked · ${j.absences.length} recent absences${j.warnings ? ` · ⚠️ ${j.warnings} warning` : ''}`),
          h('div.h4', 'Next shift'),
          h('div', ns ? `${this.ui.panels._dayLabel(ns.day)}, ${clockTime(ns.start)} – ${clockTime(ns.end)}` : '—'),
          h('div.h4', 'Pay'),
          h('div', `${money(j.pending, { cents: true })} earned since last payday. Paid every ${g.clock.calendar === 'compact' ? '5 days' : '2 weeks'}.`),
        );
        if (next) {
          const have = g.career.state.skills[skill] || 0;
          const certOk = !next.cert || next.cert.some((c) => g.career.hasCert(c));
          out.push(
            h('div.h4', `Next: ${next.title} (${money(next.salary)})`),
            h('div.sub', `• ${j.daysAtLevel}/${next.days} shifts at this level ${j.daysAtLevel >= next.days ? '✅' : ''}`),
            h('div.sub', `• ${SKILLS[skill]} skill ${Math.floor(have)}/${next.skill} ${have >= next.skill ? '✅' : ''}`),
            h('div.sub', `• Performance 70+ ${j.performance >= 70 ? '✅' : ''}`),
            next.cert ? h('div.sub', `• ${next.cert.map(certLabel).join(' or ')} ${certOk ? '✅' : ''}`) : null,
          );
        }
        const w = g.model.poiById.get(`work-${j.employer}`);
        if (w) out.push(h('button.btn.block', { style: { marginTop: '14px' }, onclick: () => { g.setWaypoint({ x: w.x, z: w.z, label: emp.name, kind: 'work' }); this.close(); } }, '📍 Directions to work'));
      }
    } else if (tab === 'apps') {
      const apps = g.career.state.applications;
      if (!apps.length) out.push(h('div.note', 'No applications yet.'));
      for (const a of apps) {
        const emp = EMPLOYER_BY_ID[a.employer];
        const L = levelInfo(a.career, a.level);
        const w = g.model.poiById.get(`work-${a.employer}`);
        out.push(
          h(
            'div.card',
            h('h4', `${L.title} — ${emp.name}`),
            h('div.sub', a.status === 'interview' ? `Interview ${this.ui.panels._dayLabel(a.day)} at ${clockTime(a.start)} (arrive within 45 min before to 30 min after)` : a.status === 'missed' ? 'Missed interview' : a.status === 'rejected' ? 'Not selected' : a.status),
            a.status === 'interview' && w ? h('button.btn.small', { style: { marginTop: '8px' }, onclick: () => { g.setWaypoint({ x: w.x, z: w.z, label: `Interview: ${emp.name}`, kind: 'interview' }); this.close(); } }, '📍 Directions') : null,
          ),
        );
      }
    } else {
      const st = g.career.state;
      out.push(h('div.sub', `Education: ${st.education === 'degree' || st.certs.includes('degree') ? "Bachelor's degree" : 'High school diploma'}`));
      for (const [k, label] of Object.entries(SKILLS)) out.push(h('div', { style: { margin: '8px 0' } }, h('div.spread', h('b', label), h('span', Math.floor(st.skills[k] || 0))), bar((st.skills[k] || 0) / 100)));
      out.push(h('div.h4', 'Certificates'), h('div.tags', st.certs.length ? st.certs.map((c) => h('span.tag.good', certLabel(c))) : h('span.tag', 'None yet')));
      out.push(h('div.note', 'Raise skills by working, studying at libraries or cafes (with a laptop), reading career guides, or taking evening courses at Borough Community College.'));
    }
    return out;
  }

  // Homes -----------------------------------------------------------------------------
  _homes() {
    const g = this.game;
    const tab = this.state.homesTab || 'listings';
    const out = [this._seg('homesTab', [['listings', 'Listings'], ['mine', 'My home']])];
    if (tab === 'listings') {
      const boro = this.state.boro || 'all';
      const maxRent = this.state.maxRent || 99999;
      out.push(
        h('div.chips', { style: { marginBottom: '8px' } }, ['all', 'Manhattan', 'Brooklyn', 'Queens'].map((b) => h(`button.chip${boro === b ? '.on' : ''}`, { onclick: () => { this.state.boro = b; this.render(); } }, b === 'all' ? 'All boroughs' : b))),
        h('div.chips', { style: { marginBottom: '10px' } }, [[99999, 'Any price'], [1500, '< $1.5k'], [2500, '< $2.5k'], [3500, '< $3.5k']].map(([v, l]) => h(`button.chip${maxRent === v ? '.on' : ''}`, { onclick: () => { this.state.maxRent = v; this.render(); } }, l))),
      );
      const list = g.housing.refreshListings().filter((l) => (boro === 'all' || l.borough === boro) && l.rent <= maxRent).sort((a, b) => a.rent - b.rent);
      out.push(h('div.sub', { style: { marginBottom: '8px' } }, `${list.length} listings · no broker fees · 1 month deposit max (NY law)`));
      for (const l of list) {
        const viewed = g.housing.isViewed(l.id);
        out.push(
          h(
            'div.card.click',
            { onclick: () => this.ui.panels.listing(l) },
            h('div.spread', h('h4', `${money(l.rent)}/mo`), h('span.tag', l.typeLabel)),
            h('div', { style: { fontSize: '13px', fontWeight: 600, marginTop: '2px' } }, l.headline),
            h('div.sub', `${l.address} · ${l.hoodName}, ${l.borough}`),
            h('div.row', { style: { marginTop: '6px' } }, h('span.tag', '★'.repeat(l.quality)), viewed ? h('span.tag.good', 'Viewed') : null, l.roommates ? h('span.tag', `${l.roommates} roommate${l.roommates > 1 ? 's' : ''}`) : null),
          ),
        );
      }
    } else {
      const hm = g.housing.home;
      out.push(h('div.card', h('h4', g.housing.homeLabel()), hm.rent ? h('div.sub', `${money(hm.rent)}/month · due on the 1st`) : null));
      if (hm.kind === 'lease') {
        out.push(h('div.sub', `Utilities: about ${money(g.housing.monthlyUtilities())}/mo${g.clock.season === 'winter' ? ' (winter heating included)' : ''}.`));
        if (hm.prepaidMonths) out.push(h('div.note.good', `${hm.prepaidMonths} months prepaid.`));
      }
      if (g.housing.state.arrears > 0) out.push(h('div.note.warn', `Back rent owed: ${money(g.housing.state.arrears)}. Two missed months means eviction.`), h('button.btn.red.block', { onclick: () => { const r = g.housing.payArrears(); this.ui.toast(r > 0 ? `Paid ${money(r)}.` : 'Not enough money in checking.', { icon: '🏠' }); this.render(); } }, 'Pay back rent'));
      if (hm.x != null) out.push(h('button.btn.block', { style: { marginTop: '10px' }, onclick: () => { g.setWaypoint({ x: hm.x, z: hm.z, label: 'Home', kind: 'home' }); this.close(); } }, '📍 Directions home'));
      if (['none', 'hostel', 'shelter'].includes(hm.kind)) out.push(h('div.note', 'No permanent place yet. Hostels cost about $58/night; shelters are free. Look for rooms — they’re the cheapest way to start.'));
      if (hm.kind === 'lease') out.push(h('button.btn.ghost.block', { style: { marginTop: '10px' }, onclick: () => this.ui.panels.confirm('Break your lease?', `It costs one month's rent (${money(hm.rent)}) and you'll lose your deposit.`, () => { g.housing.breakLease(); this.ui.toast('You broke your lease.', { icon: '📦' }); }) }, 'Break lease'));
      const hist = g.housing.state.history;
      if (hist.length) out.push(h('div.h4', 'Past homes'), ...hist.map((x) => h('div.sub', `${x.address} — ${money(x.rent)}/mo`)));
    }
    return out;
  }

  // Bank --------------------------------------------------------------------------------
  _bank() {
    const g = this.game;
    const e = g.economy;
    const out = [
      h('div.card', h('div.sub', 'Checking'), h('div.bigstat', money(e.cash, { cents: true }))),
      h('div.card', h('div.spread', h('div', h('div.sub', 'High-yield savings · 4.1% APY'), h('div.bigstat', money(e.savings, { cents: true }))))),
    ];
    const amt = (v, label) => [
      h('button.btn.small', { onclick: () => { e.toSavings(v === 'all' ? e.cash : Math.min(v, e.cash)); this.render(); } }, `→ Save ${label}`),
      h('button.btn.small.ghost', { onclick: () => { e.fromSavings(v === 'all' ? e.savings : v); this.render(); } }, `← ${label}`),
    ];
    out.push(h('div.row', { style: { flexWrap: 'wrap', marginBottom: '10px' } }, ...amt(100, '$100'), ...amt(1000, '$1,000')));
    // Monthly picture
    const salary = g.career.salary();
    const tax = annualTax(salary);
    const rent = g.housing.home.rent || 0;
    const bills = Object.values(e.state.subscriptions).reduce((a, b) => a + b, 0) + e.state.loans + g.housing.monthlyUtilities();
    out.push(
      h('div.h4', 'Monthly picture'),
      h(
        'dl.kv',
        h('dt', 'Take-home pay'),
        h('dd', salary ? `${money((salary - tax.total) / 12)} (${Math.round(tax.effective * 100)}% tax)` : '—'),
        h('dt', 'Rent'),
        h('dd', rent ? money(rent) : '—'),
        h('dt', 'Bills & loans'),
        h('dd', money(bills)),
        h('dt', 'Left over'),
        h('dd', salary ? money((salary - tax.total) / 12 - rent - bills) : '—'),
      ),
    );
    if (g.lastPaystub) {
      const s = g.lastPaystub;
      out.push(
        h('div.h4', 'Last paystub'),
        h('dl.kv', h('dt', 'Gross'), h('dd', money(s.gross, { cents: true })), h('dt', 'Federal'), h('dd', money(s.breakdown.federal, { cents: true })), h('dt', 'NY State'), h('dd', money(s.breakdown.state, { cents: true })), h('dt', 'NYC'), h('dd', money(s.breakdown.city, { cents: true })), h('dt', 'Social Sec. & Medicare'), h('dd', money(s.breakdown.fica, { cents: true })), h('dt', 'Net'), h('dd', money(s.net, { cents: true }))),
      );
    }
    out.push(h('div.h4', 'Recent activity'));
    const list = h('div.list');
    for (const t of e.state.ledger.slice(0, 30)) {
      list.append(h('div.li', h('div', { style: { flex: 1 } }, h('div', { style: { fontWeight: 600 } }, t.desc), h('div.sub', `${g.clock.dateOf(Math.floor(t.t / 1440)).month + 1}/${g.clock.dateOf(Math.floor(t.t / 1440)).day} ${clockTime(t.t % 1440)}`)), h('b', { style: { color: t.amount >= 0 ? 'var(--green)' : 'var(--ink)' } }, money(t.amount, { cents: true, sign: true }))));
    }
    out.push(list);
    return out;
  }

  // Me ----------------------------------------------------------------------------------
  _me() {
    const g = this.game;
    const p = g.profile;
    const n = g.needs.state;
    const life = g.lifeSummary();
    const bg = BACKGROUNDS.find((b) => b.id === p.background);
    const d = g.discovery.state;
    const out = [
      h('div.card', h('h4', p.name), h('div.sub', `${bg?.name || ''}${p.origin ? ` · from ${p.origin}` : ''} · ${d.stats.daysInCity} days in NYC`), h('div.sub', `${life.title}${life.employer ? ` at ${life.employer}` : ''}`), h('div.sub', life.home)),
      h('div.h4', 'How you feel'),
      h('div', h('div.spread', h('b', `Mood — ${g.needs.moodLabel()}`), h('span', Math.round(n.mood))), bar(n.mood / 100, '#ce93d8')),
      h('div', { style: { marginTop: '8px' } }, h('div.spread', h('b', 'Energy'), h('span', Math.round(n.energy))), bar(n.energy / 100, '#90caf9')),
      h('div', { style: { marginTop: '8px' } }, h('div.spread', h('b', 'Fullness'), h('span', Math.round(n.satiety))), bar(n.satiety / 100, '#ffb74d')),
      h('div.h4', 'Net worth'),
      h('div.bigstat', money(life.netWorth)),
      h('div.h4', `City explorer — ${d.landmarks.length} / ${LANDMARKS.length} landmarks`),
      h('div.tags', LANDMARKS.map((l) => h(`span.tag${d.landmarks.includes(l.id) ? '.good' : ''}`, `${d.landmarks.includes(l.id) ? '★' : '☆'} ${l.name}`))),
      h('div.h4', `Experiences — ${d.experiences.length}`),
      h('div.tags', d.experiences.length ? d.experiences.map((x) => h('span.tag.good', EXPERIENCE_LABELS[x] || x)) : h('span.tag', 'Go out and live a little!')),
      h('div.h4', `Neighborhoods — ${d.hoods.length}`),
      h('div.tags', d.hoods.map((id) => h('span.tag', g.hoodName(id)))),
      h('div.h4', 'Life stats'),
      h('dl.kv', h('dt', 'Walked'), h('dd', `${(d.stats.walked / 1000).toFixed(1)} km`), h('dt', 'Subway rides'), h('dd', d.stats.subwayRides), h('dt', 'Taxi rides'), h('dd', d.stats.taxiRides), h('dt', 'Meals'), h('dd', d.stats.meals), h('dt', 'Pizza slices'), h('dd', d.stats.slices), h('dt', 'Shifts worked'), h('dd', d.stats.shifts), h('dt', 'Deliveries'), h('dd', d.stats.deliveries), h('dt', 'Bodega cats petted'), h('dd', d.stats.bodegaCats)),
      h('div.h4', 'Journal'),
      ...d.journal.slice(0, 20).map((j) => h('div.sub', `Day ${j.day - (g.profile.startDay ?? d.journal.at(-1).day) + 1}: ${j.text}`)),
    ];
    return out;
  }

  // Bag -----------------------------------------------------------------------------------
  _bag() {
    const g = this.game;
    const items = g.inventory.list();
    if (!items.length) return h('div.note', 'Your bag is empty. Bodegas, groceries and shops sell useful things (an umbrella is a very good idea).');
    return items.map((it) =>
      h(
        'div.card',
        h('div.spread', h('h4', `${it.icon} ${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`), it.equip ? h('span.tag', g.inventory.isEquipped(it.equip) ? 'Equipped' : 'Stowed') : null),
        h('div.sub', it.desc),
        h(
          'div.row',
          { style: { marginTop: '8px' } },
          it.use ? h('button.btn.small', { onclick: () => { const r = g.useItem(it.id); this.ui.toast(r.msg || 'Done.', { icon: it.icon }); this.render(); } }, it.use.verb) : null,
          it.equip ? h('button.btn.small.ghost', { onclick: () => { g.inventory.toggleEquip(it.equip); this.render(); } }, g.inventory.isEquipped(it.equip) ? 'Put away' : 'Use') : null,
        ),
      ),
    );
  }

  // News ------------------------------------------------------------------------------------
  _news() {
    const g = this.game;
    const out = [h('div.h4', 'Weather')];
    const fc = g.weather.forecast(3);
    out.push(
      h(
        'div.row',
        { style: { gap: '8px' } },
        fc.map((f, i) => h('div.card', { style: { flex: 1, textAlign: 'center', marginBottom: 0 } }, h('div.sub', i === 0 ? 'Today' : WEEKDAYS_SHORT[g.clock.weekdayOf(f.day)]), h('div', { style: { fontSize: '26px' } }, f.icon), h('b', `${f.high}° / ${f.low}°`), h('div.sub', f.label))),
      ),
    );
    const delays = g.transit.state.delays.filter((d) => d.until > g.clock.t);
    out.push(h('div.h4', 'Subway status'));
    out.push(delays.length ? h('div', delays.map((d) => h('div.row', { style: { margin: '6px 0' } }, lineBullet(LINE_BY_ID[d.line]), h('span', `${d.suspended ? 'Suspended' : 'Delays'} — ${d.reason}`)))) : h('div.note.good', 'Good service on all lines. Enjoy it while it lasts.'));
    out.push(h('div.h4', 'Happening today'));
    const today = g.events.state.today;
    if (!today.length) out.push(h('div.sub', 'A quiet day in the city.'));
    for (const e of today) {
      const live = g.events.active().includes(e);
      const at = e.at || e.route?.[0];
      out.push(
        h(
          'div.card',
          h('div.spread', h('h4', e.name), live ? h('span.tag.good', 'Live now') : h('span.tag', `${hourLabel(e.start / 60)}–${hourLabel((e.end / 60) % 24)}`)),
          h('div.sub', e.desc),
          at ? h('button.btn.small', { style: { marginTop: '8px' }, onclick: () => { const s = g.nearestWalkable(at[0], at[1]); g.setWaypoint({ x: s.x, z: s.z, label: e.name, kind: 'event' }); this.close(); } }, '📍 Go') : null,
        ),
      );
    }
    const up = g.events.upcoming(8).filter((e) => e.day > g.clock.dayIndex && e.source === 'calendar');
    if (up.length) {
      out.push(h('div.h4', 'Coming up'));
      for (const e of up) {
        const d = g.clock.dateOf(e.day);
        out.push(h('div.card', h('h4', e.name), h('div.sub', `${WEEKDAYS_SHORT[g.clock.weekdayOf(e.day)]} ${MONTHS_SHORT[d.month]} ${d.day} · ${hourLabel(e.start / 60)}`), h('div.sub', e.desc)));
      }
    }
    for (const inc of g.events.incidents()) out.push(h('div.note.warn', `🚨 ${inc.name} at ${g.model.streetNameAt(inc.x, inc.z)} — expect delays.`));
    out.push(h('div.h4', 'Around town'));
    const day = g.clock.dayIndex;
    for (let i = 0; i < 3; i++) out.push(h('div.sub', { style: { margin: '6px 0' } }, `• ${NEWS_FILLER[(day * 3 + i) % NEWS_FILLER.length]}`));
    return out;
  }

  // Transit ---------------------------------------------------------------------------------
  _transit() {
    const g = this.game;
    const p = g.player.pos;
    const week = g.economy.state.fareWindow.filter((f) => g.clock.t - f.t < 7 * 1440).reduce((s, f) => s + f.amount, 0);
    const out = [
      h('div.card', h('div.sub', 'OMNY this week'), h('div.spread', h('div.bigstat', money(week, { cents: true })), h('div.sub', week >= 34 ? 'Capped — rides are free!' : `${money(34 - week, { cents: true })} until free rides`)), bar(week / 34, 'var(--taxi)')),
    ];
    const near = g.transit.nearestStation(p.x, p.z);
    if (near) out.push(h('div.card', h('div.sub', 'Nearest subway'), h('div.row', h('b', near.station.name), ...LINES.filter((l) => l.stations.includes(near.station.id)).map((l) => lineBullet(l, 18))), h('div.sub', `${Math.round(near.dist)} m away · ~${Math.round(g.transit.walkMinutes(near.dist * 1.2))} min walk`), h('button.btn.small', { style: { marginTop: '8px' }, onclick: () => { g.setWaypoint({ x: near.x, z: near.z, label: near.station.name, kind: 'waypoint' }); this.close(); } }, '📍 Walk there')));
    out.push(h('div.h4', 'Get a cab'));
    const dests = [];
    const hm = g.housing.home;
    if (hm.x != null) dests.push({ label: '🏠 Home', x: hm.x, z: hm.z });
    if (g.career.job) {
      const w = g.model.poiById.get(`work-${g.career.job.employer}`);
      if (w) dests.push({ label: '💼 Work', x: w.x, z: w.z });
    }
    if (g.waypoint) dests.push({ label: `📍 ${g.waypoint.label || 'Waypoint'}`, x: g.waypoint.x, z: g.waypoint.z });
    for (const l of LANDMARKS.filter((l) => l.radius > 0).slice(0, 12)) dests.push({ label: l.name, x: l.x, z: l.z, landmark: true });
    for (const d of dests) {
      const q = g.transit.taxiQuote(p.x, p.z, d.x, d.z);
      out.push(
        h(
          'div.li',
          { style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' } },
          h('div', { style: { flex: 1 } }, h('b', d.label), h('div.sub', `${q.minutes} min · ${money(q.total, { cents: true })}`)),
          h('button.btn.small.yellow', { onclick: async () => { this.close(); const s = g.nearestWalkable(d.x, d.z); const r = await g.takeTaxi(s.x, s.z, d.label.replace(/^\S+ /, '')); this.ui.toast(r.msg, { icon: r.ok ? '🚕' : '⚠️' }); } }, '🚕 Hail'),
        ),
      );
    }
    out.push(h('div.note', 'Tip: Subway entrances have green globes. Press E there to ride. Buses stop at blue signs.'));
    return out;
  }

  // Gigs ---------------------------------------------------------------------------------------
  _gigs() {
    const g = this.game;
    const s = g.gigs.state;
    const out = [
      h('div.card', h('div.spread', h('div', h('h4', 'DashRun courier'), h('div.sub', `★ ${s.rating.toFixed(2)} · ${s.completed} deliveries · ${money(s.earned, { cents: true })} lifetime`)), h('span.tag', s.online ? 'Online' : 'Offline'))),
      h('div.note', 'Deliver food on foot. Orders pop up near you: go to the restaurant, then the customer’s door. Pay is per delivery plus tips — faster is better.'),
      s.online
        ? h('button.btn.red.block', { onclick: () => { g.gigs.goOffline(); g._refreshMarkers(); this.ui.pendingOffer = null; this.render(); } }, 'Go offline')
        : h('button.btn.green.block', { onclick: () => { g.gigs.goOnline(); this.ui.toast('You’re online. Orders will appear near you.', { icon: '🛵' }); this.close(); } }, 'Go online'),
    ];
    if (s.todayDay === g.clock.dayIndex) out.push(h('div.sub', { style: { marginTop: '10px' } }, `Today: ${money(s.todayEarned, { cents: true })}`));
    return out;
  }

  // Settings -----------------------------------------------------------------------------------
  _settings() {
    const g = this.game;
    const st = g.settings;
    const out = [];
    out.push(h('div.h4', 'Time'));
    out.push(h('div.chips', Object.entries(TIME_SPEEDS).map(([k, v]) => h(`button.chip${g.clock.speed === k ? '.on' : ''}`, { onclick: () => { g.setTimeSpeed(k); this.render(); } }, v.label))));
    out.push(h('div.sub', { style: { marginTop: '6px' } }, `${TIME_SPEEDS[g.clock.speed].desc}. Shortcut: [ and ]. Calendar: ${g.clock.calendar === 'compact' ? 'compact (10-day months)' : 'realistic'}.`));
    const toggle = (key, label, after) => h('label.row', { style: { margin: '10px 0', fontWeight: 600, fontSize: '14px' } }, h('input', { type: 'checkbox', checked: !!st[key], onchange: (e) => { st[key] = e.target.checked; g.applySettings(); after?.(); } }), label);
    out.push(toggle('pauseInMenus', 'Pause time while menus are open'));
    out.push(h('div.h4', 'Controls'));
    out.push(toggle('invertY', 'Invert camera Y'), toggle('autoCamera', 'Camera follows behind you'));
    out.push(h('div.field', h('label', `Mouse sensitivity`), h('input', { type: 'range', min: 0.3, max: 2.5, step: 0.1, value: st.sensitivity, oninput: (e) => { st.sensitivity = Number(e.target.value); g.applySettings(); } })));
    out.push(h('div.h4', 'Audio'));
    out.push(toggle('music', 'Lo-fi jazz radio'));
    for (const [k, label] of [['volMaster', 'Master'], ['volAmbience', 'City ambience'], ['volSfx', 'Effects'], ['volMusic', 'Music']]) out.push(h('div.field', h('label', label), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st[k], oninput: (e) => { st[k] = Number(e.target.value); g.applySettings(); } })));
    out.push(h('div.h4', 'Graphics'));
    out.push(h('div.chips', ['auto', 'low', 'medium', 'high'].map((q) => h(`button.chip${st.quality === q ? '.on' : ''}`, { onclick: () => { g.setQuality(q); this.ui.toast('Graphics quality applies after reloading the page (your game autosaves).', { icon: '⚙️' }); this.render(); } }, q))));
    out.push(h('div.sub', `Current: ${g.quality} · resolution scale ${g.pixelRatio.toFixed(2)}`));
    out.push(toggle('showFps', 'Show FPS'));
    out.push(h('div.h4', 'Game'));
    out.push(
      h('div.row', { style: { flexWrap: 'wrap' } }, h('button.btn', { onclick: () => g.save() }, '💾 Save'), h('button.btn.ghost', { onclick: () => { g.save(true); this.close(); g.mode = 'title'; g.player.object.visible = false; g.pedestrians.clear(); this.ui.enterTitle(); } }, 'Quit to title')),
      h('button.btn.red.small', { style: { marginTop: '14px' }, onclick: () => this.ui.panels.confirm('Delete your saved game?', 'This cannot be undone.', () => { deleteSave(); this.ui.toast('Save deleted.', { icon: '🗑️' }); }) }, 'Delete save'),
    );
    out.push(h('div.h4', 'Keys'));
    out.push(h('div.sub', { style: { lineHeight: 1.7 } }, 'WASD move · Shift run · Space jump · Drag mouse to look · Wheel zoom · E interact · Tab phone · M map · J jobs · H homes · B bank · C me · I bag · N news · T transit · G DashRun · V first-person · [ ] time speed · Esc close'));
    void COURSES;
    void duration;
    return out;
  }
}
