// A minimal DOM for the panel tests (settings.test.mjs, chronicon.test.mjs): parses the real index.html, so the tests
// read the shipped markup, and installs fake timers, a fake Tauri backend and localStorage. Only what the UI modules
// use: simple selectors (tag, #id, .class, [attr], [attr="v"], :not(), descendant, comma), form.elements, options.
import { readFileSync } from 'node:fs';

const VOID = new Set(['input', 'img', 'br', 'meta', 'link', 'hr', 'source']);
const RAW = new Set(['script', 'style']);
const camel = s => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

class Text { constructor(data) { this.nodeType = 3; this.data = data; this.parent = null; } get textContent() { return this.data; } }

export class El {
  constructor(tag) {
    this.nodeType = 1; this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.childNodes = []; this.parent = null;
    this.listeners = {}; this.style = { setProperty: (k, v) => { this.style[k] = v; } };
    this._value = null; this.checked = false;
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => el.getAttribute(`data-${kebab(String(k))}`) ?? undefined,
      set: (_, k, v) => { el.setAttribute(`data-${kebab(String(k))}`, v); return true; },
      deleteProperty: (_, k) => { el.removeAttribute(`data-${kebab(String(k))}`); return true; },
    });
    this.classList = {
      contains: c => el.className.split(/\s+/).includes(c),
      add: (...cs) => { for (const c of cs) if (!el.classList.contains(c)) el.className = `${el.className} ${c}`.trim(); },
      remove: (...cs) => { el.className = el.className.split(/\s+/).filter(c => !cs.includes(c)).join(' '); },
      toggle: (c, force = !el.classList.contains(c)) => { if (force) el.classList.add(c); else el.classList.remove(c); return force; },
    };
  }
  get localName() { return this.tagName.toLowerCase(); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  removeAttribute(k) { this.attrs.delete(k); }
  hasAttribute(k) { return this.attrs.has(k); }
  get id() { return this.getAttribute('id') ?? ''; }
  get className() { return this.getAttribute('class') ?? ''; }
  set className(v) { this.setAttribute('class', v); }
  get name() { return this.getAttribute('name') ?? ''; }
  get type() { return this.getAttribute('type') ?? ''; }
  set type(v) { this.setAttribute('type', v); }
  get title() { return this.getAttribute('title') ?? ''; }
  set title(v) { this.setAttribute('title', v); }
  get src() { return this.getAttribute('src') ?? ''; }
  set src(v) { this.setAttribute('src', v); }
  get placeholder() { return this.getAttribute('placeholder') ?? ''; }
  set placeholder(v) { this.setAttribute('placeholder', v); }
  get min() { return this.getAttribute('min') ?? ''; }
  get max() { return this.getAttribute('max') ?? ''; }
  get step() { return this.getAttribute('step') ?? ''; }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v) { if (v) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get disabled() { return this.attrs.has('disabled'); }
  set disabled(v) { if (v) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get options() { return this.querySelectorAll('option'); }
  get value() {
    if (this.localName === 'select') { const o = this.options.find(o => o._selected) ?? (this._none ? null : this.options[0]); return o ? o.value : ''; }
    if (this.localName === 'option') return this._value ?? this.getAttribute('value') ?? this.textContent;
    return this._value ?? this.getAttribute('value') ?? '';
  }
  set value(v) {
    v = String(v);
    if (this.localName === 'select') { let hit = false; for (const o of this.options) { o._selected = !hit && o.value === v; hit ||= o._selected; } this._none = !hit; return; } // no match: ''
    this._value = v;
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get firstChild() { return this.childNodes[0] ?? null; }
  get lastChild() { return this.childNodes.at(-1) ?? null; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v ?? '')); }
  set innerHTML(html) { this.replaceChildren(...parse(html).childNodes); }
  get offsetHeight() { return 0; }
  #adopt(n) { if (typeof n === 'string') n = new Text(n); n.parent?.childNodes.splice(n.parent.childNodes.indexOf(n), 1); n.parent = this; return n; }
  append(...ns) { for (const n of ns) this.childNodes.push(this.#adopt(n)); }
  prepend(...ns) { this.childNodes.unshift(...ns.map(n => this.#adopt(n))); }
  replaceChildren(...ns) { for (const n of this.childNodes) n.parent = null; this.childNodes = []; this._none = false; this.append(...ns); }
  remove() { if (this.parent) { this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; } }
  after(n) { const p = this.parent; n = p.#adopt(n); p.childNodes.splice(p.childNodes.indexOf(this) + 1, 0, n); }
  contains(n) { for (; n; n = n.parent) if (n === this) return true; return false; }
  closest(sel) { for (let e = this; e && e.nodeType === 1; e = e.parent) if (matches(e, sel)) return e; return null; }
  focus() { document.activeElement = this; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  // Fires on<type> and the listeners, then bubbles to the ancestors' (form.onchange sees an input's change).
  dispatch(type, init = {}) {
    const e = { type, target: this, preventDefault() {}, stopPropagation() {}, ...init };
    for (let n = this; n; n = n.parent) { n[`on${type}`]?.(e); for (const f of n.listeners?.[type] ?? []) f(e); }
    return e;
  }
  click() { return this.dispatch('click'); }
  descendants() { const out = []; const walk = e => { for (const c of e.children) { out.push(c); walk(c); } }; walk(this); return out; }
  querySelectorAll(sel) { return this.descendants().filter(e => matches(e, sel)); }
  querySelector(sel) { return this.descendants().find(e => matches(e, sel)) ?? null; }
  get elements() { // form.elements[name]
    return new Proxy({}, { get: (_, k) => this.descendants().find(e => e.name === k && e.localName !== 'option') });
  }
}

// One compound selector, e.g. button.clear[data-cmd="x"]:not(.a)
function compound(e, s) {
  const re = /^([a-z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]|:not\(([^)]*)\)/gy;
  let m, pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    if (!(m = re.exec(s))) throw new Error(`testdom: unsupported selector ${s}`);
    pos = re.lastIndex;
    if (m[1] && e.localName !== m[1]) return false;
    if (m[2] && e.id !== m[2]) return false;
    if (m[3] && !e.classList.contains(m[3])) return false;
    if (m[4] && (m[5] === undefined ? !e.hasAttribute(m[4]) : e.getAttribute(m[4]) !== m[5])) return false;
    if (m[6] && compound(e, m[6])) return false;
  }
  return true;
}
function matches(e, sel) {
  return sel.split(',').some(alt => {
    const parts = alt.trim().split(/\s+/);
    if (!compound(e, parts.at(-1))) return false;
    let a = e.parent;
    for (let i = parts.length - 2; i >= 0; i--) { while (a && !(a.nodeType === 1 && compound(a, parts[i]))) a = a.parent; if (!a) return false; a = a.parent; }
    return true;
  });
}

export function parse(html) {
  const root = new El('#root');
  let cur = root;
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([\w-]+)\s*>|<([\w-]+)((?:\s+[\w:-]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/giy;
  let m;
  while ((m = re.exec(html))) {
    if (m[1]) { for (let e = cur; e !== root; e = e.parent) if (e.localName === m[1].toLowerCase()) { cur = e.parent; break; } }
    else if (m[2]) {
      const e = new El(m[2].toLowerCase());
      for (const [, k, v1, v2, v3] of m[3].matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) e.setAttribute(k, decode(v1 ?? v2 ?? v3 ?? ''));
      cur.append(e);
      if (RAW.has(e.localName)) { const end = html.indexOf(`</${e.localName}`, re.lastIndex); e.append(html.slice(re.lastIndex, end)); re.lastIndex = html.indexOf('>', end) + 1; }
      else if (!VOID.has(e.localName) && !m[4]) cur = e;
    } else if (m[5]) cur.append(decode(m[5]));
  }
  return root;
}

// Fake timers: nothing runs until tick(ms); the clock (Date.now, new Date()) advances with them.
export const clock = { now: 0 };
const timers = [];
let nextId = 1;
const RealDate = Date;
class FakeDate extends RealDate {
  constructor(...a) { if (a.length) super(...a); else super(clock.now); }
  static now() { return clock.now; }
}
export function tick(ms) {
  const end = clock.now + ms;
  for (;;) {
    timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const t = timers[0];
    if (!t || t.at > end) break;
    clock.now = t.at;
    if (t.every) t.at += t.every; else timers.shift();
    t.fn();
  }
  clock.now = end;
}
export const flush = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); }; // settle the promise chains

// Fake backend: calls[] records every invoke; replies[name] is a value, a function of the args, or an Error (rejects).
export const calls = [], replies = {}, events = {};
export const invoked = name => calls.filter(c => c.name === name);

export function install(html = readFileSync(new URL('./index.html', import.meta.url), 'utf8'), at = RealDate.UTC(2026, 9, 17, 14, 30)) {
  process.env.TZ = 'UTC'; // hh:mm and the day key are local time
  clock.now = at;
  const doc = parse(html);
  const docEl = doc.querySelector('html') ?? doc;
  const listeners = {};
  Object.assign(globalThis, {
    Date: FakeDate,
    setTimeout: (fn, ms = 0) => { const id = nextId++; timers.push({ id, at: clock.now + ms, fn }); return id; },
    clearTimeout: id => { const i = timers.findIndex(t => t.id === id); if (i >= 0) timers.splice(i, 1); },
    setInterval: (fn, ms) => { const id = nextId++; timers.push({ id, at: clock.now + ms, every: ms, fn }); return id; },
    clearInterval: id => globalThis.clearTimeout(id),
    addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
    document: {
      documentElement: docEl, activeElement: null, body: doc.querySelector('body'),
      getElementById: id => doc.querySelector(`#${id}`), querySelector: s => doc.querySelector(s), createElement: tag => new El(tag),
    },
    Option: function Option(text, value) { const o = new El('option'); o.textContent = text; if (value !== undefined) o.setAttribute('value', value); return o; },
    localStorage: (() => {
      const m = new Map();
      return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, clear: () => m.clear() };
    })(),
    __TAURI__: {
      core: {
        invoke: (name, args) => {
          calls.push({ name, args });
          const r = replies[name];
          const v = typeof r === 'function' ? r(args) : r;
          return v instanceof Error ? Promise.reject(v.message) : Promise.resolve(v);
        },
      },
      event: { listen: (name, cb) => { (events[name] ??= []).push(cb); return Promise.resolve(() => {}); } },
      window: { getCurrentWindow: () => ({ setAlwaysOnTop: on => { calls.push({ name: 'setAlwaysOnTop', args: on }); return Promise.resolve(); } }) },
      app: { getVersion: () => Promise.resolve('9.9.9') },
    },
  });
  return { doc, windowListeners: listeners };
}
export const emit = (name, payload) => { for (const cb of events[name] ?? []) cb({ payload }); };
