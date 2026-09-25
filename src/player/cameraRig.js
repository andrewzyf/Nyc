// Third-person orbit camera with building avoidance, plus a first-person mode.
import * as THREE from 'three';
import { clamp, damp } from '../core/math.js';

export class CameraRig {
  constructor(camera, model) {
    this.camera = camera;
    this.model = model;
    this.yaw = Math.PI; // looking north (-z)
    this.pitch = 0.32;
    this.distance = 6;
    this.targetDistance = 6;
    this.firstPerson = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this.mode = 'follow'; // follow | orbit (title/cinematic)
    this.orbitT = 0;
    this._near = [];
  }

  applyLook(dx, dy) {
    const s = 0.0042 * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch + dy * s * (this.invertY ? -1 : 1), this.firstPerson ? -1.2 : -0.35, 1.35);
  }

  zoom(delta) {
    if (this.firstPerson) return;
    this.targetDistance = clamp(this.targetDistance * (delta > 0 ? 1.12 : 0.89), 2.6, 26);
  }

  toggleFirstPerson() {
    this.firstPerson = !this.firstPerson;
    this.pitch = this.firstPerson ? 0 : 0.32;
    return this.firstPerson;
  }

  /** Update following the player position. */
  update(dt, playerPos, playerHeading, { moving = false } = {}) {
    const cam = this.camera;
    if (this.firstPerson) {
      this.focus.set(playerPos.x, playerPos.y + 1.62, playerPos.z);
      cam.position.copy(this.focus);
      const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), -Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
      cam.lookAt(this.focus.clone().add(dir));
      return;
    }
    // gently swing behind the player when walking and the user isn't steering the camera
    if (moving && this.autoFollow) {
      let diff = playerHeading - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 0.8);
    }
    this.distance = damp(this.distance, this.targetDistance, 6, dt);
    const fx = playerPos.x;
    const fy = playerPos.y + 1.55;
    const fz = playerPos.z;
    this.focus.x = damp(this.focus.x, fx, 14, dt);
    this.focus.y = damp(this.focus.y, fy, 10, dt);
    this.focus.z = damp(this.focus.z, fz, 14, dt);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // pull in if a building is in the way
    let d = this.distance;
    const step = 0.5;
    for (let t = 1.2; t <= this.distance; t += step) {
      const px = this.focus.x + dir.x * t;
      const py = this.focus.y + dir.y * t;
      const pz = this.focus.z + dir.z * t;
      if (this._blocked(px, py, pz)) {
        d = Math.max(1.0, t - 0.6);
        break;
      }
    }
    this.currentDistance = this.currentDistance == null ? d : d < this.currentDistance ? d : damp(this.currentDistance, d, 4, dt);
    const cd = this.currentDistance;
    cam.position.set(this.focus.x + dir.x * cd, Math.max(this.focus.y + dir.y * cd, 0.4), this.focus.z + dir.z * cd);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    cam.lookAt(this.focus);
  }

  _blocked(x, y, z) {
    this._near.length = 0;
    for (const c of this.model.collidersNear(x, z, 0.5, this._near)) {
      if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3 && y > c.y0 && y < c.y1 + 0.5) return true;
    }
    return false;
  }

  /** Cinematic slow orbit used on the title screen. */
  orbit(dt, center, radius = 520, height = 260) {
    this.orbitT += dt * 0.03;
    const cam = this.camera;
    cam.position.set(center.x + Math.cos(this.orbitT) * radius, height + Math.sin(this.orbitT * 0.7) * 30, center.z + Math.sin(this.orbitT) * radius);
    cam.lookAt(center.x, 90, center.z);
  }

  /** Camera yaw used for movement (first-person uses view yaw directly). */
  get moveYaw() {
    return this.yaw;
  }
}
