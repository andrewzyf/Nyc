// Jobs: listings, applications + interviews, shifts, pay, promotions and firing.
import { CAREERS, EMPLOYERS, SCHEDULES, COURSES, INTERVIEW_QUESTIONS, SKILLS } from '../data/careers.js';
import { hash2, hashString, RNG } from '../core/rng.js';
import { clamp } from '../core/math.js';

export const EMPLOYER_BY_ID = Object.fromEntries(EMPLOYERS.map((e) => [e.id, e]));

export function levelInfo(careerId, level) {
  return CAREERS[careerId]?.levels[level];
}

export class Career {
  constructor(game, state = null) {
    this.game = game;
    this.rng = new RNG(Date.now() & 0xffff);
    this.state = state || {
      job: null,
      skills: Object.fromEntries(Object.keys(SKILLS).map((k) => [k, 0])),
      certs: [],
      education: 'hs',
      applications: [],
      history: [],
      courses: {},
      jobBoostUntil: 0,
      fitness: 0,
    };
  }

  get clock() {
    return this.game.clock;
  }

  get job() {
    return this.state.job;
  }

  hasCert(c) {
    if (c === 'degree') return this.state.education === 'degree' || this.state.certs.includes('degree');
    return this.state.certs.includes(c);
  }

  addSkill(skill, amt) {
    if (!skill) return;
    this.state.skills[skill] = clamp((this.state.skills[skill] || 0) + amt, 0, 100);
  }

  schedule(job = this.state.job) {
    if (!job) return null;
    return SCHEDULES[levelInfo(job.career, job.level).schedule];
  }

  title(job = this.state.job) {
    return job ? levelInfo(job.career, job.level).title : 'Unemployed';
  }

  salary(job = this.state.job) {
    return job ? levelInfo(job.career, job.level).salary : 0;
  }

  /** Per-shift wage: annual salary spread over this calendar's shifts per year. */
  shiftPay(job = this.state.job) {
    if (!job) return 0;
    const sched = this.schedule(job);
    const shiftsPerYear = (this.clock.daysPerYear / 7) * sched.days.length;
    return this.salary(job) / shiftsPerYear;
  }

  /** Requirements check for a career level. */
  qualification(careerId, level) {
    const L = levelInfo(careerId, level);
    const skill = CAREERS[careerId].skill;
    const have = this.state.skills[skill] || 0;
    const missing = [];
    // Current employees get credit for time in the field
    const exp = this.state.history.filter((h) => h.career === careerId).reduce((s, h) => s + h.days, 0) + (this.state.job?.career === careerId ? this.state.job.totalDays : 0);
    const needSkill = Math.max(0, L.skill - Math.min(10, exp * 0.3));
    if (have < needSkill) missing.push(`${SKILLS[skill]} skill ${Math.ceil(needSkill)} (you have ${Math.floor(have)})`);
    if (L.cert && !L.cert.some((c) => this.hasCert(c))) missing.push(L.cert.map(certLabel).join(' or '));
    return { ok: missing.length === 0, missing, skill, have, need: needSkill };
  }

  /** Current openings (refresh weekly, deterministic per week). */
  listings() {
    const week = Math.floor(this.clock.dayIndex / 7);
    const out = [];
    for (const e of EMPLOYERS) {
      for (const lv of e.levels) {
        const h = hash2(hashString(e.id), lv * 17 + week * 31, 7);
        if (h > (lv === 0 ? 0.7 : 0.45)) continue;
        if (this.state.job && this.state.job.employer === e.id && this.state.job.level >= lv) continue;
        const L = levelInfo(e.career, lv);
        const q = this.qualification(e.career, lv);
        const applied = this.state.applications.find((a) => a.employer === e.id && a.level === lv && a.status !== 'rejected');
        out.push({ id: `${e.id}:${lv}`, employer: e, level: lv, career: e.career, title: L.title, salary: L.salary, schedule: SCHEDULES[L.schedule], qualified: q, applied: !!applied, posted: week });
      }
    }
    return out.sort((a, b) => Number(b.qualified.ok) - Number(a.qualified.ok) || a.salary - b.salary);
  }

  /** Apply: schedules an in-person interview in the next business day or two. */
  apply(employerId, level) {
    const e = EMPLOYER_BY_ID[employerId];
    const clock = this.clock;
    let day = clock.dayIndex + 1;
    while ([0, 6].includes(clock.weekdayOf(day))) day++;
    if (clock.hour < 12 && this.rng.chance(0.4)) day = clock.dayIndex; // same-day afternoon slot
    const startMin = day === clock.dayIndex ? Math.max(Math.ceil(clock.minuteOfDay / 60 + 2) * 60, 14 * 60) : this.rng.int(10, 16) * 60;
    const app = { id: `app-${Date.now()}-${this.rng.int(0, 9999)}`, employer: employerId, level, status: 'interview', day, start: Math.min(startMin, 17 * 60), career: e.career, created: clock.t };
    this.state.applications = this.state.applications.filter((a) => !(a.employer === employerId && a.level === level));
    this.state.applications.push(app);
    return app;
  }

