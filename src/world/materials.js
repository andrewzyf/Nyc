// Shared materials + shader patches. All world materials read the same uniform
// objects so time of day, snow and rain update everything with one assignment.
import * as THREE from 'three';

export const WORLD_UNIFORMS = {
  uTime: { value: 0 },
  uNight: { value: 0 }, // 0 = day, 1 = night (drives window lights)
  uLitFrac: { value: 0.3 }, // fraction of windows lit
  uSnow: { value: 0 }, // snow cover 0..1
  uWet: { value: 0 }, // wet streets 0..1
  uSkyTint: { value: new THREE.Color('#9fb8d0') },
  uLampGlow: { value: 0 },
};

const COMMON_VERT_PARS = /* glsl */ `
varying vec3 vWPos;
varying vec3 vWNormal;
`;

const COMMON_VERT = /* glsl */ `
{
  vec4 wp4 = vec4(transformed, 1.0);
  vec3 wn = objectNormal;
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
    wn = mat3(instanceMatrix) * wn;
  #endif
  wp4 = modelMatrix * wp4;
  vWPos = wp4.xyz;
  vWNormal = normalize(mat3(modelMatrix) * wn);
}
`;

const HASH = /* glsl */ `
float nymHash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

function injectCommon(shader, { vertexExtraPars = '', vertexExtra = '' } = {}) {
  for (const [k, v] of Object.entries(WORLD_UNIFORMS)) shader.uniforms[k] = v;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${COMMON_VERT_PARS}\n${vertexExtraPars}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${COMMON_VERT}\n${vertexExtra}`);
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>
uniform float uTime; uniform float uNight; uniform float uLitFrac; uniform float uSnow; uniform float uWet; uniform vec3 uSkyTint; uniform float uLampGlow;
varying vec3 vWPos; varying vec3 vWNormal;
${HASH}`,
  );
}

/** Ground-type surfaces: snow settles on upward faces, rain darkens. */
export function patchSurface(material, { snowScale = 1, wetScale = 1, key = 'surface' } = {}) {
  material.onBeforeCompile = (shader) => {
    injectCommon(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      {
        float up = smoothstep(0.55, 0.95, normalize(vWNormal).y);
        vec2 sp = vWPos.xz * 0.12;
        vec2 si = floor(sp);
        vec2 sf = fract(sp);
        sf = sf * sf * (3.0 - 2.0 * sf);
        float n = mix(mix(nymHash12(si), nymHash12(si + vec2(1.0, 0.0)), sf.x), mix(nymHash12(si + vec2(0.0, 1.0)), nymHash12(si + vec2(1.0, 1.0)), sf.x), sf.y);
        float snow = clamp(uSnow * ${snowScale.toFixed(2)} * (0.85 + 0.25 * n), 0.0, 1.0) * up;
        diffuseColor.rgb *= 1.0 - uWet * ${wetScale.toFixed(2)} * 0.32 * up;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), snow);
      }`,
    );
  };
  material.customProgramCacheKey = () => `nym-${key}-${snowScale}-${wetScale}`;
  return material;
}

/**
 * Buildings: procedural windows from world position. Attribute aBld = (style, seed, top, flags)
 * flags bit0 = cornice band, bit1 = storefront ground floor.
 */
