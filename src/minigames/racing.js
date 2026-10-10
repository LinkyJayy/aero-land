// Aero Kart Racing — 3 laps around the Aero Ring against bubble bots, in the live 3D world.
import * as THREE from 'three';
import { makeOverlay } from './common.js';
import { Avatar } from '../character.js';
import { TRACK_WIDTH } from '../world/track.js';
import { heightAt, WORLD } from '../world/terrain.js';

const LAPS = 3;
const BOTS = [
  { name: 'Splash', top: '#ff8ac2', bottom: '#ffd93b', hat: 'crown' },
  { name: 'Drift', top: '#c38bff', bottom: '#6fd6ff', hat: 'cap' },
  { name: 'Zippy', top: '#ffd93b', bottom: '#ff9a3c', hat: 'headphones' },
  { name: 'Mint', top: '#3cffd2', bottom: '#2fb8ff', hat: 'halo' },
];

export class Racing {
  constructor(ctx) { this.ctx = ctx; this.mode3d = true; }

  start() {
    const { world, player, scene, input } = this.ctx;
    this.track = world.track;
    this.o = makeOverlay('🏎️ Aero Kart', this.ctx, { canvas: false, transparent: true });
    input.setRaceMode?.(true);
    player.frozen = true;
    this.savedPos = player.pos.clone();
    this.racers = [];
    const mk = (avatar, isPlayer, i, name) => {
      const u = 1 - 0.012 * (Math.floor(i / 2) + 1);
      const p = this.track.pointAt(u), t = this.track.tangentAt(u);
      const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const lane = (i % 2 ? 1 : -1) * TRACK_WIDTH * 0.22;
      const r = {
        avatar, isPlayer, name,
        pos: new THREE.Vector3(p.x + side.x * lane, p.y, p.z + side.z * lane),
        heading: Math.atan2(t.x, t.z), speed: 0, lap: 0, u, half: false, finished: false, time: 0,
        boost: 0, top: 30 + Math.random() * 3, lane: lane / (TRACK_WIDTH / 2), laneT: 0,
      };
      avatar.setKart(true);
      this.racers.push(r);
      return r;
    };
    BOTS.forEach((b, i) => {
      const a = new Avatar({ ...b, eyes: 'tall', hatColor: '#ffffff' }, b.name);
      scene.add(a.root);
      mk(a, false, i, b.name);
    });
    this.me = mk(this.ctx.avatar, true, BOTS.length, 'You'); // start from the back so the chase cam is clear
    this.state = 'countdown'; this.count = 3.5; this.clock = 0;
    this.big = document.createElement('div');
    this.big.className = 'mg-center big-num';
    this.big.style.cssText = 'font-size:110px;pointer-events:none';
    this.o.root.append(this.big);
    this.o.setInfo(input.touch ? 'Joystick: steer · pull back to brake' : 'W/S: gas & brake · A/D: steer');
  }

  update(dt) {
    const { input, camera } = this.ctx;
    input.update();
    if (this.state === 'countdown') {
      this.count -= dt;
      this.big.textContent = this.count > 0.5 ? Math.ceil(this.count - 0.5) : 'GO!';
      if (this.count <= 0) { this.state = 'race'; this.big.textContent = ''; }
    } else if (this.state === 'race') this.clock += dt;

    for (const r of this.racers) {
      if (this.state !== 'countdown') this.drive(r, dt, input);
      r.avatar.root.position.copy(r.pos);
      r.avatar.root.rotation.y = r.heading;
      r.avatar.animate(dt, r.speed, 'kart', this.clock);
    }
    // kart-kart bumping
    for (let i = 0; i < this.racers.length; i++) for (let j = i + 1; j < this.racers.length; j++) {
      const a = this.racers[i], b = this.racers[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.4 && d > 0.01) { const push = (2.4 - d) / 2; a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; b.pos.x += dx / d * push; b.pos.z += dz / d * push; }
    }

    // camera
    const me = this.me;
    const back = new THREE.Vector3(-Math.sin(me.heading), 0, -Math.cos(me.heading));
    const want = me.pos.clone().addScaledVector(back, 8.5).add(new THREE.Vector3(0, 3.6, 0));
    camera.position.lerp(want, 1 - Math.exp(-dt * 6));
    camera.lookAt(me.pos.x - back.x * 4, me.pos.y + 1.2, me.pos.z - back.z * 4);
    this.ctx.player.pos.copy(me.pos);
    this.ctx.player.facing = me.heading;
    this.ctx.player.anim = 'kart';
    this.ctx.player.speed = me.speed;

    // HUD
    if (this.state !== 'countdown') {
      const order = this.standings();
      const place = order.indexOf(me) + 1;
      const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
      this.o.setInfo(`Lap ${Math.min(LAPS, me.lap + 1)}/${LAPS} · ${['1st', '2nd', '3rd', '4th', '5th'][place - 1]} · ⏱ ${fmt(me.finished ? me.time : this.clock)} · ${Math.round(me.speed * 3.2)} km/h${me.boost > 0 ? ' · 🚀 BOOST' : ''}`);
      if (me.finished && this.state === 'race') this.finish(place, fmt(me.time));
    }
  }