  interviewWindow(app) {
    const t0 = app.day * 1440 + app.start;
    return { from: t0 - 45, to: t0 + 30, at: t0 };
  }

  /** Mark missed interviews as expired. */
  expireApplications() {
    const now = this.clock.t;
    for (const a of this.state.applications) {
      if (a.status === 'interview' && now > this.interviewWindow(a).to) a.status = 'missed';
    }
    this.state.applications = this.state.applications.filter((a) => a.status === 'interview' || now - a.created < 7 * 1440);
  }

  questionsFor(careerId, n = 3) {
    const pool = [...INTERVIEW_QUESTIONS[careerId] || [], ...INTERVIEW_QUESTIONS.general];
    const rng = new RNG(hashString(careerId + this.clock.dayIndex));
    rng.shuffle(pool);
    const specific = (INTERVIEW_QUESTIONS[careerId] || []).slice();
    const picks = [];
    if (specific.length) picks.push(specific[this.clock.dayIndex % specific.length]);
    for (const q of pool) {
      if (picks.length >= n) break;
      if (!picks.includes(q)) picks.push(q);
    }
    return picks.map((q) => ({ q: q.q, a: rng.shuffle(q.a.slice()) }));
  }

  /** Resolve an interview. answers = array of scores (0-2). */
  interview(app, scores, { mood = 60, energy = 60, suit = false, lateMinutes = 0 } = {}) {
    const q = this.qualification(app.career, app.level);
    const total = scores.reduce((s, x) => s + x, 0);
    const max = scores.length * 2;
    let p = 0.25 + (total / max) * 0.55;
    if (app.level === 0) p += 0.2;
    if (suit && ['finance', 'tech', 'education', 'hospitality', 'healthcare'].includes(app.career)) p += 0.1;
    p += (mood - 50) / 400 + (energy - 50) / 500;
    if (this.clock.t < this.state.jobBoostUntil) p += 0.08;
    if (lateMinutes > 0) p -= Math.min(0.3, lateMinutes / 60);
    const surplus = q.have - q.need;
    p += clamp(surplus / 100, 0, 0.15);
    if (!q.ok) p = Math.min(p, 0.03);
    const hired = this.rng.next() < clamp(p, 0.02, 0.97);
    app.status = hired ? 'offer' : 'rejected';
    const e = EMPLOYER_BY_ID[app.employer];
    let feedback;
    if (!q.ok) feedback = `They liked you, but the role needs: ${q.missing.join(', ')}.`;
    else if (hired) feedback = `You got the job! Welcome to ${e.name}.`;
    else if (total / max > 0.6) feedback = 'It was close — they went with someone with more experience. Try again next week.';
    else feedback = 'The interview didn’t land. Practice those answers and try again.';
    return { hired, feedback, chance: p };
  }

  hire(employerId, level) {
    const e = EMPLOYER_BY_ID[employerId];
    if (this.state.job) this.quit('Switched jobs');
    this.state.job = {
      employer: employerId,
      career: e.career,
      level,
      performance: 55,
      daysAtLevel: 0,
      totalDays: 0,
      hiredDay: this.clock.dayIndex,
      startDay: this.clock.dayIndex + (this.clock.hour > 12 ? 1 : 0),
      worked: {},
      absences: [],
      lates: 0,
      warnings: 0,
      pending: 0,
      lastPayDay: this.clock.dayIndex,
    };
    this.state.applications = this.state.applications.filter((a) => a.employer !== employerId);
    return this.state.job;
  }

  quit(reason = 'Quit') {
    const j = this.state.job;
    if (!j) return null;
    this.state.history.push({ employer: j.employer, career: j.career, level: j.level, salary: this.salary(j), days: j.totalDays, end: this.clock.dayIndex, reason });
    const final = j.pending;
    this.state.job = null;
    return final;
  }

  isWorkDay(dayIndex = this.clock.dayIndex) {
    const j = this.state.job;
    if (!j || dayIndex < j.startDay) return false;
    return this.schedule().days.includes(this.clock.weekdayOf(dayIndex));
  }

