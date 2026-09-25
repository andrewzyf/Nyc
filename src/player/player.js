// Player entity: movement, collision against buildings/water, bridges and animation.
import * as THREE from 'three';
import { CharacterModel } from './characterModel.js';
import { clamp, damp } from '../core/math.js';

const RADIUS = 0.34;

export class Player {
  constructor(scene, model, appearance) {
    this.model = model;
    this.character = new CharacterModel(appearance);
    this.object = this.character.root;
    scene.add(this.object);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.vy = 0;
    this.airborne = false;
    this.onBridge = null;
    this.bridgeS = 0;
    this.speedMul = 1;
    this.walkSpeed = 4.2;
    this.runSpeed = 7.4;
    this.frozen = false;
    this.dynamicObstacles = [];
    this.stuckTimer = 0;
    this._near = [];
  }

  setAppearance(a) {
    this.character.build(a);
  }

  teleport(x, z, heading = this.heading) {
    ({ x, z } = this._safeSpot(x, z));
    this.pos.set(x, this.model.groundHeightAt(x, z), z);
    this.heading = heading;
    this.onBridge = null;
    this.vy = 0;
    this.airborne = false;
    this.object.position.copy(this.pos);
    this.object.rotation.y = heading;
  }

  /** If (x,z) is inside a building or in the water, move to the nearest sidewalk node. */
  _safeSpot(x, z) {
    const m = this.model;
    const inside = m.collidersNear(x, z, 1).some((c) => x > c.x0 - RADIUS && x < c.x1 + RADIUS && z > c.z0 - RADIUS && z < c.z1 + RADIUS && c.y0 < 1 && c.y1 > 1);
    if (!inside && m.isWalkable(x, z)) return { x, z };
    let best = null;
    let bd = Infinity;
    for (const i of m.nodesNear(x, z, 200)) {
      const n = m.nodes[i];
      if (n.kind === 'bridge') continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best ? { x: best.x, z: best.z } : { x, z };
  }

  update(dt, input, cameraYaw, { firstPerson = false } = {}) {
    const mv = this.frozen ? { x: 0, y: 0 } : input.moveVector();
    const running = input.down('ShiftLeft', 'ShiftRight');
    const target = (running ? this.runSpeed : this.walkSpeed) * this.speedMul;
    let dx = 0;
    let dz = 0;
    const mag = Math.hypot(mv.x, mv.y);
    if (mag > 0.01) {
      // camera-relative: forward is where the camera looks
      const fx = Math.sin(cameraYaw);
      const fz = Math.cos(cameraYaw);
      const rx = -fz;
      const rz = fx;
      dx = fx * mv.y + rx * mv.x;
      dz = fz * mv.y + rz * mv.x;
      const l = Math.hypot(dx, dz);
      dx /= l;
      dz /= l;
      const desired = Math.atan2(dx, dz);
      let diff = desired - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * (firstPerson ? 30 : 12));
    }
    this.speed = damp(this.speed, mag > 0.01 ? target * Math.min(1, mag) : 0, mag > 0.01 ? 8 : 12, dt);
    const stepX = dx * this.speed * dt;
    const stepZ = dz * this.speed * dt;

    // Jump
    if (!this.frozen && input.wasPressed('Space') && !this.airborne) {
      this.vy = 4.6;
      this.airborne = true;
    }

    this._move(stepX, stepZ);

    // Vertical
    const ground = this._groundY();
    if (this.airborne) {
      this.vy -= 13 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
      }
    } else {
      this.pos.y = damp(this.pos.y, ground, this.onBridge ? 30 : 18, dt);
    }

