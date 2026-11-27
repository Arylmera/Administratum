// Where a frame's time goes: the browser preview (tools/preview.html) in a headless Chromium, profiled over CDP.
// Serve the repo root first (python -m http.server 8123), then:
//   node tools/perf_profile.mjs [--port 8123] [--view 39|flat] [--plan rooms|open] [--n 28] [--size 3048x1669]
//                               [--seconds 10] [--chromium chromium] [--top 30] [--ops] [--skip 'lighting.js:156,...']
//                               [--q 'theme=vault']
// --ops: time each large canvas call (a quarter of the canvas or more) by caller and blend mode (costs ~30 ms/s itself);
// --skip: leave the large calls made from those places out (an experiment); --q: added to the preview's query.
// Prints the page's own counters (script, layout, paint, tasks per second) and the CPU profile's self time grouped
// by function, then by module. Headless Chromium rasterizes canvases on the CPU (--disable-gpu): what a GPU would
// take shows here as raster/paint time, so read paint as an upper bound of the compositor's share.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const port = +arg('port', 8123), view = arg('view', '39'), plan = arg('plan', 'rooms'), n = +arg('n', 28);
const [W, H] = arg('size', '3048x1669').split('x').map(Number), seconds = +arg('seconds', 10), top = +arg('top', 30);
const base = `http://localhost:${port}/tools`, dbg = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'adm-perf-'));
const chrome = spawn(arg('chromium', 'chromium'), ['--headless=new', `--remote-debugging-port=${dbg}`, `--user-data-dir=${prof}`,
  '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ws, id = 0;
const waiting = new Map();
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const k = ++id; waiting.set(k, { res, rej }); ws.send(JSON.stringify({ id: k, method, params, sessionId }));
});
try {
  let url;
  for (let i = 0; i < 50 && !url; i++) { try { url = (await (await fetch(`http://127.0.0.1:${dbg}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); } }
  ws = new WebSocket(url);
  await new Promise(r => ws.addEventListener('open', r));
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); const w = waiting.get(m.id); if (w) { waiting.delete(m.id); m.error ? w.rej(new Error(m.error.message)) : w.res(m.result); } });
  const { targetInfos } = await send('Target.getTargets'); // the window's own tab: a created one is hidden, and a hidden hall pauses
  const targetId = targetInfos.find(t => t.type === 'page').targetId;
  const { sessionId: s } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, s); await send('Page.bringToFront', {}, s);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, s);
  // the settings live in the page's localStorage: set them on the same origin, then load the preview
  await send('Page.navigate', { url: `${base}/preview.html?n=1` }, s); await sleep(1500);
  await send('Runtime.evaluate', { expression: `localStorage['adm.scale']='auto'; const s=JSON.parse(localStorage['adm.settings']||'{}'); s.hallPlan=${JSON.stringify(plan)}; localStorage['adm.settings']=JSON.stringify(s); 1` }, s);
  await send('Page.navigate', { url: `${base}/preview.html?n=${n}&view=${view}&mode=candles${arg('q', '') ? `&${arg('q')}` : ''}` }, s);
  await sleep(4000); // load, bake the background, settle
  const skip = arg('skip', ''); // --skip 'lighting.js:156,app.js:293': leave out the large calls made from there (an experiment: what does each cost?)
  if (process.argv.includes('--ops') || skip) { // time each canvas call drawing a large area (>= a quarter of its canvas), by caller and blend mode
    await send('Runtime.evaluate', { expression: `(() => {
      const P = CanvasRenderingContext2D.prototype, T = window.__ops = new Map();
      for (const name of ['drawImage', 'fillRect', 'clearRect']) {
        const f = P[name];
        P[name] = function (...a) {
          const c = this.canvas, m = this.getTransform(), n = a.length, w = name === 'drawImage' ? (n >= 5 ? a[n - 2] : a[0].width) : a[2], h = name === 'drawImage' ? (n >= 5 ? a[n - 1] : a[0].height) : a[3];
          if (Math.abs(w * m.a * h * m.d) < c.width * c.height / 4) return f.apply(this, a);
          const at0 = new Error().stack.split('\\n')[2] || '';
          if (${JSON.stringify(skip.split(',').filter(Boolean))}.some(x => at0.includes(x))) return;
          const t0 = performance.now(); const r = f.apply(this, a); const dt = performance.now() - t0;
          const at = (new Error().stack.split('\\n')[2] || '').replace(/^.*\\/(ui|tools)\\//, '$1/').replace(/\\)$/, '');
          const k = name + ' ' + this.globalCompositeOperation + ' ' + c.width + 'x' + c.height + ' <- ' + at;
          const e = T.get(k) || { n: 0, ms: 0 }; e.n++; e.ms += dt; T.set(k, e); return r;
        };
      }
    })(); 1` }, s);
  }
  await send('Performance.enable', {}, s);
  const m0 = Object.fromEntries((await send('Performance.getMetrics', {}, s)).metrics.map(m => [m.name, m.value]));
  await send('Profiler.enable', {}, s);
  await send('Profiler.setSamplingInterval', { interval: 200 }, s);
  await send('Profiler.start', {}, s);
  await sleep(seconds * 1000);
  const { profile } = await send('Profiler.stop', {}, s);
  const m1 = Object.fromEntries((await send('Performance.getMetrics', {}, s)).metrics.map(m => [m.name, m.value]));
  const d = k => (m1[k] ?? 0) - (m0[k] ?? 0), span = d('Timestamp') || seconds;
  console.log(`preview ${view} ${plan} n=${n} ${W}x${H}, ${seconds}s`);
  console.log(`per second of wall time: script ${(1000 * d('ScriptDuration') / span).toFixed(0)} ms, layout ${(1000 * d('LayoutDuration') / span).toFixed(0)} ms, ` +
    `style ${(1000 * d('RecalcStyleDuration') / span).toFixed(0)} ms, tasks ${(1000 * d('TaskDuration') / span).toFixed(0)} ms (main thread busy ${(100 * d('TaskDuration') / span).toFixed(0)} %)`);
  // self time per node, grouped by function and by module
  const dt = new Map(); // node id -> self µs
  profile.samples.forEach((n, i) => dt.set(n, (dt.get(n) ?? 0) + (profile.timeDeltas[i] ?? 0)));
  const fn = new Map(), mod = new Map();
  let total = 0;
  for (const node of profile.nodes) {
    const us = dt.get(node.id) ?? 0; total += us;
    const cf = node.callFrame, file = cf.url ? cf.url.replace(/^.*\/(ui|tools)\//, '$1/') : `(${cf.functionName || 'native'})`;
    const f = `${cf.functionName || '(anonymous)'} ${file}${cf.url ? `:${cf.lineNumber + 1}` : ''}`;
    fn.set(f, (fn.get(f) ?? 0) + us); mod.set(file, (mod.get(file) ?? 0) + us);
  }
  const show = (title, map, k) => {
    console.log(`\n${title}`);
    for (const [name, us] of [...map].sort((a, b) => b[1] - a[1]).slice(0, k)) console.log(`${(100 * us / total).toFixed(1).padStart(5)} %  ${(us / 1000 / seconds).toFixed(1).padStart(6)} ms/s  ${name}`);
  };
  show('self time by function', fn, top);
  show('self time by module', mod, 15);
  // the canvas's native calls (drawImage, fillRect...) carry no file: charge them to their JS caller
  const parent = new Map(), byId = new Map(profile.nodes.map(x => [x.id, x]));
  for (const node of profile.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  const nat = new Map();
  for (const node of profile.nodes) {
    const cf = node.callFrame, us = dt.get(node.id) ?? 0;
    if (cf.url || !us || cf.functionName.startsWith('(')) continue;
    const up = byId.get(parent.get(node.id))?.callFrame, by = up?.url ? `${up.functionName || '(anonymous)'} ${up.url.replace(/^.*\/(ui|tools)\//, '$1/')}:${up.lineNumber + 1}` : '?';
    const k = `${cf.functionName} <- ${by}`; nat.set(k, (nat.get(k) ?? 0) + us);
  }
  show('native calls by caller', nat, 20);
  if (process.argv.includes('--ops')) {
    const ops = JSON.parse((await send('Runtime.evaluate', { expression: 'JSON.stringify([...window.__ops])', returnByValue: true }, s)).result.value);
    console.log('\nlarge canvas calls (main-thread time to issue them; the raster may run later, off this clock)');
    for (const [k, e] of ops.sort((a, b) => b[1].ms - a[1].ms)) console.log(`${(e.ms / seconds).toFixed(1).padStart(6)} ms/s  ${(e.n / seconds).toFixed(1).padStart(5)} /s  ${k}`);
  }
} finally {
  try { ws?.close(); } catch {}
  chrome.kill(); await sleep(300); rmSync(prof, { recursive: true, force: true });
}
