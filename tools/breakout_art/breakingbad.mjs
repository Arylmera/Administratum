// Breaking Bad's break-out room, The Yard: flat concrete, a plain fence (grey panel between steel rails) on steel
// posts, a gate under a white plate, lit while the cooks are shut in, dark when it stands open. Flat, no texture.
import { flat } from '../flat_kit.mjs';

const plate = lit => { const g = flat(16, 20); g.box(0, 0, 16, 7, lit ? 'p' : 'B'); g.rect(4, 3, 8, 1, lit ? 'v' : 'k'); g.box(0, 6, 2, 14, 'm').box(14, 6, 2, 14, 'm'); return g; };
export default () => ({
  BREAKOUT_FLOOR: flat(16, 16).rect(0, 0, 16, 16, 'N').rows(),
  BREAKOUT_RAIL: flat(16, 10).rect(0, 0, 16, 2, 'm').rect(0, 2, 16, 6, 'h').rect(0, 8, 16, 1, 'm').hline(0, 15, 9, 'k').rows(),
  BREAKOUT_SIDE: flat(4, 16).box(0, -1, 4, 18, 'm').rows(),
  BREAKOUT_POST: flat(6, 14).box(0, 0, 6, 14, 'm').rows(),
  BREAKOUT_GATE: flat(4, 16).box(0, -1, 4, 18, 'h').rect(1, 7, 2, 2, 'v').rows(),
  BREAKOUT_GATE_OPEN: flat(16, 10).rect(0, 0, 16, 2, 'm').hline(0, 15, 2, 'k').box(0, 3, 16, 7, 'h').rect(7, 5, 2, 2, 'v').rows(),
  BREAKOUT_GATE_FRONT: (() => { const g = plate(true); g.box(2, 7, 12, 12, 'h').rect(7, 12, 2, 2, 'v'); g.hline(0, 15, 19, 'k'); return g.rows(); })(),
  BREAKOUT_GATE_FRONT_OPEN: plate(false).rows(),
});
