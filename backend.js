// Storage + live sync. Two interchangeable backends with the same methods:
//  - SupabaseBackend: the real thing, shared across phones over the internet.
//  - DemoBackend: everything in this browser's localStorage, synced between tabs. For trying the app with no account.
(function (g) {
"use strict";

// ---------- Demo backend ----------
class DemoBackend {
  constructor() {
    this.mode = "demo";
    this.key = "esc-demo-db";
    this.chan = "BroadcastChannel" in g ? new BroadcastChannel("esc-demo") : null;
    this.listeners = new Set();
    if (this.chan) this.chan.onmessage = e => this.listeners.forEach(f => f(e.data));
    g.addEventListener && g.addEventListener("storage", e => { if (e.key === this.key + "-ping" && e.newValue) this.listeners.forEach(f => f(JSON.parse(e.newValue))); });
  }
  db() {
    let db; try { db = JSON.parse(localStorage.getItem(this.key)); } catch (e) {}
    db = db || {};
    for (const k of ["campaigns", "members", "characters", "grants", "homebrew", "sessions", "notes", "privateRecaps"]) db[k] = db[k] || [];
    return db;
  }
  put(db) { localStorage.setItem(this.key, JSON.stringify(db)); }
  emit(ev) {
    this.listeners.forEach(f => f(ev));
    if (this.chan) this.chan.postMessage(ev);
    else try { localStorage.setItem(this.key + "-ping", JSON.stringify(Object.assign({ n: Math.random() }, ev))); } catch (e) {}
  }
  // Each browser tab is its own demo "person", so a DM tab and a player tab can talk to each other.
  async init() {
    let u = sessionStorage.getItem("esc-demo-user");
    if (!u) { u = "demo-" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("esc-demo-user", u); }
    this.user = u; return u;
  }
  switchUser() { sessionStorage.removeItem("esc-demo-user"); }
  isDM(db, c) { return db.campaigns.some(x => x.id === c && x.dm_user === this.user); }
  async createCampaign(name, display) {
    const db = this.db();
    const c = { id: Engine.uid(), name, join_code: Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[01OI]/g, "X"), dm_user: this.user, created_at: new Date().toISOString() };
    db.campaigns.push(c); db.members.push({ campaign_id: c.id, user_id: this.user, role: "dm", display_name: display || "DM" });
    this.put(db); return c;
  }
  async joinCampaign(code, display) {
    const db = this.db();
    const c = db.campaigns.find(x => x.join_code === code.trim().toUpperCase());
    if (!c) throw new Error("No campaign with that code.");
    const ex = db.members.find(m => m.campaign_id === c.id && m.user_id === this.user);
    if (ex) ex.display_name = display; else db.members.push({ campaign_id: c.id, user_id: this.user, role: "player", display_name: display || "Player" });
    this.put(db); this.emit({ table: "members", campaign_id: c.id }); return c;
  }
  async myCampaigns() {
    const db = this.db();
    return db.members.filter(m => m.user_id === this.user).map(m => Object.assign({}, db.campaigns.find(c => c.id === m.campaign_id), { role: m.role })).filter(c => c.id);
  }
  async members(cid) { return this.db().members.filter(m => m.campaign_id === cid); }
  async listCharacters(cid) {
    const db = this.db(), dm = this.isDM(db, cid);
    return db.characters.filter(c => c.campaign_id === cid && (dm || c.owner === this.user));
  }
  async getCharacter(id) { return this.db().characters.find(c => c.id === id) || null; }
  async createCharacter(cid, data) {
    const db = this.db();
    const row = { id: Engine.uid(), campaign_id: cid, owner: this.user, data, version: 1, updated_at: new Date().toISOString() };
    db.characters.push(row); this.put(db); this.emit({ table: "characters", campaign_id: cid, id: row.id }); return row;
  }
  async saveCharacter(id, version, data) {
    const db = this.db(), row = db.characters.find(c => c.id === id);
    if (!row || row.version !== version) return null;
    row.data = data; row.version++; row.updated_at = new Date().toISOString();
    this.put(db); this.emit({ table: "characters", campaign_id: row.campaign_id, id }); return row.version;
  }
  async deleteCharacter(id) {
    const db = this.db(), row = db.characters.find(c => c.id === id);
    db.characters = db.characters.filter(c => c.id !== id); db.grants = db.grants.filter(x => x.character_id !== id);
    this.put(db); if (row) this.emit({ table: "characters", campaign_id: row.campaign_id, id });
  }
  async sendGrant(cid, characterId, kind, payload, note) {
    const db = this.db(); if (!this.isDM(db, cid)) throw new Error("Only the DM can send things.");
    const row = { id: Engine.uid(), campaign_id: cid, character_id: characterId, kind, payload, note: note || "", status: "pending", created_at: new Date().toISOString() };
    db.grants.push(row); this.put(db); this.emit({ table: "grants", campaign_id: cid, id: row.id }); return row;
  }
  async listGrants(cid) {
    const db = this.db(), dm = this.isDM(db, cid);
    const mine = new Set(db.characters.filter(c => c.owner === this.user).map(c => c.id));
    return db.grants.filter(x => x.campaign_id === cid && (dm || mine.has(x.character_id))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async setGrantStatus(id, status) {
    const db = this.db(), row = db.grants.find(x => x.id === id); if (!row) return;
    row.status = status; this.put(db); this.emit({ table: "grants", campaign_id: row.campaign_id, id });
  }
  async listHomebrew(cid) { return this.db().homebrew.filter(h => h.campaign_id === cid); }
  async saveHomebrew(cid, kind, data, id) {
    const db = this.db();
    let row = id && db.homebrew.find(h => h.id === id);
    if (row) Object.assign(row, { kind, data }); else { row = { id: Engine.uid(), campaign_id: cid, kind, data }; db.homebrew.push(row); }
    this.put(db); return row;
  }
  async reassignCharacter(id, userId) {
    const db = this.db(), row = db.characters.find(c => c.id === id);
    if (!row || !this.isDM(db, row.campaign_id)) throw new Error("Only the DM can move characters.");
    row.owner = userId; row.version++; this.put(db); this.emit({ table: "characters", campaign_id: row.campaign_id, id });
  }
  async createDmInvite() { throw new Error("Connecting the DM Suite needs the live version of the app, not demo mode."); }
  async redeemDmInvite() { throw new Error("DM codes need the live version of the app, not demo mode."); }
  async deleteHomebrew(id) { const db = this.db(); db.homebrew = db.homebrew.filter(h => h.id !== id); this.put(db); }
  // Session notes. With no DM Suite in demo mode, every campaign gets a "Session 1" being played now.
  async listSessions(cid) {
    const db = this.db();
    if (!db.sessions.some(x => x.campaign_id === cid)) { db.sessions.push({ campaign_id: cid, id: "demo-1", title: "Session 1", played_on: new Date().toISOString().slice(0, 10), live: true, ord: 1, ended_at: null }); this.put(db); }
    return db.sessions.filter(x => x.campaign_id === cid).sort((a, b) => b.ord - a.ord);
  }
  async listNotes(cid) {
    const db = this.db(), dm = this.isDM(db, cid);
    return db.notes.filter(n => n.campaign_id === cid && !n.deleted && (dm || n.author === this.user || n.visibility === "shared")).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async addNote(cid, note) {
    const db = this.db(), t = new Date().toISOString();
    const row = Object.assign({ id: Engine.uid(), campaign_id: cid, author: this.user, visibility: "private", deleted: false, created_at: t, updated_at: t }, note);
    db.notes.push(row); this.put(db); this.emit({ table: "session_notes", campaign_id: cid, id: row.id }); return row;
  }
  async updateNote(id, body, visibility) {
    const db = this.db(), row = db.notes.find(n => n.id === id && n.author === this.user); if (!row) throw new Error("That note is gone.");
    row.body = body; if (visibility) row.visibility = visibility; row.updated_at = new Date().toISOString(); this.put(db); this.emit({ table: "session_notes", campaign_id: row.campaign_id, id }); return row;
  }
  async deleteNote(id) {
    const db = this.db(), row = db.notes.find(n => n.id === id && n.author === this.user); if (!row) return;
    row.deleted = true; row.updated_at = new Date().toISOString(); this.put(db); this.emit({ table: "session_notes", campaign_id: row.campaign_id, id });
  }
  async listPrivateRecaps(cid) { return this.db().privateRecaps.filter(r => r.campaign_id === cid && r.user_id === this.user); }
  subscribe(cid, cb) {
    const f = ev => { if (!ev.campaign_id || ev.campaign_id === cid) cb(ev); };
    this.listeners.add(f); return () => this.listeners.delete(f);
  }
}

// ---------- Supabase backend ----------
class SupabaseBackend {
  constructor(url, key) { this.mode = "live"; this.sb = g.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }); }
  async init() {
    let { data } = await this.sb.auth.getSession();
    if (!data.session) {
      const r = await this.sb.auth.signInAnonymously();
      if (r.error) throw new Error("Couldn't sign in: " + r.error.message + " (is anonymous sign-in turned on in Supabase?)");
      data = r.data;
    }
    this.user = data.session ? data.session.user.id : data.user.id; return this.user;
  }
  ok(r) { if (r.error) throw new Error(r.error.message); return r.data; }
  async createCampaign(name, display) { return this.ok(await this.sb.rpc("create_campaign", { p_name: name, p_display: display })); }
  async joinCampaign(code, display) { return this.ok(await this.sb.rpc("join_campaign", { p_code: code, p_display: display })); }
  async myCampaigns() {
    const rows = this.ok(await this.sb.from("members").select("role, campaigns(*)").eq("user_id", this.user));
    return rows.filter(r => r.campaigns).map(r => Object.assign({}, r.campaigns, { role: r.role }));
  }
  async members(cid) { return this.ok(await this.sb.from("members").select("*").eq("campaign_id", cid)); }
  async listCharacters(cid) { return this.ok(await this.sb.from("characters").select("*").eq("campaign_id", cid).order("updated_at")); }
  async getCharacter(id) { return this.ok(await this.sb.from("characters").select("*").eq("id", id).maybeSingle()); }
  async createCharacter(cid, data) { return this.ok(await this.sb.from("characters").insert({ campaign_id: cid, owner: this.user, data }).select().single()); }
  async saveCharacter(id, version, data) { return this.ok(await this.sb.rpc("save_character", { p_id: id, p_version: version, p_data: data })); }
  async deleteCharacter(id) { this.ok(await this.sb.from("characters").delete().eq("id", id)); }
  async sendGrant(cid, characterId, kind, payload, note) { return this.ok(await this.sb.from("grants").insert({ campaign_id: cid, character_id: characterId, kind, payload, note: note || "" }).select().single()); }
  async listGrants(cid) { return this.ok(await this.sb.from("grants").select("*").eq("campaign_id", cid).order("created_at", { ascending: false })); }
  async setGrantStatus(id, status) { this.ok(await this.sb.from("grants").update({ status }).eq("id", id)); }
  async listHomebrew(cid) { return this.ok(await this.sb.from("homebrew").select("*").eq("campaign_id", cid)); }
  async saveHomebrew(cid, kind, data, id) {
    if (id) return this.ok(await this.sb.from("homebrew").update({ kind, data, updated_at: new Date().toISOString() }).eq("id", id).select().single());
    return this.ok(await this.sb.from("homebrew").insert({ campaign_id: cid, kind, data }).select().single());
  }
  async deleteHomebrew(id) { this.ok(await this.sb.from("homebrew").delete().eq("id", id)); }
  // Session notes (supabase/fix-04-session-notes.sql). The DM Suite publishes the sessions; players write notes on them.
  async listSessions(cid) { return this.ok(await this.sb.from("game_sessions").select("*").eq("campaign_id", cid).order("ord", { ascending: false })); }
  async listNotes(cid) { return this.ok(await this.sb.from("session_notes").select("*").eq("campaign_id", cid).eq("deleted", false).order("created_at", { ascending: false })); }
  async addNote(cid, note) { return this.ok(await this.sb.from("session_notes").insert(Object.assign({ campaign_id: cid, author: this.user }, note)).select().single()); }
  async updateNote(id, body, visibility) { return this.ok(await this.sb.from("session_notes").update(Object.assign({ body, updated_at: new Date().toISOString() }, visibility ? { visibility } : {})).eq("id", id).select().single()); }
  // This player's private recaps (fix-06). Only theirs come back.
  async listPrivateRecaps(cid) { return this.ok(await this.sb.from("session_private_recaps").select("*").eq("campaign_id", cid).eq("user_id", this.user)); }
  async deleteNote(id) { this.ok(await this.sb.from("session_notes").update({ deleted: true, updated_at: new Date().toISOString() }).eq("id", id)); }
  // One-time code that lets the desktop DM Suite join this campaign as a second DM device.
  async reassignCharacter(id, userId) { this.ok(await this.sb.rpc("reassign_character", { p_id: id, p_user: userId })); }
  async createDmInvite(cid) {
    const code = this.ok(await this.sb.rpc("create_dm_invite", { p_campaign: cid }));
    const cfg = window.APP_CONFIG;
    return "ESC1." + btoa(JSON.stringify({ u: cfg.supabaseUrl, k: cfg.supabaseAnonKey, c: code }));
  }
  // Redeem a DM code (from the Companion or the DM Suite): this browser becomes a DM of that campaign.
  async redeemDmInvite(code, display) {
    let c = String(code || "").replace(/\s+/g, "");
    const m = /^ESC1\.(.+)$/.exec(c);
    if (m) { try { c = JSON.parse(atob(m[1].replace(/-/g, "+").replace(/_/g, "/"))).c; } catch (e) { throw new Error("That DM code is incomplete. Copy the whole thing and try again."); } }
    return this.ok(await this.sb.rpc("redeem_dm_invite", { p_code: c, p_display: display || "DM" }));
  }
  subscribe(cid, cb) {
    const ch = this.sb.channel("camp-" + cid)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: "campaign_id=eq." + cid }, p => cb({ table: "characters", campaign_id: cid, id: (p.new && p.new.id) || (p.old && p.old.id) }))
      .on("postgres_changes", { event: "*", schema: "public", table: "grants", filter: "campaign_id=eq." + cid }, p => cb({ table: "grants", campaign_id: cid, id: (p.new && p.new.id) || (p.old && p.old.id) }))
      .subscribe();
    // Its own channel, so a Supabase project without the notes tables yet still gets live character updates.
    const notes = this.sb.channel("notes-" + cid)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_sessions", filter: "campaign_id=eq." + cid }, () => cb({ table: "game_sessions", campaign_id: cid }))
      .on("postgres_changes", { event: "*", schema: "public", table: "session_notes", filter: "campaign_id=eq." + cid }, p => cb({ table: "session_notes", campaign_id: cid, id: (p.new && p.new.id) || (p.old && p.old.id) }))
      .subscribe();
    const recaps = this.sb.channel("recaps-" + cid)
      .on("postgres_changes", { event: "*", schema: "public", table: "session_private_recaps", filter: "campaign_id=eq." + cid }, () => cb({ table: "session_private_recaps", campaign_id: cid }))
      .subscribe();
    return () => { this.sb.removeChannel(ch); this.sb.removeChannel(notes); this.sb.removeChannel(recaps); };
  }
}

