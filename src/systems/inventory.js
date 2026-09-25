import { ITEMS } from '../data/items.js';

export class Inventory {
  constructor(state = null) {
    this.state = state || { items: {}, equipped: { umbrella: false, coat: false } };
  }

  count(id) {
    return this.state.items[id] || 0;
  }

  has(id) {
    return this.count(id) > 0;
  }

  add(id, qty = 1) {
    if (!ITEMS[id]) return;
    this.state.items[id] = this.count(id) + qty;
    // passive / equip items only need one
    if (ITEMS[id].passive || ITEMS[id].equip) this.state.items[id] = Math.min(this.state.items[id], 1);
    if (ITEMS[id].equip && this.state.equipped[ITEMS[id].equip] === false) this.state.equipped[ITEMS[id].equip] = true;
  }

  remove(id, qty = 1) {
    const n = this.count(id) - qty;
    if (n <= 0) delete this.state.items[id];
    else this.state.items[id] = n;
  }

  list() {
    return Object.entries(this.state.items).map(([id, qty]) => ({ id, qty, ...ITEMS[id] }));
  }

  isEquipped(slot) {
    return !!this.state.equipped[slot] && this.has(slot);
  }

  toggleEquip(slot) {
    this.state.equipped[slot] = !this.state.equipped[slot];
    return this.state.equipped[slot];
  }

  serialize() {
    return this.state;
  }
}
