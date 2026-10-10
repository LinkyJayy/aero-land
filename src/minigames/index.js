import { Darts } from './darts.js';
import { BubblePop } from './bubblepop.js';
import { Memory } from './memory.js';
import { Fishing } from './fishing.js';
import { Racing } from './racing.js';

export const GAMES = {
  racing: { name: 'Aero Kart', icon: '🏎️', desc: '3-lap kart race on the Aero Ring', cls: Racing, where: 'Track (west park)', unit: 's', lower: true },
  darts: { name: 'Aero Darts', icon: '🎯', desc: '9 darts, wobbly aim', cls: Darts, where: 'Arcade plaza', unit: 'pts' },
  bubbles: { name: 'Bubble Pop', icon: '🫧', desc: '45s of popping frenzy', cls: BubblePop, where: 'Arcade plaza', unit: 'pts' },
  fishing: { name: 'Fishing', icon: '🎣', desc: 'Catch fish for food & glory', cls: Fishing, where: 'Beach pier / river jetty', unit: 'kg' },
  memory: { name: 'Memory Match', icon: '🃏', desc: 'Find all 8 pairs fast', cls: Memory, where: 'Arcade plaza', unit: 'pts' },
};
