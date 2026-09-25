export function money(v, { cents = false, sign = false } = {}) {
  const neg = v < 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString('en-US', {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return `${neg ? '−' : sign ? '+' : ''}$${s}`;
}

export function moneyShort(v) {
  const abs = Math.abs(v);
  const neg = v < 0 ? '−' : '';
  if (abs >= 1e6) return `${neg}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 1e4) return `${neg}$${(abs / 1e3).toFixed(0)}k`;
  return money(v);
}

export function clockTime(minuteOfDay, { ampm = true } = {}) {
  const m = ((Math.floor(minuteOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  if (!ampm) return `${String(h).padStart(2, '0')}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

export function hourLabel(h) {
  const hh = ((h % 24) + 24) % 24;
  const whole = Math.floor(hh);
  const mins = Math.round((hh - whole) * 60);
  return clockTime(whole * 60 + mins);
}

export function duration(minutes) {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} hr ${r} min` : `${h} hr`;
}

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || word + 's'}`;
}

export function titleCase(s) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
