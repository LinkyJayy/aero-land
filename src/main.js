// Aero Land — entry point and game loop.
import * as THREE from 'three';
import './style.css';
import { World } from './world/world.js';
import { Sky } from './world/sky.js';
import { WORLD, surfaceAt } from './world/terrain.js';
import { BLOCKS } from './world/blocks.js';
import { Avatar, DEFAULT_LOOK, lightState, makeNameTag } from './character.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Net } from './net.js';
import { Survival, Blobs, ITEMS, itemForBlock } from './survival.js';
import { UI } from './ui.js';
import { GAMES } from './minigames/index.js';
import { store, el, isTouch, clamp } from './util.js';

const NODE_LABEL = { tree: '🌳 Tree', rock: '🪨 Rock', crystal: '💎 Crystal', flower: '🌸 Flower', shell: '🐚 Seashell' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.root = document.getElementById('ui');
    this.loading = el('div', { id: 'loading' }, '🫧 Blowing bubbles…');
    this.root.append(this.loading);

    const touch = isTouch();
    this.settings = { pixel: touch ? 3 : 3, view: touch ? 320 : 520, sens: 1, fov: 70, bubbles: true, names: true, touch: true, ...store.get('settings', {}) };
    this.look = { ...DEFAULT_LOOK, ...store.get('look', {}) };
    this.name = store.get('name', 'Bubble' + Math.floor(Math.random() * 900 + 100));
    this.mode = store.get('mode', 'survival');

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.1, 2000);

    this.input = new Input(this.canvas);
    this.input.sensitivity = this.settings.sens;
    this.world = new World(this.scene);
    this.world.bubbles.enabled = this.settings.bubbles;
    this.setView(this.settings.view);

    this.avatar = new Avatar(this.look);
    this.scene.add(this.avatar.root);
    this.player = new Player(this.world, this.avatar, this.camera);
    this.player.spawnAt(WORLD.spawn);
    this.player.onLand = (v) => { if (v > 17) this.survival?.damage(Math.floor((v - 15) / 2), 'fell'); };
    this.blobs = new Blobs(this.scene);

    this.others = new Map();
    this.boards = store.get('localBest', {});
    this.serverBoards = null;
    this.net = new Net();
    this.setupNet();

    // ghost block for building
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), new THREE.MeshBasicMaterial({ color: '#ffffff', wireframe: true, transparent: true, opacity: 0.8 }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.ui = new UI(this.root, this);
    this.onPanel = (open) => {
      this.panelOpen = open;
      if (open && document.pointerLockElement) document.exitPointerLock();
    };
    if (this.input.touch) { this.input.buildTouch(this.root); this.input.setTouchVisible(false); }

    this.clock = new THREE.Clock();
    this.time = 0; this.hitCd = 0; this.mapT = 0; this.saveT = 0;
    this.playing = false;
    this.mg = null;
    addEventListener('resize', () => this.resize());
    this.resize();
    this.loading.remove();
    this.ui.mainMenu({ name: this.name, mode: this.mode, pixel: this.settings.pixel, status: 'Connecting to server…', onPlay: (n, m) => this.play(n, m) });
    this.net.connect(this.name, this.look);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- settings ----------
  saveSettings() { store.set('settings', this.settings); }
  setPixel(v) { this.settings.pixel = clamp(Math.round(v), 1, 10); this.saveSettings(); this.resize(); this.mg?.o?.resize?.(); }
  setView(v) { this.scene.fog.far = v; this.scene.fog.near = v * 0.25; this.camera.far = Math.max(1000, v * 2); this.camera.updateProjectionMatrix(); }
  setNamesVisible(v) { for (const o of this.others.values()) if (o.avatar.tag) o.avatar.tag.visible = v; }
  resize() {
    const w = innerWidth, h = innerHeight, px = this.settings.pixel;
    this.renderer.setSize(Math.ceil(w / px), Math.ceil(h / px), false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ---------- flow ----------
  play(name, mode) {
    this.name = name.slice(0, 16); this.mode = mode;
    store.set('name', this.name); store.set('mode', mode);
    this.ui.hideMenu();
    this.survival = new Survival(mode);
    this.survival.onChange = () => { this.ui.updateStats(this.survival); this.ui.renderHotbar(); };
    this.survival.onToast = (t) => this.ui.toast(t);
    this.survival.onDeath = () => { this.player.spawnAt(WORLD.spawn); this.avatar.flash = 1; };
    this.ui.buildHud(mode === 'creative');
    this.ui.updateStats(this.survival);
    this.avatar.setName(this.name);
    this.avatar.tag.visible = false; // hide our own tag
    const savedPos = store.get('pos.' + mode, null);
    if (savedPos) this.player.spawnAt(new THREE.Vector3(savedPos[0], 0, savedPos[1]));
    this.playing = true;
    this.input.setTouchVisible(this.settings.touch);
    this.net.send({ t: 'look', look: this.look, name: this.name });
    this.net.name = this.name;
    this.ui.toast(`Welcome to Aero Land, ${this.name}! 🫧`);
    this.ui.toast(mode === 'creative' ? '✨ Creative: unlimited blocks, press Fly to soar' : '🌿 Survival: gather, craft, build — beware Smog Blobs at night');
  }

  toMenu() {
    this.closeGame();
    this.playing = false;
    this.ui.hud?.remove(); this.ui.hud = null;
    this.input.setTouchVisible(false);
    this.blobs.clear();
    this.savePos();
    if (document.pointerLockElement) document.exitPointerLock();
    this.ui.mainMenu({ name: this.name, mode: this.mode, pixel: this.settings.pixel, status: this.net.online ? '🌐 Connected — multiplayer on' : '🔌 Solo mode', onPlay: (n, m) => this.play(n, m) });
  }

  savePos() { if (this.survival) store.set('pos.' + this.mode, [this.player.pos.x, this.player.pos.z]); }

  resetProgress() {
    store.set('survival.' + this.mode, null);
    this.survival = new Survival(this.mode);
    this.survival.onChange = () => { this.ui.updateStats(this.survival); this.ui.renderHotbar(); };
    this.survival.onToast = (t) => this.ui.toast(t);
    this.survival.onDeath = () => this.player.spawnAt(WORLD.spawn);
    this.ui.updateStats(this.survival); this.ui.renderHotbar();
    this.ui.toast('Progress reset');
  }

  setLook(look) {
    this.look = { ...look };
    store.set('look', this.look);
    this.avatar.setLook(this.look);
    this.net.look = this.look;
    this.net.send({ t: 'look', look: this.look, name: this.name });
  }

  itemKeyForBlock(id) { return itemForBlock(id); }

  // ---------- multiplayer ----------
  setupNet() {
    const N = this.net;
    N.on('status', (s) => this.ui?.setStatus(s === 'online' ? '🌐 Connected — multiplayer on' : '🔌 Solo mode (no server found)'));
    N.on('welcome', (m) => {
      for (const o of this.others.values()) this.removeOther(o.id);
      for (const p of m.players) this.addOther(p.id, p.name, p.look, p.state);
      this.world.blocks.load(m.blocks);
      this.serverBoards = m.leaderboards;
      if (this.playing) this.net.send({ t: 'look', look: this.look, name: this.name });
    });
    N.on('disconnect', () => {
      for (const o of [...this.others.values()]) this.removeOther(o.id);
      this.world.blocks.load(store.get('blocks.offline', []));
      this.ui.toast('Disconnected — playing solo');
    });
    N.on('join', (m) => { this.addOther(m.id, m.name, m.look, null); if (this.playing) this.ui.toast(`🫧 ${m.name} joined`); });
    N.on('leave', (m) => { const o = this.others.get(m.id); if (o && this.playing) this.ui.toast(`👋 ${o.name} left`); this.removeOther(m.id); });
    N.on('state', (m) => { const o = this.others.get(m.id); if (o) this.applyState(o, m.s); });
    N.on('look', (m) => { const o = this.others.get(m.id); if (o) { o.avatar.setLook(m.look); if (m.name && m.name !== o.name) { o.name = m.name; o.avatar.setName(m.name); o.avatar.tag.visible = this.settings.names; } } });
    N.on('chat', (m) => {
      this.ui.chatLine(m.name, m.text);
      const o = this.others.get(m.id);
      if (o) this.speech(o.avatar, m.text);
    });
    N.on('block', (m) => this.world.blocks.set(m.x, m.y, m.z, m.b, true));
    N.on('leaderboard', (m) => { if (this.serverBoards) this.serverBoards[m.game] = m.list; });
    N.on('full', () => this.ui.toast('Server is full — playing solo'));
    this.world.blocks.load(store.get('blocks.offline', []));
    this.world.blocks.onChange = (x, y, z, b) => {
      if (N.online) N.send({ t: 'block', x, y, z, b });
      else this.offlineDirty = true;
    };
  }

  addOther(id, name, look, state) {
    const avatar = new Avatar(look, name);
    avatar.tag.visible = this.settings.names;
    this.scene.add(avatar.root);
    const o = { id, name, avatar, pos: new THREE.Vector3(), target: new THREE.Vector3(), rot: 0, anim: 'idle', speed: 0, v: '' };
    this.others.set(id, o);
    if (state) { this.applyState(o, state); o.pos.copy(o.target); }
    else avatar.root.visible = false;
  }
  removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    this.scene.remove(o.avatar.root); o.avatar.dispose();
    this.others.delete(id);
  }
  applyState(o, s) {
    o.target.set(s.x, s.y, s.z); o.rot = s.r; o.anim = s.a || 'idle'; o.speed = s.sp || 0;
    if (!o.avatar.root.visible) { o.avatar.root.visible = true; o.pos.copy(o.target); }
    o.avatar.setKart(s.v === 'kart');
  }
  othersList() { return [...this.others.values()]; }

  speech(avatar, text) {
    if (avatar.speech) { avatar.root.remove(avatar.speech); avatar.speech.material.map.dispose(); }
    const sp = makeNameTag(text.length > 28 ? text.slice(0, 27) + '…' : text, '#2a8d06');
    sp.position.y = 3.2;
    avatar.root.add(sp);
    avatar.speech = sp;
    clearTimeout(avatar.speechT);
    avatar.speechT = setTimeout(() => { avatar.root.remove(sp); sp.material.map.dispose(); if (avatar.speech === sp) avatar.speech = null; }, 5000);
  }

  sendChat(text) {
    this.ui.chatLine(this.name, text);
    this.speech(this.avatar, text);
    this.net.send({ t: 'chat', text });
  }

  leaderboard(game) {
    if (this.net.online && this.serverBoards) return this.serverBoards[game] || [];
    const v = this.boards[game];
    return v == null ? [] : [{ name: this.name, value: v }];
  }

  best(game) { return this.boards[game] ?? null; }

  submit(game, value) {
    const lower = GAMES[game]?.lower;
    const v = Math.round(value * 100) / 100;
    const prev = this.boards[game];
    if (prev == null || (lower ? v < prev : v > prev)) {
      this.boards[game] = v; store.set('localBest', this.boards);
      this.ui.toast(`🏆 New personal best in ${GAMES[game].name}!`);
    }
    this.net.send({ t: 'score', game, value: v });
  }

  spots() { return this.world.props.spots; }

  // ---------- mini-games ----------
  launch(key) {
    const G = GAMES[key];
    if (!G || !this.playing) return;
    this.closeGame();
    this.ui.closePanel();
    if (document.pointerLockElement) document.exitPointerLock();
    const ctx = {
      root: this.root, world: this.world, scene: this.scene, camera: this.camera, player: this.player, avatar: this.avatar, input: this.input,
      pixelSize: () => this.settings.pixel,
      close: () => this.closeGame(),
      submit: (g, v) => this.submit(g, v),
      best: (g) => this.best(g),
      reward: (k, n) => { if (!this.survival.creative || !ITEMS[k]?.block) this.survival.add(k, n); },
      toast: (t) => this.ui.toast(t),
    };
    this.mg = new G.cls(ctx);
    this.mgKey = key;
    this.mg.start();
    this.ui.setHudVisible(false);
    if (!this.mg.mode3d) this.input.setTouchVisible(false);
  }

  closeGame() {
    if (!this.mg) return;
    const mg = this.mg;
    this.mg = null;
    mg.stop();
    this.ui.setHudVisible(true);
    this.input.setTouchVisible(this.playing && this.settings.touch);
    this.input.clear();
  }

  // ---------- gameplay ----------
  updateTarget() {
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const hit = this.world.raycast(cam.position, dir, this.player.camDist + 7);
    this.target = null; this.place = null;
    this.ghost.visible = false;
    if (!hit) return;
    const hp = cam.position.clone().addScaledVector(dir, hit.dist);
    const reach = hp.distanceTo(this.player.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    if (reach > 7.5) return;
    this.target = hit;
    if (hit.type === 'block') {
      const [x, y, z] = hit.cell, [nx, ny, nz] = hit.normal;
      this.place = [x + nx, y + ny, z + nz];
      this.ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
      this.ghost.visible = true;
    } else if (hit.type === 'ground') {
      this.place = [Math.floor(hit.point.x), Math.floor(hit.point.y), Math.floor(hit.point.z)];
      this.ghost.position.set(this.place[0] + 0.5, this.place[1] + 0.5, this.place[2] + 0.5);
      this.ghost.visible = true;
    }
  }

  doHit() {
    const S = this.survival;
    this.avatar.punch();
    const power = S.inv.sword ? 3 : 1;
    const atk = this.blobs.attack(this.player.pos, this.player.facing, power);
    if (atk.hit) { if (atk.drops) { S.add('gel', atk.drops); this.ui.toast(`+${atk.drops} 🫧 Bubble Gel`); } return; }
    const t = this.target;
    if (!t) return;
    const mult = S.inv.pickaxe ? 2 : 1;
    if (t.type === 'node') {
      const n = t.node;
      n.hp -= mult;
      this.shake(n);
      if (!S.creative) for (const [k, chance] of n.drops) {
        if (chance >= 1 || Math.random() < chance * mult) { S.add(k, 1); this.ui.toast(`+1 ${ITEMS[k].icon === '🧊' ? '' : ITEMS[k].icon} ${ITEMS[k].name}`); }
      }
      if (n.hp <= 0) this.world.props.hideNode(n);
    } else if (t.type === 'block') {
      const [x, y, z] = t.cell;
      const id = this.world.blocks.get(x, y, z);
      this.world.blocks.set(x, y, z, 0);
      if (!S.creative && id) S.add(itemForBlock(id), 1);
      this.markOffline();
    } else if (t.type === 'ground' && !S.creative) {
      const surf = surfaceAt(t.point.x, t.point.z);
      const k = surf === 'sand' ? 'sand' : surf === 'stone' ? (Math.random() < 0.4 ? 'stone' : null) : surf === 'grass' ? (Math.random() < 0.25 ? 'grass' : 'dirt') : null;
      if (k) { S.add(k, 1); this.ui.toast(`+1 ${ITEMS[k].name}`); }
    }
  }

  shake(n) {
    for (const [set, i] of n.parts) {
      const m = set.mats[i].clone();
      m.multiply(new THREE.Matrix4().makeScale(0.92, 1.05, 0.92));
      set.mesh.setMatrixAt(i, m);
      set.mesh.instanceMatrix.needsUpdate = true;
      setTimeout(() => { if (!n.respawnAt) set.setVisible(i, true); }, 120);
    }
  }

  doPlace() {
    const S = this.survival, id = S.selectedBlock();
    if (!this.place || !id) return;
    const [x, y, z] = this.place;
    const p = this.player.pos;
    if (x + 1 > p.x - 0.35 && x < p.x + 0.35 && z + 1 > p.z - 0.35 && z < p.z + 0.35 && y + 1 > p.y && y < p.y + 1.8) return; // inside us
    if (this.world.blocks.solid(x, y, z)) return;
    const key = itemForBlock(id);
    if (!S.creative && !S.count(key)) { this.ui.toast(`No ${BLOCKS[id].name} — gather or craft some!`); return; }
    if (this.world.blocks.set(x, y, z, id)) { S.remove(key, 1); this.avatar.punch(); this.markOffline(); }
  }

  markOffline() { if (!this.net.online) this.offlineDirty = true; }

  nearestSpot() {
    let best = null, bd = Infinity;
    for (const s of this.spots()) {
      const d = Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }

  useSpot(s) {
    if (s.action === 'board') this.ui.leaderboards();
    else if (s.action.startsWith('game:')) this.launch(s.action.slice(5));
  }

  handleInput(dt) {
    const I = this.input, S = this.survival;
    if (I.take('menu')) { if (this.ui.panel) this.ui.closePanel(); else if (this.mg) this.closeGame(); else this.ui.settings(); }
    if (this.mg || this.ui.panel) { I.pressed.clear(); return; }
    if (I.take('chat')) { this.ui.chat(); return; }
    if (I.take('inventory')) { this.ui.bag(); return; }
    if (I.take('craft')) { this.ui.craft(); return; }
    if (I.take('games')) { this.ui.games(); return; }
    if (I.take('customize')) { this.ui.customize(); return; }
    if (I.take('settings')) { this.ui.settings(); return; }
    for (let i = 0; i < 9; i++) if (I.take('slot' + i)) { S.sel = i; this.ui.renderHotbar(); }
    if (I.take('next')) { S.sel = (S.sel + 1) % 9; this.ui.renderHotbar(); }
    if (I.take('prev')) { S.sel = (S.sel + 8) % 9; this.ui.renderHotbar(); }
    if (I.take('eat')) S.eat();
    const spot = this.nearestSpot();
    if (I.take('use') && spot) this.useSpot(spot);
    this.hitCd -= dt;
    if (this.hitCd <= 0 && (I.take('hit') || I.held.hit)) { this.hitCd = 0.28; this.doHit(); }
    if (I.take('place')) this.doPlace();
    if (I.take('fly') && !S.creative) this.ui.toast('Flying is a Creative mode power ✨');

    // contextual prompt
    let text = '';
    if (spot) text = `${I.touch ? 'Tap Use' : 'Press E'} — ${spot.icon} ${spot.label}`;
    else if (this.target?.type === 'node') text = `${NODE_LABEL[this.target.node.kind]} — ${I.touch ? 'tap Hit' : 'click'} to gather`;
    else if (this.player.swimming) text = '🏊 Swimming — Jump to bob up';
    this.ui.prompt(text);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    const dayT = Sky.clockTime();
    const sky = this.world.sky;
    lightState.dir.copy(sky.sunDir || lightState.dir);
    lightState.level = Math.max(0.45, sky.light);

    if (this.playing && !this.mg) {
      this.input.update();
      if (!this.ui.panel) this.player.update(dt, this.input, this.survival.creative);
      else this.player.updateCamera(dt);
      this.updateTarget();
      this.handleInput(dt);
      this.survival.update(dt, this.input.sprint && this.player.speed > 7);
      const dmg = this.blobs.update(dt, this.player, sky.isNight, !this.survival.creative, this.time);
      if (dmg) { this.survival.damage(dmg, 'Smog Blob'); this.avatar.flash = 1; }
      if (this.player.swimming && !this.survival.creative && this.survival.food > 0) this.survival.foodT += dt * 0.5;
      this.avatar.animate(dt, this.player.speed, this.player.anim, this.time);
      if (this.input.flyBtn) this.input.flyBtn.classList.toggle('hidden', !this.survival.creative);
    } else if (this.mg) {
      if (this.mg.mode3d) this.ui.prompt('');
      this.mg.update(dt);
      if (this.input.take('menu')) this.closeGame();
    } else {
      // title screen: slow orbit around the park
      const a = this.time * 0.05;
      this.camera.position.set(Math.cos(a) * 60 + 10, 22, Math.sin(a) * 60 + 30);
      this.camera.lookAt(10, 6, 0);
      this.avatar.animate(dt, 0, 'idle', this.time);
    }

    // remote players
    for (const o of this.others.values()) {
      o.pos.lerp(o.target, 1 - Math.exp(-dt * 10));
      o.avatar.root.position.copy(o.pos);
      let d = o.rot - o.avatar.root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      o.avatar.root.rotation.y += d * Math.min(1, dt * 10);
      o.avatar.animate(dt, o.speed, o.anim, this.time);
    }

    if (this.playing) {
      const p = this.player.pos;
      this.net.sendState({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), r: +this.player.facing.toFixed(2), a: this.player.anim, v: this.mgKey === 'racing' && this.mg ? 'kart' : '', sp: +this.player.speed.toFixed(1) }, performance.now());
      this.mapT -= dt;
      if (this.mapT <= 0 && !this.mg) {
        this.mapT = 0.25;
        this.ui.drawMap(this.player, this.othersList(), this.spots());
        this.ui.setClock(dayT, this.others.size + 1);
      }
      this.saveT -= dt;
      if (this.saveT <= 0) {
        this.saveT = 5;
        this.savePos();
        if (this.offlineDirty && !this.net.online) { store.set('blocks.offline', [...this.world.blocks.map]); this.offlineDirty = false; }
      }
    }

    const focus = this.playing ? this.player.pos : new THREE.Vector3(10, 0, 30);
    this.world.update(dt, focus, dayT, this.time);
    if (!this.mg || this.mg.mode3d) this.renderer.render(this.scene, this.camera);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error(e);
    document.getElementById('ui').innerHTML = `<div id="loading">😢 Aero Land couldn't start: ${String(e.message || e)}<br><small>WebGL is required.</small></div>`;
  }
});
