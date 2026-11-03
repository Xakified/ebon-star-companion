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
    acBonus: 0, speedBonus: 0, notes: "", appearance: "", log: [], choices: {}, multi: []
  };
}

// ---------- Classes (multiclassing) ----------
// ch.cls / ch.subclass are the class you started with; ch.level is your total character level.
// Other classes live in ch.multi = [{ cls, level, subclass, profs }]. The starting class has the levels left over.
function classList(ch) {
  const m = (ch.multi || []).filter(x => x && x.cls && x.cls !== ch.cls && +x.level > 0);
  const extra = m.reduce((s, x) => s + +x.level, 0);
  return [{ cls: ch.cls, level: Math.max(1, (ch.level || 1) - extra), subclass: ch.subclass || "", primary: true },
    ...m.map(x => ({ cls: x.cls, level: +x.level, subclass: x.subclass || "", primary: false, profs: x.profs || "" }))];
}
const clsLevel = (ch, cls) => { const e = classList(ch).find(x => x.cls === cls); return e ? e.level : 0; };
const classLabel = ch => classList(ch).filter(e => e.cls).map(e => `${e.cls} ${e.level}`).join(" / ");
// Ability scores needed to multiclass into or out of a class (2024: 13 in its primary ability).
function mcNeeds(cls) {
  const c = S.CLASSES[cls]; if (!c || !c.primary) return { any: [], all: [] };
  const names = Object.entries(S.ABIL_NAME).filter(([, n]) => new RegExp(n, "i").test(c.primary)).map(([a]) => a);
  return /\bor\b/i.test(c.primary) ? { any: names, all: [] } : { any: [], all: names };
}
function mcProblems(ch, cls) {
  const sc = scores(ch), out = [];
  for (const k of [...new Set([...classList(ch).map(e => e.cls), cls])]) {
    const n = mcNeeds(k), nm = a => `${S.ABIL_NAME[a]} 13`;
    for (const a of n.all) if (sc[a] < 13) out.push(`${nm(a)} (${k})`);
    if (n.any.length && !n.any.some(a => sc[a] >= 13)) out.push(`${n.any.map(nm).join(" or ")} (${k})`);
  }
  return out;
}

function asiLevels(cls) {
  const c = S.CLASSES[cls] || {};
  return [4, 8, 12, 16, 19, ...(c.asiExtra || [])].sort((a, b) => a - b);
}

function scores(ch) {
  const barb = clsLevel(ch, "Barbarian"), monk = clsLevel(ch, "Monk");
  const out = {};
  for (const a of S.ABILS) {
    let v = (ch.base[a] || 10) + ((ch.bgBonus || {})[a] || 0) + ((ch.speciesBonus || {})[a] || 0) + ((ch.asi || {})[a] || 0);
    v = Math.min(v, 20);
    // items or DM grants can push past 20 (e.g. Primal Champion, Belt of Giant Strength)
    v += (ch.inventory || []).filter(i => active(i) && i.abil && i.abil[a]).reduce((s, i) => s + (+i.abil[a] || 0), 0);
    if (barb >= 20 && (a === "str" || a === "con")) v = Math.min(v + 4, 25);
    if (monk >= 20 && (a === "dex" || a === "wis")) v = Math.min(v + 4, 25);
    out[a] = v;
  }
  return out;
}

// An Eldritch Knight or Arcane Trickster: a subclass that brings spellcasting to a class without it.
function subCasterOf(e) {
  const c = S.CLASSES[e.cls], sc = S.SUB_CASTERS[e.subclass];
  return (!c || !c.caster) && sc && sc.cls === e.cls && e.level >= 3 ? sc : null;
}
const casterKind = e => subCasterOf(e) ? "third" : (S.CLASSES[e.cls] || {}).caster || null;

