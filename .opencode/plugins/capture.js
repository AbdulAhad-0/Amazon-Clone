import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const AUTHOR = "Abdulahad-0";
const PROJECT_NAME = "amazon-clone";
const TOOL_NAME = "opencode";
const FALLBACK_MODEL = "opencode/mimo-v2.6-flash-free";
const NON_MAIN_AGENTS = new Set(["title", "summary", "compaction"]);
const DEBUG_PATH = path.join(os.tmpdir(), "opencode-capture-debug.log");

function debug(message) {
  try {
    void fs
      .appendFile(DEBUG_PATH, `${new Date().toISOString()} ${message}\n`, "utf8")
      .catch(() => {});
  } catch {}
}

const pad = (n) => String(n).padStart(2, "0");

function toMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value < 1e12 ? value * 1000 : value;
}

function iso(ms) {
  if (ms === null || ms === undefined) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function stamp(ms) {
  const d = new Date(ms);
  return [
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    `${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`,
  ].join("_");
}

function dateOnly(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function unwrap(res) {
  if (res && typeof res === "object" && !Array.isArray(res) && "data" in res) {
    return res.error ? null : res.data;
  }
  return res;
}

function modelOf(info) {
  if (!info || typeof info !== "object") return null;
  const model = info.modelID || info.modelId || info.model;
  if (!model || typeof model !== "string") return null;
  const provider = info.providerID || info.providerId || info.provider;
  if (provider && !model.includes("/")) return `${provider}/${model}`;
  return model;
}

function textOf(entry) {
  const parts = (entry && entry.parts) || [];
  const texts = [];
  for (const part of parts) {
    if (part && part.type === "text" && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.join("\n");
}

function sanitizeFilePart(id) {
  return String(id).replace(/[<>:"/\\|?*]/g, "-");
}

function shortId(id) {
  return String(id).slice(0, 8);
}

function normPath(p) {
  return String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function buildTurns(entries) {
  const turns = [];
  let current = null;
  for (const entry of entries) {
    const info = (entry && entry.info) || {};
    if (info.role === "user") {
      current = { user: info, prompt: textOf(entry), assistants: [] };
      turns.push(current);
    } else if (info.role === "assistant" && current) {
      current.assistants.push({ info, text: textOf(entry) });
    }
  }
  return turns;
}

function numsOf(content, type) {
  const set = new Set();
  if (!content) return set;
  const re = new RegExp(`^\\[LOG_ENTRY type=${type} num=(\\d+) `, "gm");
  let match;
  while ((match = re.exec(content)) !== null) set.add(Number(match[1]));
  return set;
}

function buildHeader({ sessionId, firstMs, model }) {
  const day = dateOnly(firstMs);
  const firstIso = iso(firstMs) || iso(Date.now());
  return [
    "---",
    `session_id: ${sessionId}`,
    `date: ${day}`,
    `author: ${AUTHOR}`,
    `model: ${model}`,
    `tool: ${TOOL_NAME}`,
    `project: ${PROJECT_NAME}`,
    `total_exchanges: 0`,
    `first_prompt_time: ${firstIso}`,
    `last_prompt_time: ${firstIso}`,
    "---",
    "",
    `# Session Log - ${day}`,
    "",
    `Session: \`${shortId(sessionId)}\` | Project: \`${PROJECT_NAME}\` | Author: \`${AUTHOR}\``,
    "",
    "---",
    "",
  ].join("\n");
}

async function readIfExists(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return "";
  }
}

async function appendEntry(file, entryType, num, sid8, ts, model, body) {
  const block = `[LOG_ENTRY ${entryType} num=${num} session=${sid8}]\ntimestamp: ${ts}\nmodel: ${model}\n\n${body}`;
  const base = await readIfExists(file);
  const trailing = base.length
    ? ((base.match(/\n*$/) || [""])[0] || "").length
    : 0;
  const sep = trailing === 0 ? "\n\n\n" : "\n";
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, base.length ? sep + block : block, "utf8");
}

async function updateFrontmatter(file, { total, lastPromptTime }) {
  let content;
  try {
    content = await fs.readFile(file, "utf8");
  } catch {
    return;
  }
  if (!content.startsWith("---\n")) return;
  const end = content.indexOf("\n---\n", 4);
  if (end === -1) return;
  const head = content.slice(0, end);
  const rest = content.slice(end);
  let next = head;
  if (next.includes("total_exchanges:")) {
    next = next.replace(/^total_exchanges: .*$/m, `total_exchanges: ${total}`);
  }
  if (next.includes("last_prompt_time:")) {
    next = next.replace(
      /^last_prompt_time: .*$/m,
      `last_prompt_time: ${lastPromptTime}`,
    );
  }
  if (next !== head) await fs.writeFile(file, next + rest, "utf8");
}

export default async function CapturePlugin({ client, directory }) {
  if (!client || !directory) {
    debug("init aborted: missing client or directory");
    return {};
  }

  const logDir = path.join(directory, ".agent-logs");
  const statePath = path.join(directory, ".opencode", ".capture-state.json");
  const queues = new Map();
  let state = { sessions: {} };
  let projectId = null;

  async function loadState() {
    try {
      const raw = await fs.readFile(statePath, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.sessions) {
        state = parsed;
      }
    } catch (err) {
      if (err && err.code !== "ENOENT") debug(`state load failed: ${err.message}`);
    }
  }

  let saveChain = Promise.resolve();

  function saveState() {
    saveChain = saveChain.then(async () => {
      try {
        await fs.mkdir(path.dirname(statePath), { recursive: true });
        await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
      } catch (err) {
        debug(`state save failed: ${err.message}`);
      }
    });
    return saveChain;
  }

  await loadState();

  function enqueue(sessionID, fn) {
    const prev = queues.get(sessionID) || Promise.resolve();
    const next = prev.then(fn).catch((err) => {
      debug(`sync ${String(sessionID).slice(0, 8)} failed: ${err && err.message}`);
    });
    queues.set(sessionID, next);
    return next;
  }

  function skipSession(s) {
    if (!s || typeof s !== "object") return true;
    if (s.parentID || s.parentId) return true;
    if (s.hidden === true) return true;
    const agent =
      typeof s.agent === "string" ? s.agent : (s.agent && s.agent.name) || null;
    if (agent && NON_MAIN_AGENTS.has(agent)) return true;
    return false;
  }

  async function belongs(s) {
    const pid = s.projectID || s.projectId;
    if (pid) {
      if (projectId === null) {
        try {
          const cur = unwrap(await client.project.current());
          projectId = (cur && cur.id) || null;
        } catch {
          projectId = null;
        }
      }
      if (projectId && String(projectId) !== String(pid)) return false;
      return true;
    }
    if (s.directory) return normPath(s.directory) === normPath(directory);
    return true;
  }

  async function sync(sessionID, options) {
    const complete = !!(options && options.complete);
    const sid = String(sessionID);
    const written = { prompts: 0, responses: 0 };
    const session = unwrap(await client.session.get({ path: { id: sid } }));
    if (!session || typeof session !== "object") return written;
    if (skipSession(session)) {
      debug(`skip ${shortId(sid)}: child/hidden/non-main session`);
      return written;
    }
    if (!(await belongs(session))) {
      debug(`skip ${shortId(sid)}: not this project`);
      return written;
    }

    const entries = unwrap(await client.session.messages({ path: { id: sid } }));
    if (!Array.isArray(entries) || entries.length === 0) return written;

    const turns = buildTurns(entries);
    if (turns.length === 0) return written;

    const firstMs =
      toMs(turns[0].user.time && turns[0].user.time.created) ||
      toMs(session.time && session.time.created) ||
      Date.now();
    const firstTurn = turns[0];
    const firstAssistant = firstTurn.assistants.length
      ? firstTurn.assistants[firstTurn.assistants.length - 1]
      : null;
    const headerModel =
      (firstAssistant && modelOf(firstAssistant.info)) ||
      modelOf(firstTurn.user) ||
      FALLBACK_MODEL;

    const file = path.join(
      logDir,
      `${stamp(firstMs)}_${sanitizeFilePart(sid)}.md`,
    );

    let existing = await readIfExists(file);
    if (existing === "") {
      await fs.mkdir(logDir, { recursive: true });
      try {
        await fs.writeFile(
          file,
          buildHeader({ sessionId: sid, firstMs, model: headerModel }),
          { flag: "wx" },
        );
        existing = await readIfExists(file);
        debug(`created log ${path.basename(file)}`);
      } catch (err) {
        if (err && err.code !== "EEXIST") throw err;
        existing = await readIfExists(file);
      }
    }

    const promptNums = numsOf(existing, "PROMPT");
    const responseNums = numsOf(existing, "RESPONSE");
    let promptTotal = promptNums.size;
    let nextPromptNum = (promptNums.size ? Math.max(...promptNums) : 0) + 1;

    if (!state.sessions[sid]) state.sessions[sid] = {};
    const sessState = state.sessions[sid];
    let stateDirty = false;

    turns.forEach((t, i) => {
      const msgId = t.user.id || `turn-${i}`;
      if (sessState[msgId]) return;
      const num = i + 1;
      if (promptNums.has(num) || responseNums.has(num)) {
        sessState[msgId] = {
          p: promptNums.has(num),
          r: responseNums.has(num),
          n: num,
        };
        stateDirty = true;
      }
    });

    const sid8 = shortId(sid);

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const msgId = turn.user.id || `turn-${i}`;
      const st = sessState[msgId] || (sessState[msgId] = {});
      const num = st.n || i + 1;
      const promptLogged = st.p === true || promptNums.has(num);
      const responseLogged = st.r === true || responseNums.has(num);
      const last = turn.assistants.length
        ? turn.assistants[turn.assistants.length - 1]
        : null;
      const responseText = turn.assistants
        .map((a) => a.text)
        .filter((x) => x && x.trim())
        .join("\n\n");
      const turnComplete = complete || i < turns.length - 1;

      if (turn.assistants.length > 1) {
        debug(
          `turn ${msgId} session=${sid8}: ${turn.assistants.length} assistant messages, ${responseText.length} chars of text concatenated`,
        );
      }

      if (!promptLogged) {
        const n = nextPromptNum++;
        const ts =
          iso(toMs(turn.user.time && turn.user.time.created) || firstMs) ||
          iso(Date.now());
        const model =
          modelOf(turn.user) ||
          (last && modelOf(last.info)) ||
          FALLBACK_MODEL;
        const body =
          turn.prompt && turn.prompt.trim()
            ? turn.prompt
            : "(no text content in this prompt)";
        await appendEntry(file, "type=PROMPT", n, sid8, ts, model, body);
        promptNums.add(n);
        promptTotal += 1;
        written.prompts += 1;
        st.p = true;
        st.n = n;
        stateDirty = true;
        await saveState();
        await updateFrontmatter(file, {
          total: promptTotal,
          lastPromptTime: ts,
        });
        debug(
          `wrote PROMPT num=${n} session=${sid8} ${body.length} chars model=${model}`,
        );
      }

      if (!responseLogged && turnComplete) {
        const n = st.n || i + 1;
        const tinfo = (last && last.info) || {};
        const ts =
          iso(
            toMs(tinfo.time && (tinfo.time.completed || tinfo.time.created)) ||
              Date.now(),
          ) || iso(Date.now());
        const model = modelOf(tinfo) || FALLBACK_MODEL;
        const body = responseText || "(no assistant text in this turn)";
        await appendEntry(file, "type=RESPONSE", n, sid8, ts, model, body);
        responseNums.add(n);
        written.responses += 1;
        st.r = true;
        stateDirty = true;
        await saveState();
        debug(
          `wrote RESPONSE num=${n} session=${sid8} ${body.length} chars model=${model}`,
        );
      }
    }

    if (stateDirty) await saveState();
    return written;
  }

  async function backfill() {
    try {
      const list = unwrap(await client.session.list());
      if (!Array.isArray(list)) {
        debug("backfill skipped: session.list not an array");
        return;
      }
      debug(`backfill scanning ${list.length} sessions`);
      const totals = { prompts: 0, responses: 0 };
      let scanned = 0;
      for (const s of list) {
        try {
          if (!s || !s.id || skipSession(s)) continue;
          if (!(await belongs(s))) continue;
          scanned += 1;
          const written = await enqueue(s.id, () =>
            sync(s.id, { complete: true }),
          );
          if (written && typeof written === "object") {
            totals.prompts += written.prompts || 0;
            totals.responses += written.responses || 0;
          }
        } catch (err) {
          debug(`backfill session error: ${err && err.message}`);
        }
      }
      debug(
        `backfill complete: ${scanned} sessions scanned, ${totals.prompts} prompts and ${totals.responses} responses written`,
      );
    } catch (err) {
      debug(`backfill failed: ${err && err.message}`);
    }
  }

  async function onEvent(input) {
    try {
      const ev = input && input.event;
      if (!ev || typeof ev.type !== "string") return;
      const props = ev.properties || {};

      if (ev.type === "session.idle") {
        const sid = props.sessionID || (props.session && props.session.id);
        if (sid) {
          debug(`event session.idle session=${String(sid).slice(0, 8)}`);
          await enqueue(sid, () => sync(sid, { complete: true }));
        }
        return;
      }

      if (ev.type === "message.updated") {
        const info = props.info || props.message;
        if (
          info &&
          info.role === "user" &&
          info.sessionID &&
          info.id
        ) {
          debug(
            `event message.updated(user) session=${String(info.sessionID).slice(0, 8)}`,
          );
          await enqueue(info.sessionID, () =>
            sync(info.sessionID, { complete: false }),
          );
        }
      }
    } catch (err) {
      debug(`event handler error: ${err && err.message}`);
    }
  }

  setTimeout(() => {
    void backfill();
  }, 2500);

  debug(`plugin init project=${PROJECT_NAME} dir=${directory}`);

  return { event: onEvent };
}
