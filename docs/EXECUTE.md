# Execution prompt

Open a Claude Code session in `C:\Users\guill\Documents\git\Administratum` and paste the block below.

---

```text
Implement the Administratum widget by executing the plan at docs/plan.md (spec: docs/spec.md).

Use the superpowers:subagent-driven-development skill: one fresh subagent per task (Tasks 1 to 8,
in order), each given the full text of its own task plus the plan's Global Constraints and File
map; after each task, review the diff against the task and the spec, run the task's checks
yourself, and only then move on. Keep the checkbox state in docs/plan.md up to date and commit it
with each task.

Rules for every task:
- Work directly on main in this repo, commit after each task and push. Plain commit messages,
  no Co-Authored-By or Claude-Session trailers, no backticks inside -m.
- Never write anything under ~/.claude (the app is read-only towards Claude Code).
- Follow the plan's code exactly; if something fails to compile or a crate API differs from the
  plan (sysinfo, Tauri menu/tray, plugins), fix it minimally, note the deviation in the task's
  commit message and keep going.
- Run every test command in the plan and quote the real output. Never claim a pass you did not see.
- Visual checks (Task 1 step 11, Task 4 step 7, Task 6 step 6, Task 7 steps 4-5, Task 8 step 2)
  need the operator's eyes: start the app, tell me exactly what to look at, and wait for my answer
  before marking the step done.
- Any command you hand to me must run in PowerShell: no $(...), no <, no nested \" quoting.
- Task 8 step 5 (Hololith card) belongs to the Terra vault, not this repo: skip it and remind me
  at the end to run it from a Terra session.

When all tasks are done, give me a short report: what works, every deviation from the plan, and
anything left open.
```
