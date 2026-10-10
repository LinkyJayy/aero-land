// All DOM UI: main menu, HUD, hotbar, panels (games, bag, crafting, customize, settings, leaderboards), chat.
import * as THREE from 'three';
import { el } from './util.js';
import { BLOCKS, blockSwatch } from './world/blocks.js';
import { ITEMS, RECIPES } from './survival.js';
import { Avatar, EYE_STYLES, HATS, PALETTE, lightState } from './character.js';
import { GAMES } from './minigames/index.js';
import { heightAt, isBeach, isPaved, isPromenade } from './world/terrain.js';

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.panel = null;
  }

  bubblesBg() {
    const b = el('div', { class: 'bubbles' });
    for (let i = 0; i < 18; i++) {
      const s = 12 + Math.random() * 60;
      b.append(el('i', { style: `left:${Math.random() * 100}%;width:${s}px;height:${s}px;animation-duration:${8 + Math.random() * 12}s;animation-delay:${-Math.random() * 15}s` }));
    }
    return b;
  }

  // ---------------- main menu ----------------
  mainMenu({ name, mode, pixel, status, onPlay }) {
    this.menuEl?.remove();
    let chosen = mode;
    const nameIn = el('input', { type: 'text', maxlength: '16', value: name, placeholder: 'Your name' });
    const seg = el('div', { class: 'seg' });
    const modes = [['survival', '🌿 Survival'], ['creative', '✨ Creative']];
    const segBtns = modes.map(([m, label]) => el('button', { class: m === chosen ? 'on' : '', onclick: () => { chosen = m; segBtns.forEach((b, i) => b.classList.toggle('on', modes[i][0] === m)); } }, label));
    seg.append(...segBtns);
    const pxLabel = el('span', {}, String(pixel));
    const pxIn = el('input', { type: 'range', min: '1', max: '10', step: '1', value: String(pixel), oninput: (e) => { pxLabel.textContent = e.target.value; this.game.setPixel(Number(e.target.value)); } });
    this.statusEl = el('div', { class: 'hint' }, status);
    const card = el('div', { class: 'menu-card glass' },
      el('div', { class: 'menu-row' }, el('label', { class: 'field' }, 'Name', nameIn)),
      el('label', { class: 'field' }, 'Game mode', seg),
      el('label', { class: 'field' }, el('span', {}, 'Pixel level: ', pxLabel, ' (1 = sharp, 10 = chunky)'), pxIn),
      el('div', { class: 'menu-row' },
        el('button', { class: 'btn green', onclick: () => onPlay(nameIn.value.trim() || 'Bubble', chosen) }, '▶ Play'),
        el('button', { class: 'btn', onclick: () => this.customize() }, '🎨 Customize'),
        el('button', { class: 'btn silver', onclick: () => this.settings() }, '⚙ Settings')),
      this.statusEl,
      el('div', { class: 'hint' }, this.game.input.touch ? 'Tip: add to Home Screen for fullscreen play 📱' : 'WASD move · Mouse look · Click hit · Right-click place · E use · Space jump'),
    );
    this.menuEl = el('div', { id: 'menu' }, this.bubblesBg(),
      el('h1', { class: 'logo' }, 'Aero ', el('span', {}, 'Land')),
      el('div', { class: 'subtitle' }, 'an open-world bubble sandbox ✦ build · explore · play together'),
      card);
    this.root.append(this.menuEl);
  }

  setStatus(text) { if (this.statusEl) this.statusEl.textContent = text; if (this.netEl) this.netEl.textContent = text; }
  hideMenu() { this.menuEl?.remove(); this.menuEl = null; }

  // ---------------- HUD ----------------
  buildHud(creative) {
    this.hud?.remove();
    const g = this.game;
    this.hpBar = el('b', { style: 'width:100%' });
    this.foodBar = el('b', { style: 'width:100%' });
    const stats = el('div', { class: 'stat-pill glass' + (creative ? ' hidden' : '') },
      '❤', el('div', { class: 'bar hp' }, this.hpBar), '🍗', el('div', { class: 'bar food' }, this.foodBar));
    this.clockEl = el('div', { class: 'clock glass' }, '');
    this.netEl = el('div', { class: 'clock glass' }, '');
    const B = (label, fn, cls = 'silver') => el('button', { class: `btn small ${cls} pe`, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
    const top = el('div', { class: 'topbar' },
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' }, stats, this.clockEl, this.netEl),
      el('div', { class: 'top-buttons' },
        B('🎮 Games', () => this.games(), ''), B('🎒 Bag', () => this.bag()), B('🔨 Craft', () => this.craft()),
        B('🎨 Look', () => this.customize()), B('💬', () => this.chat()), B('⚙', () => this.settings())));
    this.hotbarEl = el('div', { id: 'hotbar', class: 'glass pe' });
    this.toasts = el('div', { id: 'toast-area' });
    this.promptEl = el('div', { id: 'prompt', class: 'glass dark hidden' });
    this.chatLog = el('div', { id: 'chatlog' });
    this.mapCv = el('canvas', { width: '128', height: '128' });
    const mm = el('div', { id: 'minimap', class: 'pe', onclick: () => this.bigMap() }, this.mapCv);
    this.hud = el('div', { id: 'hud' }, el('div', { id: 'crosshair' }), top, mm, this.toasts, this.promptEl, this.chatLog, this.hotbarEl);
    this.root.prepend(this.hud);
    this.buildMapBase();
    this.renderHotbar();
  }

  setHudVisible(v) { this.hud?.classList.toggle('hidden', !v); }

  renderHotbar() {
    const s = this.game.survival;
    if (!s || !this.hotbarEl) return;
    this.hotbarEl.innerHTML = '';
    s.hotbar.forEach((id, i) => {
      const key = this.game.itemKeyForBlock(id);
      const n = s.count(key);
      const slot = el('div', { class: 'slot' + (i === s.sel ? ' sel' : ''), title: BLOCKS[id].name, onclick: () => { s.sel = i; this.renderHotbar(); } },
        el('div', { class: 'sw', style: `background:${blockSwatch(id)};${n === 0 ? 'opacity:.35' : ''}` }),
        el('span', { class: 'ky' }, String(i + 1)),
        n === Infinity ? null : el('span', { class: 'ct' }, String(n)));
      this.hotbarEl.append(slot);
    });
  }

  updateStats(s) {
    if (!this.hpBar) return;
    this.hpBar.style.width = (s.hp / 20) * 100 + '%';
    this.foodBar.style.width = (s.food / 20) * 100 + '%';
  }

  setClock(t, players) {
    if (!this.clockEl) return;
    const mins = Math.floor(t * 24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    const icon = t < 0.15 || t > 0.85 ? '🌙' : '☀️';
    this.clockEl.textContent = `${icon} ${String(h).padStart(2, '0')}:${String(m - (m % 10)).padStart(2, '0')}`;
    this.netEl.textContent = this.game.net.online ? `🌐 ${players} online` : '🔌 Solo';
  }

  toast(text) {
    if (!this.toasts) return;
    const t = el('div', { class: 'toast glass' }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 2600);
  }

  prompt(text) {
    if (!this.promptEl) return;
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.classList.remove('hidden');
    if (this.promptEl.textContent !== text) this.promptEl.textContent = text;
  }

  chatLine(name, text) {
    if (!this.chatLog) return;
    const d = el('div', {}, el('b', {}, name + ': '), text);
    this.chatLog.append(d);
    while (this.chatLog.children.length > 6) this.chatLog.firstChild.remove();
    setTimeout(() => d.remove(), 15000);
  }

  // ---------------- minimap ----------------
  buildMapBase() {
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d'), img = g.createImageData(S, S);
    const scale = 540 / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const wx = (x - S / 2) * scale, wz = (y - S / 2) * scale;
      const h = heightAt(wx, wz);
      let c = h < -0.15 ? [40, 150, 255] : isPromenade(wx, wz) || isPaved(wx, wz) ? [205, 215, 225] : isBeach(wx, wz) && h < 2.2 ? [247, 227, 166] : [80, 220, 40];
      if (h > 6) c = c.map((v) => v * 0.85);
      const i = (y * S + x) * 4;
      img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapBase = cv;
  }

  drawMap(player, others, spots, bigCtx = null) {
    const big = !!bigCtx;
    const g = bigCtx || this.mapCv.getContext('2d');
    const S = big ? g.canvas.width : 128;
    const toMap = (x, z) => big ? [(x / 540 + 0.5) * S, (z / 540 + 0.5) * S] : [64 + (x - player.pos.x) / 1.6, 64 + (z - player.pos.z) / 1.6];
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, S, S);
    if (big) g.drawImage(this.mapBase, 0, 0, S, S);
    else {
      g.save();
      g.translate(64, 64); g.scale(540 / 128 / 1.6, 540 / 128 / 1.6);
      g.drawImage(this.mapBase, -(player.pos.x / 540 + 0.5) * 128, -(player.pos.z / 540 + 0.5) * 128);
      g.restore();
    }
    g.font = big ? '16px serif' : '9px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const s of spots) { const [x, y] = toMap(s.x, s.z); g.fillText(s.icon, x, y); }
    for (const o of others) {
      const [x, y] = toMap(o.pos.x, o.pos.z);
      g.fillStyle = '#ff8ac2'; g.beginPath(); g.arc(x, y, big ? 5 : 3, 0, 7); g.fill();
    }
    const [px, py] = toMap(player.pos.x, player.pos.z);
    g.save(); g.translate(px, py); g.rotate(-player.facing + Math.PI);
    g.fillStyle = '#ffffff'; g.strokeStyle = '#0a79d1'; g.lineWidth = 1.5;
    const k2 = big ? 2 : 1;
    g.beginPath(); g.moveTo(0, -6 * k2); g.lineTo(4 * k2, 5 * k2); g.lineTo(-4 * k2, 5 * k2); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }

  bigMap() {
    const cv = el('canvas', { width: '540', height: '540', style: 'width:100%;max-width:520px;aspect-ratio:1;border-radius:18px;display:block;margin:0 auto;image-rendering:pixelated' });
    const p = this.openPanel('🗺️ Map of Aero Land', cv, el('p', { class: 'hint' }, '🏎️ race track · 🎯🫧🃏 arcade plaza · 🎣 fishing · 🏖️ beach to the east · 🏙️ city to the north'));
    const draw = () => { if (!p.isConnected) return; this.drawMap(this.game.player, this.game.othersList(), this.game.spots(), cv.getContext('2d')); requestAnimationFrame(draw); };
    draw();
  }

  // ---------------- panels ----------------
  openPanel(title, ...content) {
    this.closePanel();
    this.game.onPanel?.(true);
    const close = el('button', { class: 'btn red close-x', onclick: () => this.closePanel() }, '✕');
    const p = el('div', { class: 'panel glass' }, el('h2', {}, el('span', {}, title), close), ...content);
    this.root.append(p);
    this.panel = p;
    return p;
  }

  closePanel() {
    if (!this.panel) return;
    this.panel.remove(); this.panel = null;
    this.preview?.dispose(); this.preview = null;
    this.game.onPanel?.(false);
  }

  games() {
    const grid = el('div', { class: 'grid' });
    for (const [key, g] of Object.entries(GAMES)) {
      grid.append(el('div', { class: 'tile', onclick: () => { this.closePanel(); this.game.launch(key); } },
        el('span', { class: 'ico' }, g.icon), g.name, el('small', {}, g.desc), el('small', {}, '📍 ' + g.where)));
    }
    grid.append(el('div', { class: 'tile', onclick: () => this.leaderboards() }, el('span', { class: 'ico' }, '🏆'), 'Leaderboards', el('small', {}, 'Top players on this server')));
    grid.append(el('div', { class: 'tile', onclick: () => this.bigMap() }, el('span', { class: 'ico' }, '🗺️'), 'World Map', el('small', {}, 'Find the beach, track & arcade')));
    this.openPanel('🎮 Mini-games', el('p', { class: 'hint', style: 'text-align:left' }, 'Play right here, or visit the kiosks around the world.'), grid);
  }

  leaderboards() {
    const wrap = el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(200px,1fr))' });
    for (const [key, g] of Object.entries(GAMES)) {
      const list = this.game.leaderboard(key);
      const rows = list.length ? list.map((e, i) => el('tr', {}, el('td', {}, `${['🥇', '🥈', '🥉'][i] || i + 1 + '.'} ${e.name}`), el('td', {}, `${e.value}${g.unit === 's' ? 's' : g.unit === 'kg' ? 'kg' : ''}`)))
        : [el('tr', {}, el('td', {}, 'No scores yet — be the first!'), el('td', {}, ''))];
      wrap.append(el('div', { class: 'tile', style: 'text-align:left;cursor:default' }, el('div', {}, g.icon + ' ' + g.name), el('table', { class: 'lb' }, ...rows)));
    }
    this.openPanel('🏆 Leaderboards', el('p', { class: 'hint' }, this.game.net.online ? 'Live server rankings' : 'Solo mode: your personal bests'), wrap);
  }

  bag() {
    const s = this.game.survival;
    const items = Object.entries(s.inv).filter(([, n]) => n > 0);
    const grid = el('div', { class: 'inv-grid' });
    for (const [k, n] of items) {
      const it = ITEMS[k]; if (!it) continue;
      const icon = it.block ? el('span', { class: 'sw', style: `display:inline-block;width:22px;height:22px;border-radius:6px;background:${blockSwatch(it.block)}` }) : el('span', { style: 'font-size:20px' }, it.icon);
      const node = el('div', { class: 'inv-item', title: it.block ? 'Tap to put in the selected hotbar slot' : it.food ? 'Tap to eat' : '' }, icon, el('span', {}, `${it.name} ×${n}`));
      if (it.block) node.addEventListener('click', () => { s.hotbar[s.sel] = it.block; s.save(); this.renderHotbar(); this.toast(`${it.name} → slot ${s.sel + 1}`); });
      grid.append(node);
    }
    const blockPicker = el('div', { class: 'inv-grid' });
    for (const b of BLOCKS) if (b) {
      blockPicker.append(el('div', { class: 'inv-item', onclick: () => { s.hotbar[s.sel] = b.id; s.save(); this.renderHotbar(); this.toast(`${b.name} → slot ${s.sel + 1}`); } },
        el('span', { style: `display:inline-block;width:22px;height:22px;border-radius:6px;background:${blockSwatch(b.id)}` }), b.name));
    }
    this.openPanel('🎒 Bag',
      s.creative ? el('p', { class: 'hint' }, 'Creative mode: unlimited blocks. Tap a block to put it in hotbar slot ' + (s.sel + 1) + '.') : el('p', { class: 'hint' }, 'Gather by hitting trees, rocks, flowers, shells and the ground. Tap a block to assign it to hotbar slot ' + (s.sel + 1) + '.'),
      s.creative ? blockPicker : (items.length ? grid : el('p', {}, 'Your bag is empty. Go explore! 🌳🪨🐚')),
      s.creative ? null : el('div', { class: 'menu-row', style: 'margin-top:12px' }, el('button', { class: 'btn orange', onclick: () => { s.eat(); this.bag(); } }, '🍎 Eat best food')));
  }

  craft() {
    const s = this.game.survival;
    if (s.creative) { this.toast('Creative mode has every block already ✨'); return; }
    const list = el('div');
    for (const r of RECIPES) {
      const out = ITEMS[r.out[0]];
      const ins = Object.entries(r.in).map(([k, n]) => `${ITEMS[k].icon === '🧊' ? ITEMS[k].name : ITEMS[k].icon} ${s.inv[k] || 0}/${n}`).join('  ');
      const ok = s.canCraft(r);
      list.append(el('div', { class: 'recipe' },
        el('span', {}, `${out.icon === '🧊' ? '🧱' : out.icon} ${out.name} ×${r.out[1]}`),
        el('span', { class: 'hint' }, ins),
        el('button', { class: 'btn small ' + (ok ? 'green' : 'silver'), onclick: () => { if (s.craft(r)) this.craft(); else this.toast('Not enough materials'); } }, 'Craft')));
    }
    this.openPanel('🔨 Crafting', list);
  }

  chat() {
    const input = el('input', { type: 'text', maxlength: '140', placeholder: 'Say something nice…' });
    const send = () => { const t = input.value.trim(); if (t) this.game.sendChat(t); this.closePanel(); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); if (e.key === 'Escape') this.closePanel(); e.stopPropagation(); });
    this.openPanel('💬 Chat', el('div', { class: 'menu-row' }, input, el('button', { class: 'btn green', onclick: send }, 'Send')),
      el('div', { class: 'chips', style: 'margin-top:10px' }, ...['Hi! 👋', 'Race me! 🏎️', 'Nice build! 🏠', 'GG ✨', 'Follow me!'].map((q) => el('button', { onclick: () => { this.game.sendChat(q); this.closePanel(); } }, q))));
    setTimeout(() => input.focus(), 50);
  }

  settings() {
    const st = this.game.settings;
    const row = (label, input) => el('label', { class: 'field', style: 'margin-bottom:10px' }, label, input);
    const range = (key, min, max, step, onChange, fmt = (v) => v) => {
      const lab = el('b', {}, String(fmt(st[key])));
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(st[key]),
        oninput: (e) => { st[key] = Number(e.target.value); lab.textContent = fmt(st[key]); onChange?.(st[key]); this.game.saveSettings(); } });
      return [lab, r];
    };
    const toggle = (key, label, onChange) => {
      const b = el('button', { class: 'btn small ' + (st[key] ? 'green' : 'silver'), onclick: () => { st[key] = !st[key]; b.className = 'btn small ' + (st[key] ? 'green' : 'silver'); b.textContent = (st[key] ? '✔ ' : '✖ ') + label; onChange?.(st[key]); this.game.saveSettings(); } }, (st[key] ? '✔ ' : '✖ ') + label);
      return b;
    };
    const [pxL, pxR] = range('pixel', 1, 10, 1, (v) => this.game.setPixel(v));
    const [vdL, vdR] = range('view', 150, 700, 10, (v) => this.game.setView(v));
    const [seL, seR] = range('sens', 0.3, 3, 0.1, (v) => { this.game.input.sensitivity = v; }, (v) => Number(v).toFixed(1));
    const [fovL, fovR] = range('fov', 50, 95, 1, (v) => { this.game.camera.fov = v; this.game.camera.updateProjectionMatrix(); });
    this.openPanel('⚙ Settings',
      row(el('span', {}, 'Pixel level ', pxL, ' — higher = chunkier retro pixels & faster on phones'), pxR),
      row(el('span', {}, 'View distance ', vdL), vdR),
      row(el('span', {}, 'Look sensitivity ', seL), seR),
      row(el('span', {}, 'Field of view ', fovL), fovR),
      el('div', { class: 'menu-row' },
        toggle('bubbles', 'Floating bubbles', (v) => { this.game.world.bubbles.enabled = v; }),
        toggle('names', 'Name tags', (v) => this.game.setNamesVisible(v)),
        toggle('touch', 'Touch controls', (v) => this.game.input.setTouchVisible(v && this.game.playing))),
      el('div', { class: 'menu-row', style: 'margin-top:10px' },
        this.game.playing ? el('button', { class: 'btn orange', onclick: () => { this.closePanel(); this.game.toMenu(); } }, '🏠 Main menu') : null,
        el('button', { class: 'btn red small', onclick: () => { if (confirm('Reset your inventory & stats for this mode?')) this.game.resetProgress(); } }, 'Reset progress')));
  }

  customize() {
    const g = this.game;
    const look = { ...g.look };
    const wrap = el('div', { id: 'preview-wrap' });
    const swatches = (key) => {
      const row = el('div', { class: 'swatches' });
      for (const c of PALETTE) {
        const b = el('button', { class: look[key] === c ? 'on' : '', style: `background:${c}`, title: c, onclick: () => { look[key] = c; [...row.children].forEach((x) => x.classList.toggle('on', x === b)); apply(); } });
        row.append(b);
      }
      const custom = el('input', { type: 'color', value: look[key], style: 'width:34px;height:34px;border:0;padding:0;background:none', oninput: (e) => { look[key] = e.target.value; apply(); } });
      row.append(custom);
      return row;
    };
    const chips = (key, opts) => {
      const row = el('div', { class: 'chips' });
      for (const o of opts) {
        const b = el('button', { class: look[key] === o ? 'on' : '', onclick: () => { look[key] = o; [...row.children].forEach((x) => x.classList.toggle('on', x === b)); apply(); } }, o);
        row.append(b);
      }
      return row;
    };
    const sizeIn = el('input', { type: 'range', min: '0.8', max: '1.25', step: '0.05', value: String(look.size || 1), oninput: (e) => { look.size = Number(e.target.value); apply(); } });
    const apply = () => this.preview?.avatar.setLook(look);
    const controls = el('div', {},
      el('h3', {}, 'Top colour (head & shoulders)'), swatches('top'),
      el('h3', {}, 'Bottom colour (glow)'), swatches('bottom'),
      el('h3', {}, 'Eyes'), chips('eyes', EYE_STYLES),
      el('h3', {}, 'Hat'), chips('hat', HATS),
      el('h3', {}, 'Hat colour'), swatches('hatColor'),
      el('h3', {}, 'Size'), sizeIn,
      el('div', { class: 'menu-row', style: 'margin-top:12px' },
        el('button', { class: 'btn green', onclick: () => { g.setLook(look); this.closePanel(); this.toast('Looking fresh! ✨'); } }, '✔ Save look'),
        el('button', { class: 'btn silver', onclick: () => { Object.assign(look, { top: PALETTE[(Math.random() * PALETTE.length) | 0], bottom: PALETTE[(Math.random() * PALETTE.length) | 0], eyes: EYE_STYLES[(Math.random() * EYE_STYLES.length) | 0], hat: HATS[(Math.random() * HATS.length) | 0], hatColor: PALETTE[(Math.random() * PALETTE.length) | 0] }); apply(); } }, '🎲 Random')));
    this.openPanel('🎨 Customize your Aero buddy', el('div', { class: 'custom-layout' }, wrap, controls));
    this.preview = new Preview(wrap, look, () => g.settings.pixel);
  }
}

