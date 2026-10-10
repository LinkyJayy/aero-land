// Third-person player controller with simple capsule-vs-world physics.
import * as THREE from 'three';
import { heightAt } from './world/terrain.js';
import { clamp } from './util.js';

const GRAV = 26, JUMP = 9.5;

export class Player {
  constructor(world, avatar, camera) {
    this.world = world;
    this.avatar = avatar;
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.onGround = false;
    this.swimming = false;
    this.flying = false;
    this.camYaw = 0.6;
    this.camPitch = 0.32;
    this.camDist = 7;
    this.anim = 'idle';
    this.speed = 0;
    this.frozen = false;
    this.onLand = null;
    this.lastGround = 0;
  }

  spawnAt(p) { this.pos.copy(p); this.pos.y = this.world.groundAt(p.x, p.z, 100) + 0.1; this.vel.set(0, 0, 0); }

  update(dt, input, creative) {
    const look = input.consumeLook();
    this.camYaw -= look.dx;
    this.camPitch = clamp(this.camPitch + look.dy, -0.5, 1.35);
    if (input.take('zoom')) this.camDist = this.camDist > 9 ? 4.5 : this.camDist + 3;
    if (input.take('zoomIn')) this.camDist = Math.max(3.5, this.camDist - 1.5);
    if (input.take('zoomOut')) this.camDist = Math.min(14, this.camDist + 1.5);
    if (this.frozen) { this.updateCamera(dt); return; }

    if (input.take('fly') && creative) { this.flying = !this.flying; this.vel.y = 0; }
    if (!creative) this.flying = false;

    const W = this.world;
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw), rz = -Math.sin(this.camYaw);
    let mx = fx * input.move.y + rx * input.move.x, mz = fz * input.move.y + rz * input.move.x;
    const ml = Math.hypot(mx, mz);
    const terrainH = heightAt(this.pos.x, this.pos.z);
    this.swimming = !this.flying && terrainH < -0.8 && this.pos.y < -0.35;

    let speed = this.flying ? (input.sprint ? 24 : 14) : this.swimming ? 4 : input.sprint ? 10 : 6;
    const targetVX = mx * speed, targetVZ = mz * speed;
    const accel = this.onGround || this.flying || this.swimming ? 14 : 4;
    this.vel.x += (targetVX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (targetVZ - this.vel.z) * Math.min(1, accel * dt);

    if (this.flying) {
      this.vel.y = (input.jump ? 10 : 0) - (input.down ? 10 : 0);
    } else if (this.swimming) {
      const target = -0.6;
      this.vel.y += (clamp((target - this.pos.y) * 4, -3, 3) - this.vel.y) * Math.min(1, 6 * dt);
      if (input.jump && this.pos.y > -0.9) this.vel.y = 6.5;
    } else {
      this.vel.y -= GRAV * dt;
      if (input.jump && this.onGround) { this.vel.y = JUMP; this.onGround = false; }
    }

    // horizontal movement with per-axis collision and auto step-up
    const step = this.onGround ? 1.05 : 0.35;
    for (const axis of ['x', 'z']) {
      const d = this.vel[axis] * dt;
      if (!d) continue;
      const nx = axis === 'x' ? this.pos.x + d : this.pos.x;
      const nz = axis === 'z' ? this.pos.z + d : this.pos.z;
      if (!W.blocked(nx, nz, this.pos.y + 0.02)) { this.pos.x = nx; this.pos.z = nz; continue; }
      const g = W.groundAt(nx, nz, this.pos.y, step);
      if (g > this.pos.y && g - this.pos.y <= step && !W.blocked(nx, nz, g + 0.02)) {
        this.pos.x = nx; this.pos.z = nz; this.pos.y = g;
      } else this.vel[axis] = 0;
    }

    // vertical
    const ground = W.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.6);
    const ny = this.pos.y + this.vel.y * dt;
    if (this.vel.y > 0 && W.blocked(this.pos.x, this.pos.z, ny, 1.8, 0.3)) this.vel.y = 0;
    else if (ny <= ground) {
      if (!this.onGround && this.onLand) this.onLand(-this.vel.y);
      this.pos.y = ground; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && !this.flying && !this.swimming && this.vel.y <= 0 && this.pos.y - ground < 0.6) {
      this.pos.y = ground; this.vel.y = 0; // stick to slopes when walking downhill
    } else {
      this.pos.y = ny;
      this.onGround = false;
    }
    if (this.pos.y < -20) this.pos.y = 0;

    // keep inside the world
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 265) { this.pos.x *= 265 / r; this.pos.z *= 265 / r; }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (ml > 0.1) {
      const target = Math.atan2(mx, mz);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, 12 * dt);
    }
    this.anim = this.flying ? 'fly' : this.swimming ? 'swim' : !this.onGround ? 'jump' : this.speed > 7.5 ? 'run' : this.speed > 0.4 ? 'walk' : 'idle';

    this.avatar.root.position.copy(this.pos);
    this.avatar.root.rotation.y = this.facing;
    this.updateCamera(dt);
  }

  updateCamera() {
    const head = this.pos.y + 1.7;
    const cp = Math.cos(this.camPitch);
    const cam = this.camera;
    cam.position.set(
      this.pos.x + Math.sin(this.camYaw) * cp * this.camDist,
      head + Math.sin(this.camPitch) * this.camDist,
      this.pos.z + Math.cos(this.camYaw) * cp * this.camDist,
    );
    const floor = Math.max(heightAt(cam.position.x, cam.position.z), -0.2) + 0.5;
    if (cam.position.y < floor) cam.position.y = floor;
    // aim slightly above the head so the crosshair sits over the world, not the avatar
    cam.lookAt(this.pos.x - Math.sin(this.camYaw) * 2, head + 0.4, this.pos.z - Math.cos(this.camYaw) * 2);
  }
}
