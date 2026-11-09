// Breaking Bad: the Suzerain's steel platform under a desk (flat top, k outline, a darker front face), the link a dark
// industrial hose with steel edges, its end a steel coupling.
import { flat } from '../flat_kit.mjs';

const dais = w => flat(w, 54).box(0, 0, w, 54, 'h').hline(0, w - 1, 46, 'k').rect(1, 47, w - 2, 6, 'm').rows();
export default () => ({
  DAIS: dais(80),
  DAIS_C: dais(60),
  LINK_H: flat(8, 6).rect(0, 1, 8, 4, 'M').hline(0, 7, 0, 'k').hline(0, 7, 5, 'k').rows(),
  LINK_V: flat(6, 8).rect(1, 0, 4, 8, 'M').vline(0, 0, 7, 'k').vline(5, 0, 7, 'k').rows(),
  LINK_END: flat(10, 8).disc(5, 4, 4.5, 3.5, 'm').outline().set(5, 4, 'k').rows(),
});
