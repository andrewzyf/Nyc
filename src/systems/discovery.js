// Soft progress: landmarks discovered, neighborhoods visited, experiences, life stats.
import { LANDMARKS } from '../data/landmarks.js';

export const EXPERIENCE_LABELS = {
  broadway: 'Saw a Broadway show',
  comedy: 'Laughed at a comedy club',
  jazz: 'Caught a late jazz set',
  observatory: 'Saw the city from above',
  skating: 'Went ice skating',
  museum: 'Wandered a great museum',
  ferry: 'Rode the Staten Island Ferry',
  carousel: "Rode Jane's Carousel",
  concert: 'Saw a show at Radio City',
  ballet: 'Went to the ballet',
  opera: 'Stood through an opera',
  apollo: 'Amateur Night at the Apollo',
  game: 'Went to a Nets game',
  'lunar-new-year': 'Lunar New Year Parade',
  'st-patricks': "St. Patrick's Day Parade",
  'easter-bonnets': 'Easter Bonnet Parade',
  'cherry-blossoms': 'Cherry blossoms in Prospect Park',
  'fleet-week': 'Fleet Week',
  'pr-parade': 'Puerto Rican Day Parade',
  pride: 'NYC Pride March',
  fireworks: 'Fourth of July fireworks',
  'west-indian-day': 'West Indian Day Parade',
  'san-gennaro': 'Feast of San Gennaro',
  halloween: 'Village Halloween Parade',
  marathon: 'Cheered the NYC Marathon',
  thanksgiving: 'Thanksgiving Day Parade',
  'tree-lighting': 'Rockefeller Tree Lighting',
  'holiday-market': 'Holiday market shopping',
  'ball-drop': "New Year's Eve in Times Square",
  summerstage: 'Free summer concert',
  'park-movie': 'Movie night in Bryant Park',
  shakespeare: 'Shakespeare in the Park',
  smorgasburg: 'Ate your way through Smorgasburg',
  protest: 'Marched for a cause',
  'street-fair': 'Street fair funnel cake',
  'film-shoot': 'Spotted a film shoot',
  'block-party': 'Danced at a block party',
  'pop-up-concert': 'Stumbled on a free concert',
};

export class Discovery {
  constructor(state = null) {
    this.state = state || {
      landmarks: [],
      hoods: [],
      experiences: [],
      stats: { walked: 0, subwayRides: 0, taxiRides: 0, busRides: 0, meals: 0, shifts: 0, deliveries: 0, daysInCity: 0, slices: 0, bodegaCats: 0 },
      journal: [],
    };
  }

  checkLandmarks(x, z) {
    const found = [];
    for (const l of LANDMARKS) {
      if (!l.radius || this.state.landmarks.includes(l.id)) continue;
      if (Math.hypot(x - l.x, z - l.z) < l.radius) {
        this.state.landmarks.push(l.id);
        found.push(l);
      }
    }
    return found;
  }

  discover(id) {
    if (this.state.landmarks.includes(id)) return null;
    this.state.landmarks.push(id);
    return LANDMARKS.find((l) => l.id === id);
  }

  visitHood(id) {
    if (!id || this.state.hoods.includes(id)) return false;
    this.state.hoods.push(id);
    return true;
  }

  experience(id) {
    if (!id || this.state.experiences.includes(id)) return false;
    this.state.experiences.push(id);
    return true;
  }

  stat(key, amt = 1) {
    this.state.stats[key] = (this.state.stats[key] || 0) + amt;
  }

  log(dayIndex, text) {
    this.state.journal.unshift({ day: dayIndex, text });
    if (this.state.journal.length > 80) this.state.journal.length = 80;
  }

  serialize() {
    return this.state;
  }
}
