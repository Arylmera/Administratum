// Command-line client for the running app, over its local remote API (docs/remote-api.md), for scripts and Claude.
// Reads the port and token from the app's settings.json, so it needs the remote view enabled (Settings > Remote view);
// `vigil` also needs remote actions allowed. Petitions are deliberately not answerable from here: an agent must never
// approve its own permission prompts.
//
//   node tools/adm.mjs status              Night Vigil state + every session (status, waiting for, task)
//   node tools/adm.mjs vigil arm|cancel    arm or cancel the Night Vigil
//   node tools/adm.mjs chronicle [day]     the day's Chronicon events (YYYY-MM-DD, default today)
//   node tools/adm.mjs days                the days the Chronicon holds
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const conf = JSON.parse(readFileSync(join(process.env.APPDATA, 'com.arylmera.administratum', 'settings.json'), 'utf8'));
if (!conf['remote.enabled']) fail('remote view is off: enable it in Settings > Remote view');
const host = `127.0.0.1:${conf['remote.port'] ?? 7770}`;
const headers = { Cookie: `adm_t=${conf['remote.token']}` };

function fail(msg) { console.error(`adm: ${msg}`); process.exit(1); }

async function get(path) {
  const r = await fetch(`http://${host}${path}`, { headers }).catch(e => fail(`app not reachable on ${host} (${e.cause?.code ?? e.message})`));
  if (!r.ok) fail(`${path}: ${r.status} ${await r.text()}`);
  return r;
}

// The first payload of each named event on /events (roster and vigil come every second).
async function snapshot(names) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 5000);
  const r = await fetch(`http://${host}/events`, { headers, signal: ctl.signal }).catch(e => fail(`app not reachable on ${host} (${e.cause?.code ?? e.message})`));
  if (!r.ok) fail(`/events: ${r.status}`);
  const got = {};
  let buf = '';
  try {
    for await (const chunk of r.body.pipeThrough(new TextDecoderStream())) {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = block.match(/^event: (.*)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1];
        if (names.includes(ev) && !(ev in got)) got[ev] = JSON.parse(data);
      }
      if (names.every(n => n in got)) break;
    }
  } catch (e) { if (e.name !== 'AbortError') throw e; }
  clearTimeout(timer); ctl.abort();
  return got;
}

const time = ms => (ms == null ? '-' : new Date(ms).toLocaleTimeString());
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'status' || !cmd) {
  const { vigil = {}, roster = [] } = await snapshot(['vigil', 'roster']);
  const left = vigil.countdownEnd == null ? '' : `, countdown ends ${time(vigil.countdownEnd)}`;
  console.log(`Night Vigil: ${vigil.armed ? 'armed' : 'off'}${vigil.deadline ? `, deadline ${time(vigil.deadline)}` : ''}${left}${vigil.forced ? ' (forced)' : ''}`);
  for (const s of roster) {
    const wait = s.waitingFor ? ` waiting for ${s.waitingFor}` : s.limit ? ' on usage limit' : '';
    console.log(`- ${s.name} [${s.dept}] ${s.status}${wait} since ${time(s.sinceMs)}${s.task ? `: ${s.task.slice(0, 100)}` : ''}`);
  }
} else if (cmd === 'vigil' && (arg === 'arm' || arg === 'cancel')) {
  const r = await fetch(`http://${host}/api/vigil`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json', 'X-Adm': '1', Origin: `http://${host}` },
    body: JSON.stringify({ arm: arg === 'arm' }),
  }).catch(e => fail(`app not reachable on ${host} (${e.cause?.code ?? e.message})`));
  if (r.status === 403) fail('403: remote actions not allowed (Settings > Remote view)');
  if (!r.ok) fail(`${r.status} ${await r.text()}`);
  console.log(arg === 'arm' ? 'Night Vigil armed' : 'Night Vigil cancelled');
} else if (cmd === 'chronicle') {
  const day = arg ?? new Date().toLocaleDateString('sv');
  for (const e of await (await get(`/api/chronicle_day?day=${day}`)).json())
    console.log(`${time(e.ts)} ${e.kind} ${e.name}${e.detail ? `: ${e.detail}` : ''}`);
} else if (cmd === 'days') {
  console.log(JSON.stringify(await (await get('/api/chronicle_days')).json(), null, 1));
} else {
  fail('usage: node tools/adm.mjs status | vigil arm|cancel | chronicle [YYYY-MM-DD] | days');
}