  standings() {
    return [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.time - b.time;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return (b.lap + b.u) - (a.lap + a.u);
    });
  }

  drive(r, dt, input) {
    const near = this.track.nearest(r.pos.x, r.pos.z, r.u);
    const offroad = near.dist > TRACK_WIDTH / 2 + 0.6;
    let steer = 0, throttle = 0;
    if (r.isPlayer) {
      if (r.finished) { throttle = 0; }
      else {
        steer = -input.move.x;
        throttle = input.move.y;
        if (input.touch && Math.abs(input.move.y) < 0.3) throttle = 1; // auto-gas on touch screens
        if (input.jump) throttle = -0.6;
      }
    } else {
      r.laneT -= dt;
      if (r.laneT <= 0) { r.lane = (Math.random() - 0.5) * 1.1; r.laneT = 2 + Math.random() * 3; }
      const look = this.track.pointAt(r.u + 0.025), tt = this.track.tangentAt(r.u + 0.025);
      const side = new THREE.Vector3(-tt.z, 0, tt.x).normalize();
      const tx = look.x + side.x * r.lane * TRACK_WIDTH * 0.35, tz = look.z + side.z * r.lane * TRACK_WIDTH * 0.35;
      let want = Math.atan2(tx - r.pos.x, tz - r.pos.z) - r.heading;
      want = Math.atan2(Math.sin(want), Math.cos(want));
      steer = Math.max(-1, Math.min(1, want * 3));
      // gentle rubber-banding keeps races exciting
      const gap = (this.me.lap + this.me.u) - (r.lap + r.u);
      throttle = r.finished ? 0.3 : Math.max(0.75, Math.min(1.12, 0.94 + gap * 0.9));
    }

    let top = (offroad ? 13 : r.top) * (r.isPlayer ? 1.08 : 1);
    if (r.boost > 0) { r.boost -= dt; top = 46; r.speed = Math.max(r.speed, 38); }
    if (throttle > 0) r.speed += (top * throttle - r.speed) * Math.min(1, dt * 1.3);
    else if (throttle < 0) r.speed = Math.max(-8, r.speed + throttle * 40 * dt);
    else r.speed *= Math.max(0, 1 - dt * 1.2);
    if (offroad && r.speed > top) r.speed += (top - r.speed) * Math.min(1, dt * 3);

    const grip = Math.min(1, Math.abs(r.speed) / 8);
    r.heading += steer * 2.1 * grip * dt * Math.sign(r.speed || 1);
    r.pos.x += Math.sin(r.heading) * r.speed * dt;
    r.pos.z += Math.cos(r.heading) * r.speed * dt;
    r.pos.y = Math.max(heightAt(r.pos.x, r.pos.z), WORLD.track.h + 0.06);
    // keep everyone near the circuit
    if (near.dist > TRACK_WIDTH * 2.2) {
      const p = this.track.pointAt(near.u);
      r.pos.x += (p.x - r.pos.x) * dt * 2; r.pos.z += (p.z - r.pos.z) * dt * 2;
    }

    // boost pads
    for (const bu of this.track.boosts) {
      const p = this.track.pointAt(bu);
      if (Math.hypot(p.x - r.pos.x, p.z - r.pos.z) < 3) r.boost = 1.1;
    }

    // lap logic
    const prev = r.u;
    r.u = near.u;
    if (r.u > 0.4 && r.u < 0.6) r.half = true;
    if (prev > 0.85 && r.u < 0.15 && r.half) {
      r.lap++; r.half = false;
      if (r.lap >= LAPS && !r.finished) { r.finished = true; r.time = this.clock; }
    }
  }

  finish(place, time) {
    this.state = 'done';
    this.ctx.submit('racing', this.me.time);
    const order = this.standings();
    const rows = order.map((r, i) => `<tr><td>${i + 1}. ${r.name}</td><td>${r.finished ? r.time.toFixed(2) + 's' : '—'}</td></tr>`).join('');
    this.o.center(`<h2>${place === 1 ? '🏆 You win!' : `You finished ${['1st', '2nd', '3rd', '4th', '5th'][place - 1]}`}</h2><p>Time ${time}</p><table class="lb">${rows}</table>`,
      [['Race again', 'green', () => { this.stop(true); this.start(); }], ['Exit', 'silver', () => this.ctx.close()]]);
  }

  stop(restart) {
    const { player, scene, input } = this.ctx;
    for (const r of this.racers) {
      if (r.isPlayer) r.avatar.setKart(false);
      else { scene.remove(r.avatar.root); r.avatar.dispose(); }
    }
    this.racers = [];
    this.o?.destroy();
    input.setRaceMode?.(false);
    if (!restart) {
      const s = this.track.spot;
      player.frozen = false;
      player.spawnAt(new THREE.Vector3(s.x + 4, 0, s.z + 4));
    }
  }
}
