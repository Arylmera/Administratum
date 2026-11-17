// The hall's plan (Settings > Rooms > Hall plan, settings.hallPlan): 'open', the open space (one scriptorium, the shared
// cogitator bank and refectorium, the Sanctum to the east, the custom rooms a west wing), or 'rooms': only rooms, round
// the Sanctum (layout.js mirrorHall; docs/superpowers/specs/2026-11-14-hall-plan-toggle-design.md). One switch for the
// geometry and the behaviour: layout.js, actors.js and theme.js read it here.
export const PLANS = ['open', 'rooms'];
export const hallPlan = { rooms: false };
export const setHallPlan = plan => { hallPlan.rooms = plan === 'rooms'; };
