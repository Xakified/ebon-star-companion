// Runs after the DM Screen's own script in the desktop app. Connects the initiative tracker and party list
// to the Ebon Star Companion: players' characters fill the party, and HP / temp HP / conditions /
// Exhaustion / Stress flow both ways between the tracker and their phones.
(() => {
  const D = window.desktop;
  if (!D || !D.companionGet || location.hash === "#players" || typeof S === "undefined") return;
  const SRD_CONDS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
  let party = [], status = { state: "off" };
  const known = {};        // character id -> what we last synced, so we only send real changes
  const pending = {};      // character id -> timer for batching pushes
  let deferred = false;

  const exh = c => { const k = (c.conds || []).find(x => x.n === "Exhaustion"); return k ? (k.lvl || 1) : 0; };
  const snap = c => ({ hp: c.hp, temp: c.temp || 0, conditions: (c.conds || []).map(x => x.n).filter(n => SRD_CONDS.includes(n)).sort(), exhaustion: exh(c), stress: c.stress || 0 });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const byId = id => party.find(p => p.id === id);

  // Copy a character's live numbers onto a tracker row.
  function pull(c, p) {
    c.companionId = p.id; c.ac = p.ac; c.maxHp = p.maxHp; c.hp = p.hp; c.temp = p.temp; c.mod = p.mod; c.stress = Math.min(p.stress, 4);
    const keep = (c.conds || []).filter(x => !SRD_CONDS.includes(x.n) && x.n !== "Exhaustion");
    const add = p.conditions.map(n => { const old = (c.conds || []).find(x => x.n === n); return old || { n }; });
    if (p.exhaustion) add.push({ n: "Exhaustion", lvl: p.exhaustion });
    c.conds = [...add, ...keep];
    known[p.id] = snap(c);
  }
  function linkRows() {
    for (const c of S.combatants) {
      if (c.kind !== "pc") continue;
      if (c.companionId && byId(c.companionId)) continue;
      const p = party.find(p => p.name === c.name || p.name === String(c.name).replace(/\s+\d+$/, ""));
      if (p && !S.combatants.some(o => o !== c && o.companionId === p.id)) pull(c, p);
    }
  }
  function syncPartyList() {
    if (!S.partyBeforeCompanion) S.partyBeforeCompanion = S.party.filter(p => !p.companionId);
    S.party = party.map(p => ({ name: p.name, ac: p.ac, maxHp: p.maxHp, mod: p.mod, stress: p.stress, companionId: p.id }));
  }

  function applyRemote() {
    const f = document.activeElement;
    if (f && f.closest && f.closest("#initList") && /INPUT|TEXTAREA|SELECT/.test(f.tagName)) { deferred = true; return; }
    deferred = false;
    syncPartyList();
    linkRows();
    for (const c of S.combatants) { const p = c.companionId && byId(c.companionId); if (p && !pending[p.id]) pull(c, p); }
    save(); renderInit(); badge();
  }
  document.addEventListener("focusout", () => setTimeout(() => { if (deferred) applyRemote(); }, 60));

  // After every tracker save, send changed linked rows back to the Companion.
  function onLocalSave() {
    if (!party.length) return;
    const unlinked = S.combatants.filter(c => c.kind === "pc" && !c.companionId).length;
    if (unlinked) { linkRows(); if (S.combatants.filter(c => c.kind === "pc" && !c.companionId).length < unlinked) { save(); renderInit(); } } // a row just added with Add party: show the real HP, don't overwrite the phone
    for (const c of S.combatants) {
      const id = c.companionId; if (!id || !byId(id)) continue;
      const now = snap(c), was = known[id] || {};
      if (same(now, was)) continue;
      const patch = {};
      for (const k of Object.keys(now)) if (!same(now[k], was[k])) patch[k] = now[k];
      known[id] = now;
      clearTimeout(pending[id]);
      const send = Object.assign(pending[id + ":p"] || {}, patch); pending[id + ":p"] = send;
      pending[id] = setTimeout(async () => {
        delete pending[id]; delete pending[id + ":p"];
        const r = await D.companionPatch(id, send);
        if (r && r.error) toast("Couldn't update " + (byId(id) || {}).name + " in the Companion: " + r.error);
      }, 250);
    }
  }
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    setItem.call(this, k, v);
    if (this === window.localStorage && k === KEY) try { onLocalSave(); } catch (e) { console.error(e); }
  };

  // A small status pill next to Add party.
  function badge() {
    let b = document.getElementById("compPill");
    const add = document.getElementById("addParty");
    if (!add) return;
    if (status.state === "off") { if (b) b.remove(); add.title = ""; return; }
    if (!b) { b = document.createElement("span"); b.id = "compPill"; b.style.cssText = "font-size:.8rem;padding:2px 9px;border-radius:999px;background:var(--accent-soft);white-space:nowrap;align-self:center"; add.after(b); }
    const live = status.state === "live";
    b.textContent = live ? `Companion · ${party.length} live` : status.state === "connecting" ? "Companion · connecting…" : status.state === "unlinked" ? "Companion · connect this computer" : "Companion · offline";
    b.title = status.message || (live ? `Party and HP sync with ${status.name || "the Companion"}.` : "");
    b.style.color = live ? "" : "var(--warn)";
    add.title = live ? "Adds your players' Companion characters with their current HP, AC and initiative bonus." : "";
  }

  D.onCompanionParty(list => { party = list || []; applyRemote(); });
  D.onCompanionStatus(st => {
    const wasOn = status.state !== "off"; status = st || { state: "off" };
    if (status.state === "off" && wasOn) {
      // disconnected: put the old party list back, keep the tracker as it is
      if (S.partyBeforeCompanion) { S.party = S.partyBeforeCompanion; delete S.partyBeforeCompanion; }
      S.combatants.forEach(c => delete c.companionId); party = []; save(); renderInit();
    }
    badge();
  });
  // ---------- Players tab: the Companion's DM view, inside the DM Suite ----------
  // Runs the Companion in a frame. Its requests come here and go through this computer's DM sign-in (main process),
  // so everything a DM does in the Companion (sheets, sending, homebrew, moving characters, codes) happens here.
  const nav = document.getElementById("tabNav"), main = document.querySelector("main");
  let frame = null, frameLoaded = false, linkedNow = null;
  const post = m => { if (frame && frame.contentWindow) frame.contentWindow.postMessage(m, "*"); };
  const theme = () => document.documentElement.dataset.theme || "";
  if (nav && main) {
    const btn = document.createElement("button");
    btn.dataset.tab = "players"; btn.textContent = "Players"; btn.title = "Your players' characters from the Companion";
    nav.appendChild(btn);
    const sec = document.createElement("section");
    sec.id = "tab-players"; sec.hidden = true;
    sec.innerHTML = `<iframe id="playersFrame" title="Players" style="display:block;width:100%;border:1px solid var(--line);border-radius:12px;background:var(--bg)"></iframe>`;
    main.appendChild(sec);
    frame = sec.querySelector("iframe");
    const size = () => { if (!sec.hidden) frame.style.height = Math.max(480, innerHeight - frame.getBoundingClientRect().top - 16) + "px"; };
    const show = on => {
      sec.hidden = !on;
      if (!on) return;
      if (!frameLoaded) { frame.src = "companion/index.html#suite"; frameLoaded = true; }
      requestAnimationFrame(size);
    };
    addEventListener("resize", size);
    // The page's setTab only knows its own four tabs; wrap it so every way of switching tabs (the nav, lore links…) shows or hides this one.
    if (typeof setTab === "function") { const orig = setTab; window.setTab = t => { orig(t); show(t === "players"); }; }
    frame.addEventListener("load", () => post({ esc: "theme", theme: theme() }));
    new MutationObserver(() => post({ esc: "theme", theme: theme() })).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  addEventListener("message", async e => {
    if (!frame || e.source !== frame.contentWindow || !e.data || e.data.esc !== "call") return;
    const { id, method, args } = e.data;
    let r;
    try { r = await D.companionCall(String(method), Array.isArray(args) ? args : []); } catch (err) { r = { error: err.message }; }
    post({ esc: "result", id, ok: !(r && r.error), value: r && r.value, error: r && r.error });
  });
  if (D.onCompanionEvent) D.onCompanionEvent(ev => post({ esc: "event", ev }));
  // Reload the tab when this campaign gets connected or disconnected.
  D.onCompanionStatus(st => {
    const linked = !!st && (st.state === "live" || st.state === "connecting");
    if (st && st.state === "connecting") return;
    if (linkedNow !== null && linked !== linkedNow && frameLoaded) post({ esc: "reload" });
    linkedNow = linked;
  });

  // ---------- Player session notes ----------
  // Tells the Companion which sessions players can write notes on (played ones and the live one), and copies every
  // player note into the campaign file (notes/{id}), where it stays even if Supabase loses it. A note the player
  // deletes is removed here too. Needs supabase/fix-04-session-notes.sql in the Companion's Supabase project.
  const hasJournal = typeof J !== "undefined" && typeof writeDoc === "function";
  let notesOn = false, pubSig = "", pubBusy = false, pulling = false, pulledOnce = false, pullTimer = null, warned = false, recapWarned = false, quietUntil = 0;
  function noteProblem(msg) {
    quietUntil = Date.now() + 60000; // try again in a minute, not every few seconds
    const setup = /game_sessions|session_notes|schema cache|does not exist/i.test(msg || "");
    window.PLAYER_NOTES_PROBLEM = setup ? "Player notes need one more setup step: run fix-04-session-notes.sql from the Companion repo in the Supabase SQL Editor." : "Couldn't reach the Companion for player notes: " + msg;
    if (setup && !warned) { warned = true; toast(window.PLAYER_NOTES_PROBLEM, null, null, 9000); }
    if (typeof paintPlayerNotes === "function") paintPlayerNotes();
  }
  function noteFixed() { if (window.PLAYER_NOTES_PROBLEM) { delete window.PLAYER_NOTES_PROBLEM; if (typeof paintPlayerNotes === "function") paintPlayerNotes(); } }
  function publishedSessions() {
    return Object.entries(J.sessions).filter(([, x]) => x.status === "played" || x.live)
      .map(([id, x]) => ({ id, title: x.title || "", played_on: x.date || "", live: !!x.live, ord: x.order || 0, ended_at: x.ended ? new Date(x.ended).toISOString() : null, recap: x.recap || "", contradictions: x.contradictions || "",
        privateRecaps: Object.entries(x.privateRecaps || {}).map(([user_id, v]) => ({ user_id, recap: (v && v.recap) || "" })).filter(v => v.recap) }))
      .sort((a, b) => a.ord - b.ord);
  }
  async function publishSessions(force) {
    if (!notesOn || pubBusy || !J.ready) return;
    const list = publishedSessions(), sig = JSON.stringify(list);
    if (!force && sig === pubSig) return;
    pubBusy = true;
    const r = await D.companionCall("publishSessions", [list]).catch(e => ({ error: e.message }));
    pubBusy = false;
    if (r && r.error) { pubSig = ""; noteProblem(r.error); return; }
    pubSig = sig; noteFixed();
    if (r && r.value === "no-recap" && !recapWarned) { recapWarned = true; toast("Players can't see session recaps yet: run fix-05-session-recaps.sql from the Companion repo in the Supabase SQL Editor.", null, null, 9000); }
    if (r && r.value === "no-private" && !recapWarned) { recapWarned = true; toast("Players can't see their private recaps yet: run fix-06-party-and-private-notes.sql from the Companion repo in the Supabase SQL Editor.", null, null, 9000); }
  }
  async function pullNotes() {
    if (!notesOn || pulling || !J.ready || !J.db) return;
    pulling = true;
    try {
      const r = await D.companionCall("listNotes", []).catch(e => ({ error: e.message }));
      if (r && r.error) { noteProblem(r.error); return; }
      pulledOnce = true; noteFixed();
      let changed = false;
      for (const n of r.value || []) {
        const have = J.notes[n.id];
        if (n.deleted) { if (have) { delete J.notes[n.id]; deleteDoc(`notes/${n.id}`).catch(() => {}); changed = true; } continue; }
        const at = Date.parse(n.created_at) || Date.now(), up = Date.parse(n.updated_at) || at;
        const doc = { session: n.session_id, by: n.author_name || "", character: n.character_name || "", body: n.body || "", at, edited: up - at > 60000 ? up : 0, author: n.author, private: n.visibility !== "shared" };
        if (JSON.stringify(have) !== JSON.stringify(doc)) { J.notes[n.id] = doc; writeDoc(`notes/${n.id}`, () => J.notes[n.id], 0); changed = true; }
      }
      if (changed) paintPlayerNotes();
    } finally { pulling = false; }
  }
  function notesStatus(st) {
    const on = !!st && st.state === "live";
    if (on === notesOn) return;
    notesOn = on; window.PLAYER_NOTES_ON = on;
    if (on) { quietUntil = 0; publishSessions(true); pullNotes(); }
    if (typeof renderJournal === "function") renderJournal(true);
  }
  if (hasJournal) {
    D.onCompanionStatus(notesStatus);
    if (D.onCompanionEvent) D.onCompanionEvent(ev => { if (ev && ev.table === "session_notes") { clearTimeout(pullTimer); pullTimer = setTimeout(pullNotes, 300); } });
    setInterval(() => { if (Date.now() < quietUntil) return; publishSessions(); if (!pulledOnce) pullNotes(); }, 3000);   // sessions started, renamed or ended
    setInterval(pullNotes, 60000);                                                    // safety net for a missed live update
  }

  D.companionGet().then(r => { if (hasJournal) notesStatus(r.status); status = r.status || status; party = r.party || []; if (party.length) applyRemote(); else badge(); });
})();
