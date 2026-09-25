import { describe, it, expect, beforeAll } from 'vitest';
import { Clock } from '../src/systems/clock.js';
import { Economy, annualTax } from '../src/systems/economy.js';
import { Career } from '../src/systems/career.js';
import { Housing } from '../src/systems/housing.js';
import { Transit } from '../src/systems/transit.js';
import { Weather } from '../src/systems/weather.js';
import { CityEvents } from '../src/systems/cityEvents.js';
import { Needs } from '../src/systems/needs.js';
import { CityModel } from '../src/world/cityModel.js';
import { STATIONS } from '../src/data/transit.js';

let model;
beforeAll(() => {
  model = new CityModel().generate();
});

function makeGame(calendar = 'compact', { month = 8, day = 2, minute = 8 * 60 } = {}) {
  const clock = new Clock({ calendar, minutes: Clock.fromDate(calendar, 2026, month, day, minute) });
  const game = { clock, model, profile: { background: 'transplant' }, player: { pos: { x: -314, y: 0, z: 196 } } };
  game.economy = new Economy(clock);
  game.career = new Career(game);
  game.housing = new Housing(game);
  game.transit = new Transit(game);
  game.events = new CityEvents(game);
  return game;
}

describe('Clock', () => {
  it('knows Jan 1 2026 is a Thursday', () => {
    const c = new Clock({ calendar: 'realistic', minutes: 0 });
    expect(c.weekday).toBe(4);
    expect(c.date).toEqual({ year: 2026, month: 0, day: 1 });
  });

  it('round-trips dates in both calendars', () => {
    for (const cal of ['realistic', 'compact']) {
      const t = Clock.fromDate(cal, 2026, 6, 4, 21 * 60);
      const c = new Clock({ calendar: cal, minutes: t });
      expect(c.date).toEqual({ year: 2026, month: 6, day: cal === 'compact' ? 4 : 4 });
      expect(c.minuteOfDay).toBe(21 * 60);
    }
  });

  it('fires hour and day listeners across a long skip', () => {
    const c = new Clock({ calendar: 'compact', minutes: 23 * 60 });
    let hours = 0;
    let days = 0;
    c.on('hour', () => hours++);
    c.on('day', () => days++);
    c.advance(26 * 60);
    expect(hours).toBe(26);
    expect(days).toBe(2);
  });

  it('maps real holidays onto compact months', () => {
    const c = new Clock({ calendar: 'compact' });
    expect(c.mapRealDay(6, 4)).toBe(2);
    expect(c.mapRealDay(11, 31)).toBe(10);
  });
});

describe('Economy', () => {
  it('computes plausible NYC taxes', () => {
    const t = annualTax(60000);
    expect(t.effective).toBeGreaterThan(0.18);
    expect(t.effective).toBeLessThan(0.3);
    expect(t.city).toBeGreaterThan(1500);
    expect(annualTax(0).total).toBe(0);
    expect(annualTax(400000).effective).toBeGreaterThan(t.effective);
  });

  it('refuses purchases you cannot afford but allows mandatory charges', () => {
    const e = new Economy(new Clock());
    e.earn(10, 'test');
    expect(e.spend(20, 'too much')).toBe(false);
    expect(e.cash).toBe(10);
    const r = e.charge(50, 'rent');
    expect(r.overdraft).toBe(true);
    expect(e.cash).toBe(10 - 50 - 35);
  });

  it('caps subway fares at $34 per week', () => {
    const e = new Economy(new Clock());
    e.earn(100, 'test');
    let paid = 0;
    for (let i = 0; i < 15; i++) paid += e.payFare(2.9, 34, 'ride').charged;
    expect(paid).toBeCloseTo(34, 5);
  });

  it('moves money to and from savings', () => {
    const e = new Economy(new Clock());
    e.earn(1000, 'test');
    expect(e.toSavings(400)).toBe(400);
    expect(e.cash).toBe(600);
    expect(e.fromSavings(1000)).toBe(400);
    expect(e.savings).toBe(0);
  });
});

