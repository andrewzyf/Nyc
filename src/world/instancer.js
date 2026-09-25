// Instanced meshes that only contain items near the camera. Refilled when the focus
// point moves far enough, so tens of thousands of props cost only what's nearby.
import * as THREE from 'three';

const dummy = new THREE.Object3D();
const tmpColor = new THREE.Color();

export class ProximityInstancer {
  /**
   * parts: [{geometry, material, castShadow?, receiveShadow?, colorFn?}]
   * place(item, dummy, partIndex) -> sets dummy position/rotation/scale; return false to skip part
   */
  constructor(scene, { items, radius = 400, capacity = 2000, parts, place, color, refill = 60, name = 'props' }) {
    this.items = items;
    this.radius = radius;
    this.capacity = capacity;
    this.place = place;
    this.color = color;
    this.refill = refill;
    this.meshes = parts.map((p, i) => {
      const m = new THREE.InstancedMesh(p.geometry, p.material, capacity);
      m.name = `${name}-${i}`;
      m.count = 0;
      m.castShadow = !!p.castShadow;
      m.receiveShadow = !!p.receiveShadow;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (p.colored) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      }
      scene.add(m);
      return m;
    });
    this.partDefs = parts;
    this.lastX = Infinity;
    this.lastZ = Infinity;
    // Simple grid bucketing for fast radius queries
    this.cell = 100;
    this.grid = new Map();
    for (const it of items) {
      const k = `${Math.floor(it.x / this.cell)},${Math.floor(it.z / this.cell)}`;
      if (!this.grid.has(k)) this.grid.set(k, []);
      this.grid.get(k).push(it);
    }
  }

  update(x, z, force = false) {
    if (!force && Math.hypot(x - this.lastX, z - this.lastZ) < this.refill) return;
    this.lastX = x;
    this.lastZ = z;
    const r = this.radius;
    const r2 = r * r;
    const near = [];
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const arr = this.grid.get(`${ix},${iz}`);
        if (!arr) continue;
        for (const it of arr) {
          const dx = it.x - x;
          const dz = it.z - z;
          const d2 = dx * dx + dz * dz;
          if (d2 < r2) near.push([d2, it]);
        }
      }
    }
    if (near.length > this.capacity) {
      near.sort((a, b) => a[0] - b[0]);
      near.length = this.capacity;
    }
    const counts = this.meshes.map(() => 0);
    for (const [, it] of near) {
      for (let p = 0; p < this.meshes.length; p++) {
        dummy.position.set(it.x, 0, it.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        if (this.place(it, dummy, p) === false) continue;
        dummy.updateMatrix();
        const mesh = this.meshes[p];
        const i = counts[p]++;
        mesh.setMatrixAt(i, dummy.matrix);
        if (mesh.instanceColor && this.color) {
          const col = this.color(it, p, tmpColor);
          if (col) mesh.setColorAt(i, col);
        }
      }
    }
    this.meshes.forEach((m, p) => {
      m.count = counts[p];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  setVisible(v) {
    for (const m of this.meshes) m.visible = v;
  }
}
