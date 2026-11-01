// Runs before the DM Screen's own scripts. Gives the page the same window.claude.use() surface it has on
// claude.ai (db, sample, downloads), backed here by the open campaign file, Claude via your API key,
// and the system save dialog.
(() => {
  const D = window.desktop;
  if (!D) return;
  const PLAYER = location.hash === "#players";
  const camp = D.getCampaign();
  const clone = o => JSON.parse(JSON.stringify(o));

  // Fight tracker, loot and party live in localStorage in the page; mirror them into the campaign file.
  if (!PLAYER) {
    try {
      if (camp.table) localStorage.setItem("dm-screen-v1", JSON.stringify(camp.table)); else localStorage.removeItem("dm-screen-v1");
      if (camp.ui && camp.ui.tab) localStorage.setItem("dm-tab", camp.ui.tab);
    } catch (e) {}
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      setItem.call(this, k, v);
      if (this !== window.localStorage) return;
      if (k === "dm-screen-v1") D.setTable(v);
      else if (k === "dm-tab") D.setUi("tab", v);
    };
  }

  // db: the subset of the artifact database API the page uses.
  const cols = { pages: camp.pages || {}, sessions: camp.sessions || {}, items: camp.items || {}, notes: camp.notes || {} };
  const listeners = {};
  const snap = col => ({ docs: Object.entries(cols[col] || {}).map(([id, d]) => ({ id, data: () => clone(d) })) });
  const emit = col => (listeners[col] || []).forEach(fn => { try { fn(snap(col)); } catch (e) { console.error(e); } });
  D.onDbChanged((col, data) => { cols[col] = data; emit(col); });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const db = Object.freeze({
    collection: col => ({
      onSnapshot(next) { (listeners[col] ||= new Set()).add(next); setTimeout(() => next(snap(col)), 0); return () => listeners[col].delete(next); },
      doc: () => ({ id: newId() }),
    }),
    doc: p => {
      const [col, id] = p.split("/");
      return {
        async set(data) { (cols[col] ||= {})[id] = clone(data); await D.dbSet(col, id, clone(data)); emit(col); },
        async delete() { if (cols[col]) delete cols[col][id]; await D.dbDelete(col, id); emit(col); },
      };
    },
  });

  // sample: ask Claude through the main process, which holds the API key.
  const fail = (code, message, text) => Object.assign(new Error(message || code), { code, text });
  function run(input, opts = {}) {
    const prompt = Array.isArray(input) ? input.filter(m => m.role === "user").map(m => m.content).join("\n\n") : String(input);
    if (opts.signal && opts.signal.aborted) return Promise.reject(fail("cancelled"));
    const reqId = newId();
    let last = "";
    const onAbort = () => D.claudeAbort(reqId);
    opts.signal && opts.signal.addEventListener("abort", onAbort, { once: true });
    return D.claudeRun(reqId, prompt, text => {
      if (opts.signal && opts.signal.aborted) return;
      const delta = text.slice(last.length); last = text;
      if (delta && opts.onText) opts.onText({ text, delta });
    }).then(r => {
      opts.signal && opts.signal.removeEventListener("abort", onAbort);
      if (r.error) throw fail(r.error, r.message, r.text);
      if (opts.onText && r.text !== last && r.text) opts.onText({ text: r.text, delta: r.text.slice(last.length) });
      return { text: r.text, truncated: !!r.truncated };
    });
  }
  function parseJson(text) {
    const t = String(text || "").trim();
    const tries = [t];
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) tries.push(fence[1]);
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
    if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
    for (const s of tries) { try { return JSON.parse(s); } catch (e) {} }
    throw fail("invalid_json", "Claude's reply wasn't valid JSON.", text);
  }
  const sample = (input, opts) => run(input, opts);
  sample.json = (input, opts) => run(String(input) + "\n\nYour reply will be parsed by a program: reply with the JSON value only.", opts).then(r => {
    if (r.truncated) throw fail("invalid_json", "Claude's reply was cut short.", r.text);
    return parseJson(r.text);
  });
  sample.limits = async () => ({ maxInputBytes: 262144 });

  const downloads = Object.freeze({
    async save({ filename, data }) {
      const text = typeof data === "string" ? data : await new Response(data).text();
      const r = await D.saveFile(filename, text);
      if (r.error) throw fail(r.error);
      return { status: "saved" };
    },
  });

  const caps = { db, sample, downloads };
  window.claude = Object.freeze({ use: async name => caps[name] || null });

  // The page's "Player screen" button opens a second app window instead of a browser tab.
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("#playerLink");
    if (a) { e.preventDefault(); D.openPlayers(); }
  }, true);
})();
