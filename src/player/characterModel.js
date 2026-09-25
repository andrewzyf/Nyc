// Low-poly customizable human used for the player and the character creator preview.
import * as THREE from 'three';

export const SKIN_TONES = ['#f6d7c3', '#ecc0a0', '#d9a27f', '#c68642', '#a86b3c', '#8d5524', '#6b3e1e', '#4a2912'];
export const HAIR_COLORS = ['#1b1512', '#3b2618', '#6a4428', '#a0692f', '#d9b36a', '#e8d9b0', '#9a9a9a', '#b8352a', '#6d3a8c', '#2f6db5', '#e37fb0'];
export const CLOTH_COLORS = ['#f2f2f2', '#1f1f24', '#3a6ea5', '#b5382f', '#2f6f4f', '#e2b43c', '#6b4a8a', '#e07a3a', '#8a8f96', '#2d3440', '#c9b28a', '#f28cb1', '#46b5a8', '#7a2e3a'];
export const HAIR_STYLES = ['short', 'buzz', 'long', 'bob', 'bun', 'ponytail', 'curly', 'afro', 'mohawk', 'bald'];
export const BODY_TYPES = ['slim', 'average', 'broad'];
export const OUTFITS = ['casual', 'business', 'streetwear', 'artsy', 'athletic'];
export const FACIAL_HAIR = ['none', 'stubble', 'mustache', 'beard'];
export const HATS = ['none', 'beanie', 'cap', 'bucket'];

export function defaultAppearance() {
  return {
    skin: SKIN_TONES[3],
    body: 'average',
    height: 1,
    hair: 'short',
    hairColor: HAIR_COLORS[1],
    facialHair: 'none',
    style: 'casual',
    top: '#3a6ea5',
    bottom: '#2d3440',
    shoes: '#f2f2f2',
    accent: '#e2b43c',
    hat: 'none',
    glasses: false,
  };
}

export function randomAppearance(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return {
    skin: pick(SKIN_TONES),
    body: pick(BODY_TYPES),
    height: 0.94 + rng() * 0.12,
    hair: pick(HAIR_STYLES),
    hairColor: pick(HAIR_COLORS.slice(0, 7)),
    facialHair: rng() < 0.3 ? pick(FACIAL_HAIR) : 'none',
    style: pick(OUTFITS),
    top: pick(CLOTH_COLORS),
    bottom: pick(['#2d3440', '#1f1f24', '#3a4a6a', '#c9b28a', '#6b6f75', '#3d5a3d']),
    shoes: pick(['#f2f2f2', '#1f1f24', '#6b4a2e', '#b5382f']),
    accent: pick(CLOTH_COLORS),
    hat: rng() < 0.25 ? pick(HATS) : 'none',
    glasses: rng() < 0.2,
  };
}

const matCache = new Map();
function mat(color) {
  const key = typeof color === 'string' ? color : color.getHexString();
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true }));
  return matCache.get(key);
}

function box(w, h, d, color, y = 0, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function cyl(rt, rb, h, color, seg = 7) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.castShadow = true;
  return m;
}

export class CharacterModel {
  constructor(appearance = defaultAppearance()) {
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.phase = 0;
    this.build(appearance);
  }

