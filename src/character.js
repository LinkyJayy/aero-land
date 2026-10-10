// The glossy "jelly" Aero Land character: bubble head with black eyes, bean body, capsule limbs.
import * as THREE from 'three';

export const DEFAULT_LOOK = { top: '#6fd6ff', bottom: '#7dff5a', eyes: 'tall', hat: 'none', hatColor: '#ffffff', size: 1 };
export const EYE_STYLES = ['tall', 'round', 'happy', 'sleepy', 'wide'];
export const HATS = ['none', 'cap', 'crown', 'headphones', 'halo', 'flower', 'helmet', 'tophat'];
export const PALETTE = ['#6fd6ff', '#7dff5a', '#2fb8ff', '#b6ff7a', '#ffffff', '#ffd93b', '#ff8ac2', '#c38bff', '#ff9a3c', '#3cffd2', '#1a5cff', '#ff4d6d', '#2c2c38', '#a8f0ff'];

const shared = { geos: null };
function geos() {
  if (shared.geos) return shared.geos;
  // bean-shaped torso via lathe (wider at the hips like the reference figure)
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const y = t * 0.86;
    const r = 0.36 + 0.06 * Math.sin(t * Math.PI * 0.9) - 0.12 * Math.pow(t, 3);
    const cap = t < 0.12 ? Math.sqrt(1 - Math.pow(1 - t / 0.12, 2)) : t > 0.86 ? Math.sqrt(1 - Math.pow((t - 0.86) / 0.14, 2)) : 1;
    prof.push(new THREE.Vector2(Math.max(0.001, r * cap), y));
  }
  shared.geos = {
    head: new THREE.SphereGeometry(0.44, 24, 18),
    body: new THREE.LatheGeometry(prof, 24),
    arm: new THREE.CapsuleGeometry(0.13, 0.48, 6, 12),
    leg: new THREE.CapsuleGeometry(0.17, 0.26, 6, 12),
    eye: new THREE.SphereGeometry(1, 12, 10),
    shadow: new THREE.CircleGeometry(0.55, 20),
  };
  return shared.geos;
}