// Spell slots. One spellcasting class uses its own table; several add up their levels (2024 multiclass rule:
// full casters count fully, Paladin and Ranger half rounded up, Eldritch Knight and Arcane Trickster a third rounded down).
// Warlock Pact Magic slots are separate.
function slots(ch) {
  const list = classList(ch).map(e => ({ e, k: casterKind(e) })).filter(x => x.k);
  const pe = list.find(x => x.k === "pact"), pact = pe ? S.PACT(pe.e.level) : null;
  const sl = list.filter(x => x.k !== "pact");
  if (!sl.length) return { slots: [], pact };
  const lv = sl.length === 1 ? (k => k === "full" ? sl[0].e.level : Math.ceil(sl[0].e.level / (k === "half" ? 2 : 3)))(sl[0].k)
    : sl.reduce((s, { e, k }) => s + (k === "full" ? e.level : k === "half" ? Math.ceil(e.level / 2) : Math.floor(e.level / 3)), 0);
  return { slots: lv > 0 ? S.FULL_SLOTS[Math.min(20, lv) - 1] || [] : [], pact };
}

function maxHp(ch, m) {
  const c = S.CLASSES[ch.cls]; if (!c) return 1;
  // Each level after the first stores its roll (or average) when you level up, so multiclass hit dice are already in hpRolls.
  let hp = c.hd + m.con;
  for (let i = 0; i < ch.level - 1; i++) hp += Math.max(1, (ch.hpRolls[i] ?? (c.hd / 2 + 1)) + m.con);
  const sp = S.SPECIES[ch.species];
  if (sp && sp.hpPerLevel) hp += sp.hpPerLevel * ch.level;
  hp += (ch.feats || []).some(f => f.name === "Tough") ? 2 * ch.level : 0;
  return Math.max(1, hp + (+ch.hpBonus || 0));
}

function armorClass(ch, m) {
  // Unarmored Defense comes from the first class you took that has it.
  const c = classList(ch).map(e => S.CLASSES[e.cls] || {}).find(c => c.unarmored) || {};
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
  if (armor && hasFeat(ch, "Defense (Fighting Style)")) ac += 1;
  // magic bonuses on any equipped item (+1 armor, Ring of Protection, ...)
  ac += (ch.inventory || []).filter(i => active(i) && (!i.armor || i.equipped)).reduce((s, i) => s + (+i.acBonus || 0), 0);
  ac += +ch.acBonus || 0;
  return { ac, how };
}

const hasFeat = (ch, name) => (ch.feats || []).some(f => f.name === name || f.name === name.replace(/ \(Fighting Style\)$/, ""));
// The weapon kinds whose mastery property you can use, or null if the character has never chosen (older sheets show every mastery).
function masteries(ch) {
  const ks = Object.keys(ch.choices || {}).filter(k => /: Weapon Mastery$/.test(k));
  return ks.length ? new Set(ks.flatMap(k => ch.choices[k] || [])) : null;
}
function attacks(ch, m, pb) {
  const out = [], monk = clsLevel(ch, "Monk"), ms = masteries(ch), archery = hasFeat(ch, "Archery (Fighting Style)");
  for (const i of (ch.inventory || []).filter(i => i.equipped && i.weapon)) {
    const props = (i.weapon.props || "").toLowerCase();
    const ranged = props.includes("ammunition");
    let ab = ranged ? "dex" : "str";
    if (props.includes("finesse") || (monk && (i.weapon.cat === "Simple" || props.includes("light")))) ab = m.dex > m.str ? "dex" : "str";
    const bonus = +i.bonus || 0;
    const hit = m[ab] + (i.proficient === false ? 0 : pb) + bonus + (ranged && archery ? 2 : 0);
    const dmgMod = m[ab] + bonus;
    const mastered = !ms || [...ms].some(n => i.name.toLowerCase().includes(String(n).toLowerCase()));
    out.push({ name: i.name, hit, dmg: `${i.weapon.dmg}${dmgMod ? sign(dmgMod) : ""} ${i.weapon.type}`, props: i.weapon.props, mastery: mastered ? i.weapon.mastery : "" });
  }
  if (monk) {
    const die = monk >= 17 ? "1d12" : monk >= 11 ? "1d10" : monk >= 5 ? "1d8" : "1d6";
    const ab = m.dex > m.str ? m.dex : m.str;
    out.push({ name: "Unarmed Strike", hit: ab + pb, dmg: `${die}${sign(ab)} bludgeoning`, props: "Martial Arts" });
  } else out.push({ name: "Unarmed Strike", hit: m.str + pb, dmg: `${Math.max(0, 1 + m.str)} bludgeoning`, props: "" });
  return out;
}

