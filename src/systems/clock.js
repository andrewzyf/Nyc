// Game clock + calendar. Time is stored as minutes since Jan 1, 2026 00:00.
// Two calendar paces: 'realistic' (real month lengths) and 'compact' (10-day months,
// so seasons turn over in a few play sessions). Economics stay consistent per day.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));
const REAL_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const BASE_YEAR = 2026;
const BASE_WEEKDAY = 4; // Jan 1 2026 was a Thursday

// Sunrise / sunset (minute of day, DST-aware) and max sun altitude by month
const SUN = [
  [437, 1004, 29], [414, 1043, 37], [430, 1145, 48], [390, 1170, 60], [345, 1197, 68], [325, 1225, 72],
  [337, 1223, 70], [365, 1188, 64], [393, 1135, 53], [423, 1080, 42], [400, 1000, 32], [427, 990, 27],
];
// NYC monthly normal high/low °F
const TEMPS = [[39, 27], [42, 29], [50, 35], [62, 45], [72, 54], [80, 64], [85, 70], [84, 69], [76, 61], [65, 50], [54, 41], [44, 32]];

export const TIME_SPEEDS = {
  relaxed: { label: 'Relaxed', rate: 0.25, desc: '1 real second = 15 game seconds' },
  normal: { label: 'Normal', rate: 0.5, desc: '1 real second = 30 game seconds' },
  brisk: { label: 'Brisk', rate: 1, desc: '1 real second = 1 game minute' },
  fast: { label: 'Fast', rate: 2, desc: '1 real second = 2 game minutes' },
};

export function seasonOfMonth(m) {
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'fall';
}

export class Clock {
  constructor({ calendar = 'compact', minutes = 0, speed = 'normal' } = {}) {
    this.calendar = calendar;
    this.t = minutes;
    this.speed = speed;
    this.paused = false;
    this.listeners = { hour: new Set(), day: new Set(), minute: new Set() };
  }

  get daysPerMonthFixed() {
    return this.calendar === 'compact' ? 10 : null;
  }

  monthLength(month) {
    return this.calendar === 'compact' ? 10 : REAL_MONTH_DAYS[month];
  }

  get daysPerYear() {
    return this.calendar === 'compact' ? 120 : 365;
  }

  /** Construct minutes from a calendar date */
  static fromDate(calendar, year, month, day, minuteOfDay = 0) {
    const c = new Clock({ calendar });
    let days = (year - BASE_YEAR) * c.daysPerYear;
    for (let m = 0; m < month; m++) days += c.monthLength(m);
    days += day - 1;
    return days * 1440 + minuteOfDay;
  }

  /** Map a real calendar day (e.g. July 4) onto this calendar's month length. */
  mapRealDay(month, realDay) {
    if (this.calendar !== 'compact') return realDay;
    return Math.max(1, Math.min(10, Math.ceil((realDay * 10) / REAL_MONTH_DAYS[month])));
  }

  get dayIndex() {
    return Math.floor(this.t / 1440);
  }

  get minuteOfDay() {
    return this.t - this.dayIndex * 1440;
  }

  get hour() {
    return this.minuteOfDay / 60;
  }

  dateOf(dayIndex) {
    let d = dayIndex;
    const dpy = this.daysPerYear;
    const year = BASE_YEAR + Math.floor(d / dpy);
    d -= (year - BASE_YEAR) * dpy;
    let month = 0;
    while (d >= this.monthLength(month)) {
      d -= this.monthLength(month);
      month++;
    }
    return { year, month, day: d + 1 };
  }

  get date() {
    return this.dateOf(this.dayIndex);
  }

  weekdayOf(dayIndex) {
    return (((BASE_WEEKDAY + dayIndex) % 7) + 7) % 7;
  }

  get weekday() {
    return this.weekdayOf(this.dayIndex);
  }

  get season() {
    return seasonOfMonth(this.date.month);
  }

  get isWeekend() {
    const w = this.weekday;
    return w === 0 || w === 6;
  }

  /** Fractional position within the month: used to interpolate sun & temps. */
  monthFrac() {
    const { month, day } = this.date;
    return { month, frac: (day - 0.5 + this.minuteOfDay / 1440) / this.monthLength(month) };
  }

  sun() {
    const { month, frac } = this.monthFrac();
    const a = SUN[month];
    const next = frac > 0.5 ? SUN[(month + 1) % 12] : SUN[(month + 11) % 12];
    const k = Math.abs(frac - 0.5);
    const mix = (i) => a[i] + (next[i] - a[i]) * k;
    return { sunrise: mix(0), sunset: mix(1), maxAlt: mix(2) };
  }

  normals() {
    const { month, frac } = this.monthFrac();
    const a = TEMPS[month];
    const next = frac > 0.5 ? TEMPS[(month + 1) % 12] : TEMPS[(month + 11) % 12];
    const k = Math.abs(frac - 0.5);
    return { high: a[0] + (next[0] - a[0]) * k, low: a[1] + (next[1] - a[1]) * k };
  }

  on(type, fn) {
    this.listeners[type].add(fn);
    return () => this.listeners[type].delete(fn);
  }

  get rate() {
    return (TIME_SPEEDS[this.speed] || TIME_SPEEDS.normal).rate;
  }

  /** Advance real-time frame. Returns game minutes elapsed. */
  tick(realDt, multiplier = 1) {
    if (this.paused) return 0;
    const mins = realDt * this.rate * multiplier;
    this.advance(mins);
    return mins;
  }

  /** Advance game time, firing hour/day listeners for every boundary crossed. */
  advance(mins) {
    if (mins <= 0) return;
    const start = this.t;
    const end = start + mins;
    let nextHour = Math.floor(start / 60 + 1e-9) * 60 + 60;
    while (nextHour <= end) {
      this.t = nextHour;
      const h = (nextHour / 60) % 24;
      for (const fn of this.listeners.hour) fn(h);
      if (h === 0) for (const fn of this.listeners.day) fn(this.dayIndex);
      nextHour += 60;
    }
    this.t = end;
    for (const fn of this.listeners.minute) fn(mins);
  }

  /** Minutes until a given minute-of-day (today or tomorrow). */
  minutesUntil(minuteOfDay) {
    const m = this.minuteOfDay;
    return minuteOfDay > m ? minuteOfDay - m : 1440 - m + minuteOfDay;
  }

  label() {
    const { month, day } = this.date;
    return `${WEEKDAYS_SHORT[this.weekday]}, ${MONTHS_SHORT[month]} ${day}`;
  }

  serialize() {
    return { t: this.t, calendar: this.calendar, speed: this.speed };
  }
}

export { TEMPS as MONTH_TEMPS };
