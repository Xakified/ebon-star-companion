// Rules data for the character builder.
// Source: System Reference Document 5.2 (D&D 2024 rules), released by Wizards of the Coast under CC-BY-4.0.
// Descriptions here are short summaries; anything not in the SRD is entered as homebrew by the DM or player.
(function (g) {
"use strict";
const ABILS = ["str", "dex", "con", "int", "wis", "cha"];
const ABIL_NAME = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
const SKILLS = {
  "Acrobatics": "dex", "Animal Handling": "wis", "Arcana": "int", "Athletics": "str", "Deception": "cha", "History": "int",
  "Insight": "wis", "Intimidation": "cha", "Investigation": "int", "Medicine": "wis", "Nature": "int", "Perception": "wis",
  "Performance": "cha", "Persuasion": "cha", "Religion": "int", "Sleight of Hand": "dex", "Stealth": "dex", "Survival": "wis"
};
const ALL_SKILLS = Object.keys(SKILLS);

const SPECIES = {
  "Dragonborn": { speed: 30, size: "Medium", traits: [
    ["Draconic Ancestry", "Choose a dragon type; it sets your Breath Weapon and resistance damage type."],
    ["Breath Weapon", "Replace one attack with a 15-ft cone or 30-ft line exhalation (Dex save, 1d10 damage, scales at 5/11/17). Uses = proficiency bonus per long rest."],
    ["Damage Resistance", "Resistance to your ancestry's damage type."],
    ["Darkvision", "60 feet."],
    ["Draconic Flight (level 5)", "Bonus action: sprout spectral wings for 10 minutes, fly speed equal to your speed. Once per long rest."]] },
  "Dwarf": { speed: 30, size: "Medium", hpPerLevel: 1, traits: [
    ["Darkvision", "120 feet."],
    ["Dwarven Resilience", "Resistance to poison damage; advantage on saves to avoid or end the Poisoned condition."],
    ["Dwarven Toughness", "Hit point maximum +1 per level (already added)."],
    ["Stonecunning", "Bonus action: tremorsense 60 ft for 10 minutes while on or touching stone. Uses = proficiency bonus per long rest."]] },
  "Elf": { speed: 30, size: "Medium", traits: [
    ["Darkvision", "60 feet (Drow: 120)."],
    ["Elven Lineage", "Drow, High Elf, or Wood Elf: grants a cantrip and later spells (Wood Elf speed 35)."],
    ["Fey Ancestry", "Advantage on saves to avoid or end the Charmed condition."],
    ["Keen Senses", "Proficiency in Insight, Perception, or Survival."],
    ["Trance", "You don't need sleep; a long rest takes 4 hours of trance."]] },
  "Gnome": { speed: 30, size: "Small", traits: [
    ["Darkvision", "60 feet."],
    ["Gnomish Cunning", "Advantage on Intelligence, Wisdom, and Charisma saving throws."],
    ["Gnomish Lineage", "Forest Gnome or Rock Gnome: grants spells and minor tricks."]] },
  "Goliath": { speed: 35, size: "Medium", traits: [
    ["Giant Ancestry", "Choose a supernatural boon (Cloud, Fire, Frost, Hill, Stone, or Storm). Uses = proficiency bonus per long rest."],
    ["Large Form (level 5)", "Bonus action: become Large for 10 minutes, advantage on Strength checks, +10 speed. Once per long rest."],
    ["Powerful Build", "Advantage on checks to end the Grappled condition; count as one size larger for carrying."]] },
  "Halfling": { speed: 30, size: "Small", traits: [
    ["Brave", "Advantage on saves to avoid or end the Frightened condition."],
    ["Halfling Nimbleness", "You can move through the space of any creature larger than you."],
    ["Luck", "When you roll a 1 on a d20 test, reroll it and use the new roll."],
    ["Naturally Stealthy", "You can take the Hide action while obscured only by a creature larger than you."]] },
  "Human": { speed: 30, size: "Medium or Small", traits: [
    ["Resourceful", "You gain Heroic Inspiration whenever you finish a long rest."],
    ["Skillful", "Proficiency in one skill of your choice."],
    ["Versatile", "You gain an Origin feat of your choice."]] },
  "Orc": { speed: 30, size: "Medium", traits: [
    ["Adrenaline Rush", "Dash as a bonus action and gain temp HP equal to your proficiency bonus. Uses = proficiency bonus per short or long rest."],
    ["Darkvision", "120 feet."],
    ["Relentless Endurance", "When reduced to 0 HP but not killed, drop to 1 HP instead. Once per long rest."]] },
  "Tiefling": { speed: 30, size: "Medium or Small", traits: [
    ["Darkvision", "60 feet."],
    ["Fiendish Legacy", "Abyssal, Chthonic, or Infernal: a resistance, a cantrip, and later spells."],
    ["Otherworldly Presence", "You know the Thaumaturgy cantrip."]] }
};

const FEATS = {
  "Alert": "Add your proficiency bonus to initiative. You can swap initiative with a willing ally right after rolling.",
  "Magic Initiate": "Learn two cantrips and one 1st-level spell from the Cleric, Druid, or Wizard list. Cast the spell once per long rest without a slot.",
  "Savage Attacker": "Once per turn when you hit with a weapon, roll its damage dice twice and use either roll.",
  "Skilled": "Gain proficiency in any combination of three skills or tools.",
  "Grappler": "Punch and grab in one action; advantage on attacks against creatures you grapple. (General feat)",
  "Ability Score Improvement": "+2 to one ability score, or +1 to two (max 20)."
};

const BACKGROUNDS = {
  "Acolyte": { abil: ["int", "wis", "cha"], feat: "Magic Initiate", featNote: "Cleric", skills: ["Insight", "Religion"], tool: "Calligrapher's Supplies" },
  "Criminal": { abil: ["dex", "con", "int"], feat: "Alert", skills: ["Sleight of Hand", "Stealth"], tool: "Thieves' Tools" },
  "Sage": { abil: ["con", "int", "wis"], feat: "Magic Initiate", featNote: "Wizard", skills: ["Arcana", "History"], tool: "Calligrapher's Supplies" },
  "Soldier": { abil: ["str", "dex", "con"], feat: "Savage Attacker", skills: ["Athletics", "Intimidation"], tool: "Gaming Set" }
};

// f: features by level [level, name, summary]. "SUB" marks a subclass feature level.
const CLASSES = {
  Barbarian: { hd: 12, primary: "Strength", saves: ["str", "con"], skillN: 2,
    skills: ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"],
    armor: "Light, medium armor; shields", weapons: "Simple and martial weapons", gold: 75, unarmored: "con",
    sub: ["Path of the Berserker", "Frenzy and rage-fuelled resilience."], subAt: [3, 6, 10, 14],
    f: [[1, "Rage", "Bonus action: advantage on Str checks/saves, bonus damage on Str attacks, resistance to bludgeoning, piercing and slashing. Lasts while you keep attacking or forcing saves, up to 10 minutes."],
      [1, "Unarmored Defense", "Without armor, AC = 10 + Dex + Con (shield allowed)."], [1, "Weapon Mastery", "Use the mastery properties of two kinds of Simple or Martial melee weapons."],
      [2, "Danger Sense", "Advantage on Dexterity saving throws unless Incapacitated."], [2, "Reckless Attack", "Advantage on Str attacks this turn; attacks against you have advantage until your next turn."],
      [3, "Primal Knowledge", "Another Barbarian skill; while raging, use Strength for some Dex/Wis skill checks."],
      [5, "Extra Attack", "Attack twice when you take the Attack action."], [5, "Fast Movement", "+10 ft speed without heavy armor."],
      [7, "Feral Instinct", "Advantage on initiative."], [7, "Instinctive Pounce", "Move half your speed when you enter a rage."],
      [9, "Brutal Strike", "Forgo advantage from Reckless Attack to add 1d10 damage and a rider effect."], [11, "Relentless Rage", "Con save to drop to 1 HP instead of 0 while raging."],
      [13, "Improved Brutal Strike", "More Brutal Strike options."], [15, "Persistent Rage", "Regain all rages on initiative once per long rest; rage lasts 10 minutes."],
      [17, "Improved Brutal Strike", "Brutal Strike deals 2d10 and applies two effects."], [18, "Indomitable Might", "Str checks/saves use at least your Strength score."],
      [20, "Primal Champion", "Strength and Constitution +4 (max 25)."]],
    res: [["Rage", lv => [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6][lv - 1], "long (1 back on short)"],
      ["Rage damage", lv => lv >= 16 ? 4 : lv >= 9 ? 3 : 2, "info"]] },
  Bard: { hd: 8, primary: "Charisma", saves: ["dex", "cha"], skillN: 3, skills: ALL_SKILLS,
    armor: "Light armor", weapons: "Simple weapons", gold: 90, caster: "full", spellAbil: "cha",
    sub: ["College of Lore", "Cutting Words and extra Magical Discoveries."], subAt: [3, 6, 14],
    f: [[1, "Bardic Inspiration", "Bonus action: give a creature within 60 ft an inspiration die to add to a failed d20 test. Uses = Cha modifier per long rest."],
      [1, "Spellcasting", "Charisma-based; cast Bard spells."], [2, "Expertise", "Expertise in two skills you're proficient in."], [2, "Jack of All Trades", "Add half proficiency to ability checks you aren't proficient in."],
      [5, "Font of Inspiration", "Regain Bardic Inspiration on a short rest; spend a slot to regain a use."], [7, "Countercharm", "Reaction: let a creature reroll a save against Charmed/Frightened with advantage."],
      [9, "Expertise", "Expertise in two more skills."], [10, "Magical Secrets", "Prepare spells from the Bard, Cleric, Druid, and Wizard lists."],
      [18, "Superior Inspiration", "Regain Bardic Inspiration up to 2 when you roll initiative."], [20, "Words of Creation", "Power Word Heal and Power Word Kill always prepared; can target a second creature."]],
    res: [["Bardic Inspiration die", lv => lv >= 15 ? "d12" : lv >= 10 ? "d10" : lv >= 5 ? "d8" : "d6", "info"],
      ["Bardic Inspiration", (lv, c) => Math.max(1, c.mods.cha), "long (short from lvl 5)"]] },
  Cleric: { hd: 8, primary: "Wisdom", saves: ["wis", "cha"], skillN: 2, skills: ["History", "Insight", "Medicine", "Persuasion", "Religion"],
    armor: "Light, medium armor; shields", weapons: "Simple weapons", gold: 110, caster: "full", spellAbil: "wis",
    sub: ["Life Domain", "Disciple of Life and stronger healing."], subAt: [3, 6, 17],
    f: [[1, "Spellcasting", "Wisdom-based; prepare Cleric spells."], [1, "Divine Order", "Protector (martial weapons, heavy armor) or Thaumaturge (extra cantrip, bonus to Arcana/Religion)."],
      [2, "Channel Divinity", "Divine Spark (heal or harm) or Turn Undead."], [5, "Sear Undead", "Turn Undead also deals radiant damage."],
      [7, "Blessed Strikes", "Divine Strike or Potent Spellcasting."], [10, "Divine Intervention", "Cast any Cleric spell of 5th level or lower without a slot, once per long rest."],
      [14, "Improved Blessed Strikes", "Stronger Blessed Strikes."], [20, "Greater Divine Intervention", "Divine Intervention can cast Wish."]],
    res: [["Channel Divinity", lv => lv >= 18 ? 4 : lv >= 6 ? 3 : lv >= 2 ? 2 : 0, "long (1 back on short)"]] },
  Druid: { hd: 8, primary: "Wisdom", saves: ["int", "wis"], skillN: 2, skills: ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"],
    armor: "Light armor; shields", weapons: "Simple weapons", gold: 50, caster: "full", spellAbil: "wis",
    sub: ["Circle of the Land", "Circle spells tied to a land type."], subAt: [3, 6, 10, 14],
    f: [[1, "Spellcasting", "Wisdom-based; prepare Druid spells."], [1, "Druidic", "Secret language; Speak with Animals always prepared."],
      [1, "Primal Order", "Magician (extra cantrip, bonus to Arcana/Nature) or Warden (martial weapons, medium armor)."],
      [2, "Wild Shape", "Bonus action: take the form of a beast you know."], [2, "Wild Companion", "Expend a slot or Wild Shape to cast Find Familiar."],
      [5, "Wild Resurgence", "Trade spell slots and Wild Shape uses."], [7, "Elemental Fury", "Potent Spellcasting or Primal Strike."],
      [15, "Improved Elemental Fury", "Stronger Elemental Fury."], [18, "Beast Spells", "Cast spells while in Wild Shape."], [20, "Archdruid", "Evergreen Wild Shape, Nature Magician, Longevity."]],
    res: [["Wild Shape", lv => lv >= 17 ? 4 : lv >= 6 ? 3 : lv >= 2 ? 2 : 0, "long (1 back on short)"]] },
  Fighter: { hd: 10, primary: "Strength or Dexterity", saves: ["str", "con"], skillN: 2,
    skills: ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Persuasion", "Perception", "Survival"],
    armor: "All armor; shields", weapons: "Simple and martial weapons", gold: 155, asiExtra: [6, 14],
    sub: ["Champion", "Improved Critical and athletic prowess."], subAt: [3, 7, 10, 15, 18],
    f: [[1, "Fighting Style", "Gain a Fighting Style feat."], [1, "Second Wind", "Bonus action: regain 1d10 + fighter level HP."], [1, "Weapon Mastery", "Use the mastery properties of three kinds of weapons."],
      [2, "Action Surge", "Take one additional action on your turn. Once per short or long rest."], [2, "Tactical Mind", "Spend a Second Wind use to add 1d10 to a failed ability check."],
      [5, "Extra Attack", "Attack twice when you take the Attack action."], [5, "Tactical Shift", "Move half speed without opportunity attacks when you use Second Wind."],
      [9, "Indomitable", "Reroll a failed save with a bonus equal to fighter level."], [9, "Tactical Master", "Swap a weapon's mastery for Push, Sap, or Slow."],
      [11, "Two Extra Attacks", "Attack three times."], [13, "Studied Attacks", "Advantage on your next attack after a miss."],
      [17, "Action Surge (two uses)", ""], [17, "Indomitable (three uses)", ""], [20, "Three Extra Attacks", "Attack four times."]],
    res: [["Second Wind", lv => lv >= 10 ? 4 : lv >= 4 ? 3 : 2, "long (1 back on short)"], ["Action Surge", lv => lv >= 17 ? 2 : lv >= 2 ? 1 : 0, "short"],
      ["Indomitable", lv => lv >= 17 ? 3 : lv >= 13 ? 2 : lv >= 9 ? 1 : 0, "long"]] },
  Monk: { hd: 8, primary: "Dexterity and Wisdom", saves: ["str", "dex"], skillN: 2, skills: ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"],
    armor: "None", weapons: "Simple weapons; martial weapons with the Light property", gold: 50, unarmored: "wis",
    sub: ["Warrior of the Open Hand", "Open Hand Technique and more."], subAt: [3, 6, 11, 17],
    f: [[1, "Martial Arts", "Use Dex for unarmed strikes and Monk weapons, Martial Arts die damage, bonus-action unarmed strike."],
      [1, "Unarmored Defense", "Without armor or shield, AC = 10 + Dex + Wis."],
      [2, "Monk's Focus", "Focus points for Flurry of Blows, Patient Defense, Step of the Wind."], [2, "Unarmored Movement", "Speed bonus without armor or shield."],
      [2, "Uncanny Metabolism", "On initiative, regain all Focus and heal once per long rest."], [3, "Deflect Attacks", "Reaction: reduce damage from an attack."],
      [4, "Slow Fall", "Reaction: reduce falling damage by 5 x monk level."], [5, "Extra Attack", "Attack twice."], [5, "Stunning Strike", "Spend 1 Focus: target makes a Con save or is Stunned."],
      [6, "Empowered Strikes", "Unarmed strikes can deal force damage."], [7, "Evasion", "Dex saves for half damage take none on a success."],
      [9, "Acrobatic Movement", "Run on walls and water."], [10, "Heightened Focus", "Stronger Focus abilities."], [10, "Self-Restoration", "End Charmed, Frightened, or Poisoned on yourself."],
      [13, "Deflect Energy", "Deflect Attacks works on any damage type."], [14, "Disciplined Survivor", "Proficiency in all saves; spend Focus to reroll."],
      [15, "Perfect Focus", "Start with at least 4 Focus on initiative."], [18, "Superior Defense", "Spend Focus: resistance to all damage but force."], [20, "Body and Mind", "Dexterity and Wisdom +4 (max 25)."]],
    res: [["Focus Points", lv => lv >= 2 ? lv : 0, "short"], ["Martial Arts die", lv => lv >= 17 ? "d12" : lv >= 11 ? "d10" : lv >= 5 ? "d8" : "d6", "info"],
      ["Unarmored Movement", lv => lv >= 18 ? "+30 ft" : lv >= 14 ? "+25 ft" : lv >= 10 ? "+20 ft" : lv >= 6 ? "+15 ft" : lv >= 2 ? "+10 ft" : "-", "info"]] },
  Paladin: { hd: 10, primary: "Strength and Charisma", saves: ["wis", "cha"], skillN: 2, skills: ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"],
    armor: "All armor; shields", weapons: "Simple and martial weapons", gold: 150, caster: "half", spellAbil: "cha",
    sub: ["Oath of Devotion", "Sacred Weapon and an aura against charm."], subAt: [3, 7, 15, 20],
    f: [[1, "Lay On Hands", "Pool of healing equal to 5 x paladin level; bonus action to use."], [1, "Spellcasting", "Charisma-based; prepare Paladin spells."], [1, "Weapon Mastery", "Use the mastery properties of two kinds of weapons."],
      [2, "Fighting Style", "Gain a Fighting Style feat (or Blessed Warrior)."], [2, "Paladin's Smite", "Divine Smite always prepared; cast once per long rest without a slot."],
      [3, "Channel Divinity", "Divine Sense and your oath's options."], [5, "Extra Attack", "Attack twice."], [5, "Faithful Steed", "Find Steed always prepared; free cast once per long rest."],
      [6, "Aura of Protection", "You and allies within 10 ft add your Cha modifier to saves."], [9, "Abjure Foes", "Channel Divinity to frighten enemies."],
      [10, "Aura of Courage", "You and allies in your aura can't be Frightened."], [11, "Radiant Strikes", "Melee and unarmed hits deal +1d8 radiant."],
      [14, "Restoring Touch", "Lay On Hands can end conditions."], [18, "Aura Expansion", "Aura becomes 30 ft."]],
    res: [["Lay On Hands pool", lv => 5 * lv, "long"], ["Channel Divinity", lv => lv >= 11 ? 3 : lv >= 3 ? 2 : 0, "long (1 back on short)"]] },
  Ranger: { hd: 10, primary: "Dexterity and Wisdom", saves: ["str", "dex"], skillN: 3,
    skills: ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"],
    armor: "Light, medium armor; shields", weapons: "Simple and martial weapons", gold: 150, caster: "half", spellAbil: "wis",
    sub: ["Hunter", "Hunter's Prey and defensive tactics."], subAt: [3, 7, 11, 15],
    f: [[1, "Spellcasting", "Wisdom-based; prepare Ranger spells."], [1, "Favored Enemy", "Hunter's Mark always prepared; free casts per long rest."], [1, "Weapon Mastery", "Use the mastery properties of two kinds of weapons."],
      [2, "Deft Explorer", "Expertise in one skill and two languages."], [2, "Fighting Style", "Gain a Fighting Style feat (or Druidic Warrior)."],
      [5, "Extra Attack", "Attack twice."], [6, "Roving", "+10 speed; climb and swim speed."], [9, "Expertise", "Expertise in two skills."],
      [10, "Tireless", "Temp HP as a Magic action; short rests reduce Exhaustion."], [13, "Relentless Hunter", "Damage can't break concentration on Hunter's Mark."],
      [14, "Nature's Veil", "Bonus action: become Invisible until the end of your next turn."], [17, "Precise Hunter", "Advantage on attacks against your marked target."],
      [18, "Feral Senses", "Blindsight 30 ft."], [20, "Foe Slayer", "Hunter's Mark damage die becomes a d10."]],
    res: [["Favored Enemy", lv => lv >= 17 ? 6 : lv >= 13 ? 5 : lv >= 9 ? 4 : lv >= 5 ? 3 : 2, "long"]] },
  Rogue: { hd: 8, primary: "Dexterity", saves: ["dex", "int"], skillN: 4,
    skills: ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Persuasion", "Sleight of Hand", "Stealth"],
    armor: "Light armor", weapons: "Simple weapons; martial weapons with Finesse or Light", gold: 100, asiExtra: [10],
    sub: ["Thief", "Fast Hands and climbing tricks."], subAt: [3, 9, 13, 17],
    f: [[1, "Expertise", "Expertise in two skills you're proficient in."], [1, "Sneak Attack", "Extra damage once per turn with advantage or an ally adjacent to the target."],
      [1, "Thieves' Cant", "Secret rogue language plus one other language."], [1, "Weapon Mastery", "Use the mastery properties of two kinds of weapons."],
      [2, "Cunning Action", "Bonus action: Dash, Disengage, or Hide."], [3, "Steady Aim", "Bonus action: advantage on your next attack if you haven't moved."],
      [5, "Cunning Strike", "Trade Sneak Attack dice for Poison, Trip, or Withdraw effects."], [5, "Uncanny Dodge", "Reaction: halve an attack's damage."],
      [6, "Expertise", "Expertise in two more skills."], [7, "Evasion", "Dex saves for half damage take none on a success."], [7, "Reliable Talent", "Treat d20 rolls of 9 or lower as 10 on proficient checks."],
      [11, "Improved Cunning Strike", "Use two Cunning Strike effects."], [14, "Devious Strikes", "Daze, Knock Out, Obscure options."], [15, "Slippery Mind", "Proficiency in Wisdom and Charisma saves."],
      [18, "Elusive", "No attack roll has advantage against you."], [20, "Stroke of Luck", "Turn a failed d20 test into a 20, once per short or long rest."]],
    res: [["Sneak Attack", lv => Math.ceil(lv / 2) + "d6", "info"]] },
  Sorcerer: { hd: 6, primary: "Charisma", saves: ["con", "cha"], skillN: 2, skills: ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"],
    armor: "None", weapons: "Simple weapons", gold: 50, caster: "full", spellAbil: "cha",
    sub: ["Draconic Sorcery", "Draconic resilience and elemental affinity."], subAt: [3, 6, 14, 18],
    f: [[1, "Spellcasting", "Charisma-based; Sorcerer spells."], [1, "Innate Sorcery", "Bonus action: +1 spell save DC and advantage on Sorcerer spell attacks for 1 minute. Twice per long rest."],
      [2, "Font of Magic", "Sorcery Points; convert between points and spell slots."], [2, "Metamagic", "Two Metamagic options to alter spells."],
      [5, "Sorcerous Restoration", "Regain sorcery points on a short rest, once per long rest."], [7, "Sorcery Incarnate", "Spend sorcery points for Innate Sorcery; two Metamagics per spell."],
      [10, "Metamagic", "Two more options."], [17, "Metamagic", "Two more options."], [20, "Arcane Apotheosis", "Once per turn, Metamagic costs no points during Innate Sorcery."]],
    res: [["Sorcery Points", lv => lv >= 2 ? lv : 0, "long"], ["Innate Sorcery", () => 2, "long"]] },
  Warlock: { hd: 8, primary: "Charisma", saves: ["wis", "cha"], skillN: 2, skills: ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"],
    armor: "Light armor", weapons: "Simple weapons", gold: 100, caster: "pact", spellAbil: "cha",
    sub: ["Fiend Patron", "Dark One's Blessing and fiendish resilience."], subAt: [3, 6, 10, 14],
    f: [[1, "Eldritch Invocations", "Gain invocations such as Pact of the Blade/Chain/Tome."], [1, "Pact Magic", "Charisma-based; few slots that recharge on a short rest."],
      [2, "Magical Cunning", "Regain half your Pact slots with a 1-minute rite, once per long rest."], [9, "Contact Patron", "Contact Other Plane always prepared; free cast once per long rest."],
      [11, "Mystic Arcanum (6th level)", "One 6th-level spell, once per long rest."], [13, "Mystic Arcanum (7th level)", ""], [15, "Mystic Arcanum (8th level)", ""], [17, "Mystic Arcanum (9th level)", ""],
      [20, "Eldritch Master", "Magical Cunning restores all Pact slots."]],
    res: [["Invocations known", lv => [1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10][lv - 1], "info"]] },
  Wizard: { hd: 6, primary: "Intelligence", saves: ["int", "wis"], skillN: 2, skills: ["Arcana", "History", "Insight", "Investigation", "Medicine", "Nature", "Religion"],
    armor: "None", weapons: "Simple weapons", gold: 55, caster: "full", spellAbil: "int",
    sub: ["Evoker", "Sculpt Spells and potent evocations."], subAt: [3, 6, 10, 14],
    f: [[1, "Spellcasting", "Intelligence-based; spellbook of Wizard spells."], [1, "Ritual Adept", "Cast ritual spells from your spellbook without preparing them."],
      [1, "Arcane Recovery", "On a short rest, recover slots totalling half your wizard level (rounded up), once per long rest."],
      [2, "Scholar", "Expertise in one of Arcana, History, Investigation, Medicine, Nature, or Religion."], [5, "Memorize Spell", "Swap a prepared spell on a short rest."],
      [18, "Spell Mastery", "Cast a chosen 1st- and 2nd-level spell at will."], [20, "Signature Spells", "Two 3rd-level spells always prepared, each castable once per short rest free."]],
    res: [["Arcane Recovery", () => 1, "long"]] }
};

// Spell slots by caster level (full-caster table). Half casters use ceil(level / 2).
const FULL_SLOTS = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
const PACT = lv => ({ n: lv >= 17 ? 4 : lv >= 11 ? 3 : lv >= 2 ? 2 : 1, lvl: Math.min(5, Math.ceil(lv / 2)) });

// [name, base AC, dex cap (null = no cap, 0 = none), category, stealth disadvantage]
const ARMOR = [
  ["Padded Armor", 11, null, "Light", true], ["Leather Armor", 11, null, "Light", false], ["Studded Leather Armor", 12, null, "Light", false],
  ["Hide Armor", 12, 2, "Medium", false], ["Chain Shirt", 13, 2, "Medium", false], ["Scale Mail", 14, 2, "Medium", true],
  ["Breastplate", 14, 2, "Medium", false], ["Half Plate Armor", 15, 2, "Medium", true],
  ["Ring Mail", 14, 0, "Heavy", true], ["Chain Mail", 16, 0, "Heavy", true], ["Splint Armor", 17, 0, "Heavy", true], ["Plate Armor", 18, 0, "Heavy", true],
  ["Shield", 2, null, "Shield", false]];

// [name, damage, type, properties, mastery, category]
const WEAPONS = [
  ["Club", "1d4", "bludgeoning", "Light", "Slow", "Simple"], ["Dagger", "1d4", "piercing", "Finesse, Light, Thrown (20/60)", "Nick", "Simple"],
  ["Greatclub", "1d8", "bludgeoning", "Two-Handed", "Push", "Simple"], ["Handaxe", "1d6", "slashing", "Light, Thrown (20/60)", "Vex", "Simple"],
  ["Javelin", "1d6", "piercing", "Thrown (30/120)", "Slow", "Simple"], ["Light Hammer", "1d4", "bludgeoning", "Light, Thrown (20/60)", "Nick", "Simple"],
  ["Mace", "1d6", "bludgeoning", "", "Sap", "Simple"], ["Quarterstaff", "1d6", "bludgeoning", "Versatile (1d8)", "Topple", "Simple"],
  ["Sickle", "1d4", "slashing", "Light", "Nick", "Simple"], ["Spear", "1d6", "piercing", "Thrown (20/60), Versatile (1d8)", "Sap", "Simple"],
  ["Light Crossbow", "1d8", "piercing", "Ammunition (80/320), Loading, Two-Handed", "Slow", "Simple"], ["Shortbow", "1d6", "piercing", "Ammunition (80/320), Two-Handed", "Vex", "Simple"],
  ["Sling", "1d4", "bludgeoning", "Ammunition (30/120)", "Slow", "Simple"],
  ["Battleaxe", "1d8", "slashing", "Versatile (1d10)", "Topple", "Martial"], ["Flail", "1d8", "bludgeoning", "", "Sap", "Martial"],
  ["Glaive", "1d10", "slashing", "Heavy, Reach, Two-Handed", "Graze", "Martial"], ["Greataxe", "1d12", "slashing", "Heavy, Two-Handed", "Cleave", "Martial"],
  ["Greatsword", "2d6", "slashing", "Heavy, Two-Handed", "Graze", "Martial"], ["Halberd", "1d10", "slashing", "Heavy, Reach, Two-Handed", "Cleave", "Martial"],
  ["Lance", "1d10", "piercing", "Heavy, Reach, Two-Handed (unless mounted)", "Topple", "Martial"], ["Longsword", "1d8", "slashing", "Versatile (1d10)", "Sap", "Martial"],
  ["Maul", "2d6", "bludgeoning", "Heavy, Two-Handed", "Topple", "Martial"], ["Morningstar", "1d8", "piercing", "", "Sap", "Martial"],
  ["Pike", "1d10", "piercing", "Heavy, Reach, Two-Handed", "Push", "Martial"], ["Rapier", "1d8", "piercing", "Finesse", "Vex", "Martial"],
  ["Scimitar", "1d6", "slashing", "Finesse, Light", "Nick", "Martial"], ["Shortsword", "1d6", "piercing", "Finesse, Light", "Vex", "Martial"],
  ["Trident", "1d8", "piercing", "Thrown (20/60), Versatile (1d10)", "Topple", "Martial"], ["Warhammer", "1d8", "bludgeoning", "Versatile (1d10)", "Push", "Martial"],
  ["War Pick", "1d8", "piercing", "Versatile (1d10)", "Sap", "Martial"], ["Whip", "1d4", "slashing", "Finesse, Reach", "Slow", "Martial"],
  ["Hand Crossbow", "1d6", "piercing", "Ammunition (30/120), Light, Loading", "Vex", "Martial"], ["Heavy Crossbow", "1d10", "piercing", "Ammunition (100/400), Heavy, Loading, Two-Handed", "Push", "Martial"],
  ["Longbow", "1d8", "piercing", "Ammunition (150/600), Heavy, Two-Handed", "Slow", "Martial"]];

const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

g.SRD = { ABILS, ABIL_NAME, SKILLS, ALL_SKILLS, SPECIES, FEATS, BACKGROUNDS, CLASSES, FULL_SLOTS, PACT, ARMOR, WEAPONS, CONDITIONS, STANDARD_ARRAY, POINT_COST };
})(typeof window !== "undefined" ? window : globalThis);
