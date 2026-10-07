# Other agents and ACP — notes (deferred, not scheduled)

Discussion notes on showing agents other than Claude Code (Gemini CLI, Codex, Goose…) in the hall, and on the
Agent Client Protocol (ACP). Nothing here is planned yet; it records what was worked out so the decision can be
picked up later.

---

## Where we are

Administratum never talks to an agent. It reads Claude Code's own files (`~/.claude/sessions`, the transcripts under
`~/.claude/projects`) and answers permission prompts through Orca (`orca terminal read --screen` + one option digit).
That is why every Claude session shows up, however it was started, with nothing to configure.

## What ACP is

JSON-RPC over stdin/stdout between a client (an editor such as Zed) and an agent. The client launches the agent
process and owns the session. Native: Gemini CLI. Through an adapter: Claude Code (`claude-code-acp`), Codex.

ACP gives more **agents**, not more models directly: the model is whatever each agent offers.

## Watching a session we did not start

- A stdio pipe between two processes has no port or socket: a third program cannot join it.
- `session/load` (when the agent supports it) starts a second agent process that replays the history. It does not
  attach to the live one; two processes on one session would conflict. Not usable.
- The only way to watch **and** act: a **relay**. The editor's agent command points at the relay
  (`administratum-acp -- gemini --experimental-acp`); the relay starts the real agent, forwards every message
  unchanged, mirrors them to the widget, and can answer `session/request_permission`.

## Relay requirements

- **The agent must be on the PC and set up**: installed, logged in (its own account, key and billing), speaking ACP
  (natively or through its adapter, which usually means Node.js). Administratum never runs a model or holds a key.
- **One-time editor change** per agent and per editor. Sessions started without the relay stay invisible.
- **A separate small executable, not part of the widget.** It must work with Administratum closed:
  - Widget not running: plain pass-through. The agent works as usual; permission prompts go to the editor.
  - Widget opened mid-session: the relay connects and reports from then on. It keeps the current state (session,
    status, pending request) so the scribe appears in the right state at once. Earlier history is lost unless the
    agent also writes files.
  - Widget closed while a request waits on it: hand the request back to the editor immediately.
  - Rule: **the relay never blocks on the widget.**

## Risks

- **Single point of failure.** A relay crash cuts the agent from the editor: our bug breaks the user's session, not
  just the widget. Keep it tiny and well tested.
- **Uninstall.** Editor settings point at the relay. Uninstalling must restore them, or the relay must stay
  installed on its own; otherwise those agents no longer start.
- **Updates on Windows.** A running relay cannot be overwritten; the updater must install the new version
  alongside it.
- **Claude gains little.** `claude` typed in a terminal or Orca does not use ACP and never passes through the relay,
  so file-watching stays anyway. As far as we know the Claude adapter still writes the usual transcripts.

## If we pick it up

1. Keep Claude Code on file-watching.
2. Add other agents by reading their own session files first (Codex: `~/.codex/sessions/`, Gemini CLI: under
   `~/.gemini/`; formats not checked yet). Zero setup, watch-only.
3. The relay as an opt-in extra, for approve/deny on those agents, for users who accept installing the adapter and
   changing their editor settings.

Related: Claude Code hooks could answer Claude permission prompts without Orca, but `docs/spec.md` rules out any
Claude Code config change ("Read-only. No hooks"). That is an operator decision.
