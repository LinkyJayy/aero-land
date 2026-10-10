// Memory Match — flip glossy cards to find all 8 Frutiger Aero pairs.
import { makeOverlay } from './common.js';
import { el } from '../util.js';

const ICONS = ['🫧', '🐬', '🌍', '🌿', '💧', '🦋', '☀️', '🐠'];

export class Memory {
  constructor(ctx) { this.ctx = ctx; }

  start() {
    const o = this.o = makeOverlay('🃏 Memory Match', this.ctx, { canvas: false });
    if (!document.getElementById('mem-style')) {
      document.head.append(el('style', { id: 'mem-style' }, `
        .mem-grid { flex: 1; display: grid; grid-template-columns: repeat(4, 1fr); gap: min(2.4vw, 14px); padding: 12px; width: min(560px, 100vw, 100dvh * 0.9); margin: 0 auto; align-content: center; }
        .mem-card { aspect-ratio: 1; perspective: 600px; cursor: pointer; }
        .mem-in { position: relative; width: 100%; height: 100%; transition: transform .35s; transform-style: preserve-3d; }
        .mem-card.up .mem-in { transform: rotateY(180deg); }
        .mem-f { position: absolute; inset: 0; border-radius: 18px; backface-visibility: hidden; display: grid; place-items: center; font-size: min(9vw, 9vh, 52px); border: 2px solid #fff; box-shadow: 0 6px 14px rgba(0,70,140,.35); }
        .mem-back { background: linear-gradient(180deg, #8ae4ff 0%, #2fb6ff 50%, #0a8de8 51%, #39c4ff 100%); }
        .mem-back::after { content: '🫧'; opacity: .6; }
        .mem-front { transform: rotateY(180deg); background: linear-gradient(180deg, #fff, #dff4ff); }
        .mem-card.done .mem-front { background: linear-gradient(180deg, #e8ffd8, #a8f07a); }
      `));
    }
    this.grid = el('div', { class: 'mem-grid pe' });
    o.root.append(this.grid);
    this.reset();
  }

  reset() {
    const deck = [...ICONS, ...ICONS].sort(() => Math.random() - 0.5);
    this.grid.innerHTML = '';
    this.open = []; this.moves = 0; this.found = 0; this.t = 0; this.done = false;
    this.cards = deck.map((icon) => {
      const card = el('div', { class: 'mem-card' }, el('div', { class: 'mem-in' }, el('div', { class: 'mem-f mem-back' }), el('div', { class: 'mem-f mem-front' }, icon)));
      const c = { icon, el: card, up: false, done: false };
      card.addEventListener('pointerdown', () => this.flip(c));
      this.grid.append(card);
      return c;
    });
  }

  flip(c) {
    if (c.up || c.done || this.open.length >= 2 || this.done) return;
    c.up = true; c.el.classList.add('up');
    this.open.push(c);
    if (this.open.length === 2) {
      this.moves++;
      const [a, b] = this.open;
      if (a.icon === b.icon) {
        a.done = b.done = true;
        setTimeout(() => { a.el.classList.add('done'); b.el.classList.add('done'); }, 300);
        this.open = []; this.found++;
        if (this.found === ICONS.length) setTimeout(() => this.finish(), 600);
      } else {
        setTimeout(() => { a.up = b.up = false; a.el.classList.remove('up'); b.el.classList.remove('up'); this.open = []; }, 800);
      }
    }
  }

  update(dt) {
    if (!this.done) this.t += dt;
    this.o.setInfo(`⏱ ${this.t.toFixed(0)}s · Moves ${this.moves} · Pairs ${this.found}/${ICONS.length}`);
  }

  finish() {
    this.done = true;
    const score = Math.max(50, Math.round(1500 - this.moves * 30 - this.t * 8));
    this.ctx.submit('memory', score);
    this.o.center(`<h2>All pairs found!</h2><div class="big-num">${score}</div><p>${this.moves} moves in ${this.t.toFixed(1)}s</p>`,
      [['Again', 'green', () => { this.o.hideCenter(); this.reset(); }], ['Exit', 'silver', () => this.ctx.close()]]);
  }

  stop() { this.o?.destroy(); }
}
