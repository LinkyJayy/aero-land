// Ties terrain, props, blocks, track and sky together and answers physics / targeting queries.
import * as THREE from 'three';
import { buildTerrain, buildWater, heightAt, WORLD } from './terrain.js';
import { Sky } from './sky.js';
import { Props } from './props.js';
import { BlockWorld } from './blocks.js';
import { Track, TRACK_WIDTH } from './track.js';

export class World {
  constructor(scene) {
    this.scene = scene;
    this.sky = new Sky(scene);
    this.terrain = buildTerrain();
    this.water = buildWater();
    scene.add(this.terrain, this.water);
    this.props = new Props(scene);
    this.track = new Track();
    scene.add(this.track.buildMesh());
    this.blocks = new BlockWorld(scene);
    this.track.spot = (() => {
      const p = this.track.pointAt(0.985), t = this.track.tangentAt(0.985);
      const o = TRACK_WIDTH / 2 + 4; // beside the start line, outside the circuit
      return { x: p.x + t.z * o, z: p.z - t.x * o, r: 5, label: 'Aero Kart Race', icon: '🏎️', action: 'game:racing' };
    })();
    this.props.spots.push(this.track.spot);
    scene.add(this.props.iconSprite('🏎️', this.track.spot.x, WORLD.track.h + 4, this.track.spot.z));
    this.bubbles = makeAmbientBubbles(scene);
  }

  // Highest walkable surface at (x,z) that is not more than `step` above `y`.
  groundAt(x, z, y, step = 0.6, rad = 0.3) {
    let g = heightAt(x, z);
    for (const p of this.props.platforms) {
      if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1 && p.top <= y + step && p.top > g) g = p.top;
    }
    const B = this.blocks;
    if (B.map.size) {
      const maxY = y + step;
      for (const [ox, oz] of [[-rad, -rad], [rad, -rad], [-rad, rad], [rad, rad]]) {
        const t = B.topBelow(Math.floor(x + ox), Math.floor(z + oz), maxY);
        if (t > g) g = t;
      }
    }
    return g;
  }

  // Does a body of radius `rad` standing at (x,y,z) with height `h` overlap something solid?
  blocked(x, z, y, h = 1.8, rad = 0.35) {
    for (const [cx, cz, r] of this.props.circles) {
      const dx = x - cx, dz = z - cz, rr = r + rad;
      if (dx * dx + dz * dz < rr * rr) {
        if (y < heightAt(cx, cz) + 8) return true;
      }
    }
    for (const b of this.props.boxes) {
      if (x + rad > b.x0 && x - rad < b.x1 && z + rad > b.z0 && z - rad < b.z1 && y + h > b.y0 && y < b.y1) return true;
    }
    const B = this.blocks;
    if (B.map.size) {
      const y0 = Math.floor(y + 0.05), y1 = Math.floor(y + h - 0.05);
      for (let cx = Math.floor(x - rad); cx <= Math.floor(x + rad); cx++)
        for (let cz = Math.floor(z - rad); cz <= Math.floor(z + rad); cz++)
          for (let cy = y0; cy <= y1; cy++) if (B.solid(cx, cy, cz)) return true;
    }
    return false;
  }

  // Ray against terrain (marching), blocks (DDA) and resource nodes.
  raycast(origin, dir, maxDist) {
    let best = null;
    const bh = this.blocks.raycast(origin, dir, maxDist);
    if (bh) best = { type: 'block', dist: bh.dist, cell: bh.cell, normal: bh.normal };

    let t = 0, prevAbove = true;
    const step = 0.25, lim = best ? best.dist : maxDist;
    const p = new THREE.Vector3();
    while (t < lim) {
      p.copy(origin).addScaledVector(dir, t);
      const above = p.y > heightAt(p.x, p.z);
      if (!above && prevAbove && t > 0) {
        // refine
        let a = t - step, b = t;
        for (let i = 0; i < 6; i++) { const m = (a + b) / 2; p.copy(origin).addScaledVector(dir, m); if (p.y > heightAt(p.x, p.z)) a = m; else b = m; }
        p.copy(origin).addScaledVector(dir, b);
        best = { type: 'ground', dist: b, point: p.clone() };
        break;
      }
      prevAbove = above;
      t += step;
    }

    const lim2 = best ? best.dist : maxDist;
    let nodeBest = null;
    const oc = new THREE.Vector3();
    for (const n of this.props.nodes) {
      if (n.respawnAt) continue;
      oc.set(n.x - origin.x, n.y - origin.y, n.z - origin.z);
      const tc = oc.dot(dir);
      if (tc < 0 || tc > lim2 + n.r) continue;
      const d2 = oc.lengthSq() - tc * tc;
      if (d2 < n.r * n.r) {
        const th = tc - Math.sqrt(n.r * n.r - d2);
        if (th < lim2 && (!nodeBest || th < nodeBest.dist)) nodeBest = { type: 'node', node: n, dist: Math.max(0, th) };
      }
    }
    return nodeBest || best;
  }

  update(dt, playerPos, dayT, time) {
    this.sky.update(dt, playerPos, dayT);
    this.water.material.uniforms.uTime.value = time;
    this.water.material.uniforms.uLight.value = this.sky.light;
    this.water.material.uniforms.uSun.value.copy(this.sky.sunDir);
    this.props.update(dt, this.sky.isNight);
    this.blocks.flush();
    this.bubbles.update(dt, playerPos, time);
    for (const pad of this.track.padMeshes) pad.material.opacity = 0.6 + Math.sin(time * 6) * 0.3;
  }
}

function makeAmbientBubbles(scene) {
  const N = 70;
  // soap-bubble shader: clear centre, bright iridescent rim and a specular dot
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 wp = modelMatrix * instanceMatrix * vec4(position,1.0);
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal); vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV;
      void main(){ float f = 1.0 - max(dot(normalize(vN), vV), 0.0);
        float rim = pow(f, 2.5);
        vec3 irid = 0.5 + 0.5 * cos(6.2831 * (f * 1.5 + vec3(0.0, 0.33, 0.67)));
        vec3 col = mix(vec3(0.85, 0.97, 1.0), irid, 0.35);
        float spec = smoothstep(0.9, 0.97, dot(normalize(vN), normalize(vec3(-0.4, 0.7, 0.6))));
        gl_FragColor = vec4(col + spec, rim * 0.85 + spec * 0.9 + 0.04); }`,
  });
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), mat, N);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  scene.add(mesh);
  const b = Array.from({ length: N }, () => ({ x: 0, y: -100, z: 0, s: 0.2, v: 1, ph: Math.random() * 6 }));
  const m = new THREE.Matrix4();
  return {
    mesh,
    enabled: true,
    update(dt, pp, time) {
      mesh.visible = this.enabled;
      if (!this.enabled) return;
      b.forEach((o, i) => {
        o.y += o.v * dt;
        if (o.y > pp.y + 25 || Math.hypot(o.x - pp.x, o.z - pp.z) > 45) {
          const a = Math.random() * 6.28, r = 6 + Math.random() * 38;
          o.x = pp.x + Math.cos(a) * r; o.z = pp.z + Math.sin(a) * r;
          o.y = Math.max(heightAt(o.x, o.z), 0) + Math.random() * 3;
          o.s = 0.1 + Math.random() * 0.45; o.v = 0.6 + Math.random() * 1.2;
        }
        m.makeScale(o.s, o.s, o.s).setPosition(o.x + Math.sin(time + o.ph) * 0.6, o.y, o.z + Math.cos(time * 0.8 + o.ph) * 0.6);
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
