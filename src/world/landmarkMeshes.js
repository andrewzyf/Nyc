// Hand-crafted low-poly NYC landmarks. Each builder writes into shared batches
// (solid, glow, building-with-windows, screens) and registers colliders.
import * as THREE from 'three';
import { GeometryBatch } from './geometryBatch.js';
import { WORLD_UNIFORMS, createBuildingMaterial, patchSurface, createWaterMaterial } from './materials.js';
import { makeTextTexture, makeBillboardAtlas } from './textures.js';
import { LANDMARKS } from '../data/landmarks.js';
import { BROADWAY } from '../data/geography.js';
import { RNG } from '../core/rng.js';
import { GROUND } from './cityMeshes.js';

const C = {
  limestone: '#d8cdb5',
  marble: '#ece6da',
  granite: '#b3aa98',
  steel: '#8c9196',
  darkSteel: '#3a3d42',
  gold: '#d8b04a',
  brick: '#8c4535',
  patina: '#7fb5a0',
  glassDark: '#2c3440',
  copper: '#b8683a',
};

function createVertexGlowMaterial() {
  const m = new THREE.MeshBasicMaterial({ vertexColors: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLampGlow = WORLD_UNIFORMS.uLampGlow;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLampGlow;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.7, 1.9, uLampGlow);');
  };
  m.customProgramCacheKey = () => 'nym-vglow';
  return m;
}

function createScreenMaterial() {
  const m = new THREE.MeshBasicMaterial({ map: makeBillboardAtlas() });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WORLD_UNIFORMS.uTime;
    shader.uniforms.uLampGlow = WORLD_UNIFORMS.uLampGlow;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec2 aScreen;')
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
        {
          float cellIdx = mod(aScreen.x + floor(uTime / 6.0 + aScreen.y), 16.0);
          vec2 cell = vec2(mod(cellIdx, 4.0), floor(cellIdx / 4.0));
          vMapUv = (cell + uv) / 4.0;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLampGlow;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.95, 1.7, uLampGlow);');
  };
  m.customProgramCacheKey = () => 'nym-screen';
  return m;
}