function classFeatures(ch) {
  const all = [], multi = classList(ch).length > 1;
  for (const e of classList(ch)) {
    const c = S.CLASSES[e.cls]; if (!c) continue;
    const ch0 = ch.choices || {};
    const chosen = name => { const v = ch0[e.cls + ": " + name]; return v == null || v === "" || (Array.isArray(v) && !v.length) ? "" : " Chosen: " + (Array.isArray(v) ? v.join(", ") : v) + "."; };
    const out = (c.f || []).filter(f => f[0] <= e.level).map(f => ({ level: f[0], name: f[1], text: (f[2] || "") + chosen(f[1]), source: e.cls }));
    const sd = subclassDef(e.cls, e.subclass);
    if (sd && sd.f && sd.f.length) out.push(...sd.f.filter(f => f[0] <= e.level).map(f => ({ level: f[0], name: f[1], text: f[2], source: sd.name })));
    else for (const L of c.subAt || []) if (L <= e.level) out.push({ level: L, name: (e.subclass || "Subclass") + (L === c.subAt[0] ? "" : " feature"), text: L === c.subAt[0] ? (sd && sd.text ? sd.text : "Your subclass.") : "See your subclass.", source: "Subclass" });
    if (e.level >= 19) out.push({ level: 19, name: "Epic Boon", text: "An Epic Boon feat (or another feat).", source: e.cls });
    if (!e.primary) out.push({ level: 1, name: "Multiclassed into " + e.cls, text: e.profs ? "Proficiencies gained: " + e.profs + "." : "", source: e.cls });
    out.sort((a, b) => a.level - b.level);
    if (multi) out.forEach(f => { f.cls = e.cls; f.clsLevel = e.level; });
    all.push(...out);
  }
  return all;
}

// Everything the sheet shows that is computed rather than typed in.
function derive(ch) {
  const sc = scores(ch), m = {};
  for (const a of S.ABILS) m[a] = mod(sc[a]);
  const lv = Math.max(1, Math.min(20, ch.level || 1)), pb = profBonus(lv);
  const c = S.CLASSES[ch.cls] || null, sp = S.SPECIES[ch.species] || null;
  const L = k => clsLevel(ch, k), cl = classList(ch);
  // Saving throws come only from the class you started with.
  const saveProf = new Set([...(c ? c.saves : []), ...(ch.extraSaves || [])]);
  if (L("Monk") >= 14) S.ABILS.forEach(a => saveProf.add(a));
  if (L("Rogue") >= 15) { saveProf.add("wis"); saveProf.add("cha"); }
  const saves = {}; for (const a of S.ABILS) saves[a] = { mod: m[a] + (saveProf.has(a) ? pb : 0), prof: saveProf.has(a) };
  const jack = L("Bard") >= 2;
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
  if (L("Barbarian") >= 5) speed += 10;
  const ml = L("Monk"); if (ml >= 2) speed += ml >= 18 ? 30 : ml >= 14 ? 25 : ml >= 10 ? 20 : ml >= 6 ? 15 : 10;
  speed = Math.max(0, speed - 5 * (ch.exhaustion || 0)); // 2024 Exhaustion: -5 ft per level
  // Spellcasting ability: the first class you have that casts (every class you cast with is listed in casters).
  const casters = cl.map(e => { const cc = S.CLASSES[e.cls] || {}, sub = subCasterOf(e), a = cc.spellAbil || (sub && sub.abil); return a ? { cls: e.cls, abil: a, dc: 8 + pb + m[a], atk: pb + m[a] } : null; }).filter(Boolean);
  const spell = casters[0] ? { abil: casters[0].abil, dc: casters[0].dc, atk: casters[0].atk } : null;
  const res = [];
  for (const e of cl) { const cc = S.CLASSES[e.cls]; if (!cc) continue;
    for (const [name, f, reset] of cc.res || []) { if (typeof f !== "function") continue; const max = f(e.level, { mods: m }); if (!max) continue;
      const i = res.findIndex(r => r.name === name); if (i < 0) res.push({ name, max, reset }); else if (typeof max === "number" && max > res[i].max) res[i].max = max; } }
  const hitDice = cl.map(e => ({ cls: e.cls, hd: (S.CLASSES[e.cls] || {}).hd || 8, n: e.level }));
  const xpNext = lv < 20 ? XP_TABLE[lv] : null;
  return {
    scores: sc, mods: m, pb, saves, skills, hpMax, ac, acHow: how, init, speed, spell, casters, slots: slots(ch), res, hitDice, classes: cl,
    passive: 10 + skills.Perception.mod, attacks: attacks(ch, m, pb), classFeatures: classFeatures(ch),
    speciesTraits: sp ? sp.traits.map(t => ({ name: t[0], text: t[1], source: ch.species })) : [],
    hitDie: c ? c.hd : 8, d20Penalty: 2 * (ch.exhaustion || 0), xpNext, canLevelByXp: xpNext != null && ch.xp >= xpNext
  };
}

