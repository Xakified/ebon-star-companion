// Link to the Ebon Star Companion (the players' phone app). Runs in the main process.
// Joins the Companion campaign as a DM device, keeps a live party list from the players' characters,
// and writes HP / conditions / Exhaustion / Stress changes from the initiative tracker back to their sheets.
const { createClient } = require("@supabase/supabase-js");
require("./companion/srd.js");
require("./companion/engine.js");
const E = globalThis.Engine;
const SRD_CONDS = globalThis.SRD.CONDITIONS;

function parseCode(code) {
  const m = /^ESC1\.([A-Za-z0-9+/=_-]+)$/.exec(String(code || "").replace(/\s+/g, ""));
  if (!m) throw new Error("That doesn't look like a DM Suite code. In the Companion, open your campaign and press Connect DM Suite.");
  let j;
  try { j = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")); } catch (e) { throw new Error("That code is incomplete. Copy the whole thing and try again."); }
  if (!j.u || !j.k || !j.c) throw new Error("That code is incomplete. Copy the whole thing and try again.");
  return j;
}

// What the DM Suite needs from a character sheet.
function summarize(row, members, parties = []) {
  const d = row.data || {}, x = E.derive(d);
  const m = members.find(m => m.user_id === row.owner);
  const pt = parties.find(p => (p.character_ids || []).includes(row.id));
  return {
    id: row.id, version: row.version, name: d.name || "Unnamed", player: m ? m.display_name : "",
    partyId: pt ? pt.id : "", partyName: pt ? pt.name || "Party" : "",
    summary: `${d.species || ""} ${E.classLabel ? E.classLabel(d) : `${d.cls || ""} ${d.level || 1}`}`.trim(),
    ac: x.ac, maxHp: x.hpMax, hp: d.hp && d.hp.cur != null ? d.hp.cur : x.hpMax, temp: (d.hp && d.hp.temp) || 0,
    mod: x.init, passive: x.passive, speed: x.speed,
    conditions: (d.conditions || []).filter(c => SRD_CONDS.includes(c)), exhaustion: d.exhaustion || 0, stress: d.stress || 0
  };
}

class Companion {
  // storage: {getItem,setItem,removeItem} for the sign-in session; onParty(list); onStatus({state, message})
  constructor({ storage, onParty, onStatus, onChange, createClientFn }) {
    this.storage = storage; this.onParty = onParty || (() => {}); this.onStatus = onStatus || (() => {}); this.onChange = onChange || (() => {});
    this.make = createClientFn || createClient;
    this.sb = null; this.link = null; this.party = []; this.chan = null; this.timer = null; this.state = "off";
  }
  client(url, key) {
    if (this.sb && this.sbUrl === url) return this.sb;
    this.sb = this.make(url, key, { auth: { storage: this.storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }, realtime: { params: { eventsPerSecond: 20 } } });
    this.sbUrl = url; return this.sb;
  }
  async signIn() {
    const { data } = await this.sb.auth.getSession();
    if (data && data.session) return (this.userId = data.session.user.id);
    const r = await this.sb.auth.signInAnonymously();
    if (r.error) throw new Error("Couldn't sign in to the Companion: " + r.error.message);
    return (this.userId = r.data.user.id);
  }
  status(state, message = "") { this.state = state; this.onStatus({ state, message, name: this.link && this.link.name, count: this.party.length }); }

  // Redeem a code from the Companion. Returns the link to store in the campaign file.
  async connect(code) {
    const j = parseCode(code);
    this.client(j.u, j.k);
    await this.signIn();
    const r = await this.sb.rpc("redeem_dm_invite", { p_code: j.c, p_display: "DM Suite" });
    if (r.error) throw new Error(r.error.message);
    const link = { url: j.u, key: j.k, campaignId: r.data.id, name: r.data.name };
    await this.start(link);
    return link;
  }
  // A one-time DM code for another device: the laptop's DM Suite, or the Companion in a browser.
  async makeInvite() {
    if (!this.link || this.state === "unlinked") throw new Error("This computer isn't connected to the Companion, so it can't make a code.");
    const r = await this.sb.rpc("create_dm_invite", { p_campaign: this.link.campaignId });
    if (r.error) throw new Error(r.error.message);
    return "ESC1." + Buffer.from(JSON.stringify({ u: this.link.url, k: this.link.key, c: r.data })).toString("base64");
  }
  async start(link) {
    this.stop();
    this.link = link;
    this.status("connecting");
    try {
      this.client(link.url, link.key);
      await this.signIn();
      await this.loadContent().catch(() => {});
      await this.refresh();
      this.chan = this.sb.channel("suite-" + link.campaignId)
        .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: "campaign_id=eq." + link.campaignId }, p => { this.soon(); this.onChange({ table: "characters", id: (p.new && p.new.id) || (p.old && p.old.id) }); })
        .on("postgres_changes", { event: "*", schema: "public", table: "grants", filter: "campaign_id=eq." + link.campaignId }, p => this.onChange({ table: "grants", id: (p.new && p.new.id) || (p.old && p.old.id) }))
        .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: "campaign_id=eq." + link.campaignId }, () => this.onChange({ table: "members" }))
        .subscribe(s => { if (s === "SUBSCRIBED") { if (!this.notMember) this.status("live"); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") this.status("error", "Live updates paused; retrying."); });
      // Player session notes on their own channel: a Supabase project without fix-04 yet keeps the rest working.
      this.notesChan = this.sb.channel("suite-notes-" + link.campaignId)
        .on("postgres_changes", { event: "*", schema: "public", table: "session_notes", filter: "campaign_id=eq." + link.campaignId }, p => this.onChange({ table: "session_notes", id: (p.new && p.new.id) || (p.old && p.old.id) }))
        .subscribe();
      // Named parties (fix-08-parties.sql in the Companion repo) on their own channel too.
      this.partyChan = this.sb.channel("suite-parties-" + link.campaignId)
        .on("postgres_changes", { event: "*", schema: "public", table: "parties", filter: "campaign_id=eq." + link.campaignId }, () => { this.soon(); this.onChange({ table: "parties" }); })
        .subscribe();
      this.contentChan = this.sb.channel("suite-content-" + link.campaignId)
        .on("postgres_changes", { event: "*", schema: "public", table: "content_packs", filter: "campaign_id=eq." + link.campaignId }, () => { this.loadContent().then(() => this.soon()).catch(() => {}); this.onChange({ table: "content_packs" }); })
        .subscribe();
      // safety net in case a live update is missed
      this.poll = setInterval(() => this.refresh().catch(() => {}), 60000);
    } catch (e) { this.status("error", e.message); throw e; }
  }
  stop() {
    clearTimeout(this.timer); clearInterval(this.poll);
    if (this.chan && this.sb) this.sb.removeChannel(this.chan);
    if (this.notesChan && this.sb) this.sb.removeChannel(this.notesChan);
    if (this.contentChan && this.sb) this.sb.removeChannel(this.contentChan);
    if (this.partyChan && this.sb) this.sb.removeChannel(this.partyChan);
    this.chan = null; this.notesChan = null; this.contentChan = null; this.partyChan = null; this.link = null; this.party = []; this.status("off");
  }
  // Book classes and species change hit points and AC, so the party list needs the same books the players use.
  async loadContent() {
    if (!this.link) return;
    const r = await this.sb.from("content_packs").select("name, abbr, enabled, data").eq("campaign_id", this.link.campaignId);
    E.useContent(r.error ? [] : r.data || []);
  }
  soon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.refresh().catch(e => this.status("error", e.message)), 120); }
  async refresh() {
    if (!this.link) return [];
    const cid = this.link.campaignId;
    const [c, m, pt] = await Promise.all([
      this.sb.from("characters").select("*").eq("campaign_id", cid).order("updated_at"),
      this.sb.from("members").select("*").eq("campaign_id", cid),
      this.sb.from("parties").select("*").eq("campaign_id", cid).order("created_at") // no table yet (fix-08 not run): no named parties
    ]);
    if (c.error) throw new Error(c.error.message);
    const members = m.data || [];
    // The rules hide a campaign's members from anyone not in it: this computer hasn't been added as a DM device yet.
    this.notMember = !members.length;
    if (this.notMember) { this.party = []; this.onParty(this.party); this.status("unlinked", "This computer isn't connected to the Companion yet. In the Companion, press Connect DM Suite, then here choose Companion > Connect with a New Code."); return this.party; }
    const parties = pt.error ? [] : pt.data || [];
    // Characters in party order (parties as the DM made them, then everyone not in one), so the tracker lists them that way.
    const rank = r => { const i = parties.findIndex(p => (p.character_ids || []).includes(r.id)); return i < 0 ? parties.length : i; };
    this.party = (c.data || []).map((r, i) => [rank(r), i, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, , r]) => summarize(r, members, parties));
    this.onParty(this.party);
    if (this.state !== "live") this.status(this.chan ? "live" : this.state);
    return this.party;
  }
  // patch: any of {hp, temp, conditions, exhaustion, stress}
  async patch(id, patch) {
    if (!this.link) throw new Error("Not connected to the Companion.");
    for (let i = 0; i < 5; i++) {
      const r = await this.sb.from("characters").select("*").eq("id", id).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!r.data) throw new Error("That character was deleted in the Companion.");
      const d = JSON.parse(JSON.stringify(r.data.data));
      d.hp = d.hp || { cur: null, temp: 0 };
      const max = E.derive(d).hpMax;
      if ("hp" in patch && patch.hp != null) { const was = d.hp.cur ?? max; d.hp.cur = Math.max(0, Math.min(max, Math.round(patch.hp))); if (was <= 0 && d.hp.cur > 0) d.deathSaves = { s: 0, f: 0 }; }
      if ("temp" in patch) d.hp.temp = Math.max(0, Math.round(patch.temp || 0));
      if ("conditions" in patch) d.conditions = patch.conditions.filter(c => SRD_CONDS.includes(c));
      if ("exhaustion" in patch) d.exhaustion = Math.max(0, Math.min(6, patch.exhaustion | 0));
      if ("stress" in patch) d.stress = Math.max(0, Math.min(4, patch.stress | 0));
      const v = await this.sb.rpc("save_character", { p_id: id, p_version: r.data.version, p_data: d });
      if (v.error) throw new Error(v.error.message);
      if (v.data != null) return true;
    }
    throw new Error("Couldn't save: the sheet kept changing.");
  }
}

