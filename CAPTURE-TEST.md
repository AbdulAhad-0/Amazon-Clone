# CAPTURE-TEST

Verified 2026-10-02. Both canaries landed in `.agent-logs/` without any manual step.

## Tool and model

- **Tool:** `opencode` v1.18.34 (CLI, Windows / PowerShell).
- **Model:** `opencode/mimo-v2.6-flash-free` — same model for planning and execution; no mid-session switch so far. Each log entry records the model from that message's own `modelID`, so a switch would be visible.
- **Does the tool have an automatic hook?** Yes. opencode loads plugins from `.opencode/plugins/` and exposes an `event` hook (`session.idle`, `message.updated`, …).

## Mechanism

- **File:** `.opencode/plugins/capture.js` — this is the only config file changed. opencode auto-discovers the plugins directory, so no `opencode.json` entry was needed. `.gitignore` was set to `node_modules/` and `.opencode/.capture-state.json` (dedupe state; it lives outside `.agent-logs/`).
- **No manual step.** Nothing to run, remember, or invoke per turn:
  - `message.updated` with `role === "user"` → writes the `PROMPT` entry immediately, verbatim.
  - `session.idle` → writes the `RESPONSE` entry for the completed turn.
  - A best-effort backfill runs 2.5 s after startup and replays any session/turn the hook has not seen.
- **Dedupe:** `.opencode/.capture-state.json`, keyed session → user message ID → `{p, r, n}`, double-checked against the `PROMPT`/`RESPONSE` numbers already in the file, so a repeated `session.idle` can never double-write.
- **Safety:** every path is wrapped in try/catch — a logger failure cannot break a session. Child and hidden sessions (and non-main agents) are skipped.
- Diagnostics go to `%TEMP%\opencode-capture-debug.log`, outside the repo.

## Log files

- `.agent-logs/2026-10-02_17-20-42_ses_f025e1469ffem2aFVWxM5cPcA3.md` — main session, **canary 1** (`ses_f025`).
- `.agent-logs/2026-10-02_18-30-04_ses_f021e9339ffeSKzV9eOnh2hFPW.md` — fresh session, **canary 2** (`ses_f021`).
- `.agent-logs/2026-10-02_17-16-19_ses_f026215d0ffeOyxLT503629UaK.md` — earlier session recovered by backfill (`ses_f026`).

## Canary 1 — raw

Session `ses_f025e1469ffem2aFVWxM5cPcA3`, file `.agent-logs/2026-10-02_17-20-42_ses_f025e1469ffem2aFVWxM5cPcA3.md`. This is the re-send after the first attempt failed (see "What failed first"); the three leading spaces are in the original prompt.

```text
[LOG_ENTRY type=PROMPT num=4 session=ses_f025]
timestamp: 2026-10-02T18:17:09.549Z
model: opencode/mimo-v2.6-flash-free

   CAPTURE TEST — 8x assignment, Abdulahad-0


[LOG_ENTRY type=RESPONSE num=4 session=ses_f025]
timestamp: 2026-10-02T18:19:28.777Z
model: opencode/mimo-v2.6-flash-free

Canary 1 (second run) is landing correctly:

- **Restart confirmed** — new hook init at `18:16:43`, backfill ran under v2.
- **`PROMPT num=4`** — verbatim, including your three leading spaces and the em dash (`   CAPTURE TEST — 8x assignment, Abdulahad-0`), `total_exchanges: 4`. ✓
- **No premature response** — state shows `{p:true, n:4}` with no `r`. The prompt-time fix works live. ✓
- **`session.idle` confirmed firing** — observed at `18:15:02`. So the uncertainty from last turn is resolved: `RESPONSE num=4` will be written the moment this reply ends, with the full concatenated text.

Backfill under v2 wrote nothing (all prior turns already logged, and entries are frozen) but it logged what v2 *would* have written: turn 1 = **3409** chars vs the 395 v1 kept; turn 3 = **3276** chars vs the placeholder v1 froze. Those gaps stay, per your never-edit rule, and go in `CAPTURE-TEST.md`.

**Next:** send `check` so I can confirm `RESPONSE num=4` in the file, then Canary 2 in a fresh session (`opencode`, no `-c`) with the same canary line.
```

## Canary 2 — raw

