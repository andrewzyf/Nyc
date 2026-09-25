// Rain streaks, snowflakes and steam puffs, all GPU-animated around the camera.
import * as THREE from 'three';
import { makeSoftDot } from './textures.js';
import { WORLD_UNIFORMS } from './materials.js';

const BOX = new THREE.Vector3(90, 50, 90);

export class WeatherFx {
  constructor(scene) {
    this.scene = scene;
    this._buildRain();
    this._buildSnow();
    this._buildSteam();
    this.rainAmt = 0;
    this.snowAmt = 0;
  }

  _buildRain() {
    const N = 7000;
    const pos = new Float32Array(N * 2 * 3);
    const off = new Float32Array(N * 2 * 3);
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * BOX.x;
      const y = Math.random() * BOX.y;
      const z = Math.random() * BOX.z;
      for (let k = 0; k < 2; k++) {
        off.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.rainUniforms = {
      uTime: WORLD_UNIFORMS.uTime,
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uAmount: { value: 0 },
      uWind: { value: 2 },
      uColor: { value: new THREE.Color('#aeb8c6') },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aOff; attribute float aEnd;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uWind; uniform float uAmount;
        varying float vA;
        void main() {
          vec3 p = aOff;
          float speed = 28.0 + fract(aOff.x * 7.13) * 8.0;
          p.y = mod(p.y - uTime * speed, uBox.y);
          p.x += p.y * uWind * 0.05;
          vec3 w;
          w.xz = uCam.xz + mod(p.xz - uCam.xz, uBox.xz) - uBox.xz * 0.5;
          w.y = uCam.y - uBox.y * 0.35 + p.y;
          w.y += aEnd * 1.1;
          w.x += aEnd * uWind * 0.06;
          vA = step(fract(aOff.z * 3.7), uAmount);
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() { if (vA < 0.5) discard; gl_FragColor = vec4(uColor, 0.55); }`,
      transparent: true,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  _buildSnow() {
    const N = 5000;
    const off = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) off.set([Math.random() * BOX.x, Math.random() * BOX.y, Math.random() * BOX.z], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
    this.snowUniforms = {
      uTime: WORLD_UNIFORMS.uTime,
      uCam: { value: new THREE.Vector3() },
      uBox: { value: BOX },
      uAmount: { value: 0 },
      uWind: { value: 1 },
      uMap: { value: makeSoftDot() },
      uPx: { value: 1 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aOff;
        uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uWind; uniform float uAmount; uniform float uPx;
        varying float vA;
        void main() {
          vec3 p = aOff;
          float speed = 2.2 + fract(aOff.x * 3.1) * 1.6;
          p.y = mod(p.y - uTime * speed, uBox.y);
          p.x += sin(uTime * 0.8 + aOff.z) * 1.5 + uTime * uWind * 0.6;
          p.z += cos(uTime * 0.6 + aOff.x) * 1.5;
          vec3 w;
          w.xz = uCam.xz + mod(p.xz - uCam.xz, uBox.xz) - uBox.xz * 0.5;
          w.y = uCam.y - uBox.y * 0.35 + p.y;
          vA = step(fract(aOff.z * 5.3), uAmount);
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (0.18 + fract(aOff.y) * 0.12) * 300.0 / -mv.z;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; varying float vA;
        void main() { if (vA < 0.5) discard; vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(1.0, 1.0, 1.0, t.a * 0.9); }`,
      transparent: true,
      depthWrite: false,
    });
    this.snow = new THREE.Points(g, m);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  _buildSteam() {
    // Puffs rising from steam stacks; positions set by setSteamSources()
    const N = 240;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(Float32Array.from({ length: N }, () => Math.random()), 1));
    this.steamUniforms = { uTime: WORLD_UNIFORMS.uTime, uMap: { value: makeSoftDot() }, uCold: { value: 0.5 }, uPx: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.steamUniforms,
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uCold; uniform float uPx;
        varying float vLife;
        void main() {
          float life = fract(uTime * 0.25 + aSeed);
          vLife = life;
          vec3 p = position;
          p.y += 3.6 + life * 9.0;
          p.x += sin(aSeed * 40.0 + uTime) * life * 1.5 + life * 2.0;
          p.z += cos(aSeed * 31.0) * life * 1.2;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uPx * (1.5 + life * 5.0) * 220.0 / -mv.z * (0.4 + uCold);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uCold; varying float vLife;
        void main() { vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vec3(0.92), t.a * (1.0 - vLife) * (0.25 + uCold * 0.45)); }`,
      transparent: true,
      depthWrite: false,
    });
    this.steam = new THREE.Points(g, m);
    this.steam.frustumCulled = false;
    this.scene.add(this.steam);
  }

  setSteamSources(sources) {
    const pos = this.steam.geometry.attributes.position;
    const n = pos.count;
    for (let i = 0; i < n; i++) {
      const s = sources[i % Math.max(1, sources.length)];
      if (!s) pos.setXYZ(i, 0, -999, 0);
      else pos.setXYZ(i, s.x, 0, s.z);
    }
    pos.needsUpdate = true;
  }

  setPixelRatio(pr) {
    this.snowUniforms.uPx.value = pr;
    this.steamUniforms.uPx.value = pr;
  }

  update(dt, { camera, weather, temperature }) {
    const targetRain = weather.kind === 'rain' ? weather.intensity ?? 0.6 : weather.kind === 'storm' ? 1 : 0;
    const targetSnow = weather.kind === 'snow' ? weather.intensity ?? 0.7 : 0;
    this.rainAmt += (targetRain - this.rainAmt) * Math.min(1, dt * 0.6);
    this.snowAmt += (targetSnow - this.snowAmt) * Math.min(1, dt * 0.6);
    this.rain.visible = this.rainAmt > 0.02;
    this.snow.visible = this.snowAmt > 0.02;
    this.rainUniforms.uAmount.value = this.rainAmt;
    this.rainUniforms.uWind.value = weather.wind ?? 2;
    this.rainUniforms.uCam.value.copy(camera.position);
    this.snowUniforms.uAmount.value = this.snowAmt;
    this.snowUniforms.uCam.value.copy(camera.position);
    this.snowUniforms.uWind.value = (weather.wind ?? 2) * 0.3;
    this.steamUniforms.uCold.value = Math.max(0, Math.min(1, (60 - (temperature ?? 60)) / 40));
  }
}