export function createBuildingMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    injectCommon(shader, {
      vertexExtraPars: 'attribute vec4 aBld;\nvarying vec4 vBld;',
      vertexExtra: 'vBld = aBld;',
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vBld;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 nymEmissive = vec3(0.0);
        {
          vec3 N = normalize(vWNormal);
          float isWall = 1.0 - step(0.5, abs(N.y));
          vec2 tang = normalize(vec2(-N.z, N.x) + vec2(1e-5));
          float u = dot(vWPos.xz, tang);
          float v = vWPos.y;
          float style = vBld.x;
          float seed = vBld.y;
          float top = vBld.z;
          float flags = vBld.w;
          float cornice = mod(flags, 2.0);
          float store = mod(floor(flags / 2.0), 2.0);

          float fw = 3.0; float fh = 3.4;
          vec4 box = vec4(0.3, 0.7, 0.28, 0.8);
          float minV = 3.4;
          if (style < 0.5) { fw = 1.7; fh = 3.9; box = vec4(0.05, 0.95, 0.12, 0.93); minV = 0.0; }
          else if (style < 1.5) { fw = 3.0; fh = 3.4; box = vec4(0.28, 0.72, 0.26, 0.78); }
          else if (style < 2.5) { fw = 2.3; fh = 3.3; box = vec4(0.27, 0.73, 0.2, 0.8); minV = 3.3; }
          else if (style < 3.5) { fw = 3.8; fh = 4.25; box = vec4(0.1, 0.9, 0.18, 0.86); minV = 4.25; }
          vec2 c = vec2(u / fw, v / fh);
          vec2 cell = floor(c);
          vec2 f = fract(c);
          float mask = step(box.x, f.x) * step(f.x, box.y) * step(box.z, f.y) * step(f.y, box.w);
          // mullion for loft windows
          if (style > 2.5 && style < 3.5) mask *= 1.0 - step(0.47, f.x) * step(f.x, 0.53);
          mask *= step(minV, v) * step(v, top - 1.1) * isWall;
          if (style > 3.5) mask = 0.0;
          // anti-alias far away: fade pattern to its average
          float aa = clamp(2.2 - max(fwidth(u) / fw, fwidth(v) / fh) * 6.5, 0.0, 1.0);
          float coverage = (box.y - box.x) * (box.w - box.z);
          float h = nymHash12(cell + vec2(seed, seed * 1.7));
          vec3 glass = mix(vec3(0.07, 0.09, 0.12), uSkyTint * 0.55, 0.35 + 0.35 * h);
          if (style < 0.5) glass = mix(diffuseColor.rgb * 0.55, uSkyTint * 0.8, 0.35 + 0.3 * h);
          float m = mask * aa;
          diffuseColor.rgb = mix(diffuseColor.rgb, glass, m);
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, glass, coverage), (1.0 - aa) * isWall * step(minV, v));

          // cornice band
          float band = cornice * step(top - 0.9, v) * isWall;
          diffuseColor.rgb *= 1.0 - band * 0.38;

          // storefront ground floor
          float sf = store * (1.0 - step(4.0, v)) * step(0.3, v) * isWall;
          float bay = fract(u / 5.5);
          float sfMask = sf * step(0.08, bay) * step(bay, 0.92) * step(0.5, v) * step(v, 3.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.12, 0.13) + uSkyTint * 0.15, sfMask);

          // roofs
          float roof = step(0.5, N.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.5 + vec3(0.12), roof * 0.75);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), roof * uSnow * 0.9);
          diffuseColor.rgb *= 1.0 - uWet * 0.12;

          // night lights
          float litP = uLitFrac * (0.75 + 0.5 * fract(seed * 13.7));
          float lit = step(nymHash12(cell * 1.37 + seed), litP);
          vec3 warm = mix(vec3(1.0, 0.78, 0.46), vec3(0.78, 0.86, 1.0), step(0.82, nymHash12(cell + 7.1)));
          nymEmissive += warm * lit * m * uNight * 0.85;
          nymEmissive += warm * (1.0 - aa) * isWall * step(minV, v) * step(v, top - 1.0) * coverage * litP * uNight * 0.32;
          // facades read darker at night; lit windows carry the skyline
          diffuseColor.rgb *= 1.0 - uNight * 0.35 * isWall;
          nymEmissive += vec3(1.0, 0.85, 0.6) * sfMask * mix(0.08, 1.1, uNight) * step(0.3, nymHash12(vec2(seed, 3.0)));
        }`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += nymEmissive;');
  };
  material.customProgramCacheKey = () => 'nym-building';
  return material;
}

/** Road markings: procedural dashes / zebra stripes from uv. aMark.x = kind (0 solid, 1 dash, 2 zebra). */
export function createMarkingMaterial() {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  material.onBeforeCompile = (shader) => {
    injectCommon(shader, { vertexExtraPars: 'attribute vec3 aMark;\nvarying vec3 vMark;', vertexExtra: 'vMark = aMark;' });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMark;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          float kind = vMark.x;
          float along = vMark.y;
          if (kind > 0.5 && kind < 1.5) { if (fract(along / 6.0) > 0.5) discard; }
          if (kind > 1.5) { if (fract(along / 1.3) > 0.55) discard; }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.92, 0.95), uSnow * 0.8);
          diffuseColor.rgb *= 1.0 - uWet * 0.2;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'nym-marking';
  return material;
}

/** Emissive lamp heads etc: glow at night. */
export function createGlowMaterial(color, { base = 0.05, night = 1.4, key = 'glow' } = {}) {
  const material = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color) });
  material.onBeforeCompile = (shader) => {
    injectCommon(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(${base.toFixed(3)}, ${night.toFixed(3)}, uLampGlow);`,
    );
  };
  material.customProgramCacheKey = () => `nym-${key}`;
  return material;
}