// ---------- Inside the DM Suite desktop app ----------
// The Companion runs in a frame of the DM Suite's Players tab. Every call goes to the DM Suite, which talks to
// Supabase with its own DM sign-in, so the DM never has to sign in here.
class SuiteBackend {
  constructor() {
    this.mode = "suite"; this.n = 0; this.wait = new Map(); this.listeners = new Set();
    window.addEventListener("message", e => {
      if (e.source !== window.parent || !e.data || typeof e.data !== "object") return;
      const m = e.data;
      if (m.esc === "result" && this.wait.has(m.id)) { const w = this.wait.get(m.id); this.wait.delete(m.id); m.ok ? w.ok(m.value) : w.no(new Error(m.error || "The DM Suite couldn't do that.")); }
      else if (m.esc === "event") this.listeners.forEach(f => f(m.ev || {}));
      else if (m.esc === "theme") { if (m.theme) document.documentElement.dataset.theme = m.theme; else delete document.documentElement.dataset.theme; }
      else if (m.esc === "reload") location.reload();
    });
  }
  ask(method, ...args) {
    const id = ++this.n;
    return new Promise((ok, no) => { this.wait.set(id, { ok, no }); window.parent.postMessage({ esc: "call", id, method, args }, "*"); });
  }
  async init() { const st = await this.ask("status"); this.user = st.user || "suite"; this.linked = !!st.linked; this.statusMessage = st.message || ""; return this.user; }
  async myCampaigns() { if (!this.linked) return []; const c = await this.ask("campaign"); return c ? [Object.assign(c, { role: "dm" })] : []; }
  members() { return this.ask("members"); }
  listCharacters() { return this.ask("listCharacters"); }
  getCharacter(id) { return this.ask("getCharacter", id); }
  saveCharacter(id, version, data) { return this.ask("saveCharacter", id, version, data); }
  deleteCharacter(id) { return this.ask("deleteCharacter", id); }
  sendGrant(_cid, characterId, kind, payload, note) { return this.ask("sendGrant", characterId, kind, payload, note); }
  listGrants() { return this.ask("listGrants"); }
  setGrantStatus(id, status) { return this.ask("setGrantStatus", id, status); }
  listHomebrew() { return this.ask("listHomebrew"); }
  saveHomebrew(_cid, kind, data, id) { return this.ask("saveHomebrew", kind, data, id); }
  deleteHomebrew(id) { return this.ask("deleteHomebrew", id); }
  // Player notes live in the DM Suite's Sessions tab, not in this view.
  async listSessions() { return []; }
  async listNotes() { return []; }
  async listPrivateRecaps() { return []; }
  reassignCharacter(id, userId) { return this.ask("reassignCharacter", id, userId); }
  createDmInvite() { return this.ask("createDmInvite"); }
  // DM Suite extras
  suiteItems() { return this.ask("suiteItems"); }
  openConnect() { return this.ask("openConnect"); }
  copy(text) { return this.ask("copy", text); }
  async createCampaign() { throw new Error("Create the campaign in the Companion, then connect the DM Suite with a DM code."); }
  async joinCampaign() { throw new Error("Use Companion > Connect to Companion in the menu."); }
  subscribe(_cid, cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
}

// Read-modify-write with a version check, retried if someone else saved first.
async function updateCharacter(be, id, mutate) {
  for (let i = 0; i < 5; i++) {
    const row = await be.getCharacter(id); if (!row) throw new Error("Character not found.");
    const data = JSON.parse(JSON.stringify(row.data));
    mutate(data);
    const v = await be.saveCharacter(id, row.version, data);
    if (v != null) return Object.assign(row, { data, version: v });
  }
  throw new Error("Couldn't save: the sheet kept changing. Try again.");
}

g.makeBackend = function () {
  const cfg = g.APP_CONFIG || {};
  if (/(^|[#&])suite\b/.test(location.hash.slice(1)) && window.parent !== window) return new SuiteBackend();
  const forceDemo = /[?&]demo\b/.test(location.search);
  if (!forceDemo && cfg.supabaseUrl && cfg.supabaseAnonKey && g.supabase) return new SupabaseBackend(cfg.supabaseUrl, cfg.supabaseAnonKey);
  return new DemoBackend();
};
g.updateCharacter = updateCharacter;
})(window);
