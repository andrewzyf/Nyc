// Sky dome, sun/moon lighting, fog and clouds. Driven by the game clock + weather.
import * as THREE from 'three';
import { WORLD_UNIFORMS } from './materials.js';
import { clamp, lerp, smoothstep } from '../core/math.js';

const K = (alt, o) => ({ alt, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' ? new THREE.Color(v) : v])) });

// Keyframes by sun altitude (degrees). Evening variants warm the horizon.
const KEYS = [
  K(-20, { top: '#070b1c', hor: '#1a2446', fog: '#161d36', sun: '#ffffff', sunI: 0, hemiSky: '#43578a', hemiGround: '#26232c', hemiI: 0.9 }),
  K(-9, { top: '#111b40', hor: '#2c3564', fog: '#262c4c', sun: '#ffffff', sunI: 0, hemiSky: '#4a5d92', hemiGround: '#29252e', hemiI: 0.88 }),
  K(-3, { top: '#26407c', hor: '#c9786a', fog: '#6e5f78', sun: '#ff7a48', sunI: 0.25, hemiSky: '#5b6aa0', hemiGround: '#2a2224', hemiI: 0.68 }),
  K(3, { top: '#4670b0', hor: '#f4a472', fog: '#d49c84', sun: '#ffa062', sunI: 1.2, hemiSky: '#98a8cf', hemiGround: '#4c3f36', hemiI: 0.78 }),
  K(11, { top: '#4f86cf', hor: '#f3cfa2', fog: '#dcc6ac', sun: '#ffd49a', sunI: 2.1, hemiSky: '#b6c8e6', hemiGround: '#62574a', hemiI: 0.88 }),
  K(28, { top: '#3f7fd6', hor: '#b8d3ee', fog: '#bccfe2', sun: '#fff0d6', sunI: 2.7, hemiSky: '#cde0ff', hemiGround: '#766e60', hemiI: 0.98 }),
  K(65, { top: '#3474d6', hor: '#a9cbef', fog: '#b0c8e0', sun: '#fff8ee', sunI: 2.95, hemiSky: '#d6e6ff', hemiGround: '#7c7466', hemiI: 1.02 }),
];

const MORNING_TINT = new THREE.Color('#e7a3b8');

export const FOG_BY_WEATHER = {
  clear: [260, 2400],
  cloudy: [220, 2000],
  overcast: [160, 1500],
  rain: [70, 820],
  storm: [45, 560],
  snow: [40, 620],
  fog: [12, 240],
  heat: [120, 1400],
};

export class Environment {
  constructor(scene, renderer, { quality = 'medium' } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.quality = quality;
    this.hemi = new THREE.HemisphereLight('#cde0ff', '#766e60', 1.0);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff0d6', 2.5);
    this.sun.castShadow = quality !== 'low';
    const size = quality === 'high' ? 2048 : 1024;
    this.sun.shadow.mapSize.set(size, size);
    const S = quality === 'high' ? 130 : 95;
    Object.assign(this.sun.shadow.camera, { left: -S, right: S, top: S, bottom: -S, near: 1, far: 1200 });
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.9;
    this.shadowSize = S;
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.fog = new THREE.Fog('#bccfe2', 260, 2400);
    this.fill = new THREE.PointLight('#ffdcb0', 0, 60, 1.5);
    scene.add(this.fill);
    this._buildSky();
    this._buildClouds();
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.state = { night: 0, alt: 30 };
    this._fogNear = 260;
    this._fogFar = 2400;
    this._flash = 0;
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(2800, 32, 16);
    this.skyUniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color('#2a2f38') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff') },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uStars: { value: 0 },
      uTime: WORLD_UNIFORMS.uTime,
      uCloud: { value: 0 },
      uCityGlow: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSunColor;
        uniform vec3 uMoonDir; uniform float uStars; uniform float uTime; uniform float uCloud; uniform float uCityGlow;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uBottom, smoothstep(0.0, -0.25, h));
          // warm light pollution near the horizon at night
          col += vec3(0.35, 0.22, 0.12) * uCityGlow * pow(1.0 - clamp(h, 0.0, 1.0), 6.0);
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunColor * (pow(sd, 900.0) * 6.0 + pow(sd, 12.0) * 0.18) * (1.0 - uCloud * 0.85) * step(-0.05, uSunDir.y + 0.1);
          float md = max(dot(d, normalize(uMoonDir)), 0.0);
          col += vec3(0.9, 0.93, 1.0) * (smoothstep(0.9993, 0.9996, md) * 1.2 + pow(md, 60.0) * 0.08) * (1.0 - uCloud * 0.9) * step(0.0, uMoonDir.y);
          vec3 sp = floor(d * 380.0);
          float s = hash(sp);
          float tw = 0.6 + 0.4 * sin(uTime * 3.0 + s * 50.0);
          col += vec3(1.0) * step(0.9975, s) * tw * uStars * smoothstep(0.0, 0.25, h) * (1.0 - uCloud);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _buildClouds() {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.15 });
    const COUNT = 60;
    const PUFFS = 6;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, COUNT * PUFFS);
    this.clouds.frustumCulled = false;
    this.cloudData = [];
    let seed = 7;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < COUNT; i++) {
      const puffs = [];
      for (let k = 0; k < PUFFS; k++) puffs.push({ x: (rnd() - 0.5) * 120, y: rnd() * 18, z: (rnd() - 0.5) * 50, s: 22 + rnd() * 30 });
      this.cloudData.push({ x: (rnd() - 0.5) * 5000, z: (rnd() - 0.5) * 5000, y: 380 + rnd() * 220, puffs, order: rnd() });
    }
    this.cloudData.sort((a, b) => a.order - b.order);
    this.scene.add(this.clouds);
    this._dummy = new THREE.Object3D();
  }

  /** Sun direction from minute-of-day and sunrise/sunset times. */
  computeSun(minuteOfDay, sunrise, sunset, maxAlt) {
    const dayLen = sunset - sunrise;
    let alt;
    let t;
    if (minuteOfDay >= sunrise && minuteOfDay <= sunset) {
      t = (minuteOfDay - sunrise) / dayLen;
      alt = Math.sin(Math.PI * t) * maxAlt;
    } else {
      const nightLen = 1440 - dayLen;
      const since = minuteOfDay > sunset ? minuteOfDay - sunset : minuteOfDay + 1440 - sunset;
      const u = since / nightLen;
      alt = -Math.sin(Math.PI * u) * 45;
      t = minuteOfDay > sunset ? 1 + u * 0.5 : -0.5 + u * 0.5;
    }
    const az = Math.PI * clamp(t, -0.3, 1.3);
    const altR = (alt * Math.PI) / 180;
    this.sunDir.set(Math.cos(az) * Math.cos(altR), Math.sin(altR), Math.sin(az) * Math.cos(altR) * 0.9 + 0.25).normalize();
    return { alt, evening: minuteOfDay > (sunrise + sunset) / 2 };
  }

  update(dt, ctx) {
    const { minuteOfDay, sunrise, sunset, maxAlt, weather, focus, camera } = ctx;
    const { alt, evening } = this.computeSun(minuteOfDay, sunrise, sunset, maxAlt);
    // Interpolate keyframes
    let a = KEYS[0];
    let b = KEYS[KEYS.length - 1];
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (alt >= KEYS[i].alt && alt <= KEYS[i + 1].alt) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
    if (alt < KEYS[0].alt) b = a;
    const t = a === b ? 0 : smoothstep(a.alt, b.alt, alt);
    const mix = (k) => a[k].clone().lerp(b[k], t);
    const top = mix('top');
    const hor = mix('hor');
    const fog = mix('fog');
    const sunC = mix('sun');
    const hemiSky = mix('hemiSky');
    const hemiGround = mix('hemiGround');
    let sunI = lerp(a.sunI, b.sunI, t);
    let hemiI = lerp(a.hemiI, b.hemiI, t);
    if (!evening && alt > -6 && alt < 10) {
      const m = 1 - smoothstep(0, 10, Math.abs(alt - 1));
      hor.lerp(MORNING_TINT, m * 0.35);
      fog.lerp(MORNING_TINT, m * 0.25);
    }
    // Weather influence
    const cover = weather.cloudCover ?? 0;
    const dark = weather.darkness ?? 0;
    const gray = (c, amt, lum = null) => {
      const l = lum ?? c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
      c.lerp(new THREE.Color(l, l, l * 1.04), amt);
      return c;
    };
    gray(top, cover * 0.8);
    gray(hor, cover * 0.7);
    gray(fog, cover * 0.7);
    top.multiplyScalar(1 - dark * 0.45);
    hor.multiplyScalar(1 - dark * 0.35);
    fog.multiplyScalar(1 - dark * 0.35);
    sunI *= 1 - cover * 0.82;
    hemiI *= 1 + cover * 0.12 - dark * 0.2;
    if (weather.kind === 'snow') {
      fog.lerp(new THREE.Color('#c9d0d8'), 0.5 * (alt > -3 ? 1 : 0.2));
    }
    // Lightning flash
    if (this._flash > 0) {
      this._flash = Math.max(0, this._flash - dt * 3);
      const f = this._flash;
      top.lerp(new THREE.Color('#cfd8ff'), f * 0.6);
      hor.lerp(new THREE.Color('#e0e6ff'), f * 0.6);
      hemiI += f * 2.5;
    }

    const night = 1 - smoothstep(-7, 5, alt);
    this.state.night = night;
    this.state.alt = alt;
    this.skyUniforms.uTop.value.copy(top);
    this.skyUniforms.uHorizon.value.copy(hor);
    this.skyUniforms.uBottom.value.copy(fog).multiplyScalar(0.6);
    this.skyUniforms.uSunDir.value.copy(this.sunDir);
    this.skyUniforms.uSunColor.value.copy(sunC);
    this.skyUniforms.uMoonDir.value.set(-this.sunDir.x, Math.max(0.15, -this.sunDir.y), -this.sunDir.z * 0.6 + 0.2).normalize();
    this.skyUniforms.uStars.value = night;
    this.skyUniforms.uCloud.value = cover;
    this.skyUniforms.uCityGlow.value = night * 0.35;

    // Lights
    const moonUp = alt < -4;
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(hemiGround);
    this.hemi.intensity = hemiI;
    if (moonUp) {
      this.sun.color.set('#a9bcff');
      this.sun.intensity = 0.5 * (1 - cover * 0.6);
      this._lightDir = this.skyUniforms.uMoonDir.value;
    } else {
      this.sun.color.copy(sunC);
      this.sun.intensity = sunI;
      this._lightDir = this.sunDir.y > 0.02 ? this.sunDir : new THREE.Vector3(this.sunDir.x, 0.02, this.sunDir.z).normalize();
    }
    // Shadow camera follows the focus, snapped to texels to avoid swimming
    const d = this._lightDir;
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx + d.x * 500, Math.max(40, d.y * 500), fz + d.z * 500);
    this.sun.target.updateMatrixWorld();

    // Warm street-level fill light near the player after dark
    this.fill.position.set(focus.x, 14, focus.z);
    this.fill.intensity = night * 200 + (alt > 0 ? dark * 80 : 0);
    // Fog
    const [n0, f0] = FOG_BY_WEATHER[weather.kind] || FOG_BY_WEATHER.clear;
    const k = 1 - Math.exp(-dt * 0.5);
    this._fogNear = lerp(this._fogNear, n0, k);
    this._fogFar = lerp(this._fogFar, f0, k);
    this.scene.fog.color.copy(fog);
    this.scene.fog.near = this._fogNear;
    this.scene.fog.far = this._fogFar;
    this.renderer.setClearColor(fog);

    // World shader uniforms
    WORLD_UNIFORMS.uNight.value = night;
    WORLD_UNIFORMS.uLitFrac.value = lerp(0.12, 0.5, night) * (minuteOfDay > 90 && minuteOfDay < 330 ? 0.55 : 1);
    WORLD_UNIFORMS.uLampGlow.value = clamp(1 - smoothstep(-3, 9, alt) + (alt > 0 ? dark * 0.6 + cover * 0.15 : 0), 0, 1);
    WORLD_UNIFORMS.uSkyTint.value.copy(hor).lerp(top, 0.4);

    // Sky follows camera
    this.sky.position.copy(camera.position);

    // Clouds drift with the wind, wrapped around the focus point
    const visible = Math.round(this.cloudData.length * clamp(0.15 + cover * 0.95, 0, 1));
    const wind = weather.wind ?? 4;
    const dm = this._dummy;
    let idx = 0;
    const span = 5000;
    const cloudCol = new THREE.Color().copy(hor).lerp(new THREE.Color('#ffffff'), 0.6 - dark * 0.4);
    cloudCol.lerp(new THREE.Color('#1a1f2e'), night * 0.8);
    this.cloudMat.color.copy(cloudCol);
    this.cloudMat.emissive.copy(sunC).multiplyScalar(0.12 * (1 - night));
    for (let i = 0; i < this.cloudData.length; i++) {
      const c = this.cloudData[i];
      c.x += wind * dt * 1.5;
      let cx = ((((c.x - focus.x + span / 2) % span) + span) % span) - span / 2 + focus.x;
      let cz = ((((c.z - focus.z + span / 2) % span) + span) % span) - span / 2 + focus.z;
      if (i >= visible) continue;
      const lower = weather.kind === 'rain' || weather.kind === 'storm' || weather.kind === 'snow' ? 160 : 0;
      for (const p of c.puffs) {
        dm.position.set(cx + p.x, c.y - lower + p.y, cz + p.z);
        dm.scale.set(p.s * 1.6, p.s * 0.55, p.s);
        dm.rotation.set(0, i, 0);
        dm.updateMatrix();
        this.clouds.setMatrixAt(idx++, dm.matrix);
      }
    }
    this.clouds.count = idx;
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  flash() {
    this._flash = 1;
  }

  setShadows(on) {
    this.sun.castShadow = on;
  }
}
