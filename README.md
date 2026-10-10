# 🫧 Aero Land

A **Frutiger Aero** open-world multiplayer sandbox that runs in the browser, on desktop and on mobile.
Glossy jelly characters, a bright riverside park with a city skyline, a beach, a pixelated look you can tune,
LEGO Fortnite / Minecraft style survival and building, and a set of mini-games.

## Features

- **Open-world island**: a mowed riverside park with a stone promenade, footbridges, a jetty and a bronze statue,
  a city skyline to the north, a sandy **beach with palm trees and a pier** on the east coast, crystal hill,
  an arcade plaza with a floating globe fountain, and a kart circuit.
- **Your Aero buddy**: a glossy bubble character with black eyes. Customize the top and bottom colours, eye style,
  hat (cap, crown, headphones, halo, flower, bubble helmet, top hat), hat colour and size, with a live 3D preview.
- **Pixel level**: pick 1 (sharp) to 10 (chunky retro pixels) from the main menu or Settings. Higher levels also run faster on phones.
- **Survival mode**: hit trees, rocks, crystals, flowers, shells and the ground to gather resources.
  Craft 15 block types, food and tools (Aqua Pickaxe, Bubble Sword). Keep an eye on health and hunger.
  Smog Blobs come out at night, so fight them for Bubble Gel.
- **Creative mode**: unlimited blocks and flying.
- **Building**: place and break blocks anywhere: grass, stone, sand, logs, planks, Aero Glass, Bubble Brick, Lime Tile,
  Marble, Glow Orbs, Ocean Tile, Shell and Sunny blocks.
- **Day/night cycle** (20 min) with stars, sunsets and lit-up city windows. The cycle comes from the clock, so every player sees the same sky.
- **Mini-games**: use the 🎮 Games button anywhere, or the kiosks in the world:
  - 🏎️ **Aero Kart**: 3-lap kart race against 4 bubble bots with boost pads (track, west park)
  - 🎯 **Aero Darts**: 9 darts with a wobbly aim and real dartboard scoring (arcade)
  - 🫧 **Bubble Pop**: 45 s of popping with combos, golden bubbles and smog bubbles (arcade)
  - 🃏 **Memory Match**: find the 8 Aero pairs (arcade)
  - 🎣 **Fishing**: cast, strike, and reel inside the green zone. Fish become food in survival (beach pier / river jetty)
  - 🏆 **Leaderboards** for every game, shared on the server
- **Multiplayer**: see other players move, race in karts and chat with speech bubbles. Builds are shared and saved on the server.
  If no server is reachable, the game falls back to solo play and keeps your builds in local storage.
- **Mobile**: virtual joystick, drag-to-look, pinch to zoom, and big glossy action buttons. Landscape and safe-area aware.
  You can install it as a fullscreen web app.

## Run it

```bash
npm install
npm run serve        # builds the client and starts the server on http://localhost:8080
```

To play with friends on the same network, open `http://<your-computer-ip>:8080` on any phone or PC.
Set `PORT` to change the port. The world (builds and leaderboards) is saved to `server/data/world.json`.

Development with hot reload (Vite on :5173, proxying `/ws` to the game server on :8080):

```bash
npm run dev
```

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move / sprint | WASD / Shift | Joystick (push fully to sprint) |
| Look | Mouse (click to capture) | Drag the right side of the screen |
| Jump / swim up | Space | Jump |
| Hit / gather / break / attack | Left click (hold) | Hit (hold) |
| Place block | Right click or R | Place |
| Use kiosk / fishing spot | E | Use |
| Eat | Q | Eat |
| Fly (creative) | F (Space up, X down) | Fly |
| Hotbar | 1–9 / mouse wheel | Tap a slot |
| Bag / Craft / Games / Look / Chat | I / C / G / P / T | Top buttons |
| Camera zoom | Z | Pinch |
| Settings | Esc / M | ⚙ |

## Tech

Three.js and Vite on the client. Node and `ws` on the server. All textures, models and UI art are generated in code, so there are no asset files to download.
