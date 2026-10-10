// Survival layer: inventory, crafting, health/hunger, and the Smog Blobs that roam at night.
import * as THREE from 'three';
import { BLOCKS } from './world/blocks.js';
import { heightAt, WORLD } from './world/terrain.js';
import { makeJellyMaterial } from './character.js';
import { store, rand } from './util.js';

export const ITEMS = {
  apple: { name: 'Apple', icon: '🍎', food: 3 },
  coconut: { name: 'Coconut', icon: '🥥', food: 4 },
  fish: { name: 'Raw Fish', icon: '🐟', food: 2 },
  grilled: { name: 'Grilled Fish', icon: '🍣', food: 7, heal: 3 },
  salad: { name: 'Fruit Salad', icon: '🥗', food: 8, heal: 4 },
  petal: { name: 'Petal', icon: '🌸' },
  shell: { name: 'Seashell', icon: '🐚' },
  crystal: { name: 'Aqua Crystal', icon: '💎' },
  gel: { name: 'Bubble Gel', icon: '🫧' },
  pickaxe: { name: 'Aqua Pickaxe', icon: '⛏️', tool: true },
  sword: { name: 'Bubble Sword', icon: '🗡️', tool: true },
};
BLOCKS[14].itemKey = 'shellblock'; // "Shell Block" vs the seashell item
for (const b of BLOCKS) if (b) ITEMS[b.itemKey || b.key] = { name: b.name, icon: '🧊', block: b.id, color: b.color };
Object.assign(ITEMS.log, { icon: '🪵' }); Object.assign(ITEMS.stone, { icon: '🪨' }); Object.assign(ITEMS.sand, { icon: '🏖️' });
Object.assign(ITEMS.leaves, { icon: '🍃' }); Object.assign(ITEMS.dirt, { icon: '🟫' }); Object.assign(ITEMS.grass, { icon: '🌱' });

export const RECIPES = [
  { out: ['planks', 4], in: { log: 1 } },
  { out: ['glass', 2], in: { sand: 3 } },
  { out: ['bubble', 4], in: { stone: 2, gel: 1 } },
  { out: ['lime', 4], in: { stone: 2, leaves: 2 } },
  { out: ['marble', 2], in: { stone: 2, shell: 1 } },
  { out: ['ocean', 4], in: { stone: 2, glass: 1 } },
  { out: ['sunny', 4], in: { stone: 2, petal: 2 } },
  { out: ['shellblock', 1], in: { shell: 3 } },
  { out: ['glow', 2], in: { glass: 1, crystal: 1 } },
  { out: ['grass', 2], in: { dirt: 2, leaves: 1 } },
  { out: ['grilled', 1], in: { fish: 1, log: 1 } },
  { out: ['salad', 1], in: { apple: 2, petal: 1 } },
  { out: ['pickaxe', 1], in: { log: 2, crystal: 1 }, once: true },
  { out: ['sword', 1], in: { log: 1, crystal: 2, gel: 1 }, once: true },
];

export function itemForBlock(id) { return BLOCKS[id]?.itemKey || BLOCKS[id]?.key; }

export class Survival {
  constructor(mode) {
    this.mode = mode;
    const saved = store.get('survival.' + mode, null);
    this.inv = saved?.inv || {};
    this.hp = saved?.hp ?? 20;
    this.food = saved?.food ?? 20;
    this.hotbar = saved?.hotbar || [6, 7, 9, 10, 11, 12, 13, 15, 3];
    this.sel = 0;
    this.foodT = 0; this.regenT = 0;
    this.onChange = null;
    this.onToast = null;
    this.onDeath = null;
  }

  get creative() { return this.mode === 'creative'; }
  count(k) { return this.creative && ITEMS[k]?.block ? Infinity : (this.inv[k] || 0); }
  add(k, n = 1) { this.inv[k] = (this.inv[k] || 0) + n; this.changed(); }
  remove(k, n = 1) { if (this.creative && ITEMS[k]?.block) return true; if ((this.inv[k] || 0) < n) return false; this.inv[k] -= n; if (!this.inv[k]) delete this.inv[k]; this.changed(); return true; }
  changed() { this.onChange?.(); this.save(); }
  save() { store.set('survival.' + this.mode, { inv: this.inv, hp: this.hp, food: this.food, hotbar: this.hotbar }); }

  selectedBlock() { return this.hotbar[this.sel]; }

  canCraft(r) {
    if (r.once && this.inv[r.out[0]]) return false;
    return Object.entries(r.in).every(([k, n]) => (this.inv[k] || 0) >= n);
  }
  craft(r) {
    if (!this.canCraft(r)) return false;
    for (const [k, n] of Object.entries(r.in)) this.inv[k] -= n;
    for (const k of Object.keys(this.inv)) if (!this.inv[k]) delete this.inv[k];
    this.add(r.out[0], r.out[1]);
    this.onToast?.(`Crafted ${ITEMS[r.out[0]].icon} ${ITEMS[r.out[0]].name} ×${r.out[1]}`);
    return true;
  }

