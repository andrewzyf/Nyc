// Character creator with a live 3D preview (rendered into the right-hand viewport).
import { h, clear } from './dom.js';
import { money } from '../core/format.js';
import { BACKGROUNDS, ORIGINS } from '../data/backgrounds.js';
import { CAREERS, SCHEDULES } from '../data/careers.js';
import { SKIN_TONES, HAIR_COLORS, CLOTH_COLORS, HAIR_STYLES, BODY_TYPES, OUTFITS, FACIAL_HAIR, HATS, defaultAppearance, randomAppearance } from '../player/characterModel.js';

const FIRST = ['Alex', 'Jordan', 'Sam', 'Riley', 'Maya', 'Leo', 'Priya', 'Marcus', 'Sofia', 'Kenji', 'Amara', 'Diego', 'Nia', 'Tomás', 'Hana', 'Zoe', 'Omar', 'Lena', 'Kai', 'Rosa'];

export class Creator {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.visible = false;
    this.tab = 'you';
    this.el = h('div#creator.hidden', { style: { background: 'transparent' } });
    ui.root.append(this.el);
    this.reset();
  }

  reset() {
    this.p = {
      name: FIRST[Math.floor(Math.random() * FIRST.length)],
      pronouns: 'they/them',
      origin: ORIGINS[Math.floor(Math.random() * 6)],
      background: 'transplant',
      appearance: randomAppearance(),
      startJob: '',
      season: 'fall',
      calendar: 'compact',
    };
  }

  show() {
    this.visible = true;
    this.game.mode = 'creator';
    this.el.classList.remove('hidden');
    this._update();
    this.render();
  }

  hide() {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  back() {
    this.hide();
    this.ui.title.show();
  }

  _update() {
    this.game.studio.model.build(this.p.appearance);
  }

  render() {
    clear(this.el);
    const tabs = [
      ['you', 'You'],
      ['look', 'Look'],
      ['style', 'Style'],
      ['story', 'Story'],
    ];
    const body = h('div.body');
    const side = h(
      'div.side',
      h('header', h('h2', 'Who are you?'), h('div.sub', { style: { color: 'var(--muted)', fontSize: '13px' } }, 'Everyone in New York came from somewhere.')),
      h('div.tabs', tabs.map(([id, label]) => h(`button${this.tab === id ? '.on' : ''}`, { onclick: () => { this.tab = id; this.render(); } }, label))),
      body,
      h(
        'div.footer',
        h('button.btn.ghost', { onclick: () => this.back() }, '← Back'),
        h('div.row', h('button.btn.ghost', { onclick: () => { this.p.appearance = randomAppearance(); this._update(); this.render(); } }, '🎲 Randomize'), this.tab === 'story' ? h('button.btn.yellow', { onclick: () => this._start() }, 'Start my life →') : h('button.btn', { onclick: () => { this.tab = tabs[tabs.findIndex((t) => t[0] === this.tab) + 1][0]; this.render(); } }, 'Next →')),
      ),
    );
    body.append(...this[`_${this.tab}`]());
    this.viewport = h('div.viewport', h('div.hint', `${this.p.name} · ${this.p.pronouns}`));
    this.el.append(side, this.viewport);
  }

  _swatches(key, colors) {
    const a = this.p.appearance;
    return h('div.swatches', colors.map((c) => h(`button.swatch${a[key] === c ? '.on' : ''}`, { style: { background: c }, title: c, onclick: () => { a[key] = c; this._update(); this.render(); } })));
  }

  _chips(key, options, labels = {}) {
    const a = this.p.appearance;
    return h('div.chips', options.map((o) => h(`button.chip${a[key] === o ? '.on' : ''}`, { onclick: () => { a[key] = o; this._update(); this.render(); } }, labels[o] || o)));
  }

  _you() {
    const p = this.p;
    return [
      h('div.field', h('label', 'Name'), h('input', { type: 'text', value: p.name, maxLength: 24, oninput: (e) => { p.name = e.target.value || 'New Yorker'; this.viewport.querySelector('.hint').textContent = `${p.name} · ${p.pronouns}`; } })),
      h('div.field', h('label', 'Pronouns'), h('div.chips', ['she/her', 'he/him', 'they/them'].map((x) => h(`button.chip${p.pronouns === x ? '.on' : ''}`, { onclick: () => { p.pronouns = x; this.render(); } }, x)))),
      h('div.field', h('label', 'Where are you from?'), h('select', { onchange: (e) => (p.origin = e.target.value) }, ORIGINS.map((o) => h('option', { value: o, selected: o === p.origin }, o)))),
      h('div.field', h('label', 'Skin tone'), this._swatches('skin', SKIN_TONES)),
      h('div.field', h('label', 'Build'), this._chips('body', BODY_TYPES)),
      h('div.field', h('label', `Height`), h('input', { type: 'range', min: 0.9, max: 1.1, step: 0.01, value: p.appearance.height, oninput: (e) => { p.appearance.height = Number(e.target.value); this._update(); } })),
    ];
  }

  _look() {
    const a = this.p.appearance;
    return [
      h('div.field', h('label', 'Hair'), this._chips('hair', HAIR_STYLES)),
      h('div.field', h('label', 'Hair color'), this._swatches('hairColor', HAIR_COLORS)),
      h('div.field', h('label', 'Facial hair'), this._chips('facialHair', FACIAL_HAIR)),
      h('div.field', h('label', 'Glasses'), h('div.chips', [false, true].map((v) => h(`button.chip${a.glasses === v ? '.on' : ''}`, { onclick: () => { a.glasses = v; this._update(); this.render(); } }, v ? 'Glasses' : 'None')))),
      h('div.field', h('label', 'Hat'), this._chips('hat', HATS)),
    ];
  }

  _style() {
    return [
      h('div.field', h('label', 'Style'), this._chips('style', OUTFITS, { casual: 'Casual', business: 'Business', streetwear: 'Streetwear', artsy: 'Artsy', athletic: 'Athletic' })),
      h('div.field', h('label', 'Top'), this._swatches('top', CLOTH_COLORS)),
      h('div.field', h('label', 'Bottom'), this._swatches('bottom', ['#2d3440', '#1f1f24', '#3a4a6a', '#c9b28a', '#6b6f75', '#3d5a3d', '#7a2e3a', '#f2f2f2'])),
      h('div.field', h('label', 'Shoes'), this._swatches('shoes', ['#f2f2f2', '#1f1f24', '#6b4a2e', '#b5382f', '#e2b43c', '#3a6ea5'])),
      h('div.field', h('label', 'Accent (hat, scarf, tie, umbrella)'), this._swatches('accent', CLOTH_COLORS)),
    ];
  }

  _story() {
    const p = this.p;
    const out = [h('div.field', h('label', 'Your story'), h('div.cards', BACKGROUNDS.map((b) => h(`button.optcard${p.background === b.id ? '.on' : ''}`, { onclick: () => { p.background = b.id; this.render(); } }, h('b', b.name), h('small', b.story), h('div.meta', h('span', `💵 ${money(b.money)}`), h('span', b.education === 'degree' ? '🎓 Degree' : '🏫 High school'), h('span', startLabel(b.start)))))))];
    out.push(
      h(
        'div.field',
        h('label', 'Start with a job lined up? (optional)'),
        h('select', { onchange: (e) => (p.startJob = e.target.value) }, h('option', { value: '' }, 'No — I’ll find one'), Object.entries(CAREERS).map(([id, c]) => h('option', { value: id, selected: p.startJob === id }, `${c.icon} ${c.name} — ${c.levels[0].title} (${money(c.levels[0].salary)}, ${SCHEDULES[c.levels[0].schedule].label})`))),
      ),
      h('div.field', h('label', 'Arrive in'), h('div.chips', ['spring', 'summer', 'fall', 'winter'].map((s) => h(`button.chip${p.season === s ? '.on' : ''}`, { onclick: () => { p.season = s; this.render(); } }, { spring: '🌸 Spring', summer: '☀️ Summer', fall: '🍂 Fall', winter: '❄️ Winter' }[s])))),
      h(
        'div.field',
        h('label', 'Calendar pace'),
        h(
          'div.cards',
          h(`button.optcard${p.calendar === 'compact' ? '.on' : ''}`, { onclick: () => { p.calendar = 'compact'; this.render(); } }, h('b', 'Compact (recommended)'), h('small', '10-day months. Seasons, rent day and holidays come around quickly.')),
          h(`button.optcard${p.calendar === 'realistic' ? '.on' : ''}`, { onclick: () => { p.calendar = 'realistic'; this.render(); } }, h('b', 'Realistic'), h('small', 'Real month lengths and bi-weekly paychecks. A slower, truer life.')),
        ),
      ),
    );
    return out;
  }

  _start() {
    const profile = { ...this.p, appearance: { ...this.p.appearance } };
    this.hide();
    this.game.newGame(profile);
    this.reset();
  }
}

function startLabel(s) {
  return { hostel: '🛏️ Hostel', couch: '🛋️ Friend’s couch', family: '🏠 Family home', sublet: '🔑 Sublet' }[s.kind] || '';
}

export { defaultAppearance };
