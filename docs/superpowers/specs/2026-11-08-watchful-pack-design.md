# Watchful pack: five read-only additions (O11 – O15)

**Goal.** Five small additions taken as ideas from my-office (khanh020905/my-office, MIT; ideas only, no code or art
copied), each read-only: Administratum still never writes to Claude Code's files.

**Status.** User chose the read-only pack (Q26, 2026-11-08). Decisions below are mine unless marked; all reversible.
Built after O10b.

## O11 — risky command marked (my-office I1)
- A permission petition whose command matches a risky pattern is risky: recursive or forced delete (`rm -r`/`-rf`,
  `Remove-Item -Recurse`, `rd /s`), `git push --force`/`-f`/`--delete`, `git reset --hard`, `git clean -f`,
  `git branch -D`, `git filter-branch`/`filter-repo`, `DROP`/`TRUNCATE` in SQL, `terraform|tofu|pulumi apply|destroy`,
  `kubectl delete`, `docker system|volume prune`, `npm|cargo publish`, `curl|wget … | sh|bash|iex`, `chmod -R 777`,
  `mkfs`, `dd if=`, `format`, `sudo`. A fresh list written here, case-insensitive, one pure function
  `riskOf(text) -> key | null` in `ui/petition.js` (shared by card, toast text and phone).
- Source text: the peek's question (Orca) or the OpenCode request's detail.
- Effect: the label and the card turn red with the reason; *Always* hidden; *Approve* needs a second click within
  5 s (first click arms it: "Approve? click again"); the phone shows Deny only for a risky prompt; the toast keeps
  Deny only.
- Tests: each key matches its examples and not near-misses (`rm file`, `git push`, `git reset --soft`); the gates
  (no Always, two clicks, phone Deny only) each fail when removed.
- Ruling (review, 2026-11-09): the source text is not the peek's question (always "Do you want to proceed?") nor the
  card's `asks` (first line, cut at 140). The backend reads the raw, uncut command of every unanswered call of the
  pending message (`registry/risk.rs`, `tail::pending_risk`; OpenCode: the request's resource) once, and sends
  `Session.risk`; card, label, phone, remote view and toast all read that field. The list lives in Rust only.
  Commands only (a file's content runs nothing). `rm`, `rd`, `dd`, `format`, `sudo` count only at a command start
  (`git rm -r --cached` is safe); `-D` is case-sensitive (`git branch -d` is safe); added `irm|iwr … | iex`,
  `git push … +ref` / `… :ref`, `git clean --force`, `shred`, `del /s`.
- Ruling (review): the server enforces it. A remote client may send only Deny on a risky petition (`remote/app.rs`),
  the toast's rule; the hall card in the remote view shows Deny only too. The second Approve click must come 400 ms
  to 5 s after the first: a double-click never sends.

## O12 — loops keyed on the error (my-office I3)
- `repeat_after` (`chronicle/mod.rs`) today counts identical tool + input. It now counts a streak only while the same
  call also gets the same error: the tool result has `is_error` and its text, with volatile parts masked (timestamps,
  durations, hex, numbers of 4+ digits, temp paths), is identical. A success or any edit (Edit, Write, MultiEdit,
  NotebookEdit) clears it. Threshold and polling exclusions unchanged.
- Ruling: identical calls that succeed are no longer a loop (they make progress or read); the "stalled" (silent)
  rule is unchanged.
- Ruling (review, user's): a failed edit retried with the same masked error is a loop like any other call; only a
  successful edit (or any success) clears the streak.
- Tests: same call + same masked error ×N → loop; same call, different error → none; success between → reset; an
  edit between → reset; masking makes `took 1234 ms` vs `took 5678 ms` equal.

## O13 — two sessions on one file, a port in use (my-office I4)
- Two live main sessions whose current or previous turn edited the same absolute path within 20 min: each gets a
  tag `same file: <name> · <other session>` and one line on its card; one toast per pair and path; a Chronicon event
  `conflict`. Subagents count under their parent.
- A tool result containing `EADDRINUSE`, `address already in use` or `port … is already in use`: a Chronicon event
  `port-in-use` with the port number, and a card line for that turn. No toast.
- Display only; nothing is sent to Claude.
- Ruling (review): `port-in-use` only from a shell's output (Bash, PowerShell, BashOutput); a Read or Grep quoting the
  words is not one. Edits count within 20 min of now (inclusive), turns are not tracked; only file names leave the
  backend; no toast for the break-out room.
- Tests: pair detection (path case-insensitive on Windows, window edges at 20 min), no self-conflict, subagent folded
  into parent; port parsing.

## O14 — secrets masked (my-office I5)
- Before any text reaches the WebView or the remote view (task lines, turn summary, Chronicon details, petition
  questions, peek text), strings shaped like secrets are replaced by `•••`: `sk-…`/`sk-ant-…`, `ghp_`/`gho_`/
  `github_pat_`, `xox[abps]-`, `AKIA[0-9A-Z]{16}`, `-----BEGIN … PRIVATE KEY-----` blocks, JWTs (three base64url parts),
  `password=`/`token=`/`secret=`/`api_key=` values, and `Bearer <token>`. One Rust function `mask(&str) -> Cow<str>`
  applied where those strings are built; the Chronicon files on disk are masked too (new lines only).
- Tests: each shape masked; ordinary text, hashes in git messages (7–40 hex) and paths untouched.
- Ruling (review): masking runs at serialization (`serialize_with`), one place for the WebView, the remote view and
  the day files. `name=` values only when a literal (quoted, or 16+ characters with no space, bracket, `$` or call:
  `token = getToken()` stays); `Bearer` only with a token-like value (20+ characters, letters and digits); JWTs need
  the `eyJ` prefix.

## O15 — the cache clock (my original O13)
- A session's prompt cache cools after its TTL: 1 h when the last assistant usage wrote `ephemeral_1h` cache, else
  5 min, counted from its last assistant line. An idle scribe's candle burns down over that time and goes out when the
  cache is cold (each world's own light: candle, neon, lamp…, using existing frames: lit, low, out). The card shows
  `cache warm · 3 min left` / `cache cold`.
- Ruling: only idle scribes at their desk show it; a napper in the refectory shows nothing; working scribes stay lit.
- Ruling (review, user's): the TTL is the one of the most recent cache write (1 h or 5 min); a turn that only reads
  keeps the last known TTL, counted from that turn's line. No world has a low-candle frame: "low" is the lit desk
  with its light pool scaled by the time left.
- Tests: TTL choice from the usage line; remaining time; cold after TTL; the frame chosen per phase.

## Order and size
O11, O12, O13, O14 are small; O15 small plus a light art check (existing frames). One worker, slices in this order,
each green and committed on its own branch, merged together.
