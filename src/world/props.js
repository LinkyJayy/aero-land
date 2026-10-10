// World dressing + gatherable resource nodes + colliders/platforms + interactable spots.
import * as THREE from 'three';
import { heightAt, riverZ, coastR, isBeach, WORLD } from './terrain.js';
import { mulberry32 } from '../util.js';
import { Avatar } from '../character.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

class InstSet {
  constructor(geo, mat, cap, scene) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mats = [];
    scene.add(this.mesh);
  }
  add(pos, rot, scale) {
    _e.set(rot.x || 0, rot.y || 0, rot.z || 0);
    _q.setFromEuler(_e);
    _s.set(scale.x ?? scale, scale.y ?? scale, scale.z ?? scale);
    const m = new THREE.Matrix4().compose(pos, _q, _s);
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, m);
    this.mats.push(m);
    return i;
  }
  setVisible(i, v) { this.mesh.setMatrixAt(i, v ? this.mats[i] : ZERO); this.mesh.instanceMatrix.needsUpdate = true; }
  done() { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.computeBoundingSphere(); }
}

function windowTexture(base, win, cols, rows, opts = {}) {
  const cv = document.createElement('canvas');
  cv.width = cols * 4; cv.height = rows * 4;
  const g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, cv.width, cv.height);
  const rng = mulberry32(cols * 31 + rows);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = opts.lit ? (rng() > 0.55 ? '#ffe9a8' : '#0a1630') : (rng() > 0.8 ? '#e8fbff' : win);
    g.fillRect(x * 4 + 1, y * 4 + 1, 2, 3);
    if (opts.bands && y % opts.bands === 0) { g.fillStyle = opts.bandColor; g.fillRect(0, y * 4, cv.width, 3); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Props {
  constructor(scene) {
    this.scene = scene;
    this.nodes = [];        // gatherable resources
    this.circles = [];      // [x, z, r] solid cylinders
    this.boxes = [];        // {x0,x1,z0,z1,y0,y1} solid boxes
    this.platforms = [];    // {x0,x1,z0,z1,top} walkable decks
    this.spots = [];        // interactables {x,z,r,label,action,icon}
    this.lampGlobes = null;
    this.rng = mulberry32(1337);
    this.time = 0;
    this.build();
  }

  free(x, z, margin = 4) {
    const T = WORLD.track, A = WORLD.arcade, C = WORLD.city;
    if (Math.hypot((x - T.x) / (T.rx + 12), (z - T.z) / (T.rz + 12)) < 1.15) return false;
    if (Math.hypot(x - A.x, z - A.z) < A.r + margin) return false;
    if (x > C.x0 - margin && x < C.x1 + margin && z > C.z0 - margin && z < C.z1 + margin) return false;
    if (Math.abs(z - riverZ(x)) < 16 + margin) return false;
    if (Math.hypot(x - WORLD.spawn.x, z - WORLD.spawn.z) < 10) return false;
    return true;
  }

  build() {
    const S = this.scene, rng = this.rng;
    const glossy = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, shininess: 80, specular: '#ffffff', ...o });

    // ---------- trees ----------
    const trunks = new InstSet(new THREE.CylinderGeometry(0.28, 0.42, 1, 7), new THREE.MeshLambertMaterial({ color: '#7a5634' }), 900, S);
    const leafGeo = new THREE.IcosahedronGeometry(1, 1);
    const leaves = new InstSet(leafGeo, new THREE.MeshLambertMaterial({ color: '#2fb81a' }), 1800, S);
    const leavesLight = new InstSet(leafGeo, new THREE.MeshLambertMaterial({ color: '#5ee02c' }), 900, S);
    const pines = new InstSet(new THREE.ConeGeometry(1, 1, 8), new THREE.MeshLambertMaterial({ color: '#1f8f2a' }), 900, S);
    const palmLeaf = new InstSet(new THREE.SphereGeometry(1, 8, 4), new THREE.MeshLambertMaterial({ color: '#3fd42a' }), 900, S);
    const apples = new InstSet(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshLambertMaterial({ color: '#ff3b4f', emissive: '#550010' }), 900, S);

    const addTree = (x, z, kind) => {
      const y = heightAt(x, z);
      const s = 0.8 + rng() * 0.6;
      const parts = [];
      if (kind === 'oak') {
        const h = 3.2 * s;
        parts.push([trunks, trunks.add(_p.set(x, y + h / 2, z).clone(), {}, { x: s, y: h, z: s })]);
        parts.push([leaves, leaves.add(_p.set(x, y + h + 1.2 * s, z).clone(), { y: rng() * 6 }, { x: 2.6 * s, y: 2.2 * s, z: 2.6 * s })]);
        parts.push([leavesLight, leavesLight.add(_p.set(x + 0.8 * s, y + h + 2.2 * s, z - 0.4 * s).clone(), { y: rng() * 6 }, 1.7 * s)]);
        parts.push([leaves, leaves.add(_p.set(x - 1.1 * s, y + h + 0.8 * s, z + 0.6 * s).clone(), {}, 1.6 * s)]);
        if (rng() < 0.6) for (let k = 0; k < 3; k++) {
          const a = rng() * 6.28;
          parts.push([apples, apples.add(_p.set(x + Math.cos(a) * 2.3 * s, y + h + 0.6 * s + rng(), z + Math.sin(a) * 2.3 * s).clone(), {}, 1)]);
        }
        this.circles.push([x, z, 0.5 * s]);
        this.nodes.push({ kind: 'tree', x, y: y + h * 0.5, z, r: 1.4, hp: 5, maxHp: 5, parts, drops: [['log', 1], ['apple', 0.25], ['leaves', 0.3]] });
      } else if (kind === 'pine') {
        const h = 2.5 * s;
        parts.push([trunks, trunks.add(_p.set(x, y + h / 2, z).clone(), {}, { x: s * 0.8, y: h, z: s * 0.8 })]);
        for (let k = 0; k < 4; k++) parts.push([pines, pines.add(_p.set(x, y + h + k * 1.8 * s + 1, z).clone(), {}, { x: (3 - k * 0.6) * s, y: 2.6 * s, z: (3 - k * 0.6) * s })]);
        this.circles.push([x, z, 0.45 * s]);
        this.nodes.push({ kind: 'tree', x, y: y + h * 0.5, z, r: 1.3, hp: 6, maxHp: 6, parts, drops: [['log', 1], ['leaves', 0.35]] });
      } else { // palm
        const h = 5.5 * s, lean = (rng() - 0.5) * 0.35;
        parts.push([trunks, trunks.add(_p.set(x + lean * h / 2, y + h / 2, z).clone(), { z: -lean }, { x: 0.65 * s, y: h, z: 0.65 * s })]);
        const tx = x + lean * h, ty = y + h;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          parts.push([palmLeaf, palmLeaf.add(_p.set(tx + Math.cos(a) * 1.6 * s, ty - 0.3, z + Math.sin(a) * 1.6 * s).clone(), { y: -a, z: 0.35 }, { x: 2.0 * s, y: 0.18 * s, z: 0.55 * s })]);
        }
        this.circles.push([x, z, 0.4 * s]);
        this.nodes.push({ kind: 'tree', x, y: y + 2, z, r: 1.2, hp: 4, maxHp: 4, parts, drops: [['log', 1], ['coconut', 0.35]] });
      }
    };

    // park trees in loose groves (like the riverside park)
    for (let i = 0; i < 520; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 215;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < 0.8 || !this.free(x, z, 3)) continue;
      if (isBeach(x, z)) { if (rng() < 0.45) addTree(x, z, 'palm'); continue; }
      if (fbmGrove(x, z) < 0.05) continue;
      addTree(x, z, rng() < 0.22 ? 'pine' : 'oak');
    }
    // a neat avenue of young trees along the promenade (like the reference photo)
    for (let x = -200; x < 160; x += 14) {
      const z = riverZ(x) - 17;
      if (heightAt(x, z) > 0.8 && this.free(x, z - 0.1, -12) && !isBeach(x, z)) addTree(x, z, 'oak');
    }
    for (const s of [trunks, leaves, leavesLight, pines, palmLeaf, apples]) s.done();

    // ---------- rocks, crystals, flowers, shells ----------
    const rocks = new InstSet(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: '#a7b6c4' }), 300, S);
    const crystals = new InstSet(new THREE.OctahedronGeometry(1, 0), glossy('#5ff3ff', { emissive: '#0a7f9a', transparent: true, opacity: 0.85 }), 60, S);
    const petals = new InstSet(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: false }), 900, S);
    const shells = new InstSet(new THREE.ConeGeometry(0.3, 0.35, 7), glossy('#ffc4d6'), 160, S);
    petals.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(900 * 3), 3);
    const flowerColors = ['#ff5fa8', '#ffd93b', '#ffffff', '#b07bff', '#ff8a3c', '#4fd0ff'].map((c) => new THREE.Color(c));

    for (let i = 0; i < 160; i++) {
      const a = rng() * 6.28, r = 20 + Math.sqrt(rng()) * 200;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
      if (y < 0.6 || !this.free(x, z, 2)) continue;
      const s = 0.6 + rng() * 1.3;
      const idx = rocks.add(new THREE.Vector3(x, y + s * 0.35, z), { x: rng() * 3, y: rng() * 3 }, { x: s * 1.2, y: s * 0.8, z: s });
      this.circles.push([x, z, s * 0.9]);
      this.nodes.push({ kind: 'rock', x, y: y + s * 0.4, z, r: s + 0.4, hp: 6, maxHp: 6, parts: [[rocks, idx]], drops: [['stone', 1], ['crystal', 0.06]] });
    }
    for (let i = 0; i < 26; i++) { // crystals on the north-west hill
      const x = -40 + (rng() - 0.5) * 70, z = -70 + (rng() - 0.5) * 60, y = heightAt(x, z);
      if (!this.free(x, z, 1)) continue;
      const idx = crystals.add(new THREE.Vector3(x, y + 0.7, z), { y: rng() * 3, z: (rng() - 0.5) * 0.4 }, { x: 0.45, y: 0.9, z: 0.45 });
      this.nodes.push({ kind: 'crystal', x, y: y + 0.7, z, r: 1, hp: 3, maxHp: 3, parts: [[crystals, idx]], drops: [['crystal', 1]] });
    }
    for (let i = 0; i < 140; i++) {
      const cx = (rng() - 0.5) * 380, cz = (rng() - 0.5) * 380;
      if (heightAt(cx, cz) < 0.8 || !this.free(cx, cz, 0) || isBeach(cx, cz)) continue;
      const col = flowerColors[Math.floor(rng() * flowerColors.length)];
      for (let k = 0; k < 5; k++) {
        const x = cx + (rng() - 0.5) * 4, z = cz + (rng() - 0.5) * 4, y = heightAt(x, z);
        const idx = petals.add(new THREE.Vector3(x, y + 0.25, z), {}, 1);
        petals.mesh.setColorAt(idx, col);
        this.nodes.push({ kind: 'flower', x, y: y + 0.25, z, r: 0.6, hp: 1, maxHp: 1, parts: [[petals, idx]], drops: [['petal', 1]] });
      }
    }
    for (let i = 0; i < 400 && shells.mesh.count < 150; i++) {
      const a = rng() * 6.28, cr = coastR(a), r = cr - 2 - rng() * 26;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = heightAt(x, z);
      if (y < -0.1 || y > 1.8 || !isBeach(x, z)) continue;
      const idx = shells.add(new THREE.Vector3(x, y + 0.1, z), { x: 1.4, y: rng() * 6 }, 1);
      this.nodes.push({ kind: 'shell', x, y: y + 0.15, z, r: 0.7, hp: 1, maxHp: 1, parts: [[shells, idx]], drops: [['shell', 1]] });
    }
    for (const s of [rocks, crystals, petals, shells]) s.done();
    petals.mesh.instanceColor.needsUpdate = true;

    // ---------- lamp posts along the promenade ----------
    const poles = new InstSet(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), new THREE.MeshLambertMaterial({ color: '#eef4f8' }), 80, S);
    this.lampGlobes = new InstSet(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 80, S);
    for (let x = -210; x < 170; x += 20) {
      const z = riverZ(x) - 13;
      const y = heightAt(x, z);
      if (y < 0.5 || isBeach(x, z)) continue;
      poles.add(new THREE.Vector3(x, y + 2.5, z), {}, 1);
      this.lampGlobes.add(new THREE.Vector3(x, y + 5.1, z), {}, 1);
    }
    poles.done(); this.lampGlobes.done();

    this.buildCity(glossy);
    this.buildArcade(glossy);
    this.buildWaterfront(glossy);

    // bronze statue of a jelly friend on the promenade (a nod to the photo)
    const sx = 18, sz = riverZ(18) - 12.2;
    const statue = new Avatar({ top: '#c08a4a', bottom: '#5a3a1a', eyes: 'tall', hat: 'none' });
    statue.root.position.set(sx, heightAt(sx, sz) + 0.4, sz);
    statue.root.rotation.y = Math.PI;
    statue.shadow.visible = false;
    statue.armR.rotation.x = -2.4;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.4, 16), new THREE.MeshLambertMaterial({ color: '#4a5560' }));
    plinth.position.set(sx, heightAt(sx, sz) + 0.2, sz);
    S.add(statue.root, plinth);
    this.statue = statue;
    this.circles.push([sx, sz, 0.9]);
  }

  buildCity(glossy) {
    const S = this.scene, rng = mulberry32(99), C = WORLD.city;
    const blueTex = windowTexture('#123a6a', '#3d8fd6', 10, 40);
    const blueLit = windowTexture('#0a1630', '#ffe9a8', 10, 40, { lit: true });
    const creamTex = windowTexture('#e9dcc0', '#b9a785', 12, 50, { bands: 16, bandColor: '#203040' });
    const darkTex = windowTexture('#1c2633', '#4a6a8a', 10, 36);
    const whiteTex = windowTexture('#f2f6f8', '#9fc8e0', 12, 10);
    this.cityMats = [];
    const mk = (tex) => { const m = new THREE.MeshLambertMaterial({ map: tex, emissiveMap: blueLit, emissive: '#000000' }); this.cityMats.push(m); return m; };
    const mats = [mk(blueTex), mk(creamTex), mk(darkTex), mk(whiteTex)];
    const roofMat = new THREE.MeshLambertMaterial({ color: '#203040' });
    const box = new THREE.BoxGeometry(1, 1, 1);

    const place = (x, z, w, d, h, mi) => {
      const y = C.h;
      const mats6 = [mats[mi], mats[mi], roofMat, roofMat, mats[mi], mats[mi]];
      const m = new THREE.Mesh(box, mats6);
      m.scale.set(w, h, d);
      m.position.set(x, y + h / 2, z);
      S.add(m);
      this.boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: -10, y1: y + h });
      if (h > 40 && rng() < 0.6) { // rooftop crown
        const crown = new THREE.Mesh(box, roofMat);
        crown.scale.set(w * 0.9, 2, d * 0.9);
        crown.position.set(x, y + h + 1, z);
        S.add(crown);
      }
    };
    // hero towers matching the skyline in the reference photo
    place(-10, -150, 18, 18, 70, 0);     // blue glass tower
    place(55, -165, 16, 16, 105, 1);     // tall cream tower with dark bands
    place(-95, -160, 18, 16, 58, 2);     // dark tower
    place(-150, -170, 12, 12, 50, 0);
    place(-45, -158, 24, 12, 22, 3);     // low white block
    place(20, -140, 20, 10, 16, 3);
    for (let i = 0; i < 26; i++) {
      const x = C.x0 + 10 + rng() * (C.x1 - C.x0 - 20), z = C.z0 + 10 + rng() * 75;
      place(x, z, 10 + rng() * 14, 10 + rng() * 14, 18 + rng() * 60, Math.floor(rng() * 4));
    }
  }

  buildArcade(glossy) {
    const S = this.scene, A = WORLD.arcade;
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(A.r - 8, A.r - 7, 0.6, 48), glossy('#f4fbff'));
    floor.position.set(A.x, A.h, A.z);
    S.add(floor);
    this.platforms.push({ x0: A.x - A.r + 9, x1: A.x + A.r - 9, z0: A.z - A.r + 9, z1: A.z + A.r - 9, top: A.h + 0.3 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(A.r - 7.5, 0.35, 8, 64), glossy('#2fb8ff'));
    ring.rotation.x = Math.PI / 2; ring.position.set(A.x, A.h + 0.3, A.z);
    S.add(ring);
    // glass canopy
    const dome = new THREE.Mesh(new THREE.SphereGeometry(A.r - 8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.6),
      new THREE.MeshPhongMaterial({ color: '#bff3ff', transparent: true, opacity: 0.18, shininess: 150, specular: '#ffffff', side: THREE.DoubleSide, depthWrite: false }));
    dome.position.set(A.x, A.h + 6, A.z);
    dome.renderOrder = 3;
    S.add(dome);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 12, 10), glossy('#ffffff'));
      col.position.set(A.x + Math.cos(a) * (A.r - 9), A.h + 6, A.z + Math.sin(a) * (A.r - 9));
      S.add(col);
      this.circles.push([col.position.x, col.position.z, 0.45]);
    }
    // fountain with a floating Aero globe
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.4, 1, 32), glossy('#e8f6ff'));
    basin.position.set(A.x, A.h + 0.6, A.z);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 0.2, 32), new THREE.MeshPhongMaterial({ color: '#36b9ff', shininess: 140, specular: '#fff', transparent: true, opacity: 0.85 }));
    water.position.set(A.x, A.h + 1.05, A.z);
    this.globe = new THREE.Group();
    const earth = new THREE.Mesh(new THREE.SphereGeometry(2, 28, 20), new THREE.MeshPhongMaterial({ color: '#3fb6ff', shininess: 160, specular: '#ffffff', transparent: true, opacity: 0.85 }));
    const land = new THREE.Mesh(new THREE.IcosahedronGeometry(2.02, 1), new THREE.MeshLambertMaterial({ color: '#6dff4a', wireframe: true }));
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(3, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    orbit.rotation.x = 1.2;
    this.globe.add(earth, land, orbit);
    this.globe.position.set(A.x, A.h + 5.2, A.z);
    S.add(basin, water, this.globe);
    this.circles.push([A.x, A.z, 4.4]);

    // game kiosks around the plaza
    const kiosks = [
      { game: 'darts', label: 'Aero Darts', icon: '🎯', color: '#2fb8ff' },
      { game: 'bubbles', label: 'Bubble Pop', icon: '🫧', color: '#7dff5a' },
      { game: 'memory', label: 'Memory Match', icon: '🃏', color: '#ff8ac2' },
      { game: 'board', label: 'Leaderboards', icon: '🏆', color: '#ffd93b' },
    ];
    kiosks.forEach((k, i) => {
      const a = (i / kiosks.length) * Math.PI * 2 + Math.PI / 4;
      const x = A.x + Math.cos(a) * 13, z = A.z + Math.sin(a) * 13;
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 1.6, 8, 16), glossy(k.color));
      pod.position.set(x, A.h + 1.9, z);
      const screen = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 12), new THREE.MeshBasicMaterial({ color: '#e8fbff' }));
      screen.position.set(x - Math.cos(a) * 0.7, A.h + 2.4, z - Math.sin(a) * 0.7);
      screen.scale.set(1, 0.7, 0.3);
      screen.lookAt(A.x, A.h + 2.4, A.z);
      S.add(pod, screen, this.iconSprite(k.icon, x, A.h + 4.6, z));
      this.circles.push([x, z, 1.2]);
      this.spots.push({ x, z, r: 3.4, label: k.label, icon: k.icon, action: k.game === 'board' ? 'board' : 'game:' + k.game });
    });
  }

  buildWaterfront(glossy) {
    const S = this.scene;
    const deck = new THREE.MeshLambertMaterial({ color: '#c99b62' });
    const bollard = glossy('#f4f8fb');
    // beach pier on the east coast
    const pz = 18, cr = coastR(Math.atan2(pz, 190));
    const x0 = cr - 26, x1 = cr + 30, top = 1.4;
    const pier = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.4, 5), deck);
    pier.position.set((x0 + x1) / 2, top - 0.2, pz);
    S.add(pier);
    this.platforms.push({ x0, x1, z0: pz - 2.5, z1: pz + 2.5, top });
    for (let x = x0 + 2; x < x1; x += 6) for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 8), deck);
      post.position.set(x, top - 4.2, pz + s * 2.3);
      S.add(post);
    }
    this.spots.push({ x: x1 - 3, z: pz, r: 4, label: 'Fishing Spot', icon: '🎣', action: 'game:fishing' });
    S.add(this.iconSprite('🎣', x1 - 3, top + 3.2, pz));
    WORLD.pier = { x: x1 - 3, z: pz };

    // river pontoon (like the jetty in the photo)
    const jx0 = 40, jx1 = 72, jz = riverZ(56) - 9.5;
    const pont = new THREE.Mesh(new THREE.BoxGeometry(jx1 - jx0, 0.5, 3), new THREE.MeshLambertMaterial({ color: '#d4dade' }));
    pont.position.set((jx0 + jx1) / 2, 0.85, jz + 1.5);
    S.add(pont);
    this.platforms.push({ x0: jx0, x1: jx1, z0: jz, z1: jz + 3, top: 1.1 });
    for (let x = jx0 + 1; x < jx1; x += 3.2) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8), bollard);
      b.position.set(x, 1.6, jz + 2.8);
      S.add(b);
    }
    this.spots.push({ x: 56, z: jz + 1.5, r: 4, label: 'River Fishing', icon: '🎣', action: 'game:fishing' });

    // footbridges over the river
    for (const bx of [-70, 105, -165]) {
      const zc = riverZ(bx), len = 34, w = 5, topY = 1.7;
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, len), glossy('#f4fbff'));
      bridge.position.set(bx, topY - 0.25, zc);
      S.add(bridge);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, len), glossy('#2fb8ff'));
        rail.position.set(bx + s * (w / 2 - 0.1), topY + 1, zc);
        S.add(rail);
        this.boxes.push({ x0: bx + s * (w / 2 - 0.1) - 0.15, x1: bx + s * (w / 2 - 0.1) + 0.15, z0: zc - len / 2, z1: zc + len / 2, y0: topY, y1: topY + 1.1 });
      }
      this.platforms.push({ x0: bx - w / 2, x1: bx + w / 2, z0: zc - len / 2, z1: zc + len / 2, top: topY });
    }
  }

  iconSprite(emoji, x, y, z) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(24, 20, 4, 32, 32, 30);
    grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.6, 'rgba(160,230,255,.85)'); grd.addColorStop(1, 'rgba(40,160,255,.9)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill();
    g.font = '34px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, 32, 35);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.position.set(x, y, z); sp.scale.set(2, 2, 1);
    sp.userData.baseY = y;
    (this.icons ||= []).push(sp);
    return sp;
  }

  hideNode(n) { for (const [set, i] of n.parts) set.setVisible(i, false); n.respawnAt = this.time + (n.kind === 'flower' || n.kind === 'shell' ? 60 : 120); }

  update(dt, night) {
    this.time += dt;
    for (const n of this.nodes) {
      if (n.respawnAt && this.time > n.respawnAt) {
        n.respawnAt = 0; n.hp = n.maxHp;
        for (const [set, i] of n.parts) set.setVisible(i, true);
      }
    }
    if (this.globe) this.globe.rotation.y += dt * 0.4;
    for (const s of this.icons || []) s.position.y = s.userData.baseY + Math.sin(this.time * 2 + s.position.x) * 0.25;
    this.lampGlobes.mesh.material.color.set(night ? '#fff3b0' : '#ffffff');
    for (const m of this.cityMats) m.emissive.set(night ? '#ffffff' : '#000000');
  }
}

function fbmGrove(x, z) {
  return Math.sin(x * 0.045 + 1.7) * Math.cos(z * 0.05 - 0.4) + Math.sin(x * 0.11 + z * 0.07) * 0.4;
}