// How many cantrips and prepared spells the character can have (2024 rules), what they have now,
// the highest spell level they can cast, and which class lists they choose from.
// Spells marked bonus (from a feat, species, subclass or item) or always prepared don't count.
// Multiclassed casters add up each class's cantrips and prepared spells (perClass shows the split).
function spellRules(ch) {
  const adj = ch.spellAdjust || {}, ch0 = ch.choices || {};
  const own = (ch.spells || []).filter(s => !s.bonus && !s.alwaysPrepared);
  const have = {
    cantrips: own.filter(s => !s.level).length,
    prepared: own.filter(s => s.level && s.prepared).length,
    spellbook: own.filter(s => s.level).length
  };
  const { slots: sl, pact } = slots(ch);
  let maxLevel = Math.max(pact ? pact.lvl : 0, sl.length);
  const wl = clsLevel(ch, "Warlock");
  const arcanum = [[11, 6], [13, 7], [15, 8], [17, 9]].filter(([l]) => wl >= l).map(([, s]) => s);
  if (arcanum.length) maxLevel = Math.max(maxLevel, ...arcanum);
  const list = classList(ch).map(e => ({ e, r: S.SPELLCASTING[e.cls] || subCasterOf(e) })).filter(x => x.r);
  if (!list.length) return { known: false, cantrips: null, prepared: null, spellbook: null, maxLevel, arcanum, lists: [], have, perClass: [] };
  const lists = [...new Set(list.flatMap(x => x.r.lists))];
  if (clsLevel(ch, "Bard") >= 10) for (const k of ["Cleric", "Druid", "Wizard"]) if (!lists.includes(k)) lists.push(k); // Magical Secrets
  const perClass = list.map(({ e, r }) => ({
    cls: e.cls, label: subCasterOf(e) ? e.subclass : e.cls, level: e.level, lists: r.lists,
    cantrips: (r.cantrips[e.level - 1] || 0) + (e.cls === "Cleric" && ch0["Cleric: Divine Order"] === "Thaumaturge" ? 1 : 0) + (e.cls === "Druid" && ch0["Druid: Primal Order"] === "Magician" ? 1 : 0),
    prepared: r.prepared[e.level - 1] || 0, spellbook: r.spellbook ? 6 + 2 * (e.level - 1) : null
  }));
  const wiz = perClass.find(p => p.spellbook != null);
  return {
    known: true, have, maxLevel, arcanum, lists, perClass,
    cantrips: Math.max(0, perClass.reduce((s, p) => s + p.cantrips, 0) + (+adj.cantrips || 0)),
    prepared: Math.max(0, perClass.reduce((s, p) => s + p.prepared, 0) + (+adj.prepared || 0)),
    spellbook: wiz ? wiz.spellbook + (+adj.spellbook || 0) : null
  };
}