  /** Can the player clock in right now? */
  shiftStatus() {
    const j = this.state.job;
    if (!j) return { can: false, reason: 'No job' };
    const s = this.schedule();
    const day = this.clock.dayIndex;
    const m = this.clock.minuteOfDay;
    if (!this.isWorkDay(day)) return { can: false, reason: 'Not a work day', next: this.nextShift() };
    if (j.worked[day]) return { can: false, reason: 'Already worked today', next: this.nextShift() };
    const start = s.start * 60;
    const end = s.end * 60;
    if (m < start - 60) return { can: false, reason: `Shift starts at ${fmtHour(s.start)}`, early: true };
    if (m > end - 60) return { can: false, reason: 'Too late to clock in today' };
    return { can: true, late: Math.max(0, m - start - 10), start, end };
  }

  nextShift() {
    const j = this.state.job;
    if (!j) return null;
    const s = this.schedule();
    for (let d = this.clock.dayIndex; d < this.clock.dayIndex + 8; d++) {
      if (!this.isWorkDay(d) || j.worked[d]) continue;
      if (d === this.clock.dayIndex && this.clock.minuteOfDay > s.end * 60 - 60) continue;
      return { day: d, start: s.start * 60, end: s.end * 60 };
    }
    return null;
  }

  /**
   * Work a shift (time skip handled by the caller). effort: coast | normal | hard.
   * Returns a summary of what happened.
   */
  workShift(effort, { mood, energy, satiety }) {
    const j = this.state.job;
    const st = this.shiftStatus();
    if (!st.can) return null;
    const s = this.schedule();
    const minutes = st.end - Math.max(this.clock.minuteOfDay, st.start);
    const fraction = clamp(minutes / (st.end - st.start), 0.2, 1);
    const pay = this.shiftPay() * fraction;
    j.pending += pay;
    j.worked[this.clock.dayIndex] = true;
    j.daysAtLevel += 1;
    j.totalDays += 1;
    // performance
    let delta = { coast: -1, normal: 2.5, hard: 5 }[effort];
    delta += (mood - 50) / 25;
    if (energy < 25) delta -= 3;
    if (satiety < 20) delta -= 2;
    const late = st.late > 0;
    if (late) {
      delta -= 6;
      j.lates += 1;
    }
    const events = [];
    const r = this.rng.next();
    const career = CAREERS[j.career];
    if (r < 0.12) {
      delta += 4;
      events.push(pickFlavor(j.career, 'good', this.rng));
    } else if (r < 0.2) {
      delta -= 3;
      events.push(pickFlavor(j.career, 'bad', this.rng));
    } else events.push(pickFlavor(j.career, 'neutral', this.rng));
    j.performance = clamp(j.performance + delta, 0, 100);
    this.addSkill(career.skill, (effort === 'hard' ? 1.4 : effort === 'coast' ? 0.4 : 0.9) * fraction);
    // promotion?
    let promoted = null;
    const next = levelInfo(j.career, j.level + 1);
    if (next && j.performance >= 70 && j.daysAtLevel >= next.days && (this.state.skills[career.skill] || 0) >= next.skill && (!next.cert || next.cert.some((c) => this.hasCert(c)))) {
      j.level += 1;
      j.daysAtLevel = 0;
      j.performance = 60;
      promoted = { title: next.title, salary: next.salary };
    }
    return {
      minutes,
      pay,
      late,
      lateMinutes: st.late,
      perf: j.performance,
      delta,
      events,
      promoted,
      energyCost: { coast: 22, normal: 32, hard: 42 }[effort] * fraction * (s.end - s.start > 10 ? 1.25 : 1),
      satietyCost: 18 * fraction,
      moodDelta: effort === 'hard' ? -3 : effort === 'coast' ? 2 : 0,
    };
  }

  /** End-of-day bookkeeping: absences, warnings, firing. Returns messages. */
  dailyCheck(dayIndex) {
    const j = this.state.job;
    const msgs = [];
    this.expireApplications();
    if (!j) return msgs;
    if (this.isWorkDay(dayIndex) && !j.worked[dayIndex]) {
      j.absences.push(dayIndex);
      j.performance = clamp(j.performance - 12, 0, 100);
      msgs.push({ type: 'absent', text: `You missed your shift at ${EMPLOYER_BY_ID[j.employer].name}.` });
    }
    j.absences = j.absences.filter((d) => dayIndex - d < 14);
    // prune worked map
    for (const k of Object.keys(j.worked)) if (dayIndex - Number(k) > 20) delete j.worked[k];
    const bad = j.absences.length >= 3 || j.performance < 12;
    if (bad) {
      if (j.warnings >= 1) {
        const pending = this.quit('Fired');
        msgs.push({ type: 'fired', text: `You've been let go from ${EMPLOYER_BY_ID[j.employer].name}.`, pending });
      } else {
        j.warnings += 1;
        j.absences = j.absences.slice(-1);
        msgs.push({ type: 'warning', text: 'Your manager gave you a formal warning. One more slip and you’re out.' });
      }
    }
    return msgs;
  }

