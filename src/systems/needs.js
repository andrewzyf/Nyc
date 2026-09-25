// Soft needs: satiety, energy, mood (0-100). They nudge, they don't punish.
import { clamp } from '../core/math.js';

export class Needs {
  constructor(state = null) {
    this.state = state || { satiety: 80, energy: 85, mood: 65, fitness: 0, lastMeal: 0, lastSleep: 0 };
    this.modifiers = new Map(); // name -> {moodPerHour, until}
    this.warned = {};
  }

  get satiety() {
    return this.state.satiety;
  }
  get energy() {
    return this.state.energy;
  }
  get mood() {
    return this.state.mood;
  }

  apply(effects = {}) {
    const s = this.state;
    if (effects.satiety) s.satiety = clamp(s.satiety + effects.satiety, 0, 100);
    if (effects.energy) s.energy = clamp(s.energy + effects.energy, 0, 100);
    if (effects.mood) s.mood = clamp(s.mood + effects.mood, 0, 100);
    if (effects.fitness) s.fitness = clamp((s.fitness || 0) + effects.fitness, 0, 100);
  }

  /**
   * Advance needs by game minutes.
   * env: {asleep, sleepQuality, outdoors, raining, umbrella, cold, coat, heat, niceOut, inPark, homeQuality, working}
   */
  update(minutes, env = {}) {
    const h = minutes / 60;
    const s = this.state;
    if (env.asleep) {
      s.energy = clamp(s.energy + h * 12.5 * (env.sleepQuality ?? 1), 0, 100);
      s.satiety = clamp(s.satiety - h * 1.6, 0, 100);
    } else {
      s.energy = clamp(s.energy - h * (env.running ? 5.5 : 3.4), 0, 100);
      s.satiety = clamp(s.satiety - h * 4.0, 0, 100);
    }
    let moodRate = 0;
    // Drift toward a baseline set by where you live
    const baseline = 58 + (env.homeQuality ?? 0) * 4 + (s.fitness || 0) * 0.08;
    moodRate += (baseline - s.mood) * 0.05;
    if (s.satiety < 20) moodRate -= 2.5;
    if (s.energy < 15) moodRate -= 1.5;
    if (!env.asleep && env.outdoors) {
      if (env.raining && !env.umbrella) moodRate -= 3;
      if (env.cold && !env.coat) moodRate -= 2;
      if (env.heat) moodRate -= 1;
      if (env.niceOut) moodRate += 1;
      if (env.inPark && env.niceOut) moodRate += 1.5;
    }
    for (const [k, m] of this.modifiers) {
      if (m.until != null && env.now > m.until) this.modifiers.delete(k);
      else moodRate += m.moodPerHour;
    }
    s.mood = clamp(s.mood + moodRate * h, 0, 100);
  }

  /** Movement speed multiplier (tired/hungry = slower). */
  speedMultiplier() {
    const s = this.state;
    let m = 1;
    if (s.energy < 20) m -= 0.2 * (1 - s.energy / 20);
    if (s.satiety < 10) m -= 0.1;
    return m;
  }

  /** Returns a warning to show if a need just crossed a threshold. */
  warnings() {
    const s = this.state;
    const out = [];
    const check = (key, v, lo, msg) => {
      if (v < lo && !this.warned[key]) {
        this.warned[key] = true;
        out.push(msg);
      } else if (v > lo + 12) this.warned[key] = false;
    };
    check('hungry', s.satiety, 25, { icon: '🍕', text: 'You’re getting hungry.' });
    check('starving', s.satiety, 8, { icon: '🍕', text: 'You’re starving — grab a slice or a bodega sandwich.' });
    check('tired', s.energy, 22, { icon: '😴', text: 'You’re getting tired.' });
    check('exhausted', s.energy, 7, { icon: '😴', text: 'You’re exhausted. Find somewhere to sleep.' });
    check('down', s.mood, 25, { icon: '🌧️', text: 'You’re feeling down. A walk in the park or a good meal might help.' });
    return out;
  }

  moodLabel() {
    const m = this.state.mood;
    if (m > 85) return 'On top of the world';
    if (m > 70) return 'Happy';
    if (m > 55) return 'Content';
    if (m > 40) return 'Okay';
    if (m > 25) return 'Stressed';
    return 'Miserable';
  }

  serialize() {
    return this.state;
  }
}
