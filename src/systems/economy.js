// Money: checking + savings, a transaction ledger, recurring bills and NYC taxes.

// Simplified 2026 single-filer brackets (annual USD)
const FEDERAL = [
  [12400, 0.1],
  [50400, 0.12],
  [105700, 0.22],
  [201775, 0.24],
  [256225, 0.32],
  [640600, 0.35],
  [Infinity, 0.37],
];
const FED_STANDARD = 16100;
const NYS = [
  [8500, 0.04],
  [11700, 0.045],
  [13900, 0.0525],
  [80650, 0.055],
  [215400, 0.06],
  [1077550, 0.0685],
  [Infinity, 0.0965],
];
const NYS_STANDARD = 8000;
const NYC = [
  [12000, 0.03078],
  [25000, 0.03762],
  [50000, 0.03819],
  [Infinity, 0.03876],
];

function bracketTax(income, brackets) {
  let tax = 0;
  let prev = 0;
  for (const [cap, rate] of brackets) {
    if (income <= prev) break;
    tax += (Math.min(income, cap) - prev) * rate;
    prev = cap;
  }
  return tax;
}

/** Estimated annual tax for a NYC resident on W-2 wages. */
export function annualTax(gross) {
  const federal = bracketTax(Math.max(0, gross - FED_STANDARD), FEDERAL);
  const stateTaxable = Math.max(0, gross - NYS_STANDARD);
  const state = bracketTax(stateTaxable, NYS);
  const city = bracketTax(stateTaxable, NYC);
  const ss = Math.min(gross, 184500) * 0.062;
  const medicare = gross * 0.0145 + Math.max(0, gross - 200000) * 0.009;
  const fica = ss + medicare;
  const total = federal + state + city + fica;
  return { federal, state, city, fica, total, effective: gross > 0 ? total / gross : 0 };
}

export const SAVINGS_APY = 0.041;

export class Economy {
  constructor(clock, state = null) {
    this.clock = clock;
    this.state = state || {
      cash: 0,
      savings: 0,
      ledger: [],
      subscriptions: { phone: 65 },
      loans: 0,
      savingsGoal: null,
      fareWindow: [],
      overdraftFeeCharged: false,
      stats: { earned: 0, spent: 0, taxes: 0 },
    };
  }

  get cash() {
    return this.state.cash;
  }

  get savings() {
    return this.state.savings;
  }

  netWorth(extraDebt = 0) {
    return this.state.cash + this.state.savings - extraDebt;
  }

  canAfford(amount) {
    return this.state.cash >= amount - 1e-6;
  }

  _log(amount, desc, category) {
    const s = this.state;
    s.ledger.unshift({ t: this.clock.t, amount: Math.round(amount * 100) / 100, desc, category, balance: Math.round(s.cash * 100) / 100 });
    if (s.ledger.length > 200) s.ledger.length = 200;
  }

  /** Voluntary purchase: fails if you can't afford it. */
  spend(amount, desc, category = 'misc') {
    if (amount <= 0) return true;
    if (!this.canAfford(amount)) return false;
    this.state.cash -= amount;
    this.state.stats.spent += amount;
    this._log(-amount, desc, category);
    return true;
  }

  /** Mandatory charge (rent, bills): can go negative (overdraft). */
  charge(amount, desc, category = 'bills') {
    this.state.cash -= amount;
    this.state.stats.spent += amount;
    this._log(-amount, desc, category);
    if (this.state.cash < 0 && !this.state.overdraftFeeCharged) {
      this.state.overdraftFeeCharged = true;
      this.state.cash -= 35;
      this._log(-35, 'Overdraft fee', 'bank');
      return { overdraft: true };
    }
    if (this.state.cash >= 0) this.state.overdraftFeeCharged = false;
    return { overdraft: this.state.cash < 0 };
  }

  earn(amount, desc, category = 'income') {
    this.state.cash += amount;
    this.state.stats.earned += amount;
    this._log(amount, desc, category);
  }

  /** Paycheck: gross wages with withholding estimated from the annualized rate. */
  payroll(gross, annualSalary, employer) {
    const { effective, federal, state, city, fica, total } = annualTax(annualSalary);
    const scale = annualSalary > 0 ? gross / annualSalary : 0;
    const withheld = Math.round(gross * effective * 100) / 100;
    const net = Math.round((gross - withheld) * 100) / 100;
    this.state.cash += net;
    this.state.stats.earned += net;
    this.state.stats.taxes += withheld;
    this._log(net, `Paycheck — ${employer}`, 'income');
    return {
      gross,
      net,
      withheld,
      breakdown: {
        federal: federal * scale,
        state: state * scale,
        city: city * scale,
        fica: fica * scale,
      },
      total: total * scale,
    };
  }

  toSavings(amount) {
    amount = Math.min(amount, this.state.cash);
    if (amount <= 0) return 0;
    this.state.cash -= amount;
    this.state.savings += amount;
    this._log(-amount, 'Transfer to savings', 'bank');
    return amount;
  }

  fromSavings(amount) {
    amount = Math.min(amount, this.state.savings);
    if (amount <= 0) return 0;
    this.state.savings -= amount;
    this.state.cash += amount;
    this._log(amount, 'Transfer from savings', 'bank');
    return amount;
  }

  /** Monthly interest on savings (scaled to the calendar's month). */
  accrueInterest() {
    const monthsPerYear = 12;
    const interest = Math.round(this.state.savings * (SAVINGS_APY / monthsPerYear) * 100) / 100;
    if (interest > 0.009) {
      this.state.savings += interest;
      this.state.ledger.unshift({ t: this.clock.t, amount: interest, desc: 'Savings interest', category: 'bank', balance: this.state.cash });
    }
    return interest;
  }

  /** OMNY fare with weekly cap (7-day rolling). Returns the amount charged. */
  payFare(fare, cap, desc) {
    const now = this.clock.t;
    const win = this.state.fareWindow.filter((f) => now - f.t < 7 * 1440);
    const spent = win.reduce((s, f) => s + f.amount, 0);
    const charge = Math.max(0, Math.min(fare, cap - spent));
    if (charge > 0 && !this.canAfford(charge)) return null;
    if (charge > 0) {
      this.state.cash -= charge;
      this.state.stats.spent += charge;
      this._log(-charge, desc, 'transit');
    }
    win.push({ t: now, amount: charge });
    this.state.fareWindow = win;
    return { charged: charge, capped: charge < fare, weekSpent: spent + charge };
  }

  monthlyBills(extra = []) {
    const out = [];
    for (const [name, amt] of Object.entries(this.state.subscriptions)) {
      if (!amt) continue;
      this.charge(amt, `${name[0].toUpperCase()}${name.slice(1)} bill`, 'bills');
      out.push({ name, amount: amt });
    }
    if (this.state.loans > 0) {
      this.charge(this.state.loans, 'Student loan payment', 'loans');
      out.push({ name: 'Student loans', amount: this.state.loans });
    }
    for (const e of extra) {
      this.charge(e.amount, e.name, e.category || 'bills');
      out.push(e);
    }
    return out;
  }

  serialize() {
    return this.state;
  }
}