    this.object.position.copy(this.pos);
    this.object.rotation.y = this.heading;
    this.character.animate(dt, this.speed, { airborne: this.airborne });
  }

  _groundY() {
    if (this.onBridge) return this.model.bridgeHeight(this.onBridge, this.bridgeS) + 0.02;
    return this.model.groundHeightAt(this.pos.x, this.pos.z);
  }

  _move(sx, sz) {
    const len = Math.hypot(sx, sz);
    const steps = Math.max(1, Math.ceil(len / 0.3));
    for (let i = 0; i < steps; i++) this._subStep(sx / steps, sz / steps);
  }

  _subStep(sx, sz) {
    const m = this.model;
    let nx = this.pos.x + sx;
    let nz = this.pos.z + sz;

    // Bridges: enter at the ends, walk the deck, exit at the ends.
    if (this.onBridge) {
      const b = this.onBridge;
      const r = m.bridgeAt(nx, nz, 3);
      if (!r || r.bridge !== b) {
        // clamp to the deck corridor
        const cur = m.bridgeAt(this.pos.x, this.pos.z, 3);
        if (cur && cur.bridge === b && (cur.s < 1.5 || cur.s > b.length - 1.5)) {
          this.onBridge = null;
        } else return;
      } else {
        if (r.lateral > b.width / 2 - RADIUS - 0.2) {
          // slide along the rail
          const p = m.bridgePoint(b, r.s);
          const off = b.width / 2 - RADIUS - 0.25;
          const side = (nx - p.x) * -p.dz + (nz - p.z) * p.dx >= 0 ? 1 : -1;
          nx = p.x - p.dz * off * side;
          nz = p.z + p.dx * off * side;
        }
        this.bridgeS = r.s;
        if (r.s < 0.8 || r.s > b.length - 0.8) this.onBridge = null;
        this.pos.x = nx;
        this.pos.z = nz;
        return;
      }
    } else {
      const r = m.bridgeAt(nx, nz, 0);
      if (r && (r.s < 5 || r.s > r.bridge.length - 5) && Math.abs(r.h - this.pos.y) < 1.5 && r.lateral < r.bridge.width / 2 - 0.3) {
        this.onBridge = r.bridge;
        this.bridgeS = r.s;
        this.pos.x = nx;
        this.pos.z = nz;
        return;
      }
    }

    // Water / world bounds
    if (!m.isWalkable(nx, nz)) {
      if (m.isWalkable(nx, this.pos.z)) nz = this.pos.z;
      else if (m.isWalkable(this.pos.x, nz)) nx = this.pos.x;
      else return;
    }

    // Static + dynamic colliders (circle vs AABB)
    const py = this.pos.y;
    this._near.length = 0;
    const near = m.collidersNear(nx, nz, 3, this._near);
    for (let iter = 0; iter < 2; iter++) {
      for (const c of near) {
        if (py + 1.7 < c.y0 || py + 0.3 > c.y1) continue;
        const cx = clamp(nx, c.x0, c.x1);
        const cz = clamp(nz, c.z0, c.z1);
        let ddx = nx - cx;
        let ddz = nz - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 > RADIUS * RADIUS) continue;
        if (d2 < 1e-8) {
          // inside: push out along the shallowest axis
          const pl = nx - c.x0;
          const pr = c.x1 - nx;
          const pt = nz - c.z0;
          const pb = c.z1 - nz;
          const mn = Math.min(pl, pr, pt, pb);
          if (mn === pl) nx = c.x0 - RADIUS;
          else if (mn === pr) nx = c.x1 + RADIUS;
          else if (mn === pt) nz = c.z0 - RADIUS;
          else nz = c.z1 + RADIUS;
        } else {
          const d = Math.sqrt(d2);
          ddx /= d;
          ddz /= d;
          nx = cx + ddx * RADIUS;
          nz = cz + ddz * RADIUS;
        }
      }
      for (const o of this.dynamicObstacles) {
        const ddx = nx - o.x;
        const ddz = nz - o.z;
        const d = Math.hypot(ddx, ddz);
        const min = o.r + RADIUS;
        if (d < min && d > 1e-4) {
          nx = o.x + (ddx / d) * min;
          nz = o.z + (ddz / d) * min;
        }
      }
    }
    if (!m.isWalkable(nx, nz)) return;
    this.pos.x = nx;
    this.pos.z = nz;
  }
}