export class Landmarks {
  constructor(scene, model) {
    this.scene = scene;
    this.model = model;
    this.group = new THREE.Group();
    this.group.name = 'landmarks';
    scene.add(this.group);
    this.solid = new GeometryBatch();
    this.glow = new GeometryBatch();
    this.bld = new GeometryBatch({ aBld: 4 });
    this.screens = new GeometryBatch({ aScreen: 2 });
    this.waterB = new GeometryBatch();
    this.dyn = {};
    this.rng = new RNG(4242);
    for (const l of LANDMARKS) {
      const fn = l.builder && this[l.builder];
      if (typeof fn === 'function') fn.call(this, l);
    }
    const mk = (batch, mat, name, shadow = true) => {
      if (batch.empty) return null;
      const m = new THREE.Mesh(batch.build(), mat);
      m.name = name;
      m.castShadow = shadow;
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    mk(this.solid, patchSurface(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { snowScale: 1, key: 'lm-solid' }), 'lm-solid');
    mk(this.glow, createVertexGlowMaterial(), 'lm-glow', false);
    mk(this.bld, createBuildingMaterial(), 'lm-buildings');
    mk(this.screens, createScreenMaterial(), 'lm-screens', false);
    mk(this.waterB, createWaterMaterial(true), 'lm-water', false);
  }

  // Helpers --------------------------------------------------------------------
  box(x0, x1, y0, y1, z0, z1, color, collide = false) {
    this.solid.box(x0, x1, y0, y1, z0, z1, color, { bottom: y0 > 0.5 });
    if (collide) this.model.addCollider({ x0, x1, z0, z1, y0: y0 - 1, y1 });
  }
  bbox(x0, x1, y0, y1, z0, z1, color, win = 1, collide = false, flags = 0, seed = 1) {
    this.bld.box(x0, x1, y0, y1, z0, z1, color, { ex: { aBld: [win, seed, y1, flags] }, bottom: y0 > 0.5 });
    if (collide) this.model.addCollider({ x0, x1, z0, z1, y0: y0 - 1, y1 });
  }
  cbox(cx, cz, hw, hd, y0, y1, color, win = 1, collide = false, flags = 0) {
    this.bbox(cx - hw, cx + hw, y0, y1, cz - hd, cz + hd, color, win, collide, flags);
  }
  gbox(x0, x1, y0, y1, z0, z1, color) {
    this.glow.box(x0, x1, y0, y1, z0, z1, color, { bottom: true });
  }
  collideCircle(x, z, r, y1 = 50) {
    this.model.addCollider({ x, z, r, y0: -1, y1 });
  }
  text(text, x, y, z, w, h, rotY, opts = {}) {
    const tex = makeTextTexture(text, { width: 512, height: Math.round((512 * h) / w), ...opts });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: !opts.bg, side: THREE.DoubleSide, depthWrite: !!opts.bg });
    if (opts.neon) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uLampGlow = WORLD_UNIFORMS.uLampGlow;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uLampGlow;')
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.8, 1.8, uLampGlow);');
      };
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    this.group.add(m);
    return m;
  }
  /** Screen panel on a vertical plane. dir: facing normal ('n','s','e','w') */
  screen(cx, cz, y0, y1, w, dir, cell) {
    const hw = w / 2;
    const ph = this.rng.next() * 5;
    const ex = { aScreen: [cell ?? this.rng.int(0, 15), ph] };
    const uvs = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    if (dir === 's') this.screens.quad([cx - hw, y0, cz], [cx + hw, y0, cz], [cx + hw, y1, cz], [cx - hw, y1, cz], [0, 0, 1], '#fff', ex, uvs);
    if (dir === 'n') this.screens.quad([cx + hw, y0, cz], [cx - hw, y0, cz], [cx - hw, y1, cz], [cx + hw, y1, cz], [0, 0, -1], '#fff', ex, uvs);
    if (dir === 'e') this.screens.quad([cx, y0, cz + hw], [cx, y0, cz - hw], [cx, y1, cz - hw], [cx, y1, cz + hw], [1, 0, 0], '#fff', ex, uvs);
    if (dir === 'w') this.screens.quad([cx, y0, cz - hw], [cx, y0, cz + hw], [cx, y1, cz + hw], [cx, y1, cz - hw], [-1, 0, 0], '#fff', ex, uvs);
  }
  /** Classical columns in a row along x or z. */
  columns(x0, z0, x1, z1, n, y0, y1, r, color) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const x = x0 + (x1 - x0) * t;
      const z = z0 + (z1 - z0) * t;
      this.solid.prism(x, z, y0, y1, r, r * 0.9, 8, color);
      this.solid.box(x - r * 1.3, x + r * 1.3, y1, y1 + 0.5, z - r * 1.3, z + r * 1.3, color);
    }
  }
  /** Triumphal arch. axis 'z' = passage runs north-south. */
  arch(cx, cz, s, axis, color) {
    const pw = 3.6 * s; // pier width
    const open = 8.6 * s;
    const depth = 4.2 * s;
    const h = 22 * s;
    const springH = 13.5 * s;
    const piers = [-(open / 2 + pw / 2), open / 2 + pw / 2];
    for (const off of piers) {
      if (axis === 'z') this.box(cx + off - pw / 2, cx + off + pw / 2, 0, springH, cz - depth / 2, cz + depth / 2, color, true);
      else this.box(cx - depth / 2, cx + depth / 2, 0, springH, cz + off - pw / 2, cz + off + pw / 2, color, true);
    }
    // arch voussoirs approximating a semicircle
    const segs = 9;
    const R = open / 2;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI - (i / segs) * Math.PI;
      const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      const u0 = Math.cos(a0) * R;
      const u1 = Math.cos(a1) * R;
      const v = springH + Math.sin((a0 + a1) / 2) * R * 0.75;
      const lo = Math.min(u0, u1);
      const hi = Math.max(u0, u1);
      if (axis === 'z') this.box(cx + lo, cx + hi, v, h * 0.72, cz - depth / 2, cz + depth / 2, color);
      else this.box(cx - depth / 2, cx + depth / 2, v, h * 0.72, cz + lo, cz + hi, color);
    }
    const W = open / 2 + pw + 0.8 * s;
    if (axis === 'z') {
      this.box(cx - W, cx + W, h * 0.72, h, cz - depth / 2 - 0.3, cz + depth / 2 + 0.3, color);
      this.box(cx - W - 0.4, cx + W + 0.4, h * 0.7, h * 0.74, cz - depth / 2 - 0.5, cz + depth / 2 + 0.5, color);
    } else {
      this.box(cx - depth / 2 - 0.3, cx + depth / 2 + 0.3, h * 0.72, h, cz - W, cz + W, color);
      this.box(cx - depth / 2 - 0.5, cx + depth / 2 + 0.5, h * 0.7, h * 0.74, cz - W - 0.4, cz + W + 0.4, color);
    }
    return h;
  }
  fountain(x, z, r, y = GROUND.park) {
    this.solid.prism(x, z, 0, y + 0.7, r, r, 20, C.granite, { cap: false });
    this.solid.prism(x, z, y + 0.6, y + 0.72, r + 0.4, r + 0.4, 20, '#c9c1b0');
    this.waterB.ellipse(x, z, r - 0.3, r - 0.3, y + 0.5, '#fff', 24);
    this.solid.prism(x, z, 0, y + 2.5, r * 0.18, r * 0.12, 8, C.granite);
    this.glow.prism(x, z, y + 2.5, y + 5.5, r * 0.12, 0.05, 6, '#dff4ff');
    this.collideCircle(x, z, r, 1);
  }

  // Builders -------------------------------------------------------------------
  empireState(l) {
    const cx = -55;
    const cz = 229;
    const tiers = [
      [43, 18, 0, 22],
      [36, 16, 22, 80],
      [27, 13.5, 80, 205],
      [21, 11.5, 205, 236],
      [15, 9.5, 236, 254],
    ];
    tiers.forEach(([hw, hd, y0, y1], i) => this.cbox(cx, cz, hw, hd, y0, y1, i === 0 ? '#cfc4ab' : C.limestone, 1, i === 0, 1));
    // Crown (lit at night)
    const crown = new GeometryBatch();
    crown.prism(cx, cz, 254, 268, 10, 8.5, 8, '#ffffff', { rot: Math.PI / 8 });
    crown.prism(cx, cz, 268, 282, 7, 5, 8, '#ffffff', { rot: Math.PI / 8 });
    crown.prism(cx, cz, 282, 292, 4.2, 3, 8, '#ffffff', { rot: Math.PI / 8 });
    const crownMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    crownMat.onBeforeCompile = (shader) => {
      shader.uniforms.uLampGlow = WORLD_UNIFORMS.uLampGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uLampGlow;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(vec3(0.82, 0.78, 0.68), diffuse * 1.8, uLampGlow);');
    };
    crownMat.color = new THREE.Color('#ffffff');
    const crownMesh = new THREE.Mesh(crown.build(), crownMat);
    this.group.add(crownMesh);
    this.dyn.esbCrown = crownMat;
    this.solid.prism(cx, cz, 292, 330, 1.3, 0.25, 8, '#c8c8c8');
    this.glow.prism(cx, cz, 330, 332, 0.4, 0.1, 6, '#ff3030');
  }

  chrysler(l) {
    const cx = 285;
    const cz = -16;
    this.cbox(cx, cz, 34, 20, 0, 22, '#cfc8bc', 1, true, 1);
    this.cbox(cx, cz, 17, 17, 22, 178, '#d6d1c7', 1, false, 1);
    this.cbox(cx, cz, 14, 14, 178, 196, '#d6d1c7', 1, false, 1);
    // stacked sunburst crown
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const y0 = 196 + i * 7;
      const r0 = 13.5 - i * 1.9;
      const r1 = r0 - 1.2;
      this.solid.prism(cx, cz, y0, y0 + 7, r0, r1, 4, '#e8e8e8', { rot: Math.PI / 4 });
      // triangular windows glow
      for (let k = 0; k < 4; k++) {
        const a = Math.PI / 4 + (k * Math.PI) / 2 + Math.PI / 4;
        const ox = Math.cos(a) * (r1 * 0.72);
        const oz = Math.sin(a) * (r1 * 0.72);
        this.glow.prism(cx + ox, cz + oz, y0 + 1.5, y0 + 5.8, 1.2, 0.1, 3, '#fff1c4', { rot: a });
      }
    }
    this.solid.prism(cx, cz, 238, 282, 2.2, 0.05, 4, '#dcdcdc', { rot: Math.PI / 4 });
  }

  grandCentral(l) {
    const col = '#d9cfb6';
    this.bbox(110, 210, 0, 32, -37, 2, col, 4, true);
    // three great windows on the 42nd St facade
    for (const wx of [128, 160, 192]) {
      this.box(wx - 10, wx + 10, 6, 26, 2, 2.3, C.glassDark);
      this.gbox(wx - 9, wx + 9, 7, 25, 2.3, 2.45, '#ffcf87');
      this.box(wx - 0.4, wx + 0.4, 7, 25, 2.3, 2.6, '#8a8373');
    }
    for (const px of [110, 144, 176, 210]) this.box(px - 1.6, px + 1.6, 4, 30, 2, 3.2, col);
    this.box(140, 180, 32, 40, -8, 2.5, col);
    this.gbox(157.5, 162.5, 30, 35, 2.6, 2.8, '#f3e2a0');
    this.solid.box(155, 165, 40, 44, -2, 2.4, C.patina);
  }

  timesSquare(l) {
    // Billboards on buildings that face the bow-tie
    const rng = this.rng;
    for (const b of this.model.buildings) {
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      if (cz < -170 || cz > 30 || cx < -330 || cx > -120) continue;
      const faceEast = cx < -220;
      const faceX = faceEast ? b.x1 + 0.35 : b.x0 - 0.35;
      const depth = b.z1 - b.z0;
      if (depth < 8) continue;
      const n = rng.int(1, 3);
      let y = rng.range(5, 9);
      for (let i = 0; i < n && y < Math.min(b.h - 4, 60); i++) {
        const h = rng.range(7, 14);
        const w = Math.min(depth - 2, rng.range(10, 24));
        this.screen(faceX, cz, y, Math.min(y + h, b.h - 2), w, faceEast ? 'e' : 'w');
        y += h + rng.range(1, 4);
      }
      // wrap-around screens on the 42nd/47th corners
      if (rng.chance(0.5)) {
        const faceZ = cz > -45 ? b.z0 - 0.35 : b.z1 + 0.35;
        const w = Math.min(b.x1 - b.x0 - 2, 18);
        if (w > 6) this.screen(cx, faceZ, 8, 18, w, cz > -45 ? 'n' : 's');
      }
    }
    // One Times Square (ball drop tower)
    const tx0 = -214;
    const tx1 = -198;
    const tz0 = -30;
    const tz1 = 2;
    this.bbox(tx0, tx1, 0, 118, tz0, tz1, '#c9c3b6', 4, true);
    for (let y = 8; y < 100; y += 16) {
      this.screen((tx0 + tx1) / 2, tz1 + 0.35, y, y + 14, 15, 's');
      this.screen((tx0 + tx1) / 2, tz0 - 0.35, y, y + 14, 15, 'n');
      this.screen(tx0 - 0.35, (tz0 + tz1) / 2, y, y + 14, 30, 'w');
      this.screen(tx1 + 0.35, (tz0 + tz1) / 2, y, y + 14, 30, 'e');
    }
    this.solid.prism(-206, -14, 118, 136, 0.35, 0.3, 6, '#999');
    const ballGeo = new THREE.IcosahedronGeometry(2.6, 1);
    const ballMat = new THREE.MeshBasicMaterial({ color: '#dff3ff' });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(-206, 134, -14);
    this.group.add(ball);
    this.dyn.ball = ball;
    // TKTS red steps
    for (let i = 0; i < 9; i++) {
      this.gbox(-238, -222, GROUND.sidewalk, GROUND.sidewalk + (i + 1) * 0.5, -86 - i * 1.6, -84.4 - i * 1.6, '#d8242f');
    }
    this.box(-238, -222, 0, 4.6, -101, -99, '#a01a22');
    this.model.addCollider({ x0: -238, x1: -222, z0: -101, z1: -84, y0: -1, y1: 5 });
    // Red glass booth + plaza chairs
    for (let i = 0; i < 18; i++) {
      const x = rng.range(-236, -204);
      const z = rng.range(-70, -50);
      this.solid.box(x - 0.25, x + 0.25, 0, 0.8, z - 0.25, z + 0.25, '#c43a3a');
    }
  }

  radioCity(l) {
    this.bbox(-208, -122, 0, 42, -162, -113, '#c4b59a', 1, true, 1);
    this.text('RADIO CITY', -120.6, 22, -150, 4, 26, Math.PI / 2, { width: 128, height: 832, color: '#ff4a3a', glow: '#ff2a1a', font: 'bold 110px "Bebas Neue", Impact, sans-serif', neon: true });
    this.gbox(-122, -120.8, 4.5, 7.2, -162, -114, '#ff5a3a');
    this.text('MUSIC HALL', -120.5, 5.85, -138, 24, 2.4, Math.PI / 2, { color: '#fff4d0', neon: true, bg: '#1b0707' });
  }

  rockefeller(l) {
    const col = '#c9c0b0';
    this.bbox(-98, -62, 0, 80, -152, -122, col, 1, true);
    this.bbox(-96, -64, 80, 180, -150, -124, col, 1);
    this.bbox(-93, -67, 180, 240, -148, -126, col, 1);
    this.bbox(-90, -70, 240, 258, -146, -128, col, 1, false, 1);
    // Sunken plaza / rink
    this.box(-50, -20, 0.02, GROUND.park + 0.02, -145, -129, '#8f8a80');
    const rink = new THREE.Mesh(new THREE.PlaneGeometry(26, 13).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#dfeef7' }));
    rink.position.set(-35, GROUND.park + 0.05, -137);
    this.group.add(rink);
    this.dyn.rockRink = rink;
    // Prometheus
    this.glow.prism(-35, -128.6, 1, 3.5, 1.2, 0.8, 6, '#e6b84a');
    // Flags around the plaza
    const flagColors = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#16a085', '#d35400'];
    for (let i = 0; i < 12; i++) {
      const x = -52 + (i % 6) * 6;
      const z = i < 6 ? -148 : -126;
      this.solid.prism(x, z, 0, 9, 0.08, 0.06, 5, '#dcdcdc');
      this.solid.box(x + 0.1, x + 2.1, 7.4, 8.8, z - 0.03, z + 0.03, flagColors[i % flagColors.length]);
    }
    // Channel Gardens planters
    for (let i = 0; i < 5; i++) this.solid.box(-18 + -i * 7 - 2, -18 + -i * 7 + 2, 0, 0.8, -139, -135, '#6f8f4f');
    // Christmas tree (toggled by date)
    const tree = new THREE.Group();
    const tb = new GeometryBatch();
    for (let i = 0; i < 5; i++) tb.prism(0, 0, 2 + i * 4.2, 7 + i * 4.2, 7 - i * 1.3, 1.5 - i * 0.2, 9, '#2e5f3a');
    tb.prism(0, 0, 0, 2.5, 0.6, 0.6, 6, '#5a3b25');
    tree.add(new THREE.Mesh(tb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    const lightsG = new THREE.BufferGeometry();
    const pts = [];
    const cols = [];
    const palette = [new THREE.Color('#ff4d4d'), new THREE.Color('#ffd84d'), new THREE.Color('#4dff88'), new THREE.Color('#6ab8ff'), new THREE.Color('#ffffff')];
    for (let i = 0; i < 400; i++) {
      const y = this.rng.range(2, 24);
      const r = (1 - y / 26) * 6.6;
      const a = this.rng.range(0, Math.PI * 2);
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const c = this.rng.pick(palette);
      cols.push(c.r, c.g, c.b);
    }
    lightsG.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    lightsG.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    tree.add(new THREE.Points(lightsG, new THREE.PointsMaterial({ size: 0.5, vertexColors: true })));
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), new THREE.MeshBasicMaterial({ color: '#ffe680' }));
    star.position.y = 25.5;
    tree.add(star);
    tree.position.set(-35, GROUND.park, -150);
    tree.visible = false;
    this.group.add(tree);
    this.dyn.rockTree = tree;
  }

  stPatricks(l) {
    const col = '#dcd6ca';
    this.bbox(24, 64, 0, 32, -156, -119, col, 4, true);
    // pitched roof along x
    const y0 = 32;
    const y1 = 42;
    this.solid.quad([24, y0, -119], [64, y0, -119], [64, y1, -137.5], [24, y1, -137.5], [0, 0.9, 0.44], '#6f7a80');
    this.solid.quad([64, y0, -156], [24, y0, -156], [24, y1, -137.5], [64, y1, -137.5], [0, 0.9, -0.44], '#6f7a80');
    this.solid.tri([64, y0, -119], [64, y0, -156], [64, y1, -137.5], col);
    // Twin spires on Fifth Ave (west)
    for (const tz of [-150, -125]) {
      this.box(14, 24, 0, 58, tz - 5, tz + 5, col, true);
      this.solid.prism(19, tz, 58, 100, 6.2, 0.2, 8, col, { rot: Math.PI / 8 });
      for (let y = 10; y < 55; y += 12) this.box(13.8, 14, y, y + 7, tz - 1.2, tz + 1.2, C.glassDark);
    }
    // Rose window
    this.glow.prism(14.1, -137.5, 18, 18.2, 4.5, 4.5, 16, '#d9a7ff');
    this.box(14, 24, 0, 30, -145, -130, col);
  }

  nypl(l) {
    const col = '#e6dcc8';
    this.bbox(-48, -14, 0, 20, 26, 67, col, 4, true);
    this.columns(-11, 36, -11, 56, 6, GROUND.sidewalk, 14, 0.8, col);
    this.box(-13, -9.5, 14.5, 18, 33, 59, col);
    // steps
    for (let i = 0; i < 4; i++) this.box(-14 + i * 0, -4 - i * 2, 0, 0.3 * (4 - i), 32 - i, 60 + i, '#d7ccb6');
    // lions Patience & Fortitude
    for (const lz of [30, 62]) {
      this.box(-7, -3.5, 0, 1.4, lz - 0.8, lz + 0.8, '#d5cdbd', true);
      this.box(-4.2, -3, 1.4, 2.6, lz - 0.6, lz + 0.6, '#d5cdbd');
      this.box(-6.8, -4.5, 1.4, 2.1, lz - 0.7, lz + 0.7, '#d5cdbd');
    }
  }

  msg(l) {
    const cx = -275;
    const cz = 258;
    this.solid.prism(cx, cz, 0, 28, 42, 41, 28, '#c6c3bd');
    this.solid.prism(cx, cz, 28, 30, 41, 38, 28, '#9aa0a6');
    this.glow.prism(cx, cz, 22, 25, 42.3, 42.3, 28, '#7fc4ff', { cap: false });
    this.collideCircle(cx, cz, 42, 30);
    this.text('MADISON SQUARE GARDEN', cx, 12, cz + 43.5, 34, 3.4, 0, { color: '#ffffff', bg: '#1d3557', neon: true });
    // Penn Station entrance canopy on 7th Ave
    this.box(-236, -228, 3.2, 3.6, 248, 268, '#2d3a4a');
    this.text('PENN STATION', -228, 4.4, 258, 12, 1.4, Math.PI / 2, { color: '#fff', bg: '#1a2230' });
  }

  flatiron(l) {
    // Triangle between Fifth Ave (x = 10.5) and Broadway's west edge
    const bw = BROADWAY.points;
    const a = bw[4]; // (78, 650)
    const b = bw[5]; // (18, 441)
    const slope = (a[0] - b[0]) / (a[1] - b[1]);
    const cos = Math.abs(a[1] - b[1]) / Math.hypot(a[0] - b[0], a[1] - b[1]);
    const westEdge = (z) => b[0] + (z - b[1]) * slope - BROADWAY.width / 2 / cos - 1.2;
    const zA = 461;
    const zB = 513;
    const P = [
      [10.6, zA],
      [westEdge(zB), zB],
      [10.6, zB],
    ];
    const H = 87;
    const col = new THREE.Color('#d8c9ab');
    // walls
    const ex = { aBld: [1, 7.7, H, 1] };
    for (let i = 0; i < 3; i++) {
      const [x0, z0] = P[i];
      const [x1, z1] = P[(i + 1) % 3];
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      // outward normal for this CCW/CW polygon
      let nx = dz / len;
      let nz = -dx / len;
      const mx = (x0 + x1) / 2 - (P[0][0] + P[1][0] + P[2][0]) / 3;
      const mz = (z0 + z1) / 2 - (P[0][1] + P[1][1] + P[2][1]) / 3;
      if (nx * mx + nz * mz < 0) {
        nx = -nx;
        nz = -nz;
      }
      // choose vertex order so the face points along n
      const pts = [
        [x0, 0, z0],
        [x1, 0, z1],
        [x1, H, z1],
        [x0, H, z0],
      ];
      const cross = (x1 - x0) * 0 - 0; // placeholder for clarity
      void cross;
      const e1 = [x1 - x0, 0, z1 - z0];
      const e2 = [0, H, 0];
      const fnx = e1[1] * e2[2] - e1[2] * e2[1];
      const fnz = e1[0] * e2[1] - e1[1] * e2[0];
      if (fnx * nx + fnz * nz >= 0) this.bld.quad(pts[0], pts[1], pts[2], pts[3], [nx, 0, nz], col, ex);
      else this.bld.quad(pts[1], pts[0], pts[3], pts[2], [nx, 0, nz], col, ex);
    }
    this.bld.polygon(P, H, col, { aBld: [4, 0, H, 0] });
    // colliders as horizontal slices
    for (let z = zA; z < zB; z += 6) {
      const x1 = westEdge(z + 6);
      this.model.addCollider({ x0: 10.6, x1: Math.max(11.5, x1), z0: z, z1: z + 6, y0: -1, y1: H });
    }
  }

  chelseaMarket(l) {
    this.bbox(-538, -452, 0, 24, 593, 639, '#8c4535', 3, true, 1);
    this.text('CHELSEA MARKET', -451.6, 5.5, 616, 16, 2, Math.PI / 2, { color: '#f6e7c1', bg: '#3a1e14' });
  }

  vessel(l) {
    const cx = -698;
    const cz = 290;
    for (let i = 0; i < 16; i++) {
      const y0 = GROUND.sidewalk + i * 2.9;
      const r0 = 7 + i * 0.55;
      const r1 = r0 + 0.5;
      this.solid.prism(cx, cz, y0, y0 + 2.5, r0, r1, 12, C.copper, { cap: false, rot: (i % 2) * 0.26 });
      this.solid.prism(cx, cz, y0 + 2.5, y0 + 2.9, r1, r1 + 0.1, 12, '#8d4f2c', { cap: false, rot: (i % 2) * 0.26 });
    }
    // inner faces so it reads as a vessel from above
    const inner = new GeometryBatch();
    for (let i = 0; i < 16; i++) {
      const y0 = GROUND.sidewalk + i * 2.9;
      const r = 6.8 + i * 0.55;
      inner.prism(cx, cz, y0, y0 + 2.9, r, r + 0.55, 12, '#6d3a1f', { cap: false });
    }
    const m = new THREE.Mesh(inner.build(), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.BackSide, flatShading: true }));
    this.group.add(m);
    this.collideCircle(cx, cz, 8, 50);
  }

  washingtonArch(l) {
    this.arch(0, 804, 1, 'z', C.marble);
    this.fountain(-15, 826, 9);
  }

  rainbowFlags(l) {
    const x = l.x;
    const z = l.z;
    const stripes = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'];
    for (let f = 0; f < 3; f++) {
      const fx = x - 6 + f * 6;
      this.solid.prism(fx, z, 0, 8, 0.07, 0.05, 5, '#ddd');
      stripes.forEach((c, i) => this.solid.box(fx + 0.1, fx + 2.6, 7.6 - (i + 1) * 0.27, 7.6 - i * 0.27, z - 0.03, z + 0.03, c));
    }
  }

  mulberryLights(l) {
    const cols = ['#ff5a5a', '#ffffff', '#5aff8a'];
    for (let z = 1012; z < 1132; z += 11) {
      const c = cols[Math.floor((z - 1012) / 11) % 3];
      const segs = 7;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const x0 = 94 + t0 * 12;
        const x1 = 94 + t1 * 12;
        const y0 = 6.5 + Math.sin(t0 * Math.PI) * 1.8;
        const y1 = 6.5 + Math.sin(t1 * Math.PI) * 1.8;
        this.gbox(x0, x1, Math.min(y0, y1), Math.max(y0, y1) + 0.12, z - 0.06, z + 0.06, c);
      }
    }
  }

  chinatownLanterns(l) {
    for (let z = 1160; z < 1400; z += 18) {
      for (let x = 92; x <= 108; x += 4) this.glow.prism(x, z, 6.2, 7.0, 0.45, 0.45, 8, '#ff3b2f');
    }
    for (let x = 30; x < 170; x += 18) {
      for (let z = 1204; z <= 1216; z += 4) this.glow.prism(x, z, 6.2, 7.0, 0.45, 0.45, 8, '#ff3b2f');
    }
  }

  cityHall(l) {
    const col = C.marble;
    this.bbox(-60, 4, 0, 16, 1548, 1572, col, 1, true, 1);
    this.bbox(-40, -16, 0, 19, 1546, 1574, col, 1, false, 1);
    this.solid.prism(-28, 1560, 19, 27, 3.2, 2.8, 8, col);
    this.solid.prism(-28, 1560, 27, 31, 2.6, 0.6, 8, C.patina);
    this.glow.prism(-28, 1560, 31, 33, 0.3, 0.1, 6, '#e8c86a');
  }

  oneWTC(l) {
    const cx = -380;
    const cz = 1528;
    const B = 21;
    const T = 15.5;
    const y0 = 22;
    const y1 = 380;
    // podium
    this.cbox(cx, cz, 23, 23, 0, y0, '#a7b0b8', 0, true, 0);
    const bottom = [
      [cx - B, cz - B],
      [cx + B, cz - B],
      [cx + B, cz + B],
      [cx - B, cz + B],
    ];
    const top = [
      [cx, cz - T * 1.414],
      [cx + T * 1.414, cz],
      [cx, cz + T * 1.414],
      [cx - T * 1.414, cz],
    ];
    const col = new THREE.Color('#8fb0c8');
    const ex = { aBld: [0, 3.3, y1, 0] };
    const P = (p, y) => [p[0], y, p[1]];
    const addTri = (a, b, c) => {
      // outward facing: centroid away from tower axis
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const mx = (a[0] + b[0] + c[0]) / 3 - cx;
      const mz = (a[2] + b[2] + c[2]) / 3 - cz;
      if (n[0] * mx + n[2] * mz < 0) this.bld.tri(a, c, b, col, ex);
      else this.bld.tri(a, b, c, col, ex);
    };
    for (let i = 0; i < 4; i++) {
      const b0 = bottom[i];
      const b1 = bottom[(i + 1) % 4];
      const t1 = top[(i + 1) % 4];
      addTri(P(b0, y0), P(b1, y0), P(t1, y1));
      const t0 = top[i];
      addTri(P(b0, y0), P(t1, y1), P(t0, y1));
    }
    this.bld.polygon(top, y1, col, { aBld: [4, 0, y1, 0] });
    this.solid.prism(cx, cz, y1, y1 + 6, 9, 9, 8, '#c9cfd4');
    this.solid.prism(cx, cz, y1 + 6, 448, 1.3, 0.3, 8, '#dfe3e6');
    this.glow.prism(cx, cz, 440, 450, 0.6, 0.2, 6, '#ffffff');
    // Memorial pools
    for (const px of [-420, -340]) {
      const pz = 1596;
      const r = 12.5;
      this.box(px - r - 1.2, px + r + 1.2, 0, GROUND.park + 1.1, pz - r - 1.2, pz - r, '#2b2b2b', true);
      this.box(px - r - 1.2, px + r + 1.2, 0, GROUND.park + 1.1, pz + r, pz + r + 1.2, '#2b2b2b', true);
      this.box(px - r - 1.2, px - r, 0, GROUND.park + 1.1, pz - r, pz + r, '#2b2b2b', true);
      this.box(px + r, px + r + 1.2, 0, GROUND.park + 1.1, pz - r, pz + r, '#2b2b2b', true);
      this.solid.box(px - r, px + r, -1.5, GROUND.park - 0.4, pz - r, pz + r, '#3b4650');
      this.waterB.flat(px - r + 1, px + r - 1, pz - r + 1, pz + r - 1, GROUND.park - 0.5, '#fff');
      this.solid.box(px - 4, px + 4, -1.5, GROUND.park - 0.35, pz - 4, pz + 4, '#111111');
      this.model.addCollider({ x0: px - r, x1: px + r, z0: pz - r, z1: pz + r, y0: -2, y1: 3 });
    }
  }

  nyse(l) {
    const col = '#e9e4da';
    this.bbox(-50, 12, 0, 30, 1778, 1832, col, 4, true);
    this.columns(-53, 1790, -53, 1820, 6, GROUND.sidewalk, 22, 1.1, col);
    this.box(-55, -50, 22.5, 25, 1786, 1824, col);
    this.solid.quad([-55, 25, 1824], [-55, 25, 1786], [-55, 31, 1805], [-55, 31, 1805], [-1, 0, 0], col);
    this.solid.quad([-55, 25, 1786], [-50, 25, 1786], [-50, 31, 1805], [-55, 31, 1805], [0, 0.9, -0.4], col);
    this.solid.quad([-50, 25, 1824], [-55, 25, 1824], [-55, 31, 1805], [-50, 31, 1805], [0, 0.9, 0.4], col);
    // giant flag banner between the columns
    for (let i = 0; i < 13; i++) {
      const y0 = 8 + i * 0.95;
      this.box(-52.6, -52.4, y0, y0 + 0.95, 1791, 1819, i % 2 ? '#f4f4f4' : '#b22234');
    }
    this.box(-52.7, -52.5, 14.65, 20.35, 1791, 1802, '#3c3b6e');
  }

  chargingBull(l) {
    const x = -125;
    const z = 2002;
    const bronze = '#7d5a34';
    this.box(x - 3, x + 3, 0, GROUND.sidewalk + 0.3, z - 1.4, z + 1.4, '#6f6a62');
    this.box(x - 2, x + 1.8, 1.0, 2.4, z - 0.8, z + 0.8, bronze, true);
    this.box(x - 3, x - 1.7, 0.9, 2.1, z - 0.6, z + 0.6, bronze);
    this.box(x - 3.1, x - 2.7, 2.0, 2.5, z - 1.1, z - 0.8, '#b08850');
    this.box(x - 3.1, x - 2.7, 2.0, 2.5, z + 0.8, z + 1.1, '#b08850');
    for (const [lx, lz] of [
      [-1.6, -0.6],
      [-1.6, 0.4],
      [1.3, -0.6],
      [1.3, 0.4],
    ])
      this.box(x + lx, x + lx + 0.35, 0.3, 1.1, z + lz, z + lz + 0.3, bronze);
    this.box(x + 1.7, x + 2.4, 2.0, 2.2, z - 0.1, z + 0.1, bronze);
  }

  ferryTerminal(l) {
    this.bbox(-38, 38, 0, 18, 1997, 2043, '#7fa0bd', 0, true);
    this.box(-40, 40, 18, 19, 1995, 2045, '#dfe3e6');
    this.text('STATEN ISLAND FERRY', 0, 15, 1996.6, 50, 3.6, Math.PI, { color: '#ffffff', bg: '#1d3557' });
    // The ferry (animated)
    const fb = new GeometryBatch();
    fb.box(-9, 9, 0, 4, -30, 30, '#e8762a');
    fb.box(-8, 8, 4, 8, -24, 24, '#f2f2f2');
    fb.box(-6, 6, 8, 11, -14, 14, '#f2f2f2');
    fb.box(-2, 2, 11, 14, -3, 3, '#e8762a');
    const ferry = new THREE.Mesh(fb.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ferry.position.set(0, -0.8, 2110);
    ferry.castShadow = true;
    this.group.add(ferry);
    this.dyn.ferry = ferry;
  }

  statueOfLiberty(l) {
    const x = -725;
    const z = 2880;
    this.solid.prism(x, z, 0, 8, 24, 24, 11, '#9e968a');
    this.solid.box(x - 8, x + 8, 8, 40, z - 8, z + 8, C.granite);
    this.solid.box(x - 9, x + 9, 36, 40, z - 9, z + 9, '#c2b9a6');
    const g = C.patina;
    this.solid.prism(x, z, 40, 64, 4.8, 3.0, 9, g);
    this.solid.prism(x, z, 64, 70, 3.0, 1.6, 9, g);
    this.solid.prism(x, z + 0.3, 70, 73.5, 1.6, 1.3, 8, g);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + ((i - 3) / 3) * 1.2;
      this.solid.prism(x + Math.cos(a) * 1.5, z + 0.3 + Math.sin(a) * 1.5, 73, 76, 0.3, 0.02, 4, g);
    }
    // raised right arm with torch
    const arm = new GeometryBatch();
    arm.box(-0.7, 0.7, 0, 16, -0.7, 0.7, g);
    const armMesh = new THREE.Mesh(arm.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    armMesh.position.set(x + 2.8, 64, z);
    armMesh.rotation.z = -0.28;
    this.group.add(armMesh);
    this.glow.prism(x + 7.2, z, 79, 82.5, 1.3, 0.1, 7, '#ffcf4a');
    // tablet
    this.solid.box(x - 4.8, x - 3.2, 52, 60, z - 1.4, z + 1.8, g);
  }

  unitedNations(l) {
    this.bbox(560, 580, 0, 155, -90, -12, '#6f9a8f', 0, true);
    this.box(559.5, 580.5, 0, 155.5, -90.5, -89.6, '#e7e2d8');
    this.box(559.5, 580.5, 0, 155.5, -12.4, -11.5, '#e7e2d8');
    this.bbox(592, 628, 0, 16, -80, -30, '#e7e2d8', 4, true);
    this.solid.prism(610, -55, 16, 20, 7, 3, 12, C.patina);
    const colors = ['#c0392b', '#2e86c1', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#16a085', '#ffffff', '#1f3a93', '#d35400'];
    for (let i = 0; i < 16; i++) {
      const z = -95 + i * 6;
      this.solid.prism(527, z, 0, 8, 0.07, 0.05, 5, '#ddd');
      this.solid.box(527.1, 529, 6.8, 8, z - 0.03, z + 0.03, colors[i % colors.length]);
    }
  }

  centralPark(l) {
    const y = GROUND.park;
    // Bethesda Terrace + Angel of the Waters
    this.box(-200, -150, 0, y + 1.2, -618, -606, '#b9a98c', false);
    this.fountain(-175, -630, 7, y);
    this.solid.prism(-175, -630, y + 2.5, y + 5, 0.5, 0.3, 6, '#6f8f7a');
    // Bow Bridge over the Lake
    for (let i = 0; i < 8; i++) {
      const z0 = -688 + i * 6.5;
      const t = (i + 0.5) / 8;
      const h = y + 0.4 + Math.sin(t * Math.PI) * 1.4;
      this.solid.box(-223, -217, h - 0.4, h, z0, z0 + 6.5, '#e7e0cd');
      this.solid.box(-223.2, -222.9, h, h + 1, z0, z0 + 6.5, '#e7e0cd');
      this.solid.box(-217.1, -216.8, h, h + 1, z0, z0 + 6.5, '#e7e0cd');
    }
    this.model.footbridges = this.model.footbridges || [];
    this.model.footbridges.push({ x0: -222.8, x1: -217.2, z0: -690, z1: -634, y: y + 1.2 });
    // Belvedere Castle on its rock
    this.box(-162, -138, 0, 4, -800, -780, '#6f6a63', true);
    this.box(-156, -144, 4, 16, -796, -784, '#8a857c', true);
    for (let i = 0; i < 4; i++) this.box(-156 + i * 3.4, -154.5 + i * 3.4, 16, 17.2, -796, -784, '#8a857c');
    this.box(-146, -140, 4, 22, -792, -786, '#8a857c');
    this.solid.prism(-143, -789, 22, 26, 3.4, 0.1, 8, '#4e5a66');
    // Wollman Rink
    const rink = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#9fa7ad' }));
    rink.scale.set(28, 1, 16);
    rink.position.set(-90, y + 0.03, -430);
    this.group.add(rink);
    this.dyn.wollman = rink;
    // Delacorte / SummerStage shells
    this.box(-100, -80, 0, y + 1, -610, -596, '#8f8a80');
    // Gapstow bridge stones
    this.solid.box(-50, -34, y, y + 1.5, -410, -406, '#8a7f70');
  }

  theMet(l) {
    const col = '#e3dac6';
    this.bbox(-84, -16, 0, 24, -840, -770, col, 4, true);
    this.bbox(-44, -14, 0, 30, -815, -795, col, 4, true);
    this.columns(-12.5, -813, -12.5, -797, 4, GROUND.sidewalk, 19, 0.9, col);
    for (const wz of [-811, -805, -799]) this.box(-14.2, -14, 6, 15, wz - 1.8, wz + 1.8, C.glassDark);
    for (let i = 0; i < 6; i++) this.box(-14 + i * 1.2, -12.8 + i * 1.2, 0, 1.8 - i * 0.3, -830, -780, '#d8cdb5');
    this.text('THE MET', -13.8, 21, -805, 12, 2, Math.PI / 2, { color: '#b3262c', bg: '#efe7d6' });
  }

  guggenheim(l) {
    const cx = 40;
    const cz = -978;
    const white = '#f2efe8';
    for (let i = 0; i < 5; i++) {
      const y0 = 4 + i * 5;
      const r = 15 + i * 1.6;
      this.solid.prism(cx, cz, y0, y0 + 3.8, r, r + 0.4, 28, white, { cap: i === 4 });
      this.solid.prism(cx, cz, y0 + 3.8, y0 + 5, r - 0.6, r - 0.2, 28, '#5d6770', { cap: false });
    }
    this.solid.prism(cx, cz, 0, 4, 12, 12, 20, '#d9d4ca');
    this.solid.prism(cx, cz, 29, 31, 6, 2, 16, '#9ab5c9');
    this.bbox(52, 68, 0, 36, -1000, -960, '#c9c3b6', 0, true);
    this.collideCircle(cx, cz, 16, 30);
    this.text('GUGGENHEIM', 23.4, 5.6, -978, 16, 2, -Math.PI / 2, { color: '#222', bg: null });
  }

  amnh(l) {
    const col = '#c9a992';
    this.bbox(-428, -346, 0, 26, -807, -758, col, 1, true, 1);
    this.bbox(-352, -342, 0, 32, -795, -770, '#d4b8a2', 4, true);
    this.columns(-340.5, -792, -340.5, -773, 4, GROUND.sidewalk, 24, 1.1, '#d4b8a2');
    for (let i = 0; i < 4; i++) this.box(-342 + i * 1.3, -340.7 + i * 1.3, 0, 1.4 - i * 0.3, -795, -770, '#bfa38e');
  }

  lincolnCenter(l) {
    const y = GROUND.park;
    this.bbox(-526, -464, 0, 30, -486, -474, '#e8e2d4', 4, true);
    for (let i = 0; i < 5; i++) {
      const x = -520 + i * 12;
      this.glow.box(x - 4, x + 4, 3, 24, -474, -473.8, '#ffe0a6');
    }
    this.bbox(-536, -526, 0, 22, -480, -436, '#e1dccf', 1, true);
    this.bbox(-464, -454, 0, 22, -480, -436, '#e1dccf', 1, true);
    this.fountain(-495, -455, 7, y);
  }

  columbusCircle(l) {
    const x = -330;
    const z = -360;
    this.solid.prism(x, z, 0, 0.6, 16, 16, 24, '#bdb6a8', { cap: true });
    this.waterB.ellipse(x, z, 13, 13, 0.62, '#fff', 24);
    this.solid.prism(x, z, 0, 1.8, 5, 5, 12, C.granite);
    this.solid.prism(x, z, 1.8, 22, 1.1, 0.9, 10, C.marble);
    this.solid.box(x - 0.8, x + 0.8, 22, 25, z - 0.8, z + 0.8, '#d7d0c0');
    this.collideCircle(x, z, 13, 2);
  }

  apollo(l) {
    this.bbox(-318, -232, 0, 20, -1714, -1668, '#8a3f35', 1, true, 1);
    this.text('APOLLO', -275, 14, -1714.8, 16, 7, Math.PI, { color: '#ff3b3b', glow: '#ff2020', font: 'bold 150px "Bebas Neue", Impact, sans-serif', neon: true });
    this.gbox(-288, -262, 5.2, 7.4, -1716, -1714, '#ffd84a');
    this.text('AMATEUR NIGHT', -275, 6.3, -1716.1, 24, 1.8, Math.PI, { color: '#1b1b1b', bg: '#fff5d6' });
  }

  carousel(l) {
    const x = 915;
    const z = 1780;
    this.box(899, 931, 0, 0.4, 1768, 1792, '#cfc8bb');
    this.glow.box(899.2, 930.8, 0.4, 7, 1768.2, 1768.4, '#f4f1e6');
    this.glow.box(899.2, 930.8, 0.4, 7, 1791.6, 1791.8, '#f4f1e6');
    this.glow.box(899.2, 899.4, 0.4, 7, 1768.2, 1791.8, '#f4f1e6');
    this.glow.box(930.6, 930.8, 0.4, 7, 1768.2, 1791.8, '#f4f1e6');
    this.box(898, 932, 7, 7.5, 1767, 1793, '#e9e6de');
    this.solid.prism(x, z, 0.4, 1, 9, 9, 16, '#e0b24a');
    this.solid.prism(x, z, 4.8, 5.8, 9.5, 2, 16, '#c0392b');
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      this.solid.prism(x + Math.cos(a) * 7, z + Math.sin(a) * 7, 1, 4.8, 0.08, 0.08, 4, '#f1d27a');
      this.solid.box(x + Math.cos(a) * 7 - 0.4, x + Math.cos(a) * 7 + 0.4, 1.8, 2.6, z + Math.sin(a) * 7 - 0.15, z + Math.sin(a) * 7 + 0.15, ['#fff', '#d9a066', '#8e5a2c'][i % 3]);
    }
    this.model.addCollider({ x0: 899, x1: 931, z0: 1770, z1: 1792, y0: -1, y1: 7 });
  }

  boroughHall(l) {
    const col = C.marble;
    this.bbox(1380, 1442, 0, 18, 1958, 1992, col, 1, true, 1);
    this.columns(1398, 1956, 1424, 1956, 6, GROUND.sidewalk, 14, 0.8, col);
    this.box(1396, 1426, 14.3, 17, 1954.5, 1958, col);
    this.solid.prism(1411, 1975, 18, 27, 4.2, 3.6, 8, col);
    this.solid.prism(1411, 1975, 27, 31, 3.4, 0.6, 8, '#9a9086');
  }

  arena(l) {
    const cx = 1610;
    const cz = 2256;
    const oval = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      oval.push([cx + Math.cos(a) * 41, cz + Math.sin(a) * 26]);
    }
    for (let i = 0; i < oval.length; i++) {
      const [x0, z0] = oval[i];
      const [x1, z1] = oval[(i + 1) % oval.length];
      const nx = z1 - z0;
      const nz = -(x1 - x0);
      const l2 = Math.hypot(nx, nz);
      this.solid.quad([x0, 0, z0], [x1, 0, z1], [x1, 26, z1], [x0, 26, z0], [-nx / l2, 0, -nz / l2], i % 2 ? '#8a4a2a' : '#7a3f22');
      this.glow.quad([x0 * 1.0, 18, z0], [x1, 18, z1], [x1, 20, z1], [x0, 20, z0], [-nx / l2, 0, -nz / l2], '#ff9a4a');
    }
    this.solid.polygon(oval, 26, '#5a3a2a');
    this.model.addCollider({ x0: cx - 38, x1: cx + 38, z0: cz - 24, z1: cz + 24, y0: -1, y1: 26 });
    // entrance canopy with oculus
    this.box(cx - 16, cx + 16, 8, 9, 2226, 2236, '#6b3a22');
    this.glow.prism(cx, 2231, 8, 8.1, 5, 5, 20, '#ffd9a0');
  }

  domino(l) {
    this.bbox(892, 946, 0, 28, 1044, 1074, '#8a4a36', 3, true, 1);
    this.box(912, 926, 28, 44, 1052, 1066, '#8a4a36');
    const sign = this.text('DOMINO SUGAR', 919, 33, 1073.8, 34, 6, 0, { color: '#ffd23a', glow: '#ffb000', font: 'bold 110px "Bebas Neue", Impact, sans-serif', neon: true });
    sign.position.y = 33;
    this.text('DOMINO SUGAR', 919, 33, 1044.2, 34, 6, Math.PI, { color: '#ffd23a', glow: '#ffb000', font: 'bold 110px "Bebas Neue", Impact, sans-serif', neon: true });
  }

  triumphArch(l) {
    this.arch(2010, 2395, 1.25, 'x', '#d5cbb6');
    this.solid.box(2008, 2012, 27.5, 31, 2391, 2399, '#4d5a4f');
  }

  gantries(l) {
    const steel = '#2d2f33';
    for (const gz of [95, 185]) {
      this.box(846, 848, 0, 16, gz - 12, gz - 10, steel, true);
      this.box(846, 848, 0, 16, gz + 10, gz + 12, steel, true);
      this.box(840, 866, 16, 19, gz - 12, gz + 12, steel);
      this.box(838, 842, 8, 16, gz - 1, gz + 1, steel);
      this.text('LONG ISLAND', 853, 22, gz, 22, 3.2, -Math.PI / 2, { color: '#e03a2f', font: 'bold 110px "Bebas Neue", Impact, sans-serif' });
    }
  }

  // Dynamic updates ---------------------------------------------------------------
  update(dt, ctx) {
    const { month, day, minuteOfDay, season, hourFrac } = ctx;
    // Ferry shuttles to Staten Island and back (40-minute cycle)
    if (this.dyn.ferry) {
      const t = ((ctx.totalMinutes || 0) % 60) / 60;
      const leg = t < 0.5 ? t * 2 : 2 - t * 2;
      const z = 2090 + leg * 2400;
      const x = -40 - leg * 400;
      this.dyn.ferry.position.set(x, -0.8, z);
      this.dyn.ferry.rotation.y = t < 0.5 ? Math.atan2(-400, 2400) : Math.atan2(400, -2400);
    }
    // ESB crown colors
    if (this.dyn.esbCrown) {
      let col = '#fff2cc';
      if (month === 6 && day <= 5) col = ['#ff3030', '#ffffff', '#3060ff'][Math.floor(minuteOfDay / 20) % 3];
      else if (month === 11 && day >= 15) col = ['#ff3030', '#30ff60'][Math.floor(minuteOfDay / 30) % 2];
      else if (month === 5 && day >= 20) col = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787'][Math.floor(minuteOfDay / 10) % 6];
      else if (month === 9 && day >= 25) col = '#ff8a1f';
      else if (month === 1 && day === 14) col = '#ff5a8a';
      else if (month === 2 && day === 17) col = '#30d060';
      this.dyn.esbCrown.color.set(col);
    }
    // Holiday tree + rinks
    const holiday = (month === 11 && day >= 3) || (month === 0 && day <= 7);
    if (this.dyn.rockTree) this.dyn.rockTree.visible = holiday;
    const winter = season === 'winter';
    if (this.dyn.rockRink) this.dyn.rockRink.material.color.set(winter ? '#e3f1f8' : '#8f8a80');
    if (this.dyn.wollman) this.dyn.wollman.material.color.set(winter ? '#e3f1f8' : '#9fa7ad');
    // New Year's Eve ball drop: descends during the final minute of the year
    if (this.dyn.ball) {
      let y = 134;
      if (month === 11 && day >= 31 && minuteOfDay >= 1439) y = 134 - (minuteOfDay - 1439) * 16;
      this.dyn.ball.position.y = y;
      const hue = ((ctx.totalMinutes || 0) * 0.01) % 1;
      this.dyn.ball.material.color.setHSL(hue, 0.6, 0.85);
    }
    void dt;
    void hourFrac;
  }
}