describe('Career', () => {
  it('lists openings and checks qualifications', () => {
    const g = makeGame();
    const list = g.career.listings();
    expect(list.length).toBeGreaterThan(10);
    const analyst = g.career.qualification('finance', 1);
    expect(analyst.ok).toBe(false);
    g.career.state.skills.finance = 40;
    g.career.state.education = 'degree';
    expect(g.career.qualification('finance', 1).ok).toBe(true);
  });

  it('pays shifts, promotes, and fires after repeated absences', () => {
    const g = makeGame('compact', { month: 8, day: 3, minute: 6 * 60 });
    g.career.hire('bean-there', 0);
    const job = g.career.job;
    job.startDay = g.clock.dayIndex;
    // find next work day at shift time
    const sched = g.career.schedule();
    let guard = 0;
    while ((!g.career.isWorkDay() || g.clock.minuteOfDay > sched.start * 60) && guard++ < 20) g.clock.advance(60);
    g.clock.t = g.clock.dayIndex * 1440 + sched.start * 60;
    const res = g.career.workShift('normal', { mood: 60, energy: 80, satiety: 80 });
    expect(res.pay).toBeGreaterThan(50);
    expect(job.pending).toBeCloseTo(res.pay, 5);
    // promotion when requirements are met
    job.performance = 90;
    job.daysAtLevel = 100;
    g.career.state.skills.service = 60;
    job.worked = {};
    const r2 = g.career.workShift('normal', { mood: 60, energy: 80, satiety: 80 });
    expect(r2.promoted?.title).toBe('Line Cook');
    // absences -> warning -> fired
    const g2 = makeGame();
    g2.career.hire('bean-there', 0);
    g2.career.job.startDay = 0;
    let fired = false;
    for (let d = g2.clock.dayIndex; d < g2.clock.dayIndex + 20 && !fired; d++) {
      for (const m of g2.career.dailyCheck(d)) if (m.type === 'fired') fired = true;
    }
    expect(fired).toBe(true);
    expect(g2.career.job).toBe(null);
  });

  it('completes courses and grants certificates', () => {
    const g = makeGame();
    g.career.enroll('cna');
    for (let i = 0; i < 6; i++) {
      g.career.attend('cna');
      g.clock.advance(1440);
    }
    expect(g.career.hasCert('cna')).toBe(true);
    expect(g.career.qualification('healthcare', 1).missing.some((m) => /CNA/.test(m))).toBe(false);
  });
});

describe('Housing', () => {
  it('generates listings tied to real buildings with NYC rules', () => {
    const g = makeGame();
    const list = g.housing.refreshListings(true);
    expect(list.length).toBeGreaterThanOrEqual(26);
    for (const l of list) {
      expect(model.buildings[l.building]).toBeTruthy();
      expect(l.rent).toBeGreaterThan(700);
    }
    expect(list.some((l) => l.rent < 1300)).toBe(true);
  });

  it('requires an in-person viewing and enforces the 40x rule', () => {
    const g = makeGame();
    g.economy.earn(60000, 'test');
    const l = g.housing.refreshListings(true).find((x) => x.type === 'studio') || g.housing.state.listings[0];
    expect(g.housing.sign(l, 'prepay').ok).toBe(false);
    g.housing.markViewed(l.id);
    const el = g.housing.eligibility(l);
    expect(el.options.find((o) => o.id === 'income')).toBeUndefined();
    expect(g.housing.sign(l, 'prepay').ok).toBe(true);
    expect(g.housing.home.kind).toBe('lease');
    expect(g.housing.home.prepaidMonths).toBe(6);
  });

  it('charges rent monthly and evicts after two missed months', () => {
    const g = makeGame();
    g.economy.earn(10000, 'test');
    const l = g.housing.refreshListings(true).sort((a, b) => a.rent - b.rent)[0];
    g.housing.markViewed(l.id);
    g.career.hire('fifth-main', 4);
    const opt = g.housing.eligibility(l).options.find((o) => o.affordable);
    expect(g.housing.sign(l, opt.id).ok).toBe(true);
    g.economy.state.cash = 0;
    g.housing.monthly();
    expect(g.housing.state.arrears).toBeGreaterThan(0);
    const msgs = g.housing.monthly();
    expect(msgs.some((m) => m.type === 'evicted')).toBe(true);
    expect(g.housing.home.kind).toBe('none');
  });
});

