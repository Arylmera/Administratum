import { SCENE, lightLevel } from './layout.js';
import { drawStatic, drawDecorFrame, STATIC_LIGHTS } from './scene.js';
import { drawLighting } from './lighting.js';

const MODES = ['auto', 'full', 'candles'];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked: keep in memory */ } },
};
export const state = { mode: store.get('adm.mode', 'auto'), muted: store.get('adm.muted', '0') === '1' };

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
canvas.width = SCENE.w;
canvas.height = SCENE.h;
const overlay = document.getElementById('overlay');
export let scale = 2;

const bg = {};
function background(day) {
  const k = day ? 'day' : 'night';
  if (!bg[k]) {
    const c = document.createElement('canvas');
    c.width = SCENE.w; c.height = SCENE.h;
    drawStatic(c.getContext('2d'), day);
    bg[k] = c;
  }
  return bg[k];
}

function renderModes() {
  const hour = new Date().getHours();
  for (const b of document.querySelectorAll('#modes button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
    if (b.dataset.mode === 'auto') b.textContent = `Auto · ${String(hour).padStart(2, '0')}h ${lightLevel('auto', hour).phase}`;
  }
}
function setMode(m) { state.mode = m; store.set('adm.mode', m); renderModes(); }
export function cycleMode() { setMode(MODES[(MODES.indexOf(state.mode) + 1) % MODES.length]); }
for (const b of document.querySelectorAll('#modes button')) b.onclick = () => setMode(b.dataset.mode);

export function fit() {
  const head = document.querySelector('header').offsetHeight;
  scale = Math.max(1, Math.floor(Math.min(innerWidth / SCENE.w, (innerHeight - head) / SCENE.h)));
  for (const el of [canvas, overlay]) { el.style.width = `${SCENE.w * scale}px`; el.style.height = `${SCENE.h * scale}px`; }
}
addEventListener('resize', fit);

export const hooks = { beforeLights: () => [], afterFrame: () => {}, update: () => {} };
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  acc += Math.min(0.1, (now - last) / 1000);
  last = now;
  if (acc < 1 / 30) return;
  const dt = acc; acc = 0;
  hooks.update(dt);
  const level = lightLevel(state.mode, new Date().getHours());
  g.drawImage(background(level.beams), 0, 0);
  const extra = hooks.beforeLights(g);
  drawDecorFrame(g, now / 1000);
  drawLighting(g, STATIC_LIGHTS.concat(extra), level, now / 1000);
  hooks.afterFrame();
}

renderModes();
setInterval(renderModes, 60_000);
fit();
requestAnimationFrame(frame);
