// Character rules engine: builds new characters, derives every number on the sheet, and applies level-ups and DM grants.
// No DOM here, so it can be tested in Node.
(function (g) {
"use strict";
const S = g.SRD;
const uid = () => (g.crypto && g.crypto.randomUUID ? g.crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36));
// A magic item works when it is equipped or attuned, and attuned if it needs attunement.
const active = i => (i.equipped || i.attuned) && (!i.attune || i.attuned);
const mod = s => Math.floor((s - 10) / 2);
const sign = n => (n >= 0 ? "+" : "") + n;
const profBonus = lv => 2 + Math.floor((lv - 1) / 4);
const XP_TABLE = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

function blank() {
  return {
    schema: 1, name: "", player: "", species: "", lineage: "", background: "", cls: "", subclass: "", level: 1, xp: 0,
    base: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, bgBonus: {}, asi: {}, abilMethod: "standard",
    skills: [], expertise: [], extraSaves: [], tools: [], languages: "Common",
    hpRolls: [], hpBonus: 0, hp: { cur: null, temp: 0 }, hitDiceUsed: 0, deathSaves: { s: 0, f: 0 },
    exhaustion: 0, stress: 0, conditions: [], inspiration: false,
    inventory: [], coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    feats: [], features: [], spells: [], slotsUsed: {}, pactUsed: 0, resUsed: {},
    acBonus: 0, speedBonus: 0, notes: "", appearance: "", log: []
  };
}

function asiLevels(cls) {
  const c = S.CLASSES[cls] || {};
  return [4, 8, 12, 16, 19, ...(c.asiExtra || [])].sort((a, b) => a - b);
}

function scores(ch) {
  const out = {};
  for (const a of S.ABILS) {
    let v = (ch.base[a] || 10) + (ch.bgBonus[a] || 0) + (ch.asi[a] || 0);
    v = Math.min(v, 20);
    // items or DM grants can push past 20 (e.g. Primal Champion, Belt of Giant Strength)
    v += (ch.inventory || []).filter(i => active(i) && i.abil && i.abil[a]).reduce((s, i) => s + (+i.abil[a] || 0), 0);
    if (ch.cls === "Barbarian" && ch.level >= 20 && (a === "str" || a === "con")) v = Math.min(v + 4, 25);
    if (ch.cls === "Monk" && ch.level >= 20 && (a === "dex" || a === "wis")) v = Math.min(v + 4, 25);
    out[a] = v;
  }
  return out;
}

// An Eldritch Knight or Arcane Trickster: a subclass that brings spellcasting to a class without it.
function subCaster(ch) {
  const c = S.CLASSES[ch.cls], sc = S.SUB_CASTERS[ch.subclass];
  return (!c || !c.caster) && sc && sc.cls === ch.cls && ch.level >= 3 ? sc : null;
}

function slots(ch) {
  const c = S.CLASSES[ch.cls];
  if (subCaster(ch)) return { slots: S.FULL_SLOTS[Math.ceil(ch.level / 3) - 1] || [], pact: null };
  if (!c || !c.caster) return { slots: [], pact: null };
  if (c.caster === "pact") return { slots: [], pact: S.PACT(ch.level) };
  const lv = c.caster === "half" ? Math.ceil(ch.level / 2) : ch.level;
  return { slots: S.FULL_SLOTS[lv - 1] || [], pact: null };
}

function maxHp(ch, m) {
  const c = S.CLASSES[ch.cls]; if (!c) return 1;
  let hp = c.hd + m.con;
  for (let i = 0; i < ch.level - 1; i++) hp += Math.max(1, (ch.hpRolls[i] ?? (c.hd / 2 + 1)) + m.con);
  const sp = S.SPECIES[ch.species];
  if (sp && sp.hpPerLevel) hp += sp.hpPerLevel * ch.level;
  hp += (ch.feats || []).some(f => f.name === "Tough") ? 2 * ch.level : 0;
  return Math.max(1, hp + (+ch.hpBonus || 0));
}

function armorClass(ch, m) {
  const c = S.CLASSES[ch.cls] || {};
  const eq = (ch.inventory || []).filter(i => i.equipped);
  const armor = eq.find(i => i.armor && i.armor.cat !== "Shield");
  const shield = eq.find(i => i.armor && i.armor.cat === "Shield");
  let ac, how;
  if (armor) {
    const cap = armor.armor.cap;
    ac = armor.armor.base + (cap === 0 ? 0 : cap == null ? m.dex : Math.min(cap, m.dex));
    how = armor.name;
  } else if (c.unarmored === "con") { ac = 10 + m.dex + m.con; how = "Unarmored Defense"; }
  else if (c.unarmored === "wis" && !shield) { ac = 10 + m.dex + m.wis; how = "Unarmored Defense"; }
  else { ac = 10 + m.dex; how = "Unarmored"; }
  if (shield) ac += shield.armor.base;
  // magic bonuses on any equipped item (+1 armor, Ring of Protection, ...)
  ac += (ch.inventory || []).filter(i => active(i) && (!i.armor || i.equipped)).reduce((s, i) => s + (+i.acBonus || 0), 0);
  ac += +ch.acBonus || 0;
  return { ac, how };
}

function attacks(ch, m, pb) {
  const out = [];
  for (const i of (ch.inventory || []).filter(i => i.equipped && i.weapon)) {
    const props = (i.weapon.props || "").toLowerCase();
    const ranged = props.includes("ammunition");
    let ab = ranged ? "dex" : "str";
    if (props.includes("finesse") || (ch.cls === "Monk" && (i.weapon.cat === "Simple" || props.includes("light")))) ab = m.dex > m.str ? "dex" : "str";
    const bonus = +i.bonus || 0;
    const hit = m[ab] + (i.proficient === false ? 0 : pb) + bonus;
    const dmgMod = m[ab] + bonus;
    out.push({ name: i.name, hit, dmg: `${i.weapon.dmg}${dmgMod ? sign(dmgMod) : ""} ${i.weapon.type}`, props: i.weapon.props, mastery: i.weapon.mastery });
  }
  if (ch.cls === "Monk") {
    const die = ch.level >= 17 ? "1d12" : ch.level >= 11 ? "1d10" : ch.level >= 5 ? "1d8" : "1d6";
    const ab = m.dex > m.str ? m.dex : m.str;
    out.push({ name: "Unarmed Strike", hit: ab + pb, dmg: `${die}${sign(ab)} bludgeoning`, props: "Martial Arts" });
  } else out.push({ name: "Unarmed Strike", hit: m.str + pb, dmg: `${Math.max(0, 1 + m.str)} bludgeoning`, props: "" });
  return out;
}

function classFeatures(ch) {
  const c = S.CLASSES[ch.cls]; if (!c) return [];
  const out = (c.f || []).filter(f => f[0] <= ch.level).map(f => ({ level: f[0], name: f[1], text: f[2], source: ch.cls }));
  const sd = subclassDef(ch.cls, ch.subclass);
  if (sd && sd.f && sd.f.length) out.push(...sd.f.filter(f => f[0] <= ch.level).map(f => ({ level: f[0], name: f[1], text: f[2], source: sd.name })));
  else for (const L of c.subAt || []) if (L <= ch.level) out.push({ level: L, name: (ch.subclass || "Subclass") + (L === c.subAt[0] ? "" : " feature"), text: L === c.subAt[0] ? (sd && sd.text ? sd.text : "Your subclass.") : "See your subclass.", source: "Subclass" });
  if (ch.level >= 19) out.push({ level: 19, name: "Epic Boon", text: "An Epic Boon feat (or another feat).", source: ch.cls });
  return out.sort((a, b) => a.level - b.level);
}

// Everything the sheet shows that is computed rather than typed in.
function derive(ch) {
  const sc = scores(ch), m = {};
  for (const a of S.ABILS) m[a] = mod(sc[a]);
  const lv = Math.max(1, Math.min(20, ch.level || 1)), pb = profBonus(lv);
  const c = S.CLASSES[ch.cls] || null, sp = S.SPECIES[ch.species] || null;
  const saveProf = new Set([...(c ? c.saves : []), ...(ch.extraSaves || [])]);
  if (ch.cls === "Monk" && lv >= 14) S.ABILS.forEach(a => saveProf.add(a));
  if (ch.cls === "Rogue" && lv >= 15) { saveProf.add("wis"); saveProf.add("cha"); }
  const saves = {}; for (const a of S.ABILS) saves[a] = { mod: m[a] + (saveProf.has(a) ? pb : 0), prof: saveProf.has(a) };
  const jack = ch.cls === "Bard" && lv >= 2;
  const skills = {};
  for (const [k, a] of Object.entries(S.SKILLS)) {
    const prof = ch.skills.includes(k), exp = ch.expertise.includes(k);
    skills[k] = { abil: a, prof, exp, mod: m[a] + (exp ? 2 * pb : prof ? pb : jack ? Math.floor(pb / 2) : 0) };
  }
  const hpMax = maxHp(ch, m);
  const { ac, how } = armorClass(ch, m);
  let init = m.dex + ((ch.feats || []).some(f => f.name === "Alert") ? pb : 0);
  let speed = (sp ? sp.speed : 30) + (+ch.speedBonus || 0);
  if (ch.lineage === "Wood Elf") speed = 35 + (+ch.speedBonus || 0);
  if (ch.cls === "Barbarian" && lv >= 5) speed += 10;
  if (ch.cls === "Monk" && lv >= 2) speed += lv >= 18 ? 30 : lv >= 14 ? 25 : lv >= 10 ? 20 : lv >= 6 ? 15 : 10;
  speed = Math.max(0, speed - 5 * (ch.exhaustion || 0)); // 2024 Exhaustion: -5 ft per level
  const sub = subCaster(ch), spellAbil = (c && c.spellAbil) || (sub && sub.abil);
  const spell = spellAbil ? { abil: spellAbil, dc: 8 + pb + m[spellAbil], atk: pb + m[spellAbil] } : null;
  const res = c ? (c.res || []).filter(r => typeof r[1] === "function").map(([name, f, reset]) => ({ name, max: f(lv, { mods: m }), reset })).filter(r => r.max) : [];
  const xpNext = lv < 20 ? XP_TABLE[lv] : null;
  return {
    scores: sc, mods: m, pb, saves, skills, hpMax, ac, acHow: how, init, speed, spell, slots: slots(ch), res,
    passive: 10 + skills.Perception.mod, attacks: attacks(ch, m, pb), classFeatures: classFeatures(ch),
    speciesTraits: sp ? sp.traits.map(t => ({ name: t[0], text: t[1], source: ch.species })) : [],
    hitDie: c ? c.hd : 8, d20Penalty: 2 * (ch.exhaustion || 0), xpNext, canLevelByXp: xpNext != null && ch.xp >= xpNext
  };
}

// How many cantrips and prepared spells the character can have (2024 rules), what they have now,
// the highest spell level they can cast, and which class lists they choose from.
// Spells marked bonus (from a feat, species, subclass or item) or always prepared don't count.
function spellRules(ch) {
  const lv = Math.max(1, Math.min(20, ch.level || 1)), adj = ch.spellAdjust || {};
  const own = (ch.spells || []).filter(s => !s.bonus && !s.alwaysPrepared);
  const have = {
    cantrips: own.filter(s => !s.level).length,
    prepared: own.filter(s => s.level && s.prepared).length,
    spellbook: own.filter(s => s.level).length
  };
  const r = S.SPELLCASTING[ch.cls] || subCaster(ch);
  const { slots: sl, pact } = slots(ch);
  let maxLevel = pact ? pact.lvl : sl.length;
  const arcanum = ch.cls === "Warlock" ? [[11, 6], [13, 7], [15, 8], [17, 9]].filter(([l]) => lv >= l).map(([, s]) => s) : [];
  if (arcanum.length) maxLevel = Math.max(maxLevel, ...arcanum);
  if (!r) return { known: false, cantrips: null, prepared: null, spellbook: null, maxLevel, arcanum, lists: [], have };
  const lists = r.lists.slice();
  if (ch.cls === "Bard" && lv >= 10) lists.push("Cleric", "Druid", "Wizard"); // Magical Secrets
  return {
    known: true, have, maxLevel, arcanum, lists,
    cantrips: Math.max(0, (r.cantrips[lv - 1] || 0) + (+adj.cantrips || 0)),
    prepared: Math.max(0, (r.prepared[lv - 1] || 0) + (+adj.prepared || 0)),
    spellbook: r.spellbook ? 6 + 2 * (lv - 1) + (+adj.spellbook || 0) : null
  };
}

// What a level-up to (level + 1) asks the player to decide.
function levelUpPlan(ch) {
  const next = ch.level + 1, c = S.CLASSES[ch.cls];
  if (!c || next > 20) return null;
  const subAt = c.subAt || [], sd = subclassDef(ch.cls, ch.subclass);
  return {
    level: next, hd: c.hd, avg: c.hd / 2 + 1,
    features: (c.f || []).filter(f => f[0] === next).map(f => ({ name: f[1], text: f[2] })),
    subclass: subAt[0] === next ? subclassOptions(ch.cls) : null, subFeature: subAt.includes(next) && next !== subAt[0],
    subFeatures: sd && sd.f ? sd.f.filter(f => f[0] === next).map(f => ({ name: f[1], text: f[2] })) : [],
    asi: asiLevels(ch.cls).includes(next), epic: next === 19, pbUp: profBonus(next) > profBonus(ch.level)
  };
}

// choice: { hp: number, subclass?: string, asi?: {str:+2}|null, feat?: {name,text}|null }
function applyLevelUp(ch, choice) {
  const plan = levelUpPlan(ch); if (!plan) return ch;
  const before = derive(ch).hpMax;
  ch.hpRolls[ch.level - 1] = Math.max(1, Math.min(plan.hd, +choice.hp || plan.avg));
  ch.level = plan.level;
  if (plan.subclass && choice.subclass) ch.subclass = choice.subclass;
  if (plan.asi && choice.asi) for (const [a, n] of Object.entries(choice.asi)) ch.asi[a] = (ch.asi[a] || 0) + (+n || 0);
  if (plan.asi && choice.feat && choice.feat.name) ch.feats.push({ id: uid(), name: choice.feat.name, text: choice.feat.text || S.FEATS[choice.feat.name] || "", source: "Level " + plan.level });
  const after = derive(ch).hpMax;
  if (ch.hp.cur != null) ch.hp.cur = Math.min(after, ch.hp.cur + (after - before));
  ch.log.unshift({ t: Date.now(), text: `Reached level ${plan.level}` });
  return ch;
}

// Turn a DM grant into changes on the sheet.
function applyGrant(ch, grant) {
  const p = grant.payload || {};
  if (grant.kind === "item") ch.inventory.push(Object.assign({ qty: 1 }, p, { id: uid(), equipped: false, attuned: false, fromDM: true }));
  else if (grant.kind === "feature") ch.features.push({ id: uid(), name: p.name, text: p.text || "", uses: p.uses ? { max: +p.uses, reset: p.reset || "long" } : null, source: "DM" });
  else if (grant.kind === "spell") ch.spells.push({ id: uid(), name: p.name, level: +p.level || 0, school: p.school || "", text: p.text || "", prepared: true, alwaysPrepared: !!p.always, source: "DM" });
  else if (grant.kind === "coins") for (const k of Object.keys(ch.coins)) ch.coins[k] = (ch.coins[k] || 0) + (+p[k] || 0);
  else if (grant.kind === "xp") ch.xp = (ch.xp || 0) + (+p.xp || 0);
  else if (grant.kind === "level") ch.pendingLevels = (ch.pendingLevels || 0) + 1;
  ch.log.unshift({ t: Date.now(), text: "From the DM: " + grantLabel(grant) });
  return ch;
}

function grantLabel(g) {
  const p = g.payload || {};
  if (g.kind === "coins") return Object.entries(p).filter(([, v]) => +v).map(([k, v]) => `${v} ${k}`).join(", ") || "coins";
  if (g.kind === "xp") return `${p.xp} XP`;
  if (g.kind === "level") return "a level-up";
  return p.name || g.kind;
}

// Convert an item from the DM suite's magic item library into an inventory item.
function fromSuiteItem(x) {
  const props = (x.props || []).map(p => `${p.name}. ${p.text}`).join("\n\n");
  const text = [x.desc, props, x.charges ? `Charges: ${x.charges} (regains ${x.recharge || "at dawn"}).` : "", x.quirk ? `Quirk: ${x.quirk}` : "", x.lore || ""].filter(Boolean).join("\n\n");
  const m = (x.props || []).map(p => /^\+(\d)/.exec(p.name)).find(Boolean);
  const it = { name: x.name || "Unnamed item", type: x.type || "Wondrous Item", rarity: x.rarity || "", attune: !!x.attune, attuneBy: x.attuneBy || "", desc: text, charges: x.charges || null, qty: x.qty || 1 };
  if (m && x.type === "Weapon") it.bonus = +m[1];
  if (m && (x.type === "Armor" || x.type === "Shield")) it.acBonus = +m[1];
  return it;
}

// ---------- Content library (the DM's own books) ----------
// The DM adds "content packs" (JSON, format below) to the campaign; they are stored in the campaign's database,
// readable only by its members, and merged into SRD here so the builder, sheet and level-ups can use them.
// Nothing from a book is ever part of this code.
//
// { "format": "esc-content", "version": 1, "name": "Book title", "abbr": "PHB",
//   "species":     { "Name": { "size": "Medium", "speed": 30, "hpPerLevel": 0, "traits": [["Trait", "summary"]], "lineages": ["A", "B"], "lineageLabel": "Lineage" } },
//   "backgrounds": { "Name": { "abil": ["str","dex","con"], "feat": "Feat name", "featNote": "", "skills": ["Athletics","Insight"], "tool": "Tool" } },
//   "feats":       { "Name": { "text": "summary", "origin": true } }            (or "Name": "summary")
//   "classes":     { "Name": { "hd": 8, "primary": "Intelligence", "saves": ["con","int"], "skillN": 2, "skills": [...], "armor": "...", "weapons": "...",
//                    "gold": 150, "caster": "full"|"half"|"pact"|"", "spellAbil": "int", "unarmored": "con"|"wis", "subAt": [3,5,9,15],
//                    "f": [[1, "Feature", "summary"]], "res": [["Resource", [20 values, one per level] | number | "mod:cha", "long"|"short"|"info"]] } },
//   "subclasses":  { "Class": [{ "name": "Subclass", "text": "summary", "f": [[3, "Feature", "summary"]] }] },
//   "spells":      [{ "name": "...", "level": 0, "school": "...", "classes": ["Wizard"], "time": "", "range": "", "components": "", "duration": "", "text": "summary" }],
//   "items":       [{ "name": "...", "type": "Wondrous Item", "rarity": "rare", "attune": true, "attuneBy": "", "bonus": 0, "acBonus": 0, "charges": 0, "text": "summary" }],
//   "features":    [{ "name": "...", "kind": "Blessing", "text": "summary", "uses": 0, "reset": "long" }] }
// Items and features (blessings, charms and the like) are for the DM's Send dialog, not the builder.
// A class, species, background or feat with the same name as an SRD one replaces it while the book is on.
const BASE = {};
const KEEP = ["SPECIES", "BACKGROUNDS", "FEATS", "CLASSES", "LINEAGES", "LINEAGE_LABEL"];
const str = (v, n = 4000) => String(v == null ? "" : v).slice(0, n);
const strs = (a, n) => (Array.isArray(a) ? a : []).map(x => str(x, 200)).filter(Boolean).slice(0, n || 60);
const abils = a => strs(a, 6).map(x => x.toLowerCase().slice(0, 3)).filter(x => S.ABILS.includes(x));
const feats3 = a => (Array.isArray(a) ? a : []).filter(f => Array.isArray(f) && f.length >= 2).slice(0, 200)
  .map(f => [Math.max(1, Math.min(20, +f[0] || 1)), str(f[1], 120), str(f[2])]).filter(f => f[1]);
function resFn(v) {
  if (Array.isArray(v)) { const a = v.slice(0, 20); return lv => a[Math.min(a.length, lv) - 1]; }
  if (typeof v === "number") return () => v;
  const m = /^mod:(str|dex|con|int|wis|cha)$/.exec(String(v));
  if (m) return (lv, c) => Math.max(1, c.mods[m[1]]);
  return null;
}
function addClass(name, x, src) {
  const old = S.CLASSES[name] || {};
  const c = Object.assign({}, old, {
    hd: [6, 8, 10, 12].includes(+x.hd) ? +x.hd : old.hd || 8, primary: str(x.primary || old.primary, 60),
    saves: x.saves ? abils(x.saves) : old.saves || [], skillN: x.skillN != null ? Math.max(0, Math.min(6, +x.skillN || 0)) : old.skillN || 2,
    skills: x.skills ? strs(x.skills).filter(k => k in S.SKILLS) : old.skills || [], armor: str(x.armor != null ? x.armor : old.armor || "None", 200),
    weapons: str(x.weapons != null ? x.weapons : old.weapons || "Simple weapons", 200), gold: x.gold != null ? +x.gold || 0 : old.gold || 0,
    caster: ["full", "half", "pact"].includes(x.caster) ? x.caster : x.caster === "" ? undefined : old.caster,
    spellAbil: x.spellAbil != null ? abils([x.spellAbil])[0] : old.spellAbil, unarmored: x.unarmored != null ? abils([x.unarmored])[0] : old.unarmored,
    subAt: Array.isArray(x.subAt) ? x.subAt.map(n => +n).filter(n => n >= 1 && n <= 20) : old.subAt || [3],
    f: x.f ? feats3(x.f) : old.f || [], src
  });
  if (Array.isArray(x.asiExtra)) c.asiExtra = x.asiExtra.map(n => +n).filter(n => n >= 1 && n <= 20);
  if (Array.isArray(x.res)) c.res = x.res.filter(r => Array.isArray(r) && r[0]).map(r => [str(r[0], 80), resFn(r[1]), str(r[2] || "long", 40)]).filter(r => r[1]);
  if (!c.skills.length) c.skills = S.ALL_SKILLS;
  S.CLASSES[name] = c;
}
// packs: [{ name, abbr, enabled, data }] as stored in the database. Turning books off or on just calls this again.
function useContent(packs) {
  if (!BASE.done) { for (const k of KEEP) BASE[k] = Object.assign({}, S[k]); BASE.ORIGIN_FEATS = S.ORIGIN_FEATS.slice(); BASE.done = true; }
  for (const k of KEEP) { for (const n of Object.keys(S[k])) delete S[k][n]; Object.assign(S[k], BASE[k]); }
  S.ORIGIN_FEATS.splice(0, S.ORIGIN_FEATS.length, ...BASE.ORIGIN_FEATS);
  for (const n of Object.keys(S.SUBCLASSES)) delete S.SUBCLASSES[n];
  for (const n of Object.keys(S.SOURCE)) delete S.SOURCE[n];
  S.SPELLS.length = 0; S.ITEMS.length = 0; S.FEATURES.length = 0;
  const used = [];
  for (const p of packs || []) {
    if (!p || p.enabled === false) continue;
    const d = p.data || {}, src = str(p.abbr || d.abbr || p.name || d.name || "Book", 40);
    try {
      for (const [n, x] of Object.entries(d.species || {})) {
        if (!x || typeof x !== "object") continue;
        const name = str(n, 80);
        S.SPECIES[name] = { speed: +x.speed || 30, size: str(x.size || "Medium", 60), traits: feats3((x.traits || []).map(t => [1, t[0], t[1]])).map(t => [t[1], t[2]]), src };
        if (+x.hpPerLevel) S.SPECIES[name].hpPerLevel = +x.hpPerLevel;
        if (Array.isArray(x.lineages) && x.lineages.length) { S.LINEAGES[name] = strs(x.lineages); if (x.lineageLabel) S.LINEAGE_LABEL[name] = str(x.lineageLabel, 60); }
        else delete S.LINEAGES[name];
        S.SOURCE["species:" + name] = src;
      }
      for (const [n, x] of Object.entries(d.backgrounds || {})) {
        if (!x || typeof x !== "object") continue;
        const name = str(n, 80), a = abils(x.abil);
        S.BACKGROUNDS[name] = { abil: a.length === 3 ? a : ["str", "dex", "con"], feat: str(x.feat, 80), featNote: str(x.featNote, 80) || undefined, skills: strs(x.skills, 4).filter(k => k in S.SKILLS), tool: str(x.tool, 120), src };
        S.SOURCE["background:" + name] = src;
      }
      for (const [n, x] of Object.entries(d.feats || {})) {
        const name = str(n, 80), text = typeof x === "string" ? x : x && x.text;
        S.FEATS[name] = str(text);
        if (x && x.origin && !S.ORIGIN_FEATS.includes(name)) S.ORIGIN_FEATS.push(name);
        S.SOURCE["feat:" + name] = src;
      }
      for (const [n, x] of Object.entries(d.classes || {})) if (x && typeof x === "object") { addClass(str(n, 80), x, src); S.SOURCE["class:" + str(n, 80)] = src; }
      for (const [cls, list] of Object.entries(d.subclasses || {})) for (const x of Array.isArray(list) ? list : []) {
        if (!x || !x.name) continue;
        const l = S.SUBCLASSES[cls] = S.SUBCLASSES[cls] || [], sc = { name: str(x.name, 120), text: str(x.text), f: feats3(x.f), src };
        const i = l.findIndex(o => o.name === sc.name); if (i >= 0) l[i] = sc; else l.push(sc);
      }
      for (const x of Array.isArray(d.spells) ? d.spells : []) {
        if (!x || !x.name) continue;
        const sp = { name: str(x.name, 120), level: Math.max(0, Math.min(9, +x.level || 0)), school: str(x.school, 40), classes: strs(x.classes, 20),
          time: str(x.time, 80), range: str(x.range, 80), components: str(x.components, 200), duration: str(x.duration, 80), text: str(x.text, 8000), src };
        const i = S.SPELLS.findIndex(o => o.name === sp.name); if (i >= 0) S.SPELLS[i] = sp; else S.SPELLS.push(sp);
      }
      for (const x of Array.isArray(d.items) ? d.items : []) {
        if (!x || !x.name) continue;
        const it = { name: str(x.name, 120), type: str(x.type || "Wondrous Item", 40), rarity: str(x.rarity, 30).toLowerCase(), attune: !!x.attune, attuneBy: str(x.attuneBy, 120),
          bonus: +x.bonus || 0, acBonus: +x.acBonus || 0, charges: +x.charges || 0, text: str(x.text, 8000), src };
        const i = S.ITEMS.findIndex(o => o.name === it.name); if (i >= 0) S.ITEMS[i] = it; else S.ITEMS.push(it);
      }
      for (const x of Array.isArray(d.features) ? d.features : []) {
        if (!x || !x.name) continue;
        const f = { name: str(x.name, 120), kind: str(x.kind, 40), text: str(x.text, 8000), uses: Math.max(0, +x.uses || 0), reset: ["short", "long", "dawn"].includes(x.reset) ? x.reset : "long", src };
        const i = S.FEATURES.findIndex(o => o.name === f.name); if (i >= 0) S.FEATURES[i] = f; else S.FEATURES.push(f);
      }
      used.push(src);
    } catch (e) { if (g.console) console.warn("Couldn't use " + src, e); }
  }
  S.SPELLS.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  S.ITEMS.sort((a, b) => a.name.localeCompare(b.name)); S.FEATURES.sort((a, b) => a.name.localeCompare(b.name));
  return used;
}
// Every subclass a class can take: the SRD one plus any from the DM's books. [{ name, text, f?, src }]
function subclassOptions(cls) {
  const c = S.CLASSES[cls] || {}, out = [];
  if (c.sub) out.push({ name: c.sub[0], text: c.sub[1], src: "SRD" });
  for (const x of S.SUBCLASSES[cls] || []) { const i = out.findIndex(o => o.name === x.name); if (i >= 0) out[i] = x; else out.push(x); }
  return out;
}
function subclassDef(cls, name) { return name ? subclassOptions(cls).find(o => o.name === name) || null : null; }
// Check a content pack before it's saved. Returns a one-line summary, or throws.
function checkContent(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) throw new Error("That file isn't a content pack.");
  if (d.format !== "esc-content") throw new Error("That file isn't a content pack (it needs \"format\": \"esc-content\").");
  if (!d.name) throw new Error("The content pack needs a name.");
  const n = { species: Object.keys(d.species || {}).length, backgrounds: Object.keys(d.backgrounds || {}).length, feats: Object.keys(d.feats || {}).length,
    classes: Object.keys(d.classes || {}).length, subclasses: Object.values(d.subclasses || {}).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0), spells: Array.isArray(d.spells) ? d.spells.length : 0,
    items: Array.isArray(d.items) ? d.items.length : 0, features: Array.isArray(d.features) ? d.features.length : 0, monsters: Array.isArray(d.monsters) ? d.monsters.length : 0 };
  const one = { species: "species", backgrounds: "background", feats: "feat", classes: "class", subclasses: "subclass", spells: "spell", items: "magic item", features: "gift", monsters: "monster" };
  const parts = Object.entries(n).filter(([, v]) => v).map(([k, v]) => `${v} ${v === 1 ? one[k] : k === "items" ? "magic items" : k === "features" ? "gifts" : k}`);
  if (!parts.length) throw new Error("That content pack is empty.");
  return parts.join(" · ");
}

g.Engine = { uid, mod, sign, profBonus, blank, derive, spellRules, levelUpPlan, applyLevelUp, applyGrant, grantLabel, fromSuiteItem, asiLevels, XP_TABLE,
  useContent, subclassOptions, subclassDef, checkContent };
})(typeof window !== "undefined" ? window : globalThis);
