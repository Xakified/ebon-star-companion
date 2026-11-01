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
function summarize(row, members) {
  const d = row.data || {}, x = E.derive(d);
  const m = members.find(m => m.user_id === row.owner);
  return {
    id: row.id, version: row.version, name: d.name || "Unnamed", player: m ? m.display_name : "",
    summary: `${d.species || ""} ${d.cls || ""} ${d.level || 1}`.trim(),
    ac: x.ac, maxHp: x.hpMax, hp: d.hp && d.hp.cur != null ? d.hp.cur : x.hpMax, temp: (d.hp && d.hp.temp) || 0,
    mod: x.init, passive: x.passive, speed: x.speed,
    conditions: (d.conditions || []).filter(c => SRD_CONDS.includes(c)), exhaustion: d.exhaustion || 0, stress: d.stress || 0
  };
}

class Companion {
  // storage: {getItem,setItem,removeItem} for the sign-in session; onParty(list); onStatus({state, message})
  constructor({ storage, onParty, onStatus, createClientFn }) {
    this.storage = storage; this.onParty = onParty || (() => {}); this.onStatus = onStatus || (() => {});
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
    if (data && data.session) return data.session.user.id;
    const r = await this.sb.auth.signInAnonymously();
    if (r.error) throw new Error("Couldn't sign in to the Companion: " + r.error.message);
    return r.data.user.id;
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
  async start(link) {
    this.stop();
    this.link = link;
    this.status("connecting");
    try {
      this.client(link.url, link.key);
      await this.signIn();
      await this.refresh();
      this.chan = this.sb.channel("suite-" + link.campaignId)
        .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: "campaign_id=eq." + link.campaignId }, () => this.soon())
        .subscribe(s => { if (s === "SUBSCRIBED") { if (!this.notMember) this.status("live"); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") this.status("error", "Live updates paused; retrying."); });
      // safety net in case a live update is missed
      this.poll = setInterval(() => this.refresh().catch(() => {}), 60000);
    } catch (e) { this.status("error", e.message); throw e; }
  }
  stop() {
    clearTimeout(this.timer); clearInterval(this.poll);
    if (this.chan && this.sb) this.sb.removeChannel(this.chan);
    this.chan = null; this.link = null; this.party = []; this.status("off");
  }
  soon() { clearTimeout(this.timer); this.timer = setTimeout(() => this.refresh().catch(e => this.status("error", e.message)), 120); }
  async refresh() {
    if (!this.link) return [];
    const cid = this.link.campaignId;
    const [c, m] = await Promise.all([
      this.sb.from("characters").select("*").eq("campaign_id", cid).order("updated_at"),
      this.sb.from("members").select("*").eq("campaign_id", cid)
    ]);
    if (c.error) throw new Error(c.error.message);
    const members = m.data || [];
    // The rules hide a campaign's members from anyone not in it: this computer hasn't been added as a DM device yet.
    this.notMember = !members.length;
    if (this.notMember) { this.party = []; this.onParty(this.party); this.status("unlinked", "This computer isn't connected to the Companion yet. In the Companion, press Connect DM Suite, then here choose Companion > Connect with a New Code."); return this.party; }
    this.party = (c.data || []).map(r => summarize(r, members));
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

module.exports = { Companion, parseCode, summarize };
