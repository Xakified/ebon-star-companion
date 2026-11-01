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

function slots(ch) {
  const c = S.CLASSES[ch.cls];
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
  const out = c.f.filter(f => f[0] <= ch.level).map(f => ({ level: f[0], name: f[1], text: f[2], source: ch.cls }));
  for (const L of c.subAt) if (L <= ch.level) out.push({ level: L, name: (ch.subclass || "Subclass") + (L === c.subAt[0] ? "" : " feature"), text: L === c.subAt[0] ? (ch.subclass === c.sub[0] ? c.sub[1] : "Your subclass.") : "See your subclass.", source: "Subclass" });
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
  const spellAbil = c && c.spellAbil;
  const spell = spellAbil ? { abil: spellAbil, dc: 8 + pb + m[spellAbil], atk: pb + m[spellAbil] } : null;
  const res = c ? (c.res || []).map(([name, f, reset]) => ({ name, max: f(lv, { mods: m }), reset })).filter(r => r.max) : [];
  const xpNext = lv < 20 ? XP_TABLE[lv] : null;
  return {
    scores: sc, mods: m, pb, saves, skills, hpMax, ac, acHow: how, init, speed, spell, slots: slots(ch), res,
    passive: 10 + skills.Perception.mod, attacks: attacks(ch, m, pb), classFeatures: classFeatures(ch),
    speciesTraits: sp ? sp.traits.map(t => ({ name: t[0], text: t[1], source: ch.species })) : [],
    hitDie: c ? c.hd : 8, d20Penalty: 2 * (ch.exhaustion || 0), xpNext, canLevelByXp: xpNext != null && ch.xp >= xpNext
  };
}

// What a level-up to (level + 1) asks the player to decide.
function levelUpPlan(ch) {
  const next = ch.level + 1, c = S.CLASSES[ch.cls];
  if (!c || next > 20) return null;
  return {
    level: next, hd: c.hd, avg: c.hd / 2 + 1,
    features: c.f.filter(f => f[0] === next).map(f => ({ name: f[1], text: f[2] })),
    subclass: next === c.subAt[0] ? c.sub : null, subFeature: c.subAt.includes(next) && next !== c.subAt[0],
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

g.Engine = { uid, mod, sign, profBonus, blank, derive, levelUpPlan, applyLevelUp, applyGrant, grantLabel, fromSuiteItem, asiLevels, XP_TABLE };
})(typeof window !== "undefined" ? window : globalThis);
