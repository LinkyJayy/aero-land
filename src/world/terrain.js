// Island terrain: a vivid riverside park (like a city riverbank), a city skyline to the north,
// a sandy beach on the east coast, and flat zones for the race track and the arcade plaza.
import * as THREE from 'three';
import { fbm, smoothstep, lerp, clamp } from '../util.js';

export const WORLD = {
  size: 560,
  water: 0,
  spawn: new THREE.Vector3(10, 0, 30),
  track: { x: -125, z: -15, rx: 62, rz: 40, h: 2.4 },
  arcade: { x: 70, z: -40, r: 34, h: 2.6 },
  city: { x0: -170, x1: 150, z0: -250, z1: -125, h: 3.0 },
  pier: { x: 0, z: 0 }, // filled in below
};

export const riverZ = (x) => 62 + 12 * Math.sin(x * 0.017) + 5 * Math.sin(x * 0.041 + 1.3);

export function coastR(a) {
  const east = Math.max(0, Math.cos(a));
  return 228 + 10 * Math.sin(3 * a) + 7 * Math.sin(5 * a + 1) - 42 * east * east * east;
}

function flattenEllipse(h, x, z, cx, cz, rx, rz, target, pad) {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  const w = 1 - smoothstep(1, 1 + pad, d);
  return lerp(h, target, w);
}

// Returns land height (water level is 0).
export function heightAt(x, z) {
  let h = 2.3 + fbm(x * 0.011 + 7, z * 0.011 - 3, 3) * 2.4 + fbm(x * 0.05, z * 0.05, 2) * 0.35;
  // a gentle hill rising toward the north-west lookout
  h += 9 * Math.exp(-((x + 40) ** 2 + (z + 70) ** 2) / 2600);

  const T = WORLD.track, A = WORLD.arcade, C = WORLD.city;
  h = flattenEllipse(h, x, z, T.x, T.z, T.rx + 14, T.rz + 14, T.h, 0.35);
  h = flattenEllipse(h, x, z, A.x, A.z, A.r, A.r, A.h, 0.5);
  {
    const dx = Math.max(C.x0 - x, 0, x - C.x1), dz = Math.max(C.z0 - z, 0, z - C.z1);
    h = lerp(h, C.h, 1 - smoothstep(0, 22, Math.hypot(dx, dz)));
  }

  // river with stone promenade walls
  const r = Math.hypot(x, z);
  const a = Math.atan2(z, x);
  const coast = coastR(a);
  const inland = coast - r;
  const d = Math.abs(z - riverZ(x));
  if (d < 26) {
    const path = 1.05;
    let rh;
    if (d < 9) rh = -3.2 + (d / 9) * 0.8;
    else if (d < 10.2) rh = lerp(-2.4, path, (d - 9) / 1.2);
    else if (d < 14) rh = path;
    else rh = lerp(path, h, smoothstep(14, 26, d));
    h = rh;
  }

  // coastline + beach
  if (inland < 42) {
    const beach = -0.9 + Math.max(inland, 0) * 0.075;
    const blend = smoothstep(20, 42, inland);
    h = lerp(Math.min(beach, h), h, blend);
    if (inland < 0) h = Math.max(-14, Math.min(h, -0.9 + inland * 0.16));
  }
  return h;
}

export function isBeach(x, z) {
  const inland = coastR(Math.atan2(z, x)) - Math.hypot(x, z);
  return inland < 32;
}

export function isPromenade(x, z) {
  const d = Math.abs(z - riverZ(x));
  return d >= 10.2 && d < 14 && !isBeach(x, z);
}

export function isPaved(x, z) {
  const C = WORLD.city, A = WORLD.arcade;
  if (x > C.x0 && x < C.x1 && z > C.z0 && z < C.z1) return true;
  return Math.hypot(x - A.x, z - A.z) < A.r - 6;
}

// What kind of ground is under (x,z) — used for gathering and footsteps.
export function surfaceAt(x, z) {
  const h = heightAt(x, z);
  if (h < -0.15) return 'water';
  if (isPromenade(x, z) || isPaved(x, z)) return 'stone';
  if (isBeach(x, z) && h < 2.2) return 'sand';
  return 'grass';
}