// ---------- Choices a class asks for (Fighting Style, Expertise, Weapon Mastery, Invocations, ...) ----------
// Stored in ch.choices["Class: Key"]. A def is one entry of SRD.CLASS_CHOICES plus cls, id and need (how many to pick).
const isEmpty = v => v == null || v === "" || (Array.isArray(v) && !v.length);
function choiceDefs(ch, cls, classLevel, primary) {
  return (S.CLASS_CHOICES[cls] || []).filter(d => d.at <= classLevel && !(d.start && !primary) && !(d.mc && primary)).map(d => {
    const need = d.count ? d.count[classLevel - 1] || 0 : d.n || 1;
    return Object.assign({}, d, { cls, id: cls + ": " + d.key, need });
  }).filter(d => d.need > 0);
}
function choiceDone(ch, def) {
  const v = (ch.choices || {})[def.id];
  if (def.kind === "pick" || def.kind === "feat") return !isEmpty(v);
  return Array.isArray(v) && v.length >= def.need;
}
// Choices new at this class level, or ones whose count grows (more invocations, another mastery).
function choicesAt(ch, cls, classLevel, primary) {
  return choiceDefs(ch, cls, classLevel, primary).filter(d => d.at === classLevel || (d.count && (d.count[classLevel - 2] || 0) < d.need) || !choiceDone(ch, d));
}
// Options for a choice: [[value, summary]].
function choiceOptions(ch, def) {
  const k = def.kind, mine = (ch.choices || {})[def.id] || [];
  if (k === "pick") return def.from;
  if (k === "feat") return Object.keys(S.FEATS).filter(n => /\(Fighting Style\)$/.test(n)).sort().map(n => [n, S.FEATS[n]]);
  if (k === "list") {
    const lv = clsLevel(ch, def.cls) || 1, src = def.from === "invocations" ? S.INVOCATIONS : S.METAMAGIC;
    return src.filter(x => x[1] <= Math.max(lv, 1)).map(x => [x[0], x[2] + (x[1] > 1 ? ` (level ${x[1]}+)` : "")]);
  }
  if (k === "mastery") {
    const ok = w => def.weapons === "melee" ? !/ammunition/i.test(w[3]) && w[0] !== "Dart" : def.weapons === "rogue" ? w[5] === "Simple" || /finesse|light/i.test(w[3]) : true;
    return S.WEAPONS.filter(ok).map(w => [w[0], `${w[4]} · ${w[5]}`]);
  }
  if (k === "skill") {
    const from = def.from === "class" ? (S.CLASSES[def.cls] || {}).skills || S.ALL_SKILLS : Array.isArray(def.from) ? def.from : S.ALL_SKILLS;
    return from.filter(x => !ch.skills.includes(x) || mine.includes(x)).map(x => [x, ""]);
  }
  if (k === "expertise") {
    const from = Array.isArray(def.from) ? def.from : S.ALL_SKILLS;
    return from.filter(x => (ch.skills.includes(x) && !ch.expertise.includes(x)) || mine.includes(x)).map(x => [x, ""]);
  }
  if (k === "lang") {
    const known = langList(ch);
    return [...S.LANGUAGES, ...S.RARE_LANGUAGES].filter(x => !known.includes(x) || mine.includes(x)).map(x => [x, S.RARE_LANGUAGES.includes(x) ? "rare" : ""]);
  }
  if (k === "tool") {
    const from = def.from === "instrument" ? S.INSTRUMENTS : def.from === "artisanOrInstrument" ? [...S.ARTISAN_TOOLS, ...S.INSTRUMENTS] : def.from;
    return from.filter(x => !(ch.tools || []).includes(x) || mine.includes(x)).map(x => [x, ""]);
  }
  return [];
}
const langList = ch => String(ch.languages || "").split(",").map(x => x.trim()).filter(Boolean);
// Put a choice's effect on the sheet (sign 1) or take it off (sign -1).
function choiceEffect(ch, def, v, sign) {
  if (isEmpty(v)) return;
  const vals = Array.isArray(v) ? v : [v], add = (list, x) => { if (!list.includes(x)) list.push(x); };
  const drop = (list, x) => { const i = list.indexOf(x); if (i >= 0) list.splice(i, 1); };
  if (def.kind === "skill") vals.forEach(x => sign > 0 ? add(ch.skills, x) : drop(ch.skills, x));
  if (def.kind === "expertise") vals.forEach(x => sign > 0 ? add(ch.expertise, x) : drop(ch.expertise, x));
  if (def.kind === "tool") { ch.tools = ch.tools || []; vals.forEach(x => sign > 0 ? add(ch.tools, x) : drop(ch.tools, x)); }
  if (def.kind === "lang") { const l = langList(ch); vals.forEach(x => sign > 0 ? add(l, x) : drop(l, x)); ch.languages = l.join(", "); }
  if (def.kind === "feat") {
    ch.feats = (ch.feats || []).filter(f => f.source !== def.id);
    if (sign > 0) ch.feats.push({ id: uid(), name: vals[0], text: S.FEATS[vals[0]] || "", source: def.id });
  }
}
function setChoice(ch, def, v) {
  ch.choices = ch.choices || {};
  choiceEffect(ch, def, ch.choices[def.id], -1);
  if (isEmpty(v)) delete ch.choices[def.id]; else ch.choices[def.id] = Array.isArray(v) ? v.slice() : v;
  choiceEffect(ch, def, v, 1);
  return ch;
}