// Everything the Players tab (the Companion's DM view running inside the DM Suite) asks for.
const ok = r => { if (r.error) throw new Error(r.error.message); return r.data; };
const CALLS = {
  async campaign() { const r = ok(await this.sb.from("campaigns").select("*").eq("id", this.cid()).maybeSingle()); return r; },
  async members() { return ok(await this.sb.from("members").select("*").eq("campaign_id", this.cid())); },
  async listCharacters() { return ok(await this.sb.from("characters").select("*").eq("campaign_id", this.cid()).order("updated_at")); },
  async getCharacter(id) { return ok(await this.sb.from("characters").select("*").eq("id", id).maybeSingle()); },
  async saveCharacter(id, version, data) { return ok(await this.sb.rpc("save_character", { p_id: id, p_version: version, p_data: data })); },
  async deleteCharacter(id) { ok(await this.sb.from("characters").delete().eq("id", id)); return true; },
  async sendGrant(characterId, kind, payload, note) { return ok(await this.sb.from("grants").insert({ campaign_id: this.cid(), character_id: characterId, kind, payload, note: note || "" }).select().single()); },
  async listGrants() { return ok(await this.sb.from("grants").select("*").eq("campaign_id", this.cid()).order("created_at", { ascending: false })); },
  async setGrantStatus(id, status) { ok(await this.sb.from("grants").update({ status }).eq("id", id)); return true; },
  async listHomebrew() { return ok(await this.sb.from("homebrew").select("*").eq("campaign_id", this.cid())); },
  async saveHomebrew(kind, data, id) {
    if (id) return ok(await this.sb.from("homebrew").update({ kind, data, updated_at: new Date().toISOString() }).eq("id", id).select().single());
    return ok(await this.sb.from("homebrew").insert({ campaign_id: this.cid(), kind, data }).select().single());
  },
  async deleteHomebrew(id) { ok(await this.sb.from("homebrew").delete().eq("id", id)); return true; },
  // Content library: books the DM adds for the players' character builder (fix-07-content-library.sql in the Companion repo).
  async listContent() { return ok(await this.sb.from("content_packs").select("*").eq("campaign_id", this.cid()).order("updated_at")); },
  async saveContent(row, id) {
    const r = Object.assign({}, row, { updated_at: new Date().toISOString() });
    const out = id ? ok(await this.sb.from("content_packs").update(r).eq("id", id).select().single())
      : ok(await this.sb.from("content_packs").insert(Object.assign({ campaign_id: this.cid() }, r)).select().single());
    await this.loadContent(); return out;
  },
  async deleteContent(id) { ok(await this.sb.from("content_packs").delete().eq("id", id)); await this.loadContent(); return true; },
  // Named parties (fix-08-parties.sql in the Companion repo).
  async listParties() { return ok(await this.sb.from("parties").select("*").eq("campaign_id", this.cid()).order("created_at")); },
  async saveParty(row, id) {
    const r = Object.assign({}, row, { updated_at: new Date().toISOString() });
    if (id) return ok(await this.sb.from("parties").update(r).eq("id", id).select().single());
    return ok(await this.sb.from("parties").insert(Object.assign({ campaign_id: this.cid() }, r)).select().single());
  },
  async deleteParty(id) { ok(await this.sb.from("parties").delete().eq("id", id)); return true; },
  async reassignCharacter(id, userId) { ok(await this.sb.rpc("reassign_character", { p_id: id, p_user: userId })); return true; },
  async createDmInvite() { return this.makeInvite(); },
  // Player session notes (supabase/fix-04-session-notes.sql in the Companion repo).
  // The sessions players may write on: [{ id, title, played_on, live, ord, ended_at, recap, contradictions }]. Anything not in the list is removed.
  // Returns "no-recap" when the Supabase project doesn't have fix-05 yet (sessions still publish, without recaps).
  async publishSessions(list) {
    const cid = this.cid(), rows = (Array.isArray(list) ? list : []).map(x => ({
      campaign_id: cid, id: String(x.id), title: String(x.title || "").slice(0, 200), played_on: String(x.played_on || ""),
      live: !!x.live, ord: x.ord | 0, ended_at: x.ended_at || null, recap: String(x.recap || "").slice(0, 20000), contradictions: String(x.contradictions || "").slice(0, 10000), updated_at: new Date().toISOString() }));
    let out = true;
    if (rows.length) {
      let r = await this.sb.from("game_sessions").upsert(rows, { onConflict: "campaign_id,id" });
      if (r.error && /recap|contradictions/i.test(r.error.message)) { out = "no-recap"; r = await this.sb.from("game_sessions").upsert(rows.map(({ recap, contradictions, ...x }) => x), { onConflict: "campaign_id,id" }); }
      ok(r);
    }
    const have = ok(await this.sb.from("game_sessions").select("id").eq("campaign_id", cid)) || [];
    const keep = new Set(rows.map(r => r.id)), gone = have.map(r => r.id).filter(id => !keep.has(id));
    if (gone.length) ok(await this.sb.from("game_sessions").delete().eq("campaign_id", cid).in("id", gone));
    // Private recaps (fix-06): one row per player per session, readable only by that player and the DM.
    const priv = [];
    for (const x of Array.isArray(list) ? list : []) for (const p of x.privateRecaps || []) if (p.user_id && p.recap) priv.push({ campaign_id: cid, session_id: String(x.id), user_id: p.user_id, recap: String(p.recap).slice(0, 20000), updated_at: new Date().toISOString() });
    const old = await this.sb.from("session_private_recaps").select("session_id, user_id").eq("campaign_id", cid);
    if (old.error) return priv.length ? "no-private" : out;
    if (priv.length) ok(await this.sb.from("session_private_recaps").upsert(priv, { onConflict: "campaign_id,session_id,user_id" }));
    const want = new Set(priv.map(p => p.session_id + "/" + p.user_id));
    for (const r of old.data || []) if (!want.has(r.session_id + "/" + r.user_id)) ok(await this.sb.from("session_private_recaps").delete().eq("campaign_id", cid).eq("session_id", r.session_id).eq("user_id", r.user_id));
    return out;
  },
  // Every note in the campaign, including ones players deleted (so this computer can drop its copy).
  async listNotes() { return ok(await this.sb.from("session_notes").select("*").eq("campaign_id", this.cid()).order("created_at")); },
};
Companion.prototype.cid = function () { if (!this.link || !this.sb) throw new Error("This campaign isn't connected to the Companion."); return this.link.campaignId; };
Companion.prototype.call = async function (method, args) {
  const f = Object.prototype.hasOwnProperty.call(CALLS, method) && CALLS[method];
  if (!f) throw new Error("Unknown request: " + method);
  const out = await f.apply(this, Array.isArray(args) ? args : []);
  if (/^(save|delete|send|set|reassign)/.test(method)) this.soon(); // keep the tracker's party list current too
  return out;
};

module.exports = { Companion, parseCode, summarize };
