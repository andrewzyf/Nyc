// Business signs: a small pool of canvas-textured planes reassigned to the storefronts
// nearest the player, so every shop can have a readable name without thousands of textures.
import * as THREE from 'three';
import { PLACE_TYPES, SPECIAL_PLACES } from '../data/places.js';
import { WORLD_UNIFORMS } from './materials.js';

const W = 512;
const H = 112;

function drawSign(canvas, poi) {
  const g = canvas.getContext('2d');
  const def = PLACE_TYPES[poi.type] || SPECIAL_PLACES[poi.type];
  const work = poi.kind === 'work';
  const bg = work ? '#1d2433' : def?.sign?.bg || '#1d2433';
  const fg = work ? '#ffffff' : def?.sign?.fg || '#ffffff';
  g.clearRect(0, 0, W, H);
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 4;
  g.strokeRect(4, 4, W - 8, H - 8);
  let size = 58;
  const text = poi.name.toUpperCase();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const font = (s) => `800 ${s}px "Bebas Neue", "Arial Narrow", Impact, sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > W - 36 && size > 18) g.font = font((size -= 2));
  if (def?.neon) {
    g.shadowColor = fg;
    g.shadowBlur = 14;
  }
  g.fillStyle = fg;
  g.fillText(text, W / 2, H / 2 + 3);
  g.shadowBlur = 0;
}

export class Signs {
  constructor(scene, model, { count = 28 } = {}) {
    this.model = model;
    this.pool = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < count; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.uLampGlow = WORLD_UNIFORMS.uLampGlow;
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uLampGlow;')
          .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.78, 1.25, uLampGlow);');
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, canvas, tex, poi: null });
    }
    this.timer = 0;
  }

  update(dt, x, z) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.6;
    const cands = this.model
      .poisNear(x, z, 110)
      .filter((p) => !p.noSign && p.building != null && (p.kind === 'place' || p.kind === 'work'))
      .map((p) => [Math.hypot(p.x - x, p.z - z), p])
      .sort((a, b) => a[0] - b[0])
      .slice(0, this.pool.length)
      .map(([, p]) => p);
    const want = new Set(cands);
    const free = [];
    for (const s of this.pool) {
      if (s.poi && want.has(s.poi)) want.delete(s.poi);
      else free.push(s);
    }
    for (const poi of want) {
      const s = free.pop();
      if (!s) break;
      s.poi = poi;
      drawSign(s.canvas, poi);
      s.tex.needsUpdate = true;
      const b = this.model.buildings[poi.building];
      const width = Math.min(7, Math.max(3.4, Math.abs(poi.nx ? b.z1 - b.z0 : b.x1 - b.x0) * 0.7));
      s.mesh.scale.set(width, (width * H) / W, 1);
      s.mesh.position.set(poi.doorX - poi.nx * 0.75, 4.55, poi.doorZ - poi.nz * 0.75);
      s.mesh.rotation.set(0, Math.atan2(poi.nx, poi.nz), 0);
      s.mesh.visible = true;
    }
    // whatever is left in the free list wasn't reused: hide it
    for (const s of free) {
      s.poi = null;
      s.mesh.visible = false;
    }
  }
}
