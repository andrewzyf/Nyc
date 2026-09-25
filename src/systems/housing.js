// Housing: apartment listings tied to real buildings, lease signing (NYC rules),
// monthly rent, temporary arrangements (hostel, couch, sublet, family) and eviction.
import { UNIT_TYPES, FEATURES, HEADLINES, ROOMMATE_BLURBS, LANDLORDS, UTILITIES, WINTER_HEAT_EXTRA, APPLICATION_FEE, GUARANTOR_FEE_MONTHS } from '../data/housing.js';
import { NEIGHBORHOODS } from '../data/geography.js';
import { RNG } from '../core/rng.js';
import { clamp, lerp } from '../core/math.js';

export const HOOD_BY_ID = Object.fromEntries(NEIGHBORHOODS.map((h) => [h.id, h]));

const HOME_QUALITY = { none: -6, shelter: -3, hostel: -1, couch: -1, family: 0, sublet: 1 };

export class Housing {
  constructor(game, state = null) {
    this.game = game;
    this.rng = new RNG((Date.now() >>> 3) & 0xffff);
    this.state = state || {
      home: { kind: 'none' },
      listings: [],
      listingsDay: -999,
      viewed: [],
      arrears: 0,
      lateNotices: 0,
      history: [],
      deposit: 0,
    };
  }

  get clock() {
    return this.game.clock;
  }

  get home() {
    return this.state.home;
  }

  hasBed() {
    return ['lease', 'sublet', 'couch', 'family'].includes(this.state.home.kind);
  }

  qualityScore() {
    const h = this.state.home;
    if (h.kind === 'lease') return (h.quality || 3) - 2;
    if (h.kind === 'family' && this.clock.dayIndex - (h.since || 0) > 30) return -1;
    return HOME_QUALITY[h.kind] ?? 0;
  }

  homeLabel() {
    const h = this.state.home;
    switch (h.kind) {
      case 'lease':
        return `${h.address}${h.unit ? `, Apt ${h.unit}` : ''}`;
      case 'sublet':
        return `Sublet — ${h.address}`;
      case 'couch':
        return `${h.host ? `Couch at ${h.host}'s` : 'Friend’s couch'} — ${h.hoodName || ''}`;
      case 'family':
        return `Family home — ${h.hoodName || 'Astoria'}`;
      case 'hostel':
        return `Hostel (${h.nights || 0} night${h.nights === 1 ? '' : 's'} prepaid)`;
      case 'shelter':
        return 'City shelter';
      default:
        return 'No fixed address';
    }
  }

  /** Set up a temporary home at a building near a point. */
  setTemporary(kind, { near, days, host, nights, hostelPoi } = {}) {
    const model = this.game.model;
    const h = { kind, since: this.clock.dayIndex };
    if (kind === 'hostel') {
      h.nights = nights || 0;
      h.poi = hostelPoi;
      const p = model.poiById.get(hostelPoi);
      if (p) Object.assign(h, { x: p.x, z: p.z, address: p.address, hoodName: HOOD_BY_ID[p.hood]?.name });
    } else if (near) {
      const b = this._residentialNear(near[0], near[1]);
      if (b) Object.assign(h, this._buildingHome(b));
      h.until = days ? this.clock.dayIndex + days : null;
      h.host = host;
      if (b) h.unit = `${this.rng.int(1, 5)}${this.rng.pick(['A', 'B', 'C', 'F', 'R'])}`;
    }
    this.state.home = h;
    return h;
  }

  _buildingHome(b) {
    return { building: b.id, x: b.door.x + b.door.nx * 1.2, z: b.door.z + b.door.nz * 1.2, address: b.address, hood: b.hood, hoodName: HOOD_BY_ID[b.hood]?.name };
  }

