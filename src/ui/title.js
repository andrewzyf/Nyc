import { h, clear } from './dom.js';
import { loadSave } from '../systems/save.js';
import { BACKGROUNDS } from '../data/backgrounds.js';

export class TitleScreen {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.visible = false;
    this.el = h('div#title.hidden');
    ui.root.append(this.el);
  }

  show() {
    this.visible = true;
    this.game.mode = 'title';
    const save = loadSave();
    clear(this.el);
    const menu = h('div.menu');
    if (save) {
      const bg = BACKGROUNDS.find((b) => b.id === save.profile?.background);
      menu.append(
        h('button.btn.yellow', { onclick: () => this._continue(save) }, '▶  Continue', h('span', { style: { fontWeight: 500, opacity: 0.7, marginLeft: 'auto', fontSize: '13px' } }, `${save.profile?.name || ''}${bg ? ` · ${bg.name}` : ''}`)),
      );
    }
    menu.append(
      h(`button.btn${save ? '' : '.yellow'}`, { onclick: () => this._new() }, '✚  New life in New York'),
      h('button.btn.ghost', { style: { color: '#fff', boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.35)' }, onclick: () => this._howTo() }, '?  How to play'),
    );
    this.el.append(
      h(
        'div.wrap',
        h('h1', 'NEW YORK', h('br'), h('span', 'MINUTE')),
        h('p.tagline', 'Land in the city with two suitcases and a little cash. Find an apartment, build a career, ride the subway, catch a parade — and write your own New York story.'),
        menu,
        h('div.foot', 'Best with a keyboard & mouse · Progress saves in your browser'),
      ),
    );
    this.el.classList.remove('hidden');
  }

  hide() {
    this.visible = false;
    this.el.classList.add('hidden');
  }

  _continue(save) {
    this.game.audio.init();
    this.game.applySettings();
    this.hide();
    try {
      this.game.loadFromSave(save);
    } catch (err) {
      console.error(err);
      this.ui.toast('That save couldn’t be loaded. Starting fresh might help.', { icon: '⚠️' });
      this.show();
    }
  }

  _new() {
    this.game.audio.init();
    this.game.applySettings();
    this.hide();
    this.ui.creator.show();
  }

  _howTo() {
    const tips = [
      ['🚶', 'Move with WASD (or the left side of the screen on touch). Hold Shift to hurry. Drag to look around, scroll to zoom.'],
      ['📱', 'Your phone (Tab) has everything: job listings, apartment listings, your bank, the news, transit and settings.'],
      ['🔑', 'Find a home: browse StoopFinder, walk to the building, press E to view it in person, then sign a lease. Landlords want income of 40× the rent — or a guarantor, or prepayment.'],
      ['💼', 'Find work: apply in Hired, show up for the in-person interview, answer well. Clock in on time and work hard to get promoted.'],
      ['🛵', 'Need cash now? Go online in DashRun and deliver food on foot.'],
      ['🚇', 'Walking is free but slow. Subway entrances (green globes) get you across town for $2.90, capped at $34 a week. Taxis are fast and pricey.'],
      ['🍕', 'Eat, sleep, and do things you love. Mood, energy and hunger nudge your performance — they never end the game.'],
      ['🗽', 'Explore! Landmarks, neighborhoods, parades, street fairs and seasons all change the city. There’s no winning — only your story.'],
    ];
    this.ui.openPanel({
      icon: '🗽',
      title: 'How to play',
      body: tips.map(([i, t]) => h('div.row', { style: { alignItems: 'flex-start', margin: '10px 0', fontSize: '14px', lineHeight: 1.5 } }, h('span', { style: { fontSize: '20px' } }, i), h('span', t))),
      footer: [h('button.btn', { onclick: () => this.ui.closePanel() }, 'Got it')],
    });
  }
}
