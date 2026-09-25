// Waypoint beams and the interaction ring.
import * as THREE from 'three';

const COLORS = { waypoint: '#ffd23a', work: '#39d98a', home: '#5aa9ff', gig: '#ff8a3a', view: '#c77dff', interview: '#39d98a', event: '#ff4f81' };

export class Markers {
  constructor(scene) {
    this.scene = scene;
    this.beams = new Map();
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.9, 120, 16, 1, true).translate(0, 60, 0);
    this.beamGeo = beamGeo;
    this.diamondGeo = new THREE.OctahedronGeometry(0.9);
    const ringGeo = new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.visible = false;
    scene.add(this.ring);
  }

  _beamMat(color) {
    return new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.y) * 0.55 * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(uColor, a); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
  }

  /** markers: [{id, x, z, y?, kind}] */
  set(markers) {
    const keep = new Set(markers.map((m) => m.id));
    for (const [id, b] of this.beams) {
      if (!keep.has(id)) {
        this.scene.remove(b.group);
        this.beams.delete(id);
      }
    }
    for (const m of markers) {
      let b = this.beams.get(m.id);
      if (!b) {
        const color = COLORS[m.kind] || COLORS.waypoint;
        const group = new THREE.Group();
        const mat = this._beamMat(color);
        const beam = new THREE.Mesh(this.beamGeo, mat);
        beam.frustumCulled = false;
        const diamond = new THREE.Mesh(this.diamondGeo, new THREE.MeshBasicMaterial({ color }));
        diamond.position.y = 3.2;
        group.add(beam, diamond);
        this.scene.add(group);
        b = { group, mat, diamond };
        this.beams.set(m.id, b);
      }
      b.group.position.set(m.x, m.y || 0, m.z);
    }
  }

  update(dt, t, camPos) {
    for (const b of this.beams.values()) {
      b.mat.uniforms.uTime.value = t;
      b.diamond.rotation.y += dt * 1.5;
      b.diamond.position.y = 3.2 + Math.sin(t * 2) * 0.25;
      const d = camPos.distanceTo(b.group.position);
      b.group.scale.setScalar(Math.max(1, d / 60));
    }
  }

  showRing(x, y, z) {
    this.ring.visible = true;
    this.ring.position.set(x, y + 0.05, z);
    this.ring.material.opacity = 0.5 + Math.sin(performance.now() * 0.006) * 0.3;
  }

  hideRing() {
    this.ring.visible = false;
  }
}
