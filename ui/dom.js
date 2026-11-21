// DOM helpers shared by the panels and the phone page: one shape of `el`, which settings.js, chronicon.js (as `h`) and
// mobile.js each wrote for themselves. Those files move onto this one with their lanes (decision D3 of the parallel-waves spec).

// A new element: `cls` its class name (none when empty or null), `text` its textContent (set whenever it is not null,
// so '' and 0 are written, undefined and null leave the element empty).
export function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