export function buildTerrain() {
  const S = WORLD.size, seg = 280;
  const geo = new THREE.PlaneGeometry(S, S, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const grassA = new THREE.Color('#3fe014'), grassB = new THREE.Color('#2cc20c'), grassC = new THREE.Color('#79f03a');
  const sand = new THREE.Color('#f7e3a6'), wetSand = new THREE.Color('#e2c98a'), foam = new THREE.Color('#ffffff');
  const stone = new THREE.Color('#d9e1e6'), paved = new THREE.Color('#b9c8d4'), bed = new THREE.Color('#1c78c9'), deep = new THREE.Color('#0b4f9e');

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const n = fbm(x * 0.08, z * 0.08, 2);
    if (h < -0.6) {
      c.copy(bed).lerp(deep, clamp(-h / 12, 0, 1));
    } else if (isPromenade(x, z)) {
      c.copy(stone).multiplyScalar(0.95 + n * 0.05);
    } else if (isPaved(x, z)) {
      c.copy(paved).multiplyScalar(0.94 + n * 0.06);
      if ((Math.floor(x / 6) + Math.floor(z / 6)) % 2 === 0) c.multiplyScalar(1.05);
    } else if (isBeach(x, z) && h < 2.2) {
      c.copy(sand).lerp(wetSand, smoothstep(0.6, -0.3, h)).multiplyScalar(0.97 + n * 0.04);
      if (h > -0.45 && h < -0.05) c.lerp(foam, 0.6);
    } else {
      c.copy(grassA).lerp(grassB, n * 0.5 + 0.5);
      // mowed stripes like a well kept park
      if (Math.floor((x + z * 0.15) / 7) % 2 === 0) c.lerp(grassC, 0.25);
      if (h < 0.4) c.lerp(sand, 0.5);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  return mesh;
}

export function buildWater() {
  const geo = new THREE.PlaneGeometry(1600, 1600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uLight: { value: 1 }, uSun: { value: new THREE.Vector3(0.4, 0.8, 0.3) } },
    ]),
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLight; uniform vec3 uSun;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float wave(vec2 p, vec2 d, float f, float s) { return sin(dot(p, d) * f + uTime * s); }
      void main() {
        vec2 p = vWorld.xz;
        float w = wave(p, vec2(0.8, 0.6), 0.35, 1.3) + wave(p, vec2(-0.5, 0.9), 0.52, 1.7) * 0.6
                + wave(p, vec2(0.2, -1.0), 1.1, 2.4) * 0.3 + wave(p, vec2(1.0, 0.1), 2.3, 3.1) * 0.15;
        vec3 n = normalize(vec3(
          cos(dot(p, vec2(0.8, 0.6)) * 0.35 + uTime * 1.3) * 0.12 + cos(dot(p, vec2(1.0, 0.1)) * 2.3 + uTime * 3.1) * 0.05,
          1.0,
          cos(dot(p, vec2(-0.5, 0.9)) * 0.52 + uTime * 1.7) * 0.1 + cos(dot(p, vec2(0.2, -1.0)) * 1.1 + uTime * 2.4) * 0.06));
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
        vec3 deep = vec3(0.02, 0.45, 0.95);
        vec3 shallow = vec3(0.18, 0.72, 1.0);
        vec3 col = mix(deep, shallow, 0.5 + 0.25 * w);
        col = mix(col, vec3(0.75, 0.93, 1.0), fres * 0.6);
        vec3 h = normalize(normalize(uSun) + view);
        float spec = pow(max(dot(n, h), 0.0), 120.0);
        col += vec3(1.0) * spec * 1.4 * uLight;
        float glint = step(0.985, sin(p.x * 3.1 + uTime) * sin(p.y * 2.7 - uTime * 1.2));
        col += glint * 0.35 * uLight;
        col *= mix(0.25, 1.0, uLight);
        gl_FragColor = vec4(col, 0.88);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WORLD.water;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}