  _residentialNear(x, z) {
    let best = null;
    let bd = Infinity;
    for (const b of this.game.model.buildingsNear(x, z, 250)) {
      if (!b.residential || b.poi || b.construction) continue;
      const d = Math.hypot(b.door.x - x, b.door.z - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // Listings -------------------------------------------------------------------
  refreshListings(force = false) {
    const day = this.clock.dayIndex;
    if (!force && day - this.state.listingsDay < 5 && this.state.listings.length) return this.state.listings;
    const keep = this.state.listings.filter((l) => this.rng.chance(0.35) && day - l.listedDay < 14);
    const model = this.game.model;
    const residential = model.buildings.filter((b) => b.residential && !b.poi && !b.construction);
    const byHood = new Map();
    for (const b of residential) {
      if (!byHood.has(b.hood)) byHood.set(b.hood, []);
      byHood.get(b.hood).push(b);
    }
    const hoods = [...byHood.keys()].filter((h) => HOOD_BY_ID[h] && !['central-park', 'manhattan', 'brooklyn', 'times-square'].includes(h));
    const listings = [...keep];
    const target = 26;
    let guard = 0;
    while (listings.length < target && guard++ < 200) {
      const hoodId = this.rng.pick(hoods);
      const b = this.rng.pick(byHood.get(hoodId));
      if (listings.some((l) => l.building === b.id)) continue;
      listings.push(this._makeListing(b, HOOD_BY_ID[hoodId], day));
    }
    // Guarantee a few affordable rooms
    const cheap = listings.filter((l) => l.rent < 1300).length;
    for (let i = cheap; i < 4; i++) {
      const hoodId = this.rng.pick(['bushwick', 'bed-stuy', 'astoria', 'sunnyside', 'harlem', 'crown-heights'].filter((h) => byHood.has(h)));
      const b = this.rng.pick(byHood.get(hoodId));
      listings.push(this._makeListing(b, HOOD_BY_ID[hoodId], day, 'room'));
    }
    this.state.listings = listings;
    this.state.listingsDay = day;
    return listings;
  }

  _makeListing(b, hood, day, forceType) {
    const r = this.rng;
    const type = forceType || r.weighted([
      ['room', 3],
      ['studio', 3],
      ['br1', 3],
      ['br2', 1.4],
    ]);
    const spec = UNIT_TYPES[type];
    const quality = clamp(Math.round(r.gauss(3, 1)), 1, 5);
    const [lo, hi] = hood.rent[type];
    let rent = lerp(lo, hi, clamp((quality - 1) / 4 + r.range(-0.15, 0.15), 0, 1));
    rent = Math.round(rent / 25) * 25;
    const floors = Math.max(1, Math.round(b.h / 3.3));
    const floor = r.int(1, Math.max(1, floors - 1));
    const elevator = b.h > 22 || b.style === 'modern' || b.style === 'tower';
    const feats = new Set();
    const goodN = clamp(quality - 1 + r.int(0, 1), 0, 5);
    const badN = clamp(4 - quality + r.int(-1, 1), 0, 3);
    const good = r.shuffle(FEATURES.good.slice());
    const bad = r.shuffle(FEATURES.bad.slice());
    for (let i = 0; i < goodN; i++) feats.add(good[i]);
    for (let i = 0; i < badN; i++) feats.add(bad[i]);
    if (!elevator && floor >= 4) feats.add(`${ordinalFloor(floor)}-floor walk-up`);
    if (elevator) feats.add('Elevator');
    if (type === 'room' && r.chance(0.6)) feats.add('Shared bathroom');
    if (type !== 'room') feats.delete('Shared bathroom');
    const sqft = Math.round(r.range(spec.sqft[0], spec.sqft[1]) * (0.85 + quality * 0.06));
    const unit = `${floor}${r.pick(['A', 'B', 'C', 'D', 'F', 'R', 'W'])}`;
    const roommates = type === 'room' ? r.int(1, 3) : 0;
    const home = this._buildingHome(b);
    return {
      id: `lst-${day}-${b.id}-${r.int(0, 9999)}`,
      building: b.id,
      ...home,
      borough: hood.borough,
      type,
      typeLabel: spec.label,
      unit,
      rent,
      sqft,
      quality,
      floor,
      elevator,
      features: [...feats],
      headline: `${r.pick(HEADLINES)} in ${hood.name}`,
      roommates,
      roommateBlurb: roommates ? r.pick(ROOMMATE_BLURBS) : null,
      landlord: r.pick(LANDLORDS),
      listedDay: day,
      style: b.style,
      seed: r.int(0, 1e6),
    };
  }

  isViewed(listingId) {
    return this.state.viewed.includes(listingId);
  }

  markViewed(listingId) {
    if (!this.state.viewed.includes(listingId)) this.state.viewed.push(listingId);
  }

  /** NYC landlord screening: annual income >= 40x rent (30x for a room in a share). */
  eligibility(listing) {
    const career = this.game.career;
    const salary = career.salary();
    const mult = UNIT_TYPES[listing.type].income;
    const need = listing.rent * mult;
    const econ = this.game.economy;
    const upfront = listing.rent * 2 + APPLICATION_FEE; // first month + deposit
    const guarantorFee = Math.round(listing.rent * GUARANTOR_FEE_MONTHS);
    const prepayMonths = 6;
    const prepay = listing.rent * prepayMonths + listing.rent + APPLICATION_FEE;
    const options = [];
    if (salary >= need) options.push({ id: 'income', label: 'Qualify on income', cost: upfront, note: `Your salary (${fmt(salary)}) meets the ${mult}× rent rule.` });
    if (this.game.profile?.background === 'grad' && salary < need) options.push({ id: 'parents', label: 'Parents co-sign as guarantors', cost: upfront, note: 'Your parents agreed to guarantee — once.' });
    options.push({ id: 'guarantor', label: 'Use a guarantor company', cost: upfront + guarantorFee, note: `Pays a one-time fee of ${fmt(guarantorFee)} (≈80% of a month).`, requiresIncome: 0.5 });
    options.push({ id: 'prepay', label: `Prepay ${prepayMonths} months`, cost: prepay, note: 'No income needed if you prepay half the lease.' });
    const valid = options.filter((o) => {
      if (o.id === 'parents' && this.state.history.some((h) => h.option === 'parents')) return false;
      if (o.requiresIncome && salary < need * o.requiresIncome) return false;
      return true;
    });
    return {
      need,
      salary,
      mult,
      options: valid.map((o) => ({ ...o, affordable: econ.canAfford(o.cost) })),
      viewed: this.isViewed(listing.id),
    };
  }

  sign(listing, optionId) {
    const el = this.eligibility(listing);
    const opt = el.options.find((o) => o.id === optionId);
    if (!opt) return { ok: false, reason: 'That option isn’t available.' };
    if (!el.viewed) return { ok: false, reason: 'You need to view the apartment in person first.' };
    const econ = this.game.economy;
    if (!econ.spend(opt.cost, `Lease signing — ${listing.address}`, 'housing')) return { ok: false, reason: 'Not enough money in checking.' };
    const prev = this.state.home;
    this.state.deposit = listing.rent;
    this.state.home = {
      kind: 'lease',
      listing: listing.id,
      building: listing.building,
      x: listing.x,
      z: listing.z,
      address: listing.address,
      unit: listing.unit,
      hood: listing.hood,
      hoodName: listing.hoodName,
      rent: listing.rent,
      type: listing.type,
      quality: listing.quality,
      since: this.clock.dayIndex,
      leaseEnd: this.clock.dayIndex + this.clock.daysPerYear,
      prepaidMonths: optionId === 'prepay' ? 6 : 0,
      features: listing.features,
      seed: listing.seed,
      style: listing.style,
    };
    this.state.history.push({ address: listing.address, rent: listing.rent, day: this.clock.dayIndex, option: optionId, from: prev.kind });
    this.state.listings = this.state.listings.filter((l) => l.id !== listing.id);
    this.state.arrears = 0;
    this.state.lateNotices = 0;
    return { ok: true, cost: opt.cost };
  }

  breakLease() {
    const h = this.state.home;
    if (h.kind !== 'lease') return;
    const penalty = h.rent;
    this.game.economy.charge(penalty, 'Lease break fee', 'housing');
    this.state.home = { kind: 'none' };
    return penalty;
  }

  monthlyUtilities() {
    const h = this.state.home;
    if (h.kind !== 'lease') return 0;
    let u = UTILITIES[h.type] || 80;
    if (this.clock.season === 'winter') u += WINTER_HEAT_EXTRA[h.type] || 30;
    return u;
  }

  /** Called on the 1st of each month. Returns messages. */
  monthly() {
    const msgs = [];
    const h = this.state.home;
    if (h.kind !== 'lease') return msgs;
    const econ = this.game.economy;
    if (h.prepaidMonths > 0) {
      h.prepaidMonths -= 1;
      msgs.push({ type: 'rent', text: `Rent covered by your prepayment (${h.prepaidMonths} months left).` });
    } else if (econ.cash >= h.rent) {
      econ.charge(h.rent, `Rent — ${h.address}`, 'housing');
      msgs.push({ type: 'rent', text: `Rent paid: ${fmt(h.rent)}.` });
      this.state.lateNotices = 0;
      this.state.arrears = 0;
    } else {
      this.state.arrears += h.rent + 50;
      this.state.lateNotices += 1;
      msgs.push({ type: 'late', text: `You couldn't cover rent (${fmt(h.rent)}). A $50 late fee was added. Pay what you owe from the Homes app.` });
    }
    const util = this.monthlyUtilities();
    if (util) econ.charge(util, 'Con Ed & internet', 'bills');
    if (this.state.lateNotices >= 2) {
      msgs.push({ type: 'evicted', text: 'After two months of unpaid rent, your landlord won an eviction in housing court. You’ve lost the apartment and your deposit.' });
      this.state.home = { kind: 'none' };
      this.state.deposit = 0;
      this.state.arrears = 0;
      this.state.lateNotices = 0;
    }
    return msgs;
  }

  payArrears() {
    const amt = this.state.arrears;
    if (amt <= 0) return 0;
    if (!this.game.economy.spend(amt, 'Back rent', 'housing')) return -1;
    this.state.arrears = 0;
    this.state.lateNotices = 0;
    return amt;
  }

  /** Daily: temporary arrangements expire; lease renewal. */
  daily() {
    const msgs = [];
    const h = this.state.home;
    const day = this.clock.dayIndex;
    if ((h.kind === 'couch' || h.kind === 'sublet') && h.until != null) {
      const left = h.until - day;
      if (left === 3 || left === 1) msgs.push({ type: 'reminder', text: `${left} day${left === 1 ? '' : 's'} left at your ${h.kind === 'couch' ? 'friend’s place' : 'sublet'}. Time to find something!` });
      if (left <= 0) {
        msgs.push({ type: 'expired', text: h.kind === 'couch' ? `Your stay at ${h.host || 'your friend'}'s is over. You'll need a hostel, shelter or your own place.` : 'Your sublet ended. The original tenant is back.' });
        this.state.home = { kind: 'none' };
      }
    }
    if (h.kind === 'lease' && day >= h.leaseEnd) {
      const increase = Math.round((h.rent * 0.03) / 25) * 25;
      h.rent += increase;
      h.leaseEnd = day + this.clock.daysPerYear;
      msgs.push({ type: 'renewal', text: `Your lease renewed automatically. New rent: ${fmt(h.rent)} (+${fmt(increase)}).` });
    }
    return msgs;
  }

  serialize() {
    return this.state;
  }
}

function ordinalFloor(n) {
  return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

function fmt(v) {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}