// Spells your species or lineage gives you by this character level: [{ name, level, at, from }].
function speciesSpells(ch) {
  const out = [];
  for (const k of [ch.species, ch.lineage]) for (const [name, level, at] of S.SPECIES_SPELLS[k] || []) if (at <= (ch.level || 1)) out.push({ name, level, at, from: k });
  return out;
}
function spellEntry(name, level, extra) {
  const x = S.SPELLS.find(o => o.name.toLowerCase() === name.toLowerCase()) || { name, level };
  return Object.assign({ id: uid(), name: x.name, level: x.level, school: x.school || "", time: x.time, range: x.range, components: x.components, duration: x.duration,
    classes: x.classes, src: x.src, text: x.text || "", prepared: true }, extra || {});
}
// Add species spells the character has reached and doesn't have yet. Leveled ones are always prepared.
function addSpeciesSpells(ch) {
  for (const s of speciesSpells(ch)) if (!(ch.spells || []).some(o => o.name.toLowerCase() === s.name.toLowerCase() && o.from === s.from))
    ch.spells.push(spellEntry(s.name, s.level, { bonus: true, alwaysPrepared: s.level > 0 || undefined, from: s.from, source: s.from }));
  return ch;
}

// Everything the character still has to decide: [{ kind, id, label, cls?, def?, n? }]
// kinds: choice (a class choice), subclass, cantrips, prepared, spellbook, initiate (Magic Initiate spells).
function pendingChoices(ch) {
  const out = [];
  for (const e of classList(ch)) {
    const c = S.CLASSES[e.cls]; if (!c) continue;
    if ((c.subAt || [])[0] <= e.level && !e.subclass) out.push({ kind: "subclass", id: "sub:" + e.cls, cls: e.cls, label: `Choose your ${e.cls} subclass` });
    for (const d of choiceDefs(ch, e.cls, e.level, e.primary)) if (!choiceDone(ch, d)) {
      const have = Array.isArray((ch.choices || {})[d.id]) ? ch.choices[d.id].length : 0;
      out.push({ kind: "choice", id: d.id, cls: e.cls, def: d, label: d.kind === "pick" || d.kind === "feat" ? `${e.cls}: choose your ${d.key}` : `${e.cls}: choose ${d.need - have}${have ? " more" : ""} ${d.key.replace(/ \(level \d+\)$/, "")}` });
    }
  }
  const sr = spellRules(ch);
  if (sr.known) {
    if (sr.cantrips > sr.have.cantrips) out.push({ kind: "cantrips", id: "cantrips", n: sr.cantrips - sr.have.cantrips, label: `Choose ${sr.cantrips - sr.have.cantrips} more cantrip${sr.cantrips - sr.have.cantrips > 1 ? "s" : ""}` });
    if (sr.spellbook != null && sr.spellbook > sr.have.spellbook) out.push({ kind: "spellbook", id: "spellbook", n: sr.spellbook - sr.have.spellbook, label: `Add ${sr.spellbook - sr.have.spellbook} more spell${sr.spellbook - sr.have.spellbook > 1 ? "s" : ""} to your spellbook` });
    else if (sr.prepared > sr.have.prepared) out.push({ kind: "prepared", id: "prepared", n: sr.prepared - sr.have.prepared, label: `Prepare ${sr.prepared - sr.have.prepared} more spell${sr.prepared - sr.have.prepared > 1 ? "s" : ""}` });
  }
  for (const f of ch.feats || []) if (/^Magic Initiate/.test(f.name)) {
    const mine = (ch.spells || []).filter(s => s.from === f.name), c = mine.filter(s => !s.level).length, l = mine.filter(s => s.level).length;
    if (c < 2 || l < 1) out.push({ kind: "initiate", id: "mi:" + f.name, feat: f.name, label: `${f.name}: choose ${[c < 2 ? `${2 - c} cantrip${2 - c > 1 ? "s" : ""}` : "", l < 1 ? "a level 1 spell" : ""].filter(Boolean).join(" and ")}` });
  }
  return out;
}

