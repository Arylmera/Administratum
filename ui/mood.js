// The hall's mood (Settings > Appearance > Liveliness; spec 2026-11-23-liveliness): how many sessions work, whether a
// petition has gone stale, eased over seconds. It sets the pace of the channels' pulses and of the Magos, and the room
// a touch brighter or dimmer. Never the walks, the beacon or a label.
import { isStale } from './actors.js';

const FULL = 4; // working sessions at which the hall is at full energy
export function moodOf(roster) {
  const working = roster.filter(s => s.status === 'busy' || s.status === 'shell').length;
  return { energy: Math.min(1, working / FULL), alarm: roster.some(isStale) ? 1 : 0 };
}

// energy, alarm: eased; flow: px the pulses have run; clock: the Magos's time, s. Both are run up, never scaled from the
// wall clock, so a change of pace never makes anything jump.
export const makeMood = () => ({ energy: 0, alarm: 0, flow: 0, clock: 0 });
const EASE_S = 6, FLOW = [8, 26], TEMPO = [0.7, 1.4]; // calm, full energy
const mix = ([a, b], k) => a + (b - a) * k;
// dt: s; target: moodOf; k: the setting's amount (ambience.js AMOUNT; 0, off: no mood, the Magos on real time).
export function stepMood(m, dt, target, k) {
  if (!k) { Object.assign(m, { energy: 0, alarm: 0 }); m.clock += dt; return m; }
  const e = 1 - Math.exp(-dt / EASE_S);
  m.energy += (target.energy - m.energy) * e;
  m.alarm += (target.alarm - m.alarm) * e;
  m.flow += dt * mix(FLOW, m.energy);
  m.clock += dt * mix(TEMPO, m.energy);
  return m;
}

// The light level (layout.js lightLevel) in this mood: calm a little dimmer, busy a little brighter, dimmer again when
// a petition is stale, so the beacon stands out.
export const moodLevel = (level, { energy, alarm }, k) => (k ? { ...level, dark: level.dark + k * (0.03 - 0.07 * energy + 0.06 * alarm) } : level);
