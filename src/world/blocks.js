// Buildable voxel blocks (Minecraft / LEGO Fortnite style building on top of the smooth island).
// A block at cell (x,y,z) fills [x,x+1] x [y,y+1] x [z,z+1].
import * as THREE from 'three';
import { mulberry32 } from '../util.js';

export const BLOCKS = [
  null,
  { id: 1, key: 'grass', name: 'Grass', color: '#45d61c', top: '#6cf23a' },
  { id: 2, key: 'dirt', name: 'Dirt', color: '#9a6b3f' },
  { id: 3, key: 'stone', name: 'Stone', color: '#a9b4bd' },
  { id: 4, key: 'sand', name: 'Sand', color: '#f5df9e' },
  { id: 5, key: 'log', name: 'Log', color: '#8a5a2b', ring: true },
  { id: 6, key: 'planks', name: 'Planks', color: '#d9a35f', planks: true },
  { id: 7, key: 'glass', name: 'Aero Glass', color: '#9fe8ff', glass: true },
  { id: 8, key: 'leaves', name: 'Leaves', color: '#3cc81e' },
  { id: 9, key: 'bubble', name: 'Bubble Brick', color: '#2fb8ff', brick: true, gloss: true },
  { id: 10, key: 'lime', name: 'Lime Tile', color: '#86ec3a', tile: true, gloss: true },
  { id: 11, key: 'marble', name: 'Marble', color: '#f4f8fb', marble: true },
  { id: 12, key: 'glow', name: 'Glow Orb', color: '#c8fbff', glow: true },
  { id: 13, key: 'ocean', name: 'Ocean Tile', color: '#1677e8', tile: true, gloss: true },
  { id: 14, key: 'shell', name: 'Shell Block', color: '#ffc4d6', tile: true },
  { id: 15, key: 'sunny', name: 'Sunny Block', color: '#ffd93b', tile: true, gloss: true },
];
export const BLOCK_BY_KEY = Object.fromEntries(BLOCKS.filter(Boolean).map((b) => [b.key, b]));

function makeTexture(def) {
  const S = 16, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const rng = mulberry32(def.id * 977);
  const base = new THREE.Color(def.color);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = base.clone();
    let v = 0.92 + rng() * 0.16;
    if (def.planks && y % 4 === 0) v = 0.7;
    if (def.planks && x === ((y >> 2) * 5) % 16) v = 0.75;
    if (def.brick) { const off = (y >> 2) % 2 ? 4 : 0; if (y % 4 === 0 || (x + off) % 8 === 0) v = 0.72; }
    if (def.tile && (x === 0 || y === 0)) v = 0.78;
    if (def.marble && Math.abs(Math.sin(x * 0.7 + y * 0.35)) > 0.96) v = 0.82;
    if (def.ring) { const d = Math.hypot(x - 7.5, y - 7.5); if (Math.floor(d) % 3 === 0) v = 0.75; }
    if (def.gloss && y < 6 && x > 1 && x < 14) v += (6 - y) * 0.035; // glossy highlight band
    if (def.glass) v = (x === 0 || y === 0 || x === 15 || y === 15) ? 1.25 : (x + y === 10 || x + y === 12 ? 1.35 : 1);
    if (def.glow) { const d = Math.hypot(x - 7.5, y - 7.5); v = 1.25 - d * 0.03; }
    c.multiplyScalar(v);
    g.fillStyle = `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`;
    g.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function blockSwatch(id) {
  const d = BLOCKS[id];
  if (!d) return '';
  const c = new THREE.Color(d.color);
  const hi = c.clone().lerp(new THREE.Color('#fff'), 0.45).getStyle();
  const lo = c.clone().multiplyScalar(0.7).getStyle();
  return `linear-gradient(180deg, ${hi} 0%, ${d.color} 50%, ${lo} 100%)`;
}

const CAP = 8192;
const _m = new THREE.Matrix4();

export class BlockWorld {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.meshes = [];
    this.dirty = new Set();
    this.onChange = null;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (const def of BLOCKS) {
      if (!def) { this.meshes.push(null); continue; }
      const tex = makeTexture(def);
      const mat = def.glow
        ? new THREE.MeshBasicMaterial({ map: tex, color: '#ffffff' })
        : new THREE.MeshLambertMaterial({ map: tex, transparent: !!def.glass, opacity: def.glass ? 0.45 : 1, depthWrite: !def.glass });
      const mesh = new THREE.InstancedMesh(geo, mat, CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.userData.blockId = def.id;
      mesh.userData.cells = [];
      if (def.glass) mesh.renderOrder = 2;
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    this.glowLights = [];
  }

  static key(x, y, z) { return `${x},${y},${z}`; }
  get(x, y, z) { return this.map.get(`${x},${y},${z}`) || 0; }
  solid(x, y, z) { return this.map.has(`${x},${y},${z}`); }

  set(x, y, z, id, fromNet = false) {
    const k = `${x},${y},${z}`;
    const prev = this.map.get(k) || 0;
    if (prev === id) return false;
    if (id) this.map.set(k, id); else this.map.delete(k);
    if (prev) this.dirty.add(prev);
    if (id) this.dirty.add(id);
    if (!fromNet && this.onChange) this.onChange(x, y, z, id);
    return true;
  }

  load(entries) {
    this.map.clear();
    for (const [k, id] of entries) if (BLOCKS[id]) this.map.set(k, id);
    for (let i = 1; i < BLOCKS.length; i++) this.dirty.add(i);
  }

  flush() {
    if (!this.dirty.size) return;
    const lists = new Map([...this.dirty].map((id) => [id, []]));
    for (const [k, id] of this.map) { const l = lists.get(id); if (l) l.push(k); }
    for (const [id, keys] of lists) {
      const mesh = this.meshes[id];
      const n = Math.min(keys.length, CAP);
      for (let i = 0; i < n; i++) {
        const [x, y, z] = keys[i].split(',').map(Number);
        _m.makeTranslation(x + 0.5, y + 0.5, z + 0.5);
        mesh.setMatrixAt(i, _m);
      }
      mesh.count = n;
      mesh.userData.cells = keys;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.dirty.clear();
  }

  // Highest block top at or below `maxY` in column (x,z) (cell coordinates), or -Infinity.
  topBelow(cx, cz, maxY) {
    for (let y = Math.floor(maxY); y > maxY - 6; y--) if (this.solid(cx, y - 1, cz)) return y;
    return -Infinity;
  }

  // Voxel DDA raycast. Returns { cell:[x,y,z], normal:[nx,ny,nz], dist } or null.
  raycast(origin, dir, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
    let tx = sx ? ((sx > 0 ? x + 1 - origin.x : origin.x - x) * tdx) : Infinity;
    let ty = sy ? ((sy > 0 ? y + 1 - origin.y : origin.y - y) * tdy) : Infinity;
    let tz = sz ? ((sz > 0 ? z + 1 - origin.z : origin.z - z) * tdz) : Infinity;
    let normal = [0, 0, 0], t = 0;
    for (let i = 0; i < 256 && t <= maxDist; i++) {
      if (this.map.has(`${x},${y},${z}`)) return { cell: [x, y, z], normal, dist: t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; normal = [-sx, 0, 0]; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; normal = [0, -sy, 0]; }
      else { z += sz; t = tz; tz += tdz; normal = [0, 0, -sz]; }
    }
    return null;
  }
}