  eat() {
    if (this.creative) return;
    const foods = Object.keys(this.inv).filter((k) => ITEMS[k]?.food).sort((a, b) => ITEMS[b].food - ITEMS[a].food);
    if (!foods.length) { this.onToast?.('No food! Shake trees for 🍎 or go fishing 🎣'); return; }
    if (this.food >= 20 && this.hp >= 20) { this.onToast?.("You're full!"); return; }
    const k = foods[0], it = ITEMS[k];
    this.remove(k);
    this.food = Math.min(20, this.food + it.food);
    this.hp = Math.min(20, this.hp + (it.heal || 0));
    this.onToast?.(`Yum! ${it.icon} ${it.name}`);
    this.changed();
  }

  damage(n, why) {
    if (this.creative || this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - n);
    this.changed();
    if (this.hp <= 0) {
      this.onToast?.(`You popped! (${why}) Respawning…`);
      this.hp = 20; this.food = Math.max(this.food, 12);
      this.onDeath?.();
    }
  }

  update(dt, sprinting) {
    if (this.creative) return;
    this.foodT += dt * (sprinting ? 2 : 1);
    if (this.foodT > 28) { this.foodT = 0; this.food = Math.max(0, this.food - 1); this.changed(); }
    this.regenT += dt;
    if (this.regenT > 4) {
      this.regenT = 0;
      if (this.food >= 15 && this.hp < 20) { this.hp++; this.changed(); }
      else if (this.food === 0) this.damage(1, 'hunger');
    }
  }
}

// ---------- Smog Blobs (night-time enemies) ----------
export class Blobs {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.geo = new THREE.SphereGeometry(0.8, 18, 14);
    this.eyeGeo = new THREE.SphereGeometry(1, 8, 6);
    this.eyeMat = new THREE.MeshBasicMaterial({ color: '#ff3355' });
    this.spawnT = 0;
  }

  spawn(near) {
    const a = Math.random() * Math.PI * 2, r = rand(24, 40);
    const x = near.x + Math.cos(a) * r, z = near.z + Math.sin(a) * r;
    const y = heightAt(x, z);
    if (y < 0.3 || Math.hypot(x - WORLD.arcade.x, z - WORLD.arcade.z) < WORLD.arcade.r) return;
    const mat = makeJellyMaterial('#6b5a8f', '#2a2140');
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(this.geo, mat);
    body.position.y = 0.8;
    mesh.add(body);
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(this.eyeGeo, this.eyeMat);
      e.scale.set(0.09, 0.14, 0.05);
      e.position.set(s * 0.25, 1.0, 0.72);
      e.rotation.z = s * 0.4;
      mesh.add(e);
    }
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.list.push({ mesh, body, mat, pos: mesh.position, vy: 0, hp: 3, hop: Math.random(), hurtT: 0, atkT: 0, dying: 0 });
  }

  // returns damage dealt to the player this frame
  update(dt, player, night, active, time) {
    let dmg = 0;
    if (active && night) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.list.length < 7) { this.spawn(player.pos); this.spawnT = rand(5, 10); }
    }
    for (const b of this.list) {
      b.mat.uniforms.uFlash.value = Math.max(0, b.hurtT * 3);
      b.hurtT = Math.max(0, b.hurtT - dt);
      if (!night || !active) b.dying = b.dying || 0.001;
      if (b.dying) {
        b.dying += dt;
        b.mesh.scale.setScalar(Math.max(0.01, 1 - b.dying));
        continue;
      }
      const dx = player.pos.x - b.pos.x, dz = player.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      const ground = heightAt(b.pos.x, b.pos.z);
      b.vy -= 20 * dt;
      b.pos.y += b.vy * dt;
      if (b.pos.y <= ground) {
        b.pos.y = ground; b.vy = 0;
        b.hop -= dt;
        if (b.hop <= 0 && d < 34) { b.vy = 6; b.hop = rand(0.4, 1.0); }
      }
      if (b.pos.y > ground + 0.05 && d > 1.2 && d < 34) {
        b.pos.x += (dx / d) * 4.2 * dt; b.pos.z += (dz / d) * 4.2 * dt;
      }
      b.mesh.rotation.y = Math.atan2(dx, dz);
      const sq = b.vy > 0 ? 1.15 : 1 + Math.sin(time * 8) * 0.04;
      b.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      b.atkT -= dt;
      if (d < 1.4 && Math.abs(player.pos.y - b.pos.y) < 1.5 && b.atkT <= 0) { dmg += 2; b.atkT = 1.1; }
      if (ground < -0.5) b.dying = 0.001; // blobs dissolve in water
    }
    for (const b of this.list.filter((o) => o.dying > 1)) { this.scene.remove(b.mesh); b.mat.dispose(); }
    this.list = this.list.filter((o) => o.dying <= 1);
    return dmg;
  }

  // melee attack from the player; returns number of gel dropped
  attack(pos, facing, power) {
    let drops = 0;
    for (const b of this.list) {
      if (b.dying) continue;
      const dx = b.pos.x - pos.x, dz = b.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > 3.4) continue;
      const dot = (dx * Math.sin(facing) + dz * Math.cos(facing)) / (d || 1);
      if (dot < 0.2 && d > 1.2) continue;
      b.hp -= power; b.hurtT = 0.3; b.vy = 5;
      b.pos.x += (dx / (d || 1)) * 1.5; b.pos.z += (dz / (d || 1)) * 1.5;
      if (b.hp <= 0) { b.dying = 0.001; drops += 1 + (Math.random() < 0.4 ? 1 : 0); }
      return { hit: true, drops };
    }
    return { hit: false, drops: 0 };
  }

  clear() { for (const b of this.list) b.dying = b.dying || 0.001; }
}

