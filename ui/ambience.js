// The room's air (Settings > Appearance > Liveliness; spec 2026-11-23-liveliness): pulses of light along the floor
// channels, dust in the day's window beams, sparks over the braziers. Drawn each frame over the cached background, the
// same in both views (view.js toScreen, lighting.js's own projection); positions are pure functions of time.
import { T } from './theme.js';
import { WALL_DY } from './layout.js';
import { beamOf, lift39 } from './lighting.js';
import { toScreen, view } from './view.js';
import { rnd } from './liveliness.js';

// The Liveliness setting as an amount.
export const AMOUNT = { off: 0, subtle: 0.5, full: 1 };

// A pulse on each floor channel under a slot row (scene.js drawStatic, staticLights): lights for drawLighting. flow: px
// run so far (mood.js, so a change of pace never jumps); every other channel runs west. Faded at the walls, where it
// wraps round. The rooms plan has no channel, the strip no floor.
const PULSE_R = 10, FADE = 24;
export function flowLights(hall, flow, k) {
  if (!k || hall.strip || hall.sanct) return [];
  if (hall.wx) return flowLights(hall.base, flow, k).map(l => ({ ...l, x: l.x + hall.wx }));
  const { sw } = hall, out = [];
  for (let j = 0; j < hall.rows; j += k < 1 ? 2 : 1) {
    const p = (flow + sw * rnd(`channel ${j}`)) % sw, x = j % 2 ? sw - p : p;
    out.push({ x, y: WALL_DY + (j ? 119 + 64 * j : 117), r: PULSE_R * Math.min(1, x / FADE, (sw - x) / FADE), z: 0, color: T.light.green });
  }
  return out;
}

// n specks in a unit box: u across, v along their way (0 born, 1 gone), a their alpha; born and gone faded out.
const specks = (kind, life, sway) => (id, t, n) => Array.from({ length: n }, (_, i) => {
  const L = life * (0.7 + 0.6 * rnd(`${kind}${id}:${i}:life`)), q = t / L + rnd(`${kind}${id}:${i}`), v = q % 1;
  const u = rnd(`${kind}${id}:${i}:${Math.floor(q)}`) + sway * Math.sin(t * 0.8 + 7 * i);
  return { u: Math.min(1, Math.max(0, u)), v, a: Math.sin(Math.PI * v) };
});
export const dust = specks('d', 14, 0.08);
export const sparks = specks('s', 2.6, 0.15);

// A brazier's light (scene.js staticLights): a big flickering one, not a desk candle (its own h), nor a burning pile.
export const isFire = l => !!l.flicker && l.r >= 26 && l.r <= 30 && l.h == null;
const DUST_N = 14, SPARK_N = 5, RISE = 26;

// lights: the frame's (flat coords); windows: scene.js propsOf; k: AMOUNT. g in scene coords, after the lighting.
export function drawAmbience(g, { lights, level, windows, t, k }) {
  if (!k) return;
  g.save();
  g.globalCompositeOperation = 'lighter';
  if (level.beams) for (const x of windows) {
    const [A, B, C, D] = beamOf(x).pts.map(p => toScreen(...p)); // glass west, glass east, foot east, foot west
    for (const p of dust(x, t, Math.round(DUST_N * k))) {
      const top = [A[0] + (B[0] - A[0]) * p.u, A[1] + (B[1] - A[1]) * p.u], foot = [D[0] + (C[0] - D[0]) * p.u, D[1] + (C[1] - D[1]) * p.u];
      g.fillStyle = `rgba(${T.light.beam},${0.55 * p.a})`;
      g.fillRect(snap(top[0] + (foot[0] - top[0]) * p.v), snap(top[1] + (foot[1] - top[1]) * p.v), 0.5, 0.5);
    }
  }
  for (const l of lights) if (isFire(l)) {
    g.fillStyle = T.ink.flame;
    for (const p of sparks(`${l.x},${l.y}`, t, Math.round(SPARK_N * k))) {
      const dx = (p.u - 0.5) * (4 + 10 * p.v), up = RISE * p.v;
      const [x, y] = view.mode === '39' ? toScreen(l.x + dx, l.y + lift39.d, lift39.h + up) : [l.x + dx, l.y - up];
      g.globalAlpha = 0.8 * p.a;
      g.fillRect(snap(x), snap(y), 0.5, 0.5);
    }
  }
  g.restore();
}
const snap = v => Math.round(2 * v) / 2; // whole art px