describe('Transit', () => {
  it('routes across boroughs with transfers', () => {
    const g = makeGame();
    const r = g.transit.route('times-sq', 'bedford-l');
    expect(r).toBeTruthy();
    expect(r.legs.length).toBeGreaterThanOrEqual(1);
    expect(r.minutes).toBeGreaterThan(5);
    expect(r.minutes).toBeLessThan(60);
    const astoria = g.transit.route('ditmars', '15-prospect');
    expect(astoria).toBeTruthy();
  });

  it('every station can reach every other station', () => {
    const g = makeGame();
    for (const s of STATIONS) expect(g.transit.route('times-sq', s.id), s.id).toBeTruthy();
  });

  it('quotes taxis with realistic fares', () => {
    const g = makeGame();
    const q = g.transit.taxiQuote(-314, 196, 1260, 1030);
    expect(q.total).toBeGreaterThan(20);
    expect(q.total).toBeLessThan(120);
  });

  it('respects suspended lines', () => {
    const g = makeGame();
    g.transit.addDelay({ line: 'l', suspended: true, extra: 0, until: g.clock.t + 100, reason: 'test' });
    const r = g.transit.route('8av-14', 'dekalb-l');
    expect(r === null || r.legs.every((l) => l.line !== 'l')).toBe(true);
  });
});

describe('Weather & events', () => {
  it('produces forecasts and plausible temperatures', () => {
    const g = makeGame('realistic', { month: 0, day: 15 });
    const w = new Weather(g.clock, { seed: 3 });
    const fc = w.forecast(3);
    expect(fc).toHaveLength(3);
    const t = w.temperature();
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(65);
  });

  it('schedules the Fourth of July fireworks', () => {
    for (const cal of ['realistic', 'compact']) {
      const day = cal === 'compact' ? 2 : 4;
      const g = makeGame(cal, { month: 6, day });
      const list = g.events.planDay();
      expect(list.some((e) => e.id === 'july-4'), cal).toBe(true);
    }
  });

  it('needs decay and recover', () => {
    const n = new Needs();
    n.update(240, {});
    expect(n.satiety).toBeLessThan(80);
    const e = n.energy;
    n.update(240, { asleep: true, sleepQuality: 1 });
    expect(n.energy).toBeGreaterThan(e);
  });
});

describe('City model', () => {
  it('generates a dense, consistent city', () => {
    expect(model.blocks.length).toBeGreaterThan(1500);
    expect(model.buildings.length).toBeGreaterThan(10000);
    for (const b of model.buildings) {
      expect(Number.isFinite(b.h)).toBe(true);
      expect(b.x1).toBeGreaterThan(b.x0);
      expect(b.z1).toBeGreaterThan(b.z0);
    }
  });

  it('puts every subway entrance on walkable land', () => {
    for (const e of model.stationEntrances) expect(model.isWalkable(e.x, e.z), e.station).toBe(true);
  });

  it('has employers and landmark doors', () => {
    expect(model.pois.filter((p) => p.kind === 'work').length).toBeGreaterThan(25);
    expect(model.poiById.get('lm-empire-state')).toBeTruthy();
  });

  it('keeps Central Park free of buildings and names streets', () => {
    expect(model.buildingsNear(-165, -860, 60).length).toBe(0);
    expect(model.streetNameAt(-220, 15)).toMatch(/42nd St|7th Ave|Broadway/);
    expect(model.describe(-165, -860).place).toBe('Central Park');
  });

  it('computes bridge decks', () => {
    const b = model.bridges.find((x) => x.id === 'brooklyn-bridge');
    expect(model.bridgeHeight(b, 0)).toBeCloseTo(0, 3);
    expect(model.bridgeHeight(b, b.length / 2)).toBeGreaterThan(30);
  });
});
