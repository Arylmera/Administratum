// Night Vigil state, as the backend emits it every tick (event 'vigil'): armed, deadline, countdownEnd (ms), forced.
export const vigil = { armed: false, deadline: null, countdownEnd: null, forced: false };
export function onVigil(s) { Object.assign(vigil, s); }
export const secondsLeft = now => (vigil.countdownEnd == null ? null : Math.max(0, Math.ceil((vigil.countdownEnd - now) / 1000)));
// The bell rings each time the countdown crosses a 30 s mark (120, 90, 60, 30, 0).
export const bellDue = (prev, s) => prev != null && s != null && Math.ceil(s / 30) < Math.ceil(prev / 30);
