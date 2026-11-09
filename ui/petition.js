// Which petitions can be answered, and how (shared by the hall's card and the phone page). Pure: no DOM, no imports.

// Permission petitions in an Orca terminal can be answered: the backend checks the screen really shows the
// dialog before typing one option key. Free-text petitions are not. An OpenCode permission request is answered
// through its service (no terminal needed).
export const answerable = s => s?.status === 'waiting'
  && (s.source === 'opencode' ? !!s.opencodeRequest : !!s.orca && /approve|permission/i.test(s.waitingFor ?? ''));
// The backend command and its arguments for answering `s` with yes / always / no (the backend maps OpenCode's).
export const answerCall = (s, choice) => (s.source === 'opencode'
  ? ['answer_opencode', { session: s.id, request: s.opencodeRequest, choice }]
  : ['answer_petition', { handle: s.orca, choice }]);

// A petition's risk (O11): the backend reads it once from the pending calls' raw input (registry/risk.rs) and sends it
// as `risk` (its reason), null when safe. Every surface reads this field.
export const riskOfPetition = s => s?.risk ?? null;

// Which answers a surface offers for a petition of risk `risk` (null: none). A risky one never gets Always; the phone
// (and any remote client: remote/app.rs refuses the rest) never sends Always and, for a risky one, only Deny.
export const allowed = (choice, risk, where) => (where === 'phone'
  ? choice === 'no' || (choice === 'yes' && !risk)
  : !(risk && choice === 'always'));
// A risky Approve takes two clicks: the first arms it ('arm'); a second at least ARM_GAP_MS later and within ARM_MS
// sends ('send'); one sooner is a double-click and does nothing ('hold', still armed); a later one arms again.
export const ARM_MS = 5000, ARM_GAP_MS = 400;
export const armStep = (armedAt, now) => {
  const dt = armedAt == null ? NaN : now - armedAt;
  return dt >= ARM_GAP_MS && dt <= ARM_MS ? 'send' : dt >= 0 && dt < ARM_GAP_MS ? 'hold' : 'arm';
};
