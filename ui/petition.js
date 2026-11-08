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