// Small separate renderer for the character customizer.
class Preview {
  constructor(container, look, pixelFn) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#6fdc3a', 1.2));
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(0, 1.4, 6);
    this.camera.lookAt(0, 1.05, 0);
    this.avatar = new Avatar(look);
    this.avatar.shadow.visible = true;
    this.scene.add(this.avatar.root);
    this.pixelFn = pixelFn;
    this.alive = true;
    this.t = 0;
    let dragging = false, lx = 0;
    const cv = this.renderer.domElement;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', (e) => { if (dragging) { this.avatar.root.rotation.y += (e.clientX - lx) * 0.01; lx = e.clientX; } });
    cv.addEventListener('pointerup', () => { dragging = false; });
    const loop = () => {
      if (!this.alive) return;
      const w = container.clientWidth || 300, h = Math.max(220, container.clientHeight || 300);
      const px = Math.max(1, Math.round(this.pixelFn() * 0.75));
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(Math.ceil(w / px), Math.ceil(h / px), false);
      cv.style.width = '100%'; cv.style.height = h + 'px';
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
      this.t += 1 / 60;
      if (!dragging) this.avatar.root.rotation.y += 0.01;
      const saved = lightState.level; lightState.level = 1;
      this.avatar.animate(1 / 60, 0, 'idle', this.t);
      this.renderer.render(this.scene, this.camera);
      lightState.level = saved;
      requestAnimationFrame(loop);
    };
    loop();
  }
  dispose() { this.alive = false; this.avatar.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss?.(); }
}