/** Additive radial glow decals on the ground under street lamps. */
export function createLightPoolMaterial() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uLampGlow: WORLD_UNIFORMS.uLampGlow, uWet: WORLD_UNIFORMS.uWet },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uLampGlow; uniform float uWet; varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        a = a * a * uLampGlow * (0.32 + uWet * 0.25);
        gl_FragColor = vec4(vec3(1.0, 0.78, 0.45) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return material;
}

export function createWaterMaterial(fog) {
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: WORLD_UNIFORMS.uTime,
        uDeep: { value: new THREE.Color('#1d4a5e') },
        uShallow: { value: new THREE.Color('#3f7d8c') },
        uSky: { value: new THREE.Color('#9fc4dd') },
        uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) },
        uSunColor: { value: new THREE.Color('#fff2d6') },
        uNight: WORLD_UNIFORMS.uNight,
        uLampGlow: WORLD_UNIFORMS.uLampGlow,
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWPos = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uSky; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight; uniform float uLampGlow;
      varying vec3 vWPos;
      void main() {
        vec2 p = vWPos.xz;
        float t = uTime;
        vec3 n = normalize(vec3(
          sin(p.x * 0.08 + t * 0.9) * 0.18 + sin(p.x * 0.23 - p.y * 0.17 + t * 1.7) * 0.08 + sin(p.y * 0.5 + t * 2.3) * 0.03,
          1.0,
          cos(p.y * 0.07 + t * 0.7) * 0.18 + cos(p.x * 0.19 + p.y * 0.21 + t * 1.3) * 0.08 + cos(p.x * 0.47 - t * 2.1) * 0.03));
        vec3 V = normalize(cameraPosition - vWPos);
        float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 col = mix(uDeep, uShallow, 0.35 + 0.25 * n.x);
        col = mix(col, uSky, clamp(0.15 + fres * 0.85, 0.0, 1.0));
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(n, H), 0.0), 180.0) * step(0.0, uSunDir.y);
        col += uSunColor * spec * 1.6;
        // City lights shimmer on the water at night
        float shimmer = pow(max(sin(p.x * 0.9 + t * 2.0) * sin(p.y * 0.35 - t * 1.4), 0.0), 8.0);
        col += vec3(1.0, 0.8, 0.5) * shimmer * uNight * 0.18;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
    fog: !!fog,
  });
  return material;
}

/** Simple solid-color Lambert with world patch (snow-aware), memoized by color. */
const lambertCache = new Map();
export function lambert(color, { flat = true, snow = 0, side } = {}) {
  const key = `${color}-${flat}-${snow}-${side}`;
  if (lambertCache.has(key)) return lambertCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: flat, side: side ?? THREE.FrontSide });
  if (snow) patchSurface(m, { snowScale: snow, key: `lam-${snow}` });
  lambertCache.set(key, m);
  return m;
}
