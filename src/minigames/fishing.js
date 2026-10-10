// Fishing — cast, wait for the bite, then keep the fish inside the green zone to reel it in.
import { makeOverlay, glossyBubble, glossyText, cloud } from './common.js';

const FISH = [
  { name: 'Aqua Guppy', icon: '🐟', min: 0.2, max: 1.2, diff: 0.8, w: 50 },
  { name: 'Lime Tetra', icon: '🐠', min: 0.4, max: 2, diff: 1, w: 30 },
  { name: 'Bubble Puffer', icon: '🐡', min: 1, max: 4, diff: 1.3, w: 15 },
  { name: 'Golden Koi', icon: '✨', min: 3, max: 9, diff: 1.7, w: 5 },
];

export class Fishing {
  constructor(ctx) { this.ctx = ctx; }

  start() {
    const o = this.o = makeOverlay('🎣 Fishing', this.ctx);
    this.state = 'idle'; this.t = 0; this.catches = 0; this.best = 0; this.holding = false;
    o.cv.addEventListener('pointerdown', () => this.press());
    addEventListener('pointerup', this.onUp = () => { this.holding = false; });
    this.keyDown = (e) => { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) this.press(); } };
    this.keyUp = (e) => { if (e.code === 'Space') this.holding = false; };
    addEventListener('keydown', this.keyDown); addEventListener('keyup', this.keyUp);
    this.info();
  }

  info() {
    const msg = { idle: 'Tap to cast', wait: 'Wait for a bite…', bite: 'TAP NOW!', reel: 'Hold to lift the green zone' }[this.state] || '';
    this.o.setInfo(`${msg} · Caught ${this.catches}${this.best ? ` · Biggest ${this.best.toFixed(2)}kg` : ''}`);
  }

  press() {
    if (this.o.centerEl) return;
    if (this.state === 'idle') {
      this.state = 'wait'; this.waitT = 1.5 + Math.random() * 4; this.castT = 0;
      const roll = Math.random() * 100;
      let acc = 0; this.fish = FISH.find((f) => (acc += f.w) >= roll) || FISH[0];
    } else if (this.state === 'wait') {
      this.state = 'idle'; this.flash('Too early!');
    } else if (this.state === 'bite') {
      this.state = 'reel'; this.zone = 0.35; this.zoneV = 0; this.fishY = 0.5; this.fishV = 0; this.progress = 0.3; this.holding = true;
    } else if (this.state === 'reel') this.holding = true;
    this.info();
  }

  flash(text) { this.msg = { text, t: 0 }; }

  update(dt) {
    const { o } = this, g = o.g, W = o.W, H = o.H;
    this.t += dt;
    if (this.state === 'wait') {
      this.castT += dt; this.waitT -= dt;
      if (this.waitT <= 0) { this.state = 'bite'; this.biteT = 0.9; this.info(); }
    } else if (this.state === 'bite') {
      this.biteT -= dt;
      if (this.biteT <= 0) { this.state = 'idle'; this.flash('It got away…'); this.info(); }
    } else if (this.state === 'reel') {
      const f = this.fish;
      this.zoneV += (this.holding ? 2.6 : -2.2) * dt;
      this.zoneV *= 0.96;
      this.zone = Math.max(0, Math.min(0.7, this.zone + this.zoneV * dt));
      if (this.zone === 0 || this.zone === 0.7) this.zoneV *= -0.3;
      if (Math.random() < dt * 1.5 * f.diff) this.fishV = (Math.random() - 0.5) * 2.2 * f.diff;
      this.fishY = Math.max(0.02, Math.min(0.98, this.fishY + this.fishV * dt));
      if (this.fishY <= 0.02 || this.fishY >= 0.98) this.fishV *= -1;
      const inside = this.fishY >= this.zone && this.fishY <= this.zone + 0.3;
      this.progress += (inside ? 0.28 : -0.2) * dt;
      if (this.progress >= 1) this.landed();
      else if (this.progress <= 0) { this.state = 'idle'; this.flash('The fish escaped!'); this.info(); }
    }

    // scene
    const sky = g.createLinearGradient(0, 0, 0, H * 0.5);
    sky.addColorStop(0, '#1d8fff'); sky.addColorStop(1, '#bff0ff');
    g.fillStyle = sky; g.fillRect(0, 0, W, H * 0.5);
    g.fillStyle = 'rgba(255,255,255,.9)';
    cloud(g, (this.t * 15) % (W + 200) - 100, 60, 1.2); cloud(g, (this.t * 9 + 400) % (W + 200) - 100, 120, 0.8);
    const sea = g.createLinearGradient(0, H * 0.5, 0, H);
    sea.addColorStop(0, '#2fb8ff'); sea.addColorStop(1, '#0a4fa8');
    g.fillStyle = sea; g.fillRect(0, H * 0.5, W, H * 0.5);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const y = H * 0.52 + i * 22; g.beginPath(); for (let x = 0; x <= W; x += 20) g.lineTo(x, y + Math.sin(x * 0.03 + this.t * 2 + i) * 3); g.stroke(); }
    // pier
    g.fillStyle = '#c99b62'; g.fillRect(0, H * 0.47, W * 0.25, 16);
    g.fillStyle = '#8a6a40'; for (let x = 10; x < W * 0.25; x += 40) g.fillRect(x, H * 0.47 + 16, 8, H * 0.2);
    // bobber + line
    const bx = W * 0.62, by = H * 0.52 + Math.sin(this.t * 3) * 3 + (this.state === 'bite' ? Math.sin(this.t * 40) * 6 + 8 : 0);
    if (this.state !== 'idle') {
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(W * 0.24, H * 0.3); g.quadraticCurveTo(W * 0.45, H * 0.35, bx, by - 8); g.stroke();
      g.fillStyle = '#ff3355'; g.beginPath(); g.arc(bx, by - 4, 8, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by - 4, 8, 0, Math.PI); g.fill();
    }
    // rod
    g.strokeStyle = '#2fb8ff'; g.lineWidth = 5; g.beginPath(); g.moveTo(W * 0.12, H * 0.62); g.lineTo(W * 0.24, H * 0.3); g.stroke();
    if (this.state === 'bite') glossyText(g, '❗', bx, by - 50, 46, '#ffffff', '#ff3355');
    for (let i = 0; i < 6; i++) glossyBubble(g, (i * 173 + 40) % W, H - ((this.t * 30 + i * 90) % (H * 0.45)), 4 + (i % 3) * 3);

    if (this.state === 'reel') {
      const bx2 = W - 70, top = 70, h = H - 140;
      g.fillStyle = 'rgba(255,255,255,.5)'; g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(bx2, top, 40, h, 20); g.fill(); g.stroke();
      const zy = top + h * (1 - this.zone - 0.3);
      const zg = g.createLinearGradient(bx2, 0, bx2 + 40, 0); zg.addColorStop(0, '#c6ff9a'); zg.addColorStop(1, '#3cb515');
      g.fillStyle = zg; g.beginPath(); g.roundRect(bx2 + 4, zy, 32, h * 0.3, 14); g.fill();
      g.font = '28px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(this.fish.icon, bx2 + 20, top + h * (1 - this.fishY));
      g.fillStyle = 'rgba(0,60,120,.3)'; g.beginPath(); g.roundRect(bx2 - 26, top, 14, h, 7); g.fill();
      g.fillStyle = '#ffd93b'; g.beginPath(); g.roundRect(bx2 - 26, top + h * (1 - this.progress), 14, h * this.progress, 7); g.fill();
    }
    if (this.msg) {
      this.msg.t += dt;
      g.globalAlpha = Math.max(0, 1 - this.msg.t / 1.5);
      glossyText(g, this.msg.text, W / 2, H * 0.3, 34);
      g.globalAlpha = 1;
      if (this.msg.t > 1.5) this.msg = null;
    }
  }

  landed() {
    const f = this.fish;
    const kg = f.min + Math.random() * (f.max - f.min);
    this.catches++; this.best = Math.max(this.best, kg);
    this.state = 'idle';
    this.ctx.reward('fish', 1);
    if (f.name === 'Golden Koi') this.ctx.reward('crystal', 1);
    this.ctx.submit('fishing', kg);
    this.o.center(`<h2>You caught a ${f.name}!</h2><div class="big-num">${f.icon} ${kg.toFixed(2)}kg</div><p>+1 🐟 added to your bag${f.name === 'Golden Koi' ? ' · +1 💎 bonus!' : ''}</p>`,
      [['Cast again', 'green', () => { this.o.hideCenter(); this.info(); }], ['Exit', 'silver', () => this.ctx.close()]]);
  }

  stop() {
    removeEventListener('pointerup', this.onUp);
    removeEventListener('keydown', this.keyDown); removeEventListener('keyup', this.keyUp);
    this.o?.destroy();
  }
}