  build(a) {
    this.appearance = { ...defaultAppearance(), ...a };
    a = this.appearance;
    while (this.root.children.length) this.root.remove(this.root.children[0]);
    const W = (a.body === 'slim' ? 0.88 : a.body === 'broad' ? 1.2 : 1) * 1.14;
    const coat = this.coatOn;
    const topColor = coat ? this.coatColor || '#3b4a5a' : a.top;
    const sleeves = coat || ['business', 'streetwear', 'artsy'].includes(a.style);
    const shorts = a.style === 'athletic';
    const body = new THREE.Group();
    body.scale.setScalar(a.height);
    this.root.add(body);
    this.body = body;

    // Legs (pivot at hip)
    const hipY = 0.9;
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.1 * W, hipY, 0);
      const thigh = cyl(0.085 * W, 0.075 * W, shorts ? 0.36 : 0.84, a.bottom, 6);
      thigh.position.y = shorts ? -0.18 : -0.42;
      leg.add(thigh);
      if (shorts) {
        const shin = cyl(0.06, 0.055, 0.48, a.skin, 6);
        shin.position.y = -0.6;
        leg.add(shin);
      }
      const shoe = box(0.13, 0.09, 0.27, a.shoes, -0.86, 0, 0.05);
      leg.add(shoe);
      body.add(leg);
      this.legs.push(leg);
    }

    // Torso
    const torsoG = new THREE.Group();
    torsoG.position.y = hipY;
    body.add(torsoG);
    this.torso = torsoG;
    const torsoH = 0.6;
    const torso = cyl(0.2 * W * (coat ? 1.12 : 1), 0.17 * W, torsoH, topColor, 8);
    torso.scale.z = 0.62;
    torso.position.y = torsoH / 2;
    torsoG.add(torso);
    // hips / belt
    const pelvis = cyl(0.17 * W, 0.16 * W, 0.12, a.bottom, 8);
    pelvis.scale.z = 0.66;
    pelvis.position.y = 0.0;
    torsoG.add(pelvis);
    if (a.style === 'business' && !coat) {
      torsoG.add(box(0.1, 0.42, 0.02, '#f4f4f4', 0.34, 0, 0.125));
      torsoG.add(box(0.045, 0.34, 0.025, a.accent, 0.32, 0, 0.14));
    }
    if (a.style === 'streetwear' && !coat) {
      const hood = cyl(0.15, 0.17, 0.16, topColor, 8);
      hood.position.set(0, torsoH + 0.02, -0.1);
      hood.scale.z = 0.7;
      torsoG.add(hood);
      torsoG.add(box(0.22 * W, 0.14, 0.03, shadeColor(topColor, -0.15), 0.18, 0, 0.115));
    }
    if (a.style === 'artsy' || coat) {
      const skirt = cyl(0.19 * W, 0.24 * W, 0.42, coat ? topColor : a.top, 8);
      skirt.scale.z = 0.66;
      skirt.position.y = -0.18;
      torsoG.add(skirt);
      if (!coat) {
        const scarf = cyl(0.1, 0.12, 0.08, a.accent, 8);
        scarf.position.y = torsoH + 0.02;
        torsoG.add(scarf);
      }
    }
    // Arms (pivot at shoulder)
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * (0.24 * W + 0.02), torsoH - 0.06, 0);
      const upper = cyl(0.058 * W, 0.05 * W, 0.3, a.style === 'athletic' && !coat ? a.skin : topColor, 6);
      upper.position.y = -0.15;
      arm.add(upper);
      const lower = cyl(0.05 * W, 0.045 * W, 0.28, sleeves ? topColor : a.skin, 6);
      lower.position.y = -0.43;
      arm.add(lower);
      const hand = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(a.skin));
      hand.position.y = -0.6;
      hand.castShadow = true;
      arm.add(hand);
      arm.rotation.z = side * 0.06;
      torsoG.add(arm);
      this.arms.push(arm);
    }
    this.handR = this.arms[1];

    // Neck + head
    const neck = cyl(0.05, 0.055, 0.08, a.skin, 6);
    neck.position.y = torsoH + 0.03;
    torsoG.add(neck);
    const head = new THREE.Group();
    head.position.y = torsoH + 0.25;
    head.scale.setScalar(1.24);
    torsoG.add(head);
    this.head = head;
    const skull = new THREE.Mesh(new THREE.IcosahedronGeometry(0.125, 1), mat(a.skin));
    skull.scale.set(1, 1.12, 1.02);
    skull.castShadow = true;
    head.add(skull);
    for (const side of [-1, 1]) {
      head.add(box(0.028, 0.034, 0.01, '#1a1410', 0.015, side * 0.045, 0.118));
      const ear = new THREE.Mesh(new THREE.IcosahedronGeometry(0.028, 0), mat(a.skin));
      ear.position.set(side * 0.125, 0.0, 0);
      head.add(ear);
    }
    head.add(box(0.03, 0.045, 0.03, shadeColor(a.skin, -0.08), -0.02, 0, 0.13));
    head.add(box(0.06, 0.012, 0.01, shadeColor(a.skin, -0.35), -0.065, 0, 0.115));
    if (a.glasses) {
      for (const side of [-1, 1]) head.add(box(0.06, 0.045, 0.01, '#141414', 0.015, side * 0.045, 0.128));
      head.add(box(0.03, 0.01, 0.01, '#141414', 0.02, 0, 0.13));
    }
    this._hair(head, a);
    this._facialHair(head, a);
    this._hat(head, a);

    // Umbrella (hidden until needed)
    const umb = new THREE.Group();
    const stick = cyl(0.012, 0.012, 1.0, '#2a2a2a', 4);
    stick.position.y = 0.3;
    umb.add(stick);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.26, 8, 1, true), mat(a.accent));
    canopy.material = new THREE.MeshLambertMaterial({ color: a.accent, flatShading: true, side: THREE.DoubleSide });
    canopy.position.y = 0.84;
    umb.add(canopy);
    umb.position.set(0, -0.55, 0.08);
    umb.visible = false;
    this.arms[1].add(umb);
    this.umbrella = umb;

    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
  }

  _hair(head, a) {
    const c = a.hairColor;
    const cap = (sx, sy, sz, y = 0.03, z = -0.01) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.135, 1), mat(c));
      m.scale.set(sx, sy, sz);
      m.position.set(0, y, z);
      m.castShadow = true;
      head.add(m);
      return m;
    };
    switch (a.hair) {
      case 'bald':
        break;
      case 'buzz':
        cap(0.98, 0.9, 1.0, 0.035, -0.012);
        break;
      case 'short':
        cap(1.04, 0.92, 1.06, 0.045, -0.015);
        break;
      case 'long': {
        cap(1.06, 0.95, 1.08, 0.045, -0.015);
        head.add(box(0.26, 0.34, 0.08, c, -0.12, 0, -0.1));
        break;
      }
      case 'bob': {
        cap(1.1, 0.98, 1.1, 0.04, -0.01);
        head.add(box(0.29, 0.16, 0.2, c, -0.06, 0, -0.04));
        break;
      }
      case 'bun': {
        cap(1.04, 0.92, 1.06, 0.045, -0.015);
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 1), mat(c));
        b.position.set(0, 0.14, -0.08);
        head.add(b);
        break;
      }
      case 'ponytail': {
        cap(1.04, 0.92, 1.06, 0.045, -0.015);
        head.add(box(0.07, 0.26, 0.07, c, -0.06, 0, -0.16));
        break;
      }
      case 'curly': {
        const m = cap(1.2, 1.05, 1.2, 0.06, -0.015);
        m.geometry = new THREE.IcosahedronGeometry(0.135, 0);
        break;
      }
      case 'afro': {
        const m = cap(1.55, 1.35, 1.5, 0.09, -0.02);
        m.geometry = new THREE.IcosahedronGeometry(0.135, 1);
        break;
      }
      case 'mohawk':
        head.add(box(0.05, 0.1, 0.28, c, 0.13, 0, -0.02));
        break;
      default:
        cap(1.04, 0.92, 1.06);
    }
  }

  _facialHair(head, a) {
    const c = a.hairColor;
    if (a.facialHair === 'beard') {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(c));
      m.scale.set(1.05, 0.8, 0.7);
      m.position.set(0, -0.08, 0.05);
      head.add(m);
    } else if (a.facialHair === 'mustache') {
      head.add(box(0.08, 0.02, 0.02, c, -0.045, 0, 0.125));
    } else if (a.facialHair === 'stubble') {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat(shadeColor(a.skin, -0.25)));
      m.scale.set(1.08, 0.7, 0.78);
      m.position.set(0, -0.07, 0.035);
      head.add(m);
    }
  }

  _hat(head, a) {
    if (a.hat === 'beanie') {
      const m = cyl(0.135, 0.145, 0.14, a.accent, 8);
      m.position.y = 0.1;
      head.add(m);
    } else if (a.hat === 'cap') {
      const m = cyl(0.135, 0.14, 0.08, a.accent, 8);
      m.position.y = 0.11;
      head.add(m);
      head.add(box(0.2, 0.02, 0.12, a.accent, 0.08, 0, 0.15));
    } else if (a.hat === 'bucket') {
      const m = cyl(0.12, 0.2, 0.12, a.accent, 8);
      m.position.y = 0.12;
      head.add(m);
    }
  }

  setCoat(on, color) {
    if (this.coatOn === on && this.coatColor === color) return;
    this.coatOn = on;
    this.coatColor = color;
    this.build(this.appearance);
  }

  setUmbrella(on) {
    this.umbrella.visible = on;
  }

  /** speed in m/s, dt in seconds */
  animate(dt, speed, { airborne = false } = {}) {
    const moving = speed > 0.2;
    const cadence = speed > 5.5 ? 1.9 : 1.55;
    this.phase += dt * (moving ? speed * cadence : 0);
    const amp = moving ? Math.min(0.75, 0.25 + speed * 0.08) : 0;
    const s = Math.sin(this.phase);
    const target = (v) => v;
    this.legs[0].rotation.x = target(s * amp);
    this.legs[1].rotation.x = target(-s * amp);
    const umbrellaUp = this.umbrella.visible;
    this.arms[0].rotation.x = -s * amp * 0.9;
    this.arms[1].rotation.x = umbrellaUp ? -1.25 : s * amp * 0.9;
    this.arms[1].rotation.z = umbrellaUp ? 0.2 : 0.06;
    if (umbrellaUp) this.umbrella.rotation.x = 1.25;
    const bob = moving ? Math.abs(Math.cos(this.phase)) * 0.04 * Math.min(1, speed / 3) : Math.sin(performance.now() * 0.002) * 0.004;
    this.torso.position.y = 0.9 + bob;
    this.torso.rotation.x = moving ? Math.min(0.18, speed * 0.02) : 0;
    this.legs[0].position.y = this.legs[1].position.y = 0.9 + bob * 0.5;
    if (airborne) {
      this.legs[0].rotation.x = 0.5;
      this.legs[1].rotation.x = -0.3;
    }
  }
}

export function shadeColor(hex, amt) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
