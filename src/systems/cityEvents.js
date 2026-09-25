// City events: calendar parades & festivals, weekly recurring events, random happenings
// (protests, street fairs, film shoots) and incidents (accidents, subway delays).
import { CALENDAR_EVENTS, RECURRING_EVENTS, PROTEST_CAUSES, PROTEST_SITES, RANDOM_EVENT_TEMPLATES, SUBWAY_DELAY_REASONS, FILMING_SHOWS } from '../data/events.js';
import { LINES } from '../data/transit.js';
import { Clock } from './clock.js';
import { RNG, hashString } from '../core/rng.js';

const REAL_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export class CityEvents {
  constructor(game, state = null) {
    this.game = game;
    this.state = state || { day: -1, today: [], attended: [], incidents: [], experiences: [] };
    this.rng = new RNG((Date.now() >>> 5) & 0xffff);
  }

  get clock() {
    return this.game.clock;
  }

  /** Day index a calendar event starts in the given year. */
  eventDay(ev, year) {
    const c = this.clock;
    const { month } = ev.date;
    let day;
    if (ev.date.day) day = c.mapRealDay(month, ev.date.day);
    else {
      const len = c.monthLength(month);
      const startIdx = Clock.fromDate(c.calendar, year, month, 1) / 1440;
      const matches = [];
      for (let d = 1; d <= len; d++) if (c.weekdayOf(startIdx + d - 1) === ev.date.weekday) matches.push(d);
      if (!matches.length) return null;
      day = ev.date.nth === -1 ? matches[matches.length - 1] : matches[Math.min(ev.date.nth - 1, matches.length - 1)];
    }
    return Clock.fromDate(c.calendar, year, month, day) / 1440;
  }

  durationDays(ev) {
    if (!ev.duration) return 1;
    if (this.clock.calendar !== 'compact') return ev.duration;
    return Math.max(1, Math.ceil((ev.duration * 10) / REAL_MONTH_DAYS[ev.date.month]));
  }

  /** Build today's schedule (called at midnight and on load). */
  planDay(dayIndex = this.clock.dayIndex) {
    if (this.state.day === dayIndex && this.state.today.length) return this.state.today;
    const c = this.clock;
    const { year, month } = c.dateOf(dayIndex);
    const season = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'fall', 'fall', 'fall', 'winter'][month];
    const weekday = c.weekdayOf(dayIndex);
    const list = [];
    for (const ev of CALENDAR_EVENTS) {
      for (const y of [year, year - 1]) {
        const start = this.eventDay(ev, y);
        if (start == null) continue;
        if (dayIndex >= start && dayIndex < start + this.durationDays(ev)) list.push(this._instance(ev, dayIndex, 'calendar'));
      }
    }
    for (const ev of RECURRING_EVENTS) {
      if (ev.seasons && !ev.seasons.includes(season)) continue;
      if (!ev.weekdays.includes(weekday)) continue;
      list.push(this._instance(ev, dayIndex, 'recurring'));
    }
    // Random happenings (deterministic per day)
    const rng = new RNG(hashString(`day-${dayIndex}`));
    const n = rng.weighted([
      [0, 2],
      [1, 5],
      [2, 3],
    ]);
    const weekend = weekday === 0 || weekday === 6;
    for (let i = 0; i < n; i++) {
      const pool = RANDOM_EVENT_TEMPLATES.filter((t) => (!t.seasons || t.seasons.includes(season)) && (!t.weekend || weekend));
      if (!pool.length) break;
      const tpl = rng.weighted(pool.map((t) => [t, t.weight]));
      const ev = this._randomEvent(tpl, rng, dayIndex);
      if (ev && !list.some((e) => e.kind === ev.kind)) list.push(ev);
    }
    this.state.day = dayIndex;
    this.state.today = list;
    return list;
  }

  _instance(ev, dayIndex, source) {
    return {
      key: `${ev.id}-${dayIndex}`,
      id: ev.id,
      source,
      name: ev.name,
      kind: ev.kind,
      desc: ev.desc,
      start: ev.start * 60,
      end: ev.end * 60,
      at: ev.at || (ev.route ? ev.route[Math.floor(ev.route.length / 2)] : null),
      route: ev.route || null,
      radius: ev.radius || 60,
      mood: ev.mood || 8,
      experience: ev.experience || null,
      theme: ev.theme || null,
      balloons: !!ev.balloons,
      day: dayIndex,
    };
  }

  _randomEvent(tpl, rng, dayIndex) {
    const start = rng.range(tpl.hours[0], tpl.hours[1]);
    const dur = rng.range(tpl.duration[0], tpl.duration[1]);
    const base = { key: `${tpl.kind}-${dayIndex}`, id: tpl.kind, source: 'random', kind: tpl.kind, start: Math.round(start * 60), end: Math.round((start + dur) * 60), day: dayIndex, radius: 50 };
    if (tpl.kind === 'protest') {
      const site = rng.pick(PROTEST_SITES);
      const cause = rng.pick(PROTEST_CAUSES);
      return { ...base, name: `${cause} march`, desc: `A march starting at ${site.name}. Streets along the route may close.`, at: site.at, route: site.route, mood: 6, theme: 'protest', experience: 'protest' };
    }
    if (tpl.kind === 'streetfair') {
      const spots = [
        { name: '3rd Ave (23rd–34th St)', route: [[330, 441], [330, 209]] },
        { name: 'Broadway (Soho)', route: [[40, 1140], [48, 1010]] },
        { name: 'Bedford Ave (Williamsburg)', route: [[1260, 1240], [1260, 1030]] },
        { name: '7th Ave (Park Slope)', route: [[1660, 2500], [1660, 2780]] },
        { name: 'Amsterdam Ave (UWS)', route: [[-550, -690], [-550, -880]] },
        { name: '30th Ave (Astoria)', route: [[1400, -960], [1700, -960]] },
      ];
      const s = rng.pick(spots);
      return { ...base, name: `Street fair on ${s.name}`, desc: 'Tents with arepas, mozzarepas, tube socks and funnel cake. Classic.', at: s.route[0], route: s.route, mood: 8, theme: 'fair', experience: 'street-fair' };
    }
    if (tpl.kind === 'filming') {
      const spots = [
        ['West Village', [-420, 880]],
        ['DUMBO', [1110, 1690]],
        ['SoHo', [-300, 1100]],
        ['Brooklyn Heights', [1060, 2080]],
        ['Tribeca', [-500, 1300]],
        ['Upper West Side', [-500, -760]],
        ['East Village', [420, 800]],
      ];
      const [hood, at] = rng.pick(spots);
      const show = rng.pick(FILMING_SHOWS);
      return { ...base, name: `Film shoot: “${show}”`, desc: `Trailers and lights are parked in ${hood}. You might spot a celebrity.`, at, mood: 10, theme: 'filming', experience: 'film-shoot', radius: 40 };
    }
    if (tpl.kind === 'blockparty') {
      const spots = [
        ['Bed-Stuy', [2260, 2010]],
        ['Crown Heights', [2560, 2640]],
        ['Bushwick', [2260, 1240]],
        ['Harlem', [-165, -1560]],
      ];
      const [hood, at] = rng.pick(spots);
      return { ...base, name: `Block party in ${hood}`, desc: 'A DJ, a bouncy castle and someone’s uncle on the grill. Everyone’s invited.', at, mood: 12, theme: 'blockparty', experience: 'block-party', radius: 45 };
    }
    if (tpl.kind === 'popupconcert') {
      const spots = [
        ['Domino Park', [915, 1110]],
        ['Washington Square', [-15, 826]],
        ['Union Square', [120, 616]],
        ['McCarren Park', [1660, 890]],
        ['Brooklyn Bridge Park', [915, 1900]],
        ['Astoria Park', [900, -1150]],
      ];
      const [where, at] = rng.pick(spots);
      return { ...base, name: `Free concert at ${where}`, desc: 'A local band is playing a free set. Bring a blanket.', at, mood: 12, theme: 'concert', experience: 'pop-up-concert', radius: 45 };
    }
    return null;
  }

  /** Called hourly: roll for incidents. */
  hourly() {
    const msgs = [];
    const player = this.game.player.pos;
    const now = this.clock.t;
    this.state.incidents = this.state.incidents.filter((i) => i.until > now);
    const h = this.clock.hour;
    if (h >= 6 && h <= 23 && this.rng.chance(0.07)) {
      // subway delay
      const line = this.rng.pick(LINES);
      const suspended = this.rng.chance(0.15);
      const reason = this.rng.pick(SUBWAY_DELAY_REASONS);
      const dur = this.rng.range(60, 180);
      this.game.transit.addDelay({ line: line.id, extra: suspended ? 0 : this.rng.range(8, 25), suspended, until: now + dur, reason });
      msgs.push({ type: 'delay', text: `${line.name.replace(/ /g, '/')} trains are ${suspended ? 'suspended' : 'delayed'} due to ${reason}.`, line: line.id });
    }
    if (this.rng.chance(0.08)) {
      // accident near the player
      const its = this.game.model.intersections.filter((it) => {
        const d = Math.hypot(it.x - player.x, it.z - player.z);
        return d > 90 && d < 420;
      });
      if (its.length) {
        const it = this.rng.pick(its);
        const inc = { key: `acc-${now}`, kind: 'accident', x: it.x, z: it.z, until: now + this.rng.range(35, 80), name: 'Fender bender' };
        this.state.incidents.push(inc);
        msgs.push({ type: 'accident', text: `Traffic alert: a crash has blocked the intersection at ${this.game.model.streetNameAt(it.x, it.z)}.`, incident: inc });
      }
    }
    return msgs;
  }

  /** Events happening right now. */
  active() {
    const m = this.clock.minuteOfDay;
    const list = this.state.today.filter((e) => m >= e.start && m < e.end);
    // events that run past midnight (e.g. NYE) are handled by end > 1440 on their own day
    return list;
  }

  upcoming(days = 7) {
    const out = [];
    const today = this.clock.dayIndex;
    const c = this.clock;
    const { year } = c.date;
    for (const ev of CALENDAR_EVENTS) {
      for (const y of [year, year + 1]) {
        const d = this.eventDay(ev, y);
        if (d != null && d >= today && d < today + days) out.push({ ...this._instance(ev, d, 'calendar'), day: d });
      }
    }
    for (const e of this.state.today) if (e.source !== 'calendar' && e.end > c.minuteOfDay) out.push(e);
    return out.sort((a, b) => a.day - b.day || a.start - b.start);
  }

  incidents() {
    const now = this.clock.t;
    return this.state.incidents.filter((i) => i.until > now);
  }

  /** Participation check: returns events the player just joined. */
  checkParticipation(px, pz) {
    const joined = [];
    for (const e of this.active()) {
      if (this.state.attended.includes(e.key)) continue;
      let d = Infinity;
      if (e.route) {
        for (let i = 0; i < e.route.length - 1; i++) {
          const [ax, az] = e.route[i];
          const [bx, bz] = e.route[i + 1];
          const l2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
          const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (pz - az) * (bz - az)) / l2));
          d = Math.min(d, Math.hypot(px - (ax + (bx - ax) * t), pz - (az + (bz - az) * t)));
        }
      } else if (e.at) d = Math.hypot(px - e.at[0], pz - e.at[1]);
      if (d < (e.route ? 35 : e.radius)) {
        this.state.attended.push(e.key);
        if (this.state.attended.length > 300) this.state.attended.shift();
        if (e.experience && !this.state.experiences.includes(e.experience)) this.state.experiences.push(e.experience);
        joined.push(e);
      }
    }
    return joined;
  }

  serialize() {
    return this.state;
  }
}
