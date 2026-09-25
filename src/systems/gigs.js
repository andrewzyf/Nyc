// DashRun: on-foot food delivery gigs. Real gameplay in the open world — pick up at a
// restaurant, drop off at an apartment before the food gets cold.
import { GIG } from '../data/careers.js';
import { RNG } from '../core/rng.js';

const PICKUP_TYPES = ['pizza', 'restaurant', 'diner', 'deli', 'bagel', 'bakery', 'coffee', 'fancy'];

export class Gigs {
  constructor(game, state = null) {
    this.game = game;
    this.rng = new RNG((Date.now() >>> 7) & 0xffff);
    this.state = state || { online: false, order: null, completed: 0, earned: 0, rating: 4.8, todayEarned: 0, todayDay: -1 };
  }

  get order() {
    return this.state.order;
  }

  goOnline() {
    this.state.online = true;
  }

  goOffline() {
    this.state.online = false;
    this.state.order = null;
  }

  /** Find a new order near the player. */
  offer() {
    const model = this.game.model;
    const p = this.game.player.pos;
    const pickups = model.poisNear(p.x, p.z, 260).filter((q) => q.kind === 'place' && PICKUP_TYPES.includes(q.type));
    if (!pickups.length) return null;
    const pick = this.rng.pick(pickups);
    const drops = model.buildingsNear(pick.x, pick.z, 650).filter((b) => b.residential && !b.poi && Math.hypot(b.door.x - pick.x, b.door.z - pick.z) > 140);
    if (!drops.length) return null;
    const drop = this.rng.pick(drops);
    const dist = Math.hypot(drop.door.x - pick.x, drop.door.z - pick.z) * 1.25;
    const toPickup = Math.hypot(pick.x - p.x, pick.z - p.z) * 1.25;
    const pay = Math.round((GIG.base + dist * GIG.perMeter) * 100) / 100;
    const tip = Math.round(this.rng.range(GIG.tipRange[0], GIG.tipRange[1]) * 100) / 100;
    // Time limit in game minutes, generous: walking pace plus slack
    const limit = Math.round(this.game.transit.walkMinutes((dist + toPickup) * 1.6) + 10);
    return {
      id: `ord-${this.game.clock.t}-${this.rng.int(0, 999)}`,
      pickup: { poi: pick.id, name: pick.name, x: pick.x, z: pick.z },
      dropoff: { building: drop.id, address: drop.address, x: drop.door.x + drop.door.nx * 1.2, z: drop.door.z + drop.door.nz * 1.2 },
      customer: this.rng.pick(['Priya', 'Marcus', 'Dana', 'Luis', 'Sam', 'Aisha', 'Tomasz', 'Mei', 'Jordan', 'Grace', 'Kwame', 'Olga']),
      items: this.rng.pick(['2 slices + garlic knots', 'Chicken over rice', 'Pad see ew', 'Bagel with lox', 'Pastrami on rye', 'Dumplings (24)', 'Birria tacos', 'Iced oat latte ×3', 'Ramen + gyoza']),
      pay,
      tip,
      distance: Math.round(dist),
      limit,
      stage: 'pickup',
      accepted: null,
    };
  }

  accept(order) {
    order.accepted = this.game.clock.t;
    this.state.order = order;
    return order;
  }

  pickup() {
    if (this.state.order?.stage !== 'pickup') return false;
    this.state.order.stage = 'dropoff';
    return true;
  }

  /** Deliver: returns {total, late, tip}. */
  deliver() {
    const o = this.state.order;
    if (!o || o.stage !== 'dropoff') return null;
    const elapsed = this.game.clock.t - o.accepted;
    const late = elapsed > o.limit;
    const tip = late ? Math.round(o.tip * 0.3 * 100) / 100 : o.tip;
    const total = Math.round((o.pay + tip) * 100) / 100;
    this.game.economy.earn(total, `DashRun delivery — ${o.customer}`, 'gig');
    const day = this.game.clock.dayIndex;
    if (this.state.todayDay !== day) {
      this.state.todayDay = day;
      this.state.todayEarned = 0;
    }
    this.state.todayEarned += total;
    this.state.completed += 1;
    this.state.earned += total;
    this.state.rating = Math.max(3.5, Math.min(5, this.state.rating + (late ? -0.08 : 0.02)));
    this.state.order = null;
    return { total, late, tip, elapsed };
  }

  cancel() {
    this.state.order = null;
    this.state.rating = Math.max(3.5, this.state.rating - 0.1);
  }

  serialize() {
    return this.state;
  }
}