  /** Pay period check. Returns gross amount to pay (and resets), or 0. */
  payday(dayIndex, periodDays) {
    const j = this.state.job;
    if (!j) return 0;
    if (dayIndex - j.lastPayDay < periodDays) return 0;
    j.lastPayDay = dayIndex;
    const gross = j.pending;
    j.pending = 0;
    return gross;
  }

  // Courses --------------------------------------------------------------------
  courseStatus(courseId) {
    return this.state.courses[courseId] || null;
  }

  enroll(courseId) {
    const c = COURSES.find((x) => x.id === courseId);
    this.state.courses[courseId] = { sessions: 0, total: c.sessions, done: false, lastDay: -1 };
    return c;
  }

  attend(courseId) {
    const c = COURSES.find((x) => x.id === courseId);
    const st = this.state.courses[courseId];
    if (!st || st.done) return null;
    if (st.lastDay === this.clock.dayIndex) return { already: true };
    st.sessions += 1;
    st.lastDay = this.clock.dayIndex;
    if (c.skill) this.addSkill(c.skill, c.gain / c.sessions);
    if (st.sessions >= c.sessions) {
      st.done = true;
      if (c.cert === 'degree') this.state.education = 'degree';
      if (!this.state.certs.includes(c.cert)) this.state.certs.push(c.cert);
      return { completed: true, course: c };
    }
    return { completed: false, course: c, progress: st.sessions / c.sessions };
  }

  serialize() {
    return this.state;
  }
}

export function certLabel(c) {
  return { degree: "bachelor's degree", bootcamp: 'coding bootcamp', cna: 'CNA certification', rn: 'nursing license (RN)', electrician: 'electrician training', teaching: 'teaching certificate', finmodel: 'financial modeling cert', design: 'design certificate', hospitality: 'hospitality certificate' }[c] || c;
}

function fmtHour(h) {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const ap = hh < 12 ? 'AM' : 'PM';
  return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, '0')} ${ap}`;
}

const FLAVOR = {
  good: {
    default: ['Your manager praised your work in front of the team.', 'A regular left you a glowing review.', 'You fixed a problem nobody else could.'],
    food: ['A food critic loved the dish you plated.', 'You nailed the Friday rush without a single remake.'],
    tech: ['Your pull request got merged with zero comments.', 'You found the bug that took down staging.'],
    finance: ['Your model was used in the partner meeting.', 'A client asked for you by name.'],
    healthcare: ['A patient’s family thanked you personally.', 'You caught a medication error in time.'],
    education: ['A student finally got long division. You almost cried.', 'Parents emailed to say thanks.'],
    construction: ['The foreman noticed your clean work.', 'You finished the floor a day early.'],
    creative: ['The client approved your concept on the first round.', 'Your design got pinned to the studio wall.'],
    hospitality: ['A guest left you a handwritten thank-you note.', 'You got a celebrity a table at the last minute.'],
    retail: ['You hit your sales target by 2 PM.', 'A customer asked for your name to tell your boss how helpful you were.'],
  },
  bad: {
    default: ['The printer jammed. All day.', 'You spilled coffee on something important.', 'Your manager was in a mood.'],
    food: ['The walk-in fridge broke mid-shift.', 'Someone sent back a burger for being "too round".'],
    tech: ['The deploy failed at 4:59 PM.', 'You spent six hours in meetings about meetings.'],
    finance: ['A spreadsheet had a circular reference. It was yours.', 'The market tanked and everyone blamed you somehow.'],
    healthcare: ['Three admissions at once, one of them a biter.', 'Double shift energy on a single shift.'],
    education: ['The fire drill ate your whole lesson plan.', 'Someone put glitter in the vents.'],
    construction: ['The concrete truck was three hours late.', 'An inspector found a problem with the permits.'],
    creative: ['The client asked to "make the logo bigger". Again.', 'Your file got corrupted.'],
    hospitality: ['A guest demanded an upgrade and a refund.', 'The elevator broke on check-in day.'],
    retail: ['Inventory day. Enough said.', 'A customer tried to return something from a different store.'],
  },
  neutral: {
    default: ['A normal shift. The time flew by.', 'Nothing special — just honest work.', 'Busy, but manageable.'],
  },
};

function pickFlavor(career, kind, rng) {
  const pool = [...(FLAVOR[kind][career] || []), ...FLAVOR[kind].default];
  return rng.pick(pool);
}