const JELLY_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vW;
  #include <fog_pars_vertex>
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const JELLY_FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uLightDir; uniform float uLight; uniform float uFlash;
  varying vec3 vN; varying vec3 vW;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vW);
    float g = smoothstep(-0.7, 0.8, n.y);
    vec3 col = mix(uBottom, uTop, g);
    // glassy translucency: brighten the core, deepen the edges
    float facing = max(dot(n, v), 0.0);
    col = mix(col * 0.82, col * 1.12 + 0.06, facing);
    // white rim (fresnel) like polished plastic
    float rim = pow(1.0 - facing, 2.6);
    col = mix(col, vec3(0.92, 1.0, 1.0), rim * 0.75);
    // bounce light under the bottom
    col += vec3(0.75, 1.0, 0.55) * smoothstep(-0.3, -0.95, n.y) * 0.35;
    float diff = max(dot(n, normalize(uLightDir)), 0.0);
    col *= 0.62 + 0.45 * diff;
    vec3 h = normalize(normalize(uLightDir) + v);
    float spec = pow(max(dot(n, h), 0.0), 70.0);
    col += vec3(1.0) * (spec * 0.9 + smoothstep(0.8, 0.98, n.y) * 0.18);
    col *= mix(0.35, 1.0, uLight);
    col = mix(col, vec3(1.0, 0.3, 0.35), uFlash);
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
  }`;

export const lightState = { dir: new THREE.Vector3(0.4, 0.8, 0.3), level: 1 };

export function makeJellyMaterial(top, bottom) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTop: { value: new THREE.Color(top) }, uBottom: { value: new THREE.Color(bottom) },
      uLightDir: { value: lightState.dir }, uLight: { value: 1 }, uFlash: { value: 0 },
    }]),
    vertexShader: JELLY_VERT,
    fragmentShader: JELLY_FRAG,
  });
}

function glossy(color, opts = {}) {
  return new THREE.MeshPhongMaterial({ color, shininess: 90, specular: '#ffffff', ...opts });
}

function buildHat(type, color) {
  const g = new THREE.Group();
  const m = glossy(color);
  switch (type) {
    case 'cap': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.46, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
      dome.position.y = 0.06;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16, 1, false, -Math.PI / 2, Math.PI), m);
      brim.position.set(0, 0.1, 0.32); brim.scale.z = 1.4;
      g.add(dome, brim); break;
    }
    case 'crown': {
      const gold = glossy('#ffd23b', { emissive: '#553a00' });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 16, 1, true), gold);
      ring.material.side = THREE.DoubleSide;
      ring.position.y = 0.42;
      g.add(ring);
      for (let i = 0; i < 6; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), gold);
        const a = (i / 6) * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.28, 0.57, Math.sin(a) * 0.28);
        g.add(sp);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glossy(color));
        gem.position.set(Math.cos(a) * 0.31, 0.42, Math.sin(a) * 0.31);
        g.add(gem);
      }
      break;
    }
    case 'headphones': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.04, 8, 24, Math.PI), m);
      band.position.y = 0.02;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 16), m);
      l.rotation.z = Math.PI / 2; l.position.set(-0.46, 0, 0);
      const r = l.clone(); r.position.x = 0.46;
      g.add(band, l, r); break;
    }
    case 'halo': {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 28), new THREE.MeshBasicMaterial({ color: '#fff7b0' }));
      halo.rotation.x = Math.PI / 2; halo.position.y = 0.7;
      g.add(halo); g.userData.spin = halo; break;
    }
    case 'flower': {
      for (let i = 0; i < 6; i++) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), m);
        const a = (i / 6) * Math.PI * 2;
        p.position.set(0.22 + Math.cos(a) * 0.1, 0.36, Math.sin(a) * 0.1 + 0.05);
        g.add(p);
      }
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), glossy('#ffd93b'));
      c.position.set(0.22, 0.38, 0.05);
      g.add(c); break;
    }
    case 'helmet': {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), new THREE.MeshPhongMaterial({ color: color, transparent: true, opacity: 0.25, shininess: 140, specular: '#ffffff', depthWrite: false }));
      g.add(h); break;
    }
    case 'tophat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), m);
      brim.position.y = 0.34;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.42, 20), m);
      top.position.y = 0.56;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.08, 20), glossy('#2fb8ff'));
      band.position.y = 0.4;
      g.add(brim, top, band); break;
    }
  }
  return g;
}

function buildEyes(style) {
  const g = new THREE.Group();
  const black = new THREE.MeshBasicMaterial({ color: '#05070a' });
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const E = geos().eye;
  for (const side of [-1, 1]) {
    let eye;
    if (style === 'happy') {
      eye = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 6, 12, Math.PI), black);
      eye.position.set(side * 0.14, 0.03, 0.41);
    } else {
      eye = new THREE.Mesh(E, black);
      const s = { tall: [0.065, 0.13, 0.04], round: [0.08, 0.085, 0.04], sleepy: [0.08, 0.035, 0.03], wide: [0.1, 0.12, 0.04] }[style] || [0.065, 0.13, 0.04];
      eye.scale.set(...s);
      eye.position.set(side * 0.14, 0.04, 0.405);
      if (style !== 'sleepy') {
        const hi = new THREE.Mesh(E, white);
        hi.scale.set(0.022, 0.026, 0.01);
        hi.position.set(side * 0.14 + 0.025, 0.04 + s[1] * 0.6, 0.445);
        g.add(hi);
      }
    }
    eye.lookAt(eye.position.clone().multiplyScalar(2));
    g.add(eye);
  }
  return g;
}

export function makeNameTag(name, color = '#0a79d1') {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = 'bold 30px Segoe UI, Nunito, sans-serif';
  const w = Math.ceil(ctx.measureText(name).width) + 40;
  cv.width = w; cv.height = 48;
  ctx.font = 'bold 30px Segoe UI, Nunito, sans-serif';
  const grd = ctx.createLinearGradient(0, 0, 0, 48);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.5, '#bfeeff'); grd.addColorStop(0.51, '#7fd6ff'); grd.addColorStop(1, '#c8f3ff');
  ctx.fillStyle = grd;
  ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(2, 2, w - 4, 44, 22); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, w / 2, 26);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(w / 90, 48 / 90, 1);
  sp.renderOrder = 10;
  return sp;
}

export function buildKart(color = '#2fb8ff') {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.4, 6, 14), glossy(color));
  body.rotation.x = Math.PI / 2; body.scale.set(1.2, 1, 0.55); body.position.y = 0.55;
  const seat = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glossy('#ffffff'));
  seat.position.set(0, 0.75, -0.3);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
  const wm = glossy('#1b2733');
  for (const [x, z] of [[-0.85, 0.85], [0.85, 0.85], [-0.85, -0.85], [0.85, -0.85]]) {
    const w = new THREE.Mesh(wheelGeo, wm);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z);
    g.add(w);
  }
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.4), glossy('#7dff5a'));
  spoiler.position.set(0, 1.1, -1.15);
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.1), wm);
  strut.position.set(0, 0.9, -1.1);
  g.add(body, seat, spoiler, strut);
  return g;
}

export class Avatar {
  constructor(look = DEFAULT_LOOK, name = null) {
    const G = geos();
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.mat = makeJellyMaterial(look.top, look.bottom);
    const M = this.mat;

    this.body = new THREE.Mesh(G.body, M); this.body.position.y = 0.5;
    this.headPivot = new THREE.Group(); this.headPivot.position.y = 1.36;
    this.head = new THREE.Mesh(G.head, M); this.head.position.y = 0.42;
    this.headPivot.add(this.head);
    this.armL = new THREE.Group(); this.armL.position.set(-0.38, 1.22, 0);
    this.armR = new THREE.Group(); this.armR.position.set(0.38, 1.22, 0);
    for (const [arm, s] of [[this.armL, -1], [this.armR, 1]]) {
      const m = new THREE.Mesh(G.arm, M); m.position.y = -0.34; arm.add(m);
      arm.rotation.z = s * 0.42;
    }
    this.legL = new THREE.Group(); this.legL.position.set(-0.17, 0.5, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.17, 0.5, 0);
    for (const leg of [this.legL, this.legR]) { const m = new THREE.Mesh(G.leg, M); m.position.y = -0.3; leg.add(m); }
    this.model.add(this.body, this.headPivot, this.armL, this.armR, this.legL, this.legR);

    this.shadow = new THREE.Mesh(G.shadow, new THREE.MeshBasicMaterial({ color: '#003a66', transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.root.add(this.shadow);

    this.kart = null;
    this.phase = 0;
    this.hitT = 0;
    this.flash = 0;
    this.setLook(look);
    if (name) this.setName(name);
  }

  setLook(look) {
    this.look = { ...DEFAULT_LOOK, ...look };
    this.mat.uniforms.uTop.value.set(this.look.top);
    this.mat.uniforms.uBottom.value.set(this.look.bottom);
    if (this.eyes) this.head.remove(this.eyes);
    this.eyes = buildEyes(this.look.eyes);
    this.head.add(this.eyes);
    if (this.hat) this.head.remove(this.hat);
    this.hat = buildHat(this.look.hat, this.look.hatColor);
    this.head.add(this.hat);
    this.model.scale.setScalar(this.look.size || 1);
  }

  setName(name) {
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); }
    this.tag = makeNameTag(name);
    this.tag.position.y = 2.55;
    this.root.add(this.tag);
  }

  setKart(on, color) {
    if (on && !this.kart) { this.kart = buildKart(color || this.look.top); this.root.add(this.kart); }
    if (!on && this.kart) { this.root.remove(this.kart); this.kart = null; }
  }

  punch() { this.hitT = 0.3; }

  // anim: idle | walk | run | jump | swim | kart | fly
  animate(dt, speed, anim, time) {
    this.mat.uniforms.uLight.value = lightState.level;
    this.flash = Math.max(0, this.flash - dt * 3);
    this.mat.uniforms.uFlash.value = this.flash;
    this.phase += dt * (anim === 'run' ? 11 : 7.5) * Math.min(1, speed / 3 + 0.2);
    const walking = (anim === 'walk' || anim === 'run') && speed > 0.3;
    const sw = walking ? Math.sin(this.phase) * (anim === 'run' ? 0.9 : 0.6) : 0;
    const bob = walking ? Math.abs(Math.sin(this.phase)) * 0.06 : Math.sin(time * 2) * 0.015;
    const k = 1 - Math.exp(-dt * 14);
    const set = (o, x) => { o.rotation.x += (x - o.rotation.x) * k; };
    this.model.position.y = bob + (this.kart ? 0.35 : 0);

    if (anim === 'kart') {
      set(this.legL, -1.4); set(this.legR, -1.4); set(this.armL, -1.1); set(this.armR, -1.1);
    } else if (anim === 'swim') {
      const s = Math.sin(time * 6) * 0.8;
      set(this.armL, -2.6 + s); set(this.armR, -2.6 - s); set(this.legL, s * 0.5); set(this.legR, -s * 0.5);
      this.model.position.y = -0.9 + Math.sin(time * 3) * 0.05;
    } else if (anim === 'jump' || anim === 'fly') {
      set(this.armL, -2.4); set(this.armR, -2.4); set(this.legL, 0.4); set(this.legR, -0.3);
    } else {
      set(this.legL, sw); set(this.legR, -sw); set(this.armL, -sw * 0.8); set(this.armR, sw * 0.8);
    }
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.armR.rotation.x = -2.2 * Math.sin((this.hitT / 0.3) * Math.PI);
    }
    // squishy idle wobble
    const squish = 1 + Math.sin(time * 3.1) * 0.015;
    this.body.scale.set(squish, 2 - squish, squish);
    if (this.hat?.userData.spin) this.hat.userData.spin.rotation.z += dt;
    this.shadow.visible = anim !== 'swim';
  }

  dispose() {
    this.mat.dispose();
    if (this.tag) this.tag.material.map.dispose();
  }
}