// What a level-up asks the player to decide. cls: the class to take a level in (default: the class you started with).
// A class you don't have yet is multiclassing; mc lists what it gives and problems lists unmet ability scores.
function levelUpPlan(ch, cls) {
  cls = cls || ch.cls;
  const c = S.CLASSES[cls];
  if (!c || (ch.level || 1) >= 20) return null;
  const e = classList(ch).find(x => x.cls === cls), cur = e ? e.level : 0, next = cur + 1, isNew = !e;
  const subAt = c.subAt || [], sd = subclassDef(cls, e ? e.subclass : "");
  const primary = !!(e && e.primary);
  const mp = S.MC_PROFS[cls];
  return {
    cls, isNew, level: (ch.level || 1) + 1, classLevel: next, hd: c.hd, avg: c.hd / 2 + 1,
    features: (c.f || []).filter(f => f[0] === next).map(f => ({ name: f[1], text: f[2] })),
    subclass: subAt[0] === next ? subclassOptions(cls) : null, subFeature: subAt.includes(next) && next !== subAt[0], subName: e ? e.subclass : "",
    subFeatures: sd && sd.f ? sd.f.filter(f => f[0] === next).map(f => ({ name: f[1], text: f[2] })) : [],
    asi: asiLevels(cls).includes(next), epic: next === 19, pbUp: profBonus((ch.level || 1) + 1) > profBonus(ch.level || 1),
    choices: choicesAt(ch, cls, next, primary),
    mc: isNew ? (mp ? { armor: mp.armor || "", weapons: mp.weapons || "", tool: mp.tool || "", known: true } : { known: false }) : null,
    problems: isNew ? mcProblems(ch, cls) : [],
    speciesSpells: speciesSpells(Object.assign({}, ch, { level: (ch.level || 1) + 1 })).filter(s => s.at === (ch.level || 1) + 1)
  };
}