Session `ses_f021e9339ffeSKzV9eOnh2hFPW` (opened fresh, no `--continue`), file `.agent-logs/2026-10-02_18-30-04_ses_f021e9339ffeSKzV9eOnh2hFPW.md`.

```text
[LOG_ENTRY type=PROMPT num=1 session=ses_f021]
timestamp: 2026-10-02T18:30:04.273Z
model: opencode/mimo-v2.6-flash-free

   CAPTURE TEST — 8x assignment, Abdulahad-0


[LOG_ENTRY type=RESPONSE num=1 session=ses_f021]
timestamp: 2026-10-02T18:30:36.200Z
model: opencode/mimo-v2.6-flash-free

Capture received — 8x assignment, Abdulahad-0. Standing by for your actual task.
```

## What failed first

Two bugs were found and fixed before either canary could be trusted. Both bad entries are still in the log exactly as first written — nothing was edited, reordered, or deleted after the fact.

### 1. Empty `RESPONSE num=3`, written 96 ms after the prompt

The first canary attempt wrote its prompt correctly, then wrote a placeholder response almost immediately:

```text
[LOG_ENTRY type=PROMPT num=3 session=ses_f025]
timestamp: 2026-10-02T18:00:29.973Z
model: opencode/mimo-v2.6-flash-free

CAPTURE TEST — 8x assignment, Abdulahad-0


[LOG_ENTRY type=RESPONSE num=3 session=ses_f025]
timestamp: 2026-10-02T18:00:30.069Z
model: opencode/mimo-v2.6-flash-free

(no assistant text in this turn)
```

`18:00:30.069 − 18:00:29.973 = 96 ms` — far too fast for a model reply. Diagnosis from an exported session (`opencode export ses_f025…`): opencode creates the assistant message object the moment the prompt arrives, so v1 of the hook saw "an assistant message exists" and wrote the response while it was still empty. Dedupe then locked that placeholder forever.

**Fix:** added a `complete` flag to `sync()`. The `PROMPT` is still written at prompt time, but the `RESPONSE` is written only when `complete` is true — i.e. on `session.idle` or during backfill — or when the turn is not the last one in the session (`turnComplete = complete || i < turns.length - 1`). An in-progress turn can no longer produce a response entry. Confirmed live: after the fix, `PROMPT num=4` sat alone with state `{p:true, n:4}` and no `r` until `session.idle` fired at `18:19:28`.

### 2. Turn 1's response kept 395 chars and dropped ~3,014

v1 wrote only the **last** assistant message of a turn. Turn 1 had 10 assistant messages, so the entry that landed was 395 chars — the tail of the reply — while the actual answer (the plan and step-1 response) never reached the file:

```text
[LOG_ENTRY type=RESPONSE num=1 session=ses_f025]
timestamp: 2026-10-02T17:31:59.986Z
model: opencode/mimo-v2.6-flash-free

Plan's ready. Two blockers before I start:

1. **Your GitHub handle** — the option came back without text, so I still don't have it. Reply with the handle to use for `author:` and the canary line.
2. **The assignment brief** — paste it whenever; capture setup comes first either way.

Approve the plan and give me the handle, and I'll install the hook, then tell you exactly when to restart.
```

The hook's own debug log recorded it at the time: `10 assistant messages, last one used, 3016 chars of earlier assistant text not written`. Measured against the full turn (3,409 chars of assistant text), 395 was kept and 3,014 dropped. Turn 2 hit the same bug (19 assistant messages, 922 chars of interim narration dropped).

**Fix:** the response body is now every `type: "text"` part of **every** assistant message in the turn, in order, joined by `\n\n`, with empty parts filtered. Nothing is truncated, summarised, or cleaned, and the per-turn concatenated char count is logged to `%TEMP%\opencode-capture-debug.log`. Under the never-edit rule the 395-char entry and the `num=3` placeholder stay as they are; the corrected text for those turns was never back-written.

## Known limitation

- **The last turn's response is only written on `session.idle` or when the next prompt arrives.** Responses for the final turn are gated on `complete`, so between the end of a reply and the next event the log shows a `PROMPT` with no matching `RESPONSE`. Earlier turns are completed by the next `message.updated`, so they are always closed out.
- `RESPONSE num=7` in the main log is also a placeholder: that turn's assistant messages contained no text parts when it was written (debug: `9 assistant messages, 0 chars of text concatenated`). Left as-is, per the never-edit rule.
