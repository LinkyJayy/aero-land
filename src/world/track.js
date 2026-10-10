// The "Aero Ring" kart circuit in the west of the park.
import * as THREE from 'three';
import { WORLD } from './terrain.js';

export const TRACK_WIDTH = 13;
const SAMPLES = 480;

export class Track {
  constructor() {
    const T = WORLD.track;
    const pts = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const wob = 1 + 0.16 * Math.sin(a * 3 + 0.6) + 0.08 * Math.cos(a * 5);
      pts.push(new THREE.Vector3(T.x + Math.cos(a) * T.rx * wob, T.h + 0.06, T.z + Math.sin(a) * T.rz * wob));
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.samples = this.curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
    this.length = this.curve.getLength();
    this.boosts = [0.12, 0.38, 0.63, 0.86];
  }

  pointAt(u) { return this.samples[((Math.floor(u * SAMPLES) % SAMPLES) + SAMPLES) % SAMPLES]; }
  tangentAt(u) { return this.curve.getTangentAt(((u % 1) + 1) % 1); }

  // nearest progress value (0..1) and distance from the center line
  nearest(x, z, hint = -1) {
    let best = 0, bd = Infinity;
    const from = hint < 0 ? 0 : Math.floor(hint * SAMPLES) - 30, to = hint < 0 ? SAMPLES : from + 60;
    for (let j = from; j < to; j++) {
      const i = ((j % SAMPLES) + SAMPLES) % SAMPLES;
      const p = this.samples[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return { u: best / SAMPLES, dist: Math.sqrt(bd) };
  }

  buildMesh() {
    const group = new THREE.Group();
    const pos = [], col = [], idx = [];
    const road = new THREE.Color('#5d6f86'), line = new THREE.Color('#ffffff'), curbR = new THREE.Color('#ff3d5a'), curbW = new THREE.Color('#ffffff');
    const side = new THREE.Vector3();
    const lanes = [-1.25, -1, -0.03, 0.03, 1, 1.25]; // curb | road | center line | road | curb
    const N = SAMPLES;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = this.pointAt(u), t = this.tangentAt(u);
      side.set(-t.z, 0, t.x).normalize();
      for (let l = 0; l < lanes.length; l++) {
        const o = lanes[l] * TRACK_WIDTH / 2;
        pos.push(p.x + side.x * o, p.y + (Math.abs(lanes[l]) > 1 ? 0.12 : 0), p.z + side.z * o);
        col.push(road.r, road.g, road.b);
      }
    }
    const L = lanes.length;
    for (let i = 0; i < N; i++) {
      for (let l = 0; l < L - 1; l++) {
        const a = i * L + l, b = a + 1, c = a + L, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    // paint: curbs stripes + dashed centre
    for (let i = 0; i <= N; i++) {
      const stripe = Math.floor(i / 4) % 2 === 0;
      const set = (l, c) => { const k = (i * L + l) * 3; col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; };
      set(0, stripe ? curbR : curbW); set(L - 1, stripe ? curbR : curbW);
      if (Math.floor(i / 6) % 2 === 0) { set(2, line); set(3, line); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    group.add(mesh);

    // checkered start/finish line
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 4;
    const g = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x, y, 1, 1); }
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    const start = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 3), new THREE.MeshBasicMaterial({ map: tex }));
    const p0 = this.pointAt(0), t0 = this.tangentAt(0);
    start.rotation.x = -Math.PI / 2;
    start.rotation.z = Math.atan2(-t0.x, -t0.z);
    start.position.set(p0.x, p0.y + 0.03, p0.z);
    group.add(start);

    // start gantry arch (glossy bubble arch)
    const archMat = new THREE.MeshPhongMaterial({ color: '#2fb8ff', shininess: 120, specular: '#ffffff' });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(TRACK_WIDTH / 2 + 1, 0.6, 10, 32, Math.PI), archMat);
    arch.position.set(p0.x, p0.y, p0.z);
    arch.rotation.y = Math.atan2(-t0.x, -t0.z);
    group.add(arch);

    // boost pads (glowing chevrons)
    const padMat = new THREE.MeshBasicMaterial({ color: '#7dff5a', transparent: true, opacity: 0.85 });
    this.padMeshes = [];
    for (const u of this.boosts) {
      const p = this.pointAt(u), t = this.tangentAt(u);
      const pad = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = Math.atan2(-t.x, -t.z);
      pad.position.set(p.x, p.y + 0.05, p.z);
      group.add(pad);
      this.padMeshes.push(pad);
    }
    return group;
  }
}