// choice: { cls?, hp, subclass?, asi?: {str:+2}|null, feat?: {name,text,abil?}|null, choices?: { [def.id]: value } }
function applyLevelUp(ch, choice) {
  const plan = levelUpPlan(ch, choice.cls); if (!plan) return ch;
  const before = derive(ch).hpMax;
  ch.multi = ch.multi || []; ch.choices = ch.choices || {};
  ch.hpRolls[ch.level - 1] = Math.max(1, Math.min(plan.hd, +choice.hp || plan.avg));
  let entry = plan.cls === ch.cls ? null : ch.multi.find(x => x.cls === plan.cls);
  if (plan.isNew) {
    const mp = plan.mc || {};
    entry = { cls: plan.cls, level: 0, subclass: "", profs: [mp.armor, mp.weapons, mp.tool].filter(Boolean).join("; ") };
    ch.multi.push(entry);
    if (mp.tool) { ch.tools = ch.tools || []; if (!ch.tools.includes(mp.tool)) ch.tools.push(mp.tool); }
    const l = langList(ch); for (const x of S.CLASS_LANGS[plan.cls] || []) if (!l.includes(x)) l.push(x); ch.languages = l.join(", ");
  }
  if (entry) entry.level = +entry.level + 1;
  ch.level = plan.level;
  if (plan.subclass && choice.subclass) { if (entry) entry.subclass = choice.subclass; else ch.subclass = choice.subclass; }
  if (plan.asi && choice.asi) for (const [a, n] of Object.entries(choice.asi)) ch.asi[a] = (ch.asi[a] || 0) + (+n || 0);
  if (plan.asi && choice.feat && choice.feat.name) {
    ch.feats.push({ id: uid(), name: choice.feat.name, text: choice.feat.text || S.FEATS[choice.feat.name] || "", source: "Level " + plan.level });
    if (choice.feat.abil && S.ABILS.includes(choice.feat.abil)) ch.asi[choice.feat.abil] = (ch.asi[choice.feat.abil] || 0) + 1;
  }
  const all = choiceDefs(ch, plan.cls, plan.classLevel, !entry);
  for (const [id, v] of Object.entries(choice.choices || {})) { const d = all.find(x => x.id === id); if (d) setChoice(ch, d, v); }
  addSpeciesSpells(ch);
  const after = derive(ch).hpMax;
  if (ch.hp.cur != null) ch.hp.cur = Math.min(after, ch.hp.cur + (after - before));
  ch.log.unshift({ t: Date.now(), text: plan.isNew ? `Reached level ${plan.level}: multiclassed into ${plan.cls}` : `Reached level ${plan.level}` + (classList(ch).length > 1 ? ` (${plan.cls} ${plan.classLevel})` : "") });
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

// ---------- Coins ----------
const COIN = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const coinWorth = c => Object.keys(COIN).reduce((s, k) => s + (+(c || {})[k] || 0) * COIN[k], 0);
// Pay n coins of kind k. Uses that coin first, then smaller ones, then larger ones, and breaks one
// coin for change (given back as gp, sp and cp) when nothing fits exactly. Returns the new purse and
// what was broken, or null if the purse can't cover it.
function spendCoins(coins, n, k) {
  const c = {}; for (const o in COIN) c[o] = Math.max(0, Math.floor(+(coins || {})[o] || 0));
  let need = Math.max(0, Math.floor(+n || 0)) * COIN[k];
  if (!need) return { coins: c, broke: null };
  if (coinWorth(c) < need) return null;
  const keys = Object.keys(COIN), i = keys.indexOf(k);
  const order = [k, ...keys.slice(0, i).reverse(), ...keys.slice(i + 1)];
  for (const o of order) { const t = Math.min(c[o], Math.floor(need / COIN[o])); c[o] -= t; need -= t * COIN[o]; }
  let broke = null;
  if (need > 0) {
    const o = keys.find(o => c[o] > 0 && COIN[o] > need);
    c[o]--; broke = o; let change = COIN[o] - need;
    for (const g of ["gp", "sp", "cp"]) { const t = Math.floor(change / COIN[g]); c[g] += t; change -= t * COIN[g]; }
  }
  return { coins: c, broke };
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
        if (x.abil && typeof x.abil === "object") { const ab = {}; for (const [k, n] of Object.entries(x.abil)) if (S.ABILS.includes(k) && +n) ab[k] = Math.max(-2, Math.min(3, +n)); if (Object.keys(ab).length) S.SPECIES[name].abil = ab; }
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

g.Engine = { uid, mod, sign, profBonus, blank, derive, spellRules, levelUpPlan, applyLevelUp, applyGrant, grantLabel, fromSuiteItem, asiLevels, XP_TABLE, COIN, coinWorth, spendCoins,
  useContent, subclassOptions, subclassDef, checkContent, classList, clsLevel, classLabel, mcProblems, choiceDefs, choiceDone, choiceOptions, setChoice, choiceEffect,
  pendingChoices, speciesSpells, addSpeciesSpells, spellEntry, scores };
})(typeof window !== "undefined" ? window : globalThis);
