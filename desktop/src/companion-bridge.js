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
  D.companionGet().then(r => { status = r.status || status; party = r.party || []; if (party.length) applyRemote(); else badge(); });
})();
