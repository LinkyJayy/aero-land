// Sky dome with a day/night cycle, puffy Frutiger Aero clouds, sun glow and stars.
import * as THREE from 'three';
import { lerp, clamp, mulberry32 } from '../util.js';

const DAY_LENGTH = 20 * 60; // seconds for a full day (shared by every client via wall clock)

const KEYS = [ // t, top, horizon, light
  [0.00, '#07103a', '#1f3a7a', 0.22],
  [0.15, '#0b1e5a', '#ff9a6a', 0.35],
  [0.21, '#2a8cff', '#bfeeff', 1.0],
  [0.50, '#1a8dff', '#d6f6ff', 1.0],
  [0.79, '#2a8cff', '#bfeeff', 1.0],
  [0.85, '#26307a', '#ff8a5a', 0.4],
  [0.90, '#07103a', '#1f3a7a', 0.22],
  [1.00, '#07103a', '#1f3a7a', 0.22],
];

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.top = new THREE.Color();
    this.horizon = new THREE.Color();
    this.light = 1;
    this.time = 0.35;

    this.uniforms = { uTop: { value: this.top }, uHorizon: { value: this.horizon }, uSun: { value: new THREE.Vector3() }, uNight: { value: 0 } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(900, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform float uNight; varying vec3 vDir;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
          void main(){
            float y = max(vDir.y, 0.0);
            vec3 col = mix(uHorizon, uTop, pow(y, 0.55));
            if (vDir.y < 0.0) col = uHorizon * 0.9;
            float s = max(dot(vDir, normalize(uSun)), 0.0);
            col += vec3(1.0, 0.95, 0.8) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
            vec3 cell = floor(vDir * 180.0);
            float st = step(0.9965, hash(cell)) * uNight * smoothstep(0.0, 0.3, vDir.y);
            col += vec3(st);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    dome.renderOrder = -10;
    this.dome = dome;
    scene.add(dome);

    this.hemi = new THREE.HemisphereLight('#dff6ff', '#4fbf2a', 1.1);
    this.sun = new THREE.DirectionalLight('#fff8e6', 1.6);
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog('#cdeeff', 120, 520);

    // puffy clouds made from clustered spheres
    this.clouds = new THREE.Group();
    const rng = mulberry32(42);
    const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#7fb4d8', emissiveIntensity: 0.35 });
    const sphere = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 26; i++) {
      const g = new THREE.Group();
      const puffs = 5 + Math.floor(rng() * 6);
      for (let j = 0; j < puffs; j++) {
        const m = new THREE.Mesh(sphere, cloudMat);
        const s = 8 + rng() * 10;
        m.scale.set(s * 1.3, s * 0.8, s);
        m.position.set((j - puffs / 2) * 9 + rng() * 6, rng() * 6, rng() * 10 - 5);
        g.add(m);
      }
      const ang = rng() * Math.PI * 2, dist = 150 + rng() * 380;
      g.position.set(Math.cos(ang) * dist, 95 + rng() * 60, Math.sin(ang) * dist);
      g.userData.speed = 1 + rng() * 2;
      this.clouds.add(g);
    }
    this.cloudMat = cloudMat;
    scene.add(this.clouds);
  }

  // 0..1 day fraction derived from the shared clock so every player sees the same sky
  static clockTime(offset = 0) {
    return (((Date.now() / 1000 + offset) / DAY_LENGTH) + 0.3) % 1;
  }

  get isNight() { return this.time < 0.15 || this.time > 0.85; }

  update(dt, playerPos, t) {
    this.time = t;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++;
    const [t0, top0, hor0, l0] = KEYS[i], [t1, top1, hor1, l1] = KEYS[i + 1];
    const k = clamp((t - t0) / (t1 - t0), 0, 1);
    this.top.set(top0).lerp(new THREE.Color(top1), k);
    this.horizon.set(hor0).lerp(new THREE.Color(hor1), k);
    this.light = lerp(l0, l1, k);
    this.uniforms.uNight.value = clamp(1 - this.light * 1.6, 0, 1);

    // sun crosses the sky between 0.18 and 0.82; the rest of the circle (night) passes faster
    const ang = t >= 0.18 && t <= 0.82 ? ((t - 0.18) / 0.64) * Math.PI
      : Math.PI + (((t + 1 - 0.82) % 1) / 0.36) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const lightDir = sunDir.y > 0 ? sunDir : new THREE.Vector3(-sunDir.x, -sunDir.y, 0.35).normalize(); // moon
    this.uniforms.uSun.value.copy(sunDir);
    this.sunDir = lightDir;
    this.sun.position.copy(playerPos).addScaledVector(lightDir, 100);
    this.sun.target.position.copy(playerPos);
    this.sun.intensity = 1.25 * this.light;
    this.sun.color.set(this.light < 0.5 ? '#9fb6ff' : '#fff6e0');
    this.hemi.intensity = 0.55 + 1.05 * this.light;
    this.hemi.color.set(this.light < 0.5 ? '#6b7fd6' : '#e2f7ff');
    this.scene.fog.color.copy(this.horizon);
    this.cloudMat.emissive.set(this.light < 0.5 ? '#1a2350' : '#8ec3e6');
    this.cloudMat.color.set(this.light < 0.5 ? '#8090c0' : '#ffffff');

    this.dome.position.copy(playerPos);
    for (const c of this.clouds.children) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 600) c.position.x = -600;
    }
  }
}
