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
  "Archery (Fighting Style)": "+2 bonus to attack rolls you make with ranged weapons.",
  "Defense (Fighting Style)": "+1 bonus to AC while you wear light, medium or heavy armor.",
  "Great Weapon Fighting (Fighting Style)": "Treat a 1 or 2 on a damage die as a 3 for melee attacks with a weapon you hold in two hands (Two-Handed or Versatile).",
  "Two-Weapon Fighting (Fighting Style)": "Add your ability modifier to the damage of the extra attack from a Light weapon.",
  "Boon of Combat Prowess": "Epic Boon (level 19+). +1 to one ability (max 30). Once per turn, turn a missed attack into a hit.",
  "Boon of Dimensional Travel": "Epic Boon (level 19+). +1 to one ability (max 30). After you take the Attack or Magic action, teleport up to 30 feet.",
  "Boon of Fate": "Epic Boon (level 19+). +1 to one ability (max 30). Add or subtract 2d4 from a nearby creature's D20 Test; once per initiative or rest.",
  "Boon of Irresistible Offense": "Epic Boon (level 19+). +1 Strength or Dexterity (max 30). Your bludgeoning, piercing and slashing damage ignores resistance; a natural 20 adds damage equal to that ability score.",
  "Boon of Spell Recall": "Epic Boon (level 19+). +1 Intelligence, Wisdom or Charisma (max 30). Cast a level 1 to 4 spell without a slot, once per Long Rest.",
  "Boon of the Night Spirit": "Epic Boon (level 19+). +1 to one ability (max 30). Become Invisible in dim light or darkness; resistance to all damage but psychic and radiant there.",
  "Boon of Truesight": "Epic Boon (level 19+). +1 to one ability (max 30). Truesight 60 feet.",
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

// Spells a character can have, from the 2024 Player's Handbook class tables (index 0 = level 1).
// "prepared" is the Prepared Spells column; wizards also keep a spellbook (6 spells, +2 a level).
const by3 = (a, b, c) => Array.from({ length: 20 }, (_, i) => (i < 3 ? a : i < 9 ? b : c));
const PREP_FULL = [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22];
const PREP_HALF = [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15];
const PREP_THIRD = [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13];
const SPELLCASTING = {
  Bard: { cantrips: by3(2, 3, 4), prepared: PREP_FULL, lists: ["Bard"] },
  Cleric: { cantrips: by3(3, 4, 5), prepared: PREP_FULL, lists: ["Cleric"] },
  Druid: { cantrips: by3(2, 3, 4), prepared: PREP_FULL, lists: ["Druid"] },
  Paladin: { cantrips: by3(0, 0, 0), prepared: PREP_HALF, lists: ["Paladin"] },
  Ranger: { cantrips: by3(0, 0, 0), prepared: PREP_HALF, lists: ["Ranger"] },
  Sorcerer: { cantrips: by3(4, 5, 6), prepared: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22], lists: ["Sorcerer"] },
  Warlock: { cantrips: by3(2, 3, 4), prepared: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15], lists: ["Warlock"] },
  Wizard: { cantrips: by3(3, 4, 5), prepared: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25], lists: ["Wizard"], spellbook: true }
};
// Subclasses that give a non-caster spellcasting from level 3, with slots as a full caster of a third their level.
const SUB_CASTERS = {
  "Eldritch Knight": { cls: "Fighter", abil: "int", cantrips: [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], prepared: PREP_THIRD, lists: ["Wizard"] },
  "Arcane Trickster": { cls: "Rogue", abil: "int", cantrips: [0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4], prepared: PREP_THIRD, lists: ["Wizard"] }
};

// [name, base AC, dex cap (null = no cap, 0 = none), category, stealth disadvantage, cost, weight (lb), Strength needed]
const ARMOR = [
  ["Padded Armor", 11, null, "Light", true, "5 gp", 8, 0], ["Leather Armor", 11, null, "Light", false, "10 gp", 10, 0], ["Studded Leather Armor", 12, null, "Light", false, "45 gp", 13, 0],
  ["Hide Armor", 12, 2, "Medium", false, "10 gp", 12, 0], ["Chain Shirt", 13, 2, "Medium", false, "50 gp", 20, 0], ["Scale Mail", 14, 2, "Medium", true, "50 gp", 45, 0],
  ["Breastplate", 14, 2, "Medium", false, "400 gp", 20, 0], ["Half Plate Armor", 15, 2, "Medium", true, "750 gp", 40, 0],
  ["Ring Mail", 14, 0, "Heavy", true, "30 gp", 40, 0], ["Chain Mail", 16, 0, "Heavy", true, "75 gp", 55, 13], ["Splint Armor", 17, 0, "Heavy", true, "200 gp", 60, 15], ["Plate Armor", 18, 0, "Heavy", true, "1,500 gp", 65, 15],
  ["Shield", 2, null, "Shield", false, "10 gp", 6, 0]];

// [name, damage, type, properties, mastery, category, cost, weight (lb)]
const WEAPONS = [
  ["Club", "1d4", "bludgeoning", "Light", "Slow", "Simple", "1 sp", 2], ["Dagger", "1d4", "piercing", "Finesse, Light, Thrown (20/60)", "Nick", "Simple", "2 gp", 1],
  ["Greatclub", "1d8", "bludgeoning", "Two-Handed", "Push", "Simple", "2 sp", 10], ["Handaxe", "1d6", "slashing", "Light, Thrown (20/60)", "Vex", "Simple", "5 gp", 2],
  ["Javelin", "1d6", "piercing", "Thrown (30/120)", "Slow", "Simple", "5 sp", 2], ["Light Hammer", "1d4", "bludgeoning", "Light, Thrown (20/60)", "Nick", "Simple", "2 gp", 2],
  ["Mace", "1d6", "bludgeoning", "", "Sap", "Simple", "5 gp", 4], ["Quarterstaff", "1d6", "bludgeoning", "Versatile (1d8)", "Topple", "Simple", "2 sp", 4],
  ["Sickle", "1d4", "slashing", "Light", "Nick", "Simple", "1 gp", 2], ["Spear", "1d6", "piercing", "Thrown (20/60), Versatile (1d8)", "Sap", "Simple", "1 gp", 3],
  ["Light Crossbow", "1d8", "piercing", "Ammunition (80/320), Loading, Two-Handed", "Slow", "Simple", "25 gp", 5], ["Shortbow", "1d6", "piercing", "Ammunition (80/320), Two-Handed", "Vex", "Simple", "25 gp", 2],
  ["Sling", "1d4", "bludgeoning", "Ammunition (30/120)", "Slow", "Simple", "1 sp", 0], ["Dart", "1d4", "piercing", "Finesse, Thrown (20/60)", "Vex", "Simple", "5 cp", 0.25],
  ["Battleaxe", "1d8", "slashing", "Versatile (1d10)", "Topple", "Martial", "10 gp", 4], ["Flail", "1d8", "bludgeoning", "", "Sap", "Martial", "10 gp", 2],
  ["Glaive", "1d10", "slashing", "Heavy, Reach, Two-Handed", "Graze", "Martial", "20 gp", 6], ["Greataxe", "1d12", "slashing", "Heavy, Two-Handed", "Cleave", "Martial", "30 gp", 7],
  ["Greatsword", "2d6", "slashing", "Heavy, Two-Handed", "Graze", "Martial", "50 gp", 6], ["Halberd", "1d10", "slashing", "Heavy, Reach, Two-Handed", "Cleave", "Martial", "20 gp", 6],
  ["Lance", "1d10", "piercing", "Heavy, Reach, Two-Handed (unless mounted)", "Topple", "Martial", "10 gp", 6], ["Longsword", "1d8", "slashing", "Versatile (1d10)", "Sap", "Martial", "15 gp", 3],
  ["Maul", "2d6", "bludgeoning", "Heavy, Two-Handed", "Topple", "Martial", "10 gp", 10], ["Morningstar", "1d8", "piercing", "", "Sap", "Martial", "15 gp", 4],
  ["Pike", "1d10", "piercing", "Heavy, Reach, Two-Handed", "Push", "Martial", "5 gp", 18], ["Rapier", "1d8", "piercing", "Finesse", "Vex", "Martial", "25 gp", 2],
  ["Scimitar", "1d6", "slashing", "Finesse, Light", "Nick", "Martial", "25 gp", 3], ["Shortsword", "1d6", "piercing", "Finesse, Light", "Vex", "Martial", "10 gp", 2],
  ["Trident", "1d8", "piercing", "Thrown (20/60), Versatile (1d10)", "Topple", "Martial", "5 gp", 4], ["Warhammer", "1d8", "bludgeoning", "Versatile (1d10)", "Push", "Martial", "15 gp", 5],
  ["War Pick", "1d8", "piercing", "Versatile (1d10)", "Sap", "Martial", "5 gp", 2], ["Whip", "1d4", "slashing", "Finesse, Reach", "Slow", "Martial", "2 gp", 3],
  ["Hand Crossbow", "1d6", "piercing", "Ammunition (30/120), Light, Loading", "Vex", "Martial", "75 gp", 3], ["Heavy Crossbow", "1d10", "piercing", "Ammunition (100/400), Heavy, Loading, Two-Handed", "Push", "Martial", "50 gp", 18],
  ["Longbow", "1d8", "piercing", "Ammunition (150/600), Heavy, Two-Handed", "Slow", "Martial", "50 gp", 2],
  ["Blowgun", "1", "piercing", "Ammunition (25/100), Loading", "Vex", "Martial", "10 gp", 1], ["Musket", "1d12", "piercing", "Ammunition (40/120), Loading, Two-Handed", "Slow", "Martial", "500 gp", 10],
  ["Pistol", "1d10", "piercing", "Ammunition (30/90), Loading", "Vex", "Martial", "250 gp", 3]];

// Basic equipment (SRD 5.2): [name, cost, weight (lb), kind, what it does]
const GEAR = [
  ["Backpack", "2 gp", 5, "Adventuring gear", "Holds up to 30 pounds within 1 cubic foot. Can also have items strapped to the outside."],
  ["Ball Bearings", "1 gp", 2, "Adventuring gear", "As a Utilize action, spill them to cover a level 10-foot square. A creature entering it must succeed on a DC 10 Dexterity save or have the Prone condition."],
  ["Barrel", "2 gp", 70, "Adventuring gear", "Holds up to 40 gallons of liquid or 4 cubic feet of dry goods."],
  ["Basket", "4 sp", 2, "Adventuring gear", "Holds up to 40 pounds within 2 cubic feet."],
  ["Bedroll", "1 gp", 7, "Adventuring gear", "Sleeps one Small or Medium creature. While in it, you automatically succeed on saves against extreme cold."],
  ["Bell", "1 gp", 0, "Adventuring gear", "When rung, it can be heard up to 60 feet away."],
  ["Blanket", "5 sp", 3, "Adventuring gear", "While wrapped in it, you have Advantage on saves against extreme cold."],
  ["Block and Tackle", "1 gp", 5, "Adventuring gear", "Lets you hoist up to four times the weight you could normally lift."],
  ["Book", "25 gp", 5, "Adventuring gear", "A book on a subject. Gives Advantage on Intelligence checks to recall information about that subject while you consult it."],
  ["Bottle, Glass", "2 gp", 2, "Adventuring gear", "Holds up to 1½ pints."],
  ["Bucket", "5 cp", 2, "Adventuring gear", "Holds up to half a cubic foot of contents."],
  ["Caltrops", "1 gp", 2, "Adventuring gear", "As a Utilize action, spread them over a 5-foot square. A creature entering it must succeed on a DC 15 Dexterity save or take 1 piercing damage and have its Speed reduced to 0 until the start of its next turn."],
  ["Candle", "1 cp", 0, "Adventuring gear", "Burns for 1 hour, shedding Bright Light in a 5-foot radius and Dim Light for an additional 5 feet."],
  ["Case, Crossbow Bolt", "1 gp", 1, "Adventuring gear", "Holds up to 20 bolts."],
  ["Case, Map or Scroll", "1 gp", 1, "Adventuring gear", "Holds up to 10 sheets of paper or 5 sheets of parchment."],
  ["Chain", "5 gp", 10, "Adventuring gear", "10 feet long. Can bind an unwilling Grappled, Incapacitated or Restrained creature (Escape DC 13). Bursting it takes a DC 20 Strength (Athletics) check."],
  ["Chest", "5 gp", 25, "Adventuring gear", "Holds up to 12 cubic feet of contents."],
  ["Climber's Kit", "25 gp", 12, "Adventuring gear", "Boot tips, gloves, pitons and a harness. As a Utilize action, anchor yourself: you can't fall more than 25 feet from that point."],
  ["Clothes, Fine", "15 gp", 6, "Adventuring gear", "Made of expensive fabrics. Some events and places admit only people wearing them."],
  ["Clothes, Traveler's", "2 gp", 4, "Adventuring gear", "Resilient garments for travel in various environments."],
  ["Component Pouch", "25 gp", 2, "Spellcasting focus", "Watertight and filled with compartments holding the free Material components of your spells."],
  ["Costume", "5 gp", 4, "Adventuring gear", "Gives Advantage on checks to impersonate the person or type of person it represents."],
  ["Crowbar", "2 gp", 5, "Adventuring gear", "Gives Advantage on Strength checks where its leverage can be applied."],
  ["Flask", "2 cp", 1, "Adventuring gear", "Holds up to 1 pint."],
  ["Grappling Hook", "2 gp", 4, "Adventuring gear", "Throw it at a railing, ledge or other catch within 50 feet; it catches on a DC 13 Dexterity (Acrobatics) check. Tie a rope to it to climb."],
  ["Healer's Kit", "5 gp", 3, "Adventuring gear", "Ten uses. As a Utilize action, expend a use to stabilize an Unconscious creature at 0 Hit Points without a Wisdom (Medicine) check."],
  ["Hunting Trap", "5 gp", 25, "Adventuring gear", "A creature that steps on it makes a DC 13 Dexterity save or takes 1d4 piercing damage and has its Speed set to 0 until it escapes (DC 13 Strength (Athletics))."],
  ["Ink", "10 gp", 0, "Adventuring gear", "A 1-ounce bottle, enough to write about 500 pages."],
  ["Ink Pen", "2 cp", 0, "Adventuring gear", "Used with ink to write or draw."],
  ["Jug", "2 cp", 4, "Adventuring gear", "Holds up to 1 gallon."],
  ["Ladder", "1 sp", 25, "Adventuring gear", "10 feet tall. You climb it at normal speed."],
  ["Lamp", "5 sp", 1, "Adventuring gear", "Burns oil: Bright Light in a 15-foot radius and Dim Light for 30 more feet. Burns for 6 hours on a flask of oil."],
  ["Lantern, Bullseye", "10 gp", 2, "Adventuring gear", "Burns oil: Bright Light in a 60-foot Cone and Dim Light for 60 more feet. Burns for 6 hours on a flask of oil."],
  ["Lantern, Hooded", "5 gp", 2, "Adventuring gear", "Burns oil: Bright Light in a 30-foot radius and Dim Light for 30 more feet. Lower the hood (Bonus Action) to reduce it to Dim Light in 5 feet."],
  ["Lock", "10 gp", 1, "Adventuring gear", "Comes with a key. Picking it without the key takes a DC 15 Dexterity (Sleight of Hand) check with Thieves' Tools."],
  ["Magnifying Glass", "100 gp", 0, "Adventuring gear", "Gives Advantage on checks to appraise or inspect a highly detailed item. Can light a fire in bright sunlight in 5 minutes."],
  ["Manacles", "2 gp", 6, "Adventuring gear", "Bind a Small or Medium Grappled, Incapacitated or Restrained creature (Escape DC 20, or DC 25 to break)."],
  ["Mirror", "5 gp", 0.5, "Adventuring gear", "A handheld steel mirror, useful for cosmetics, peeking around corners and reflecting light."],
  ["Net", "1 gp", 3, "Adventuring gear", "As an attack, throw it at a creature within 15 feet (Dex save, DC 8 + Dex mod + proficiency bonus). On a failure the target has the Restrained condition until it escapes (DC 10 Strength (Athletics)) or the net is destroyed (AC 10, 5 HP)."],
  ["Paper", "2 sp", 0, "Adventuring gear", "One sheet, holding about 250 handwritten words."],
  ["Parchment", "1 sp", 0, "Adventuring gear", "One sheet, holding about 250 handwritten words."],
  ["Perfume", "5 gp", 0, "Adventuring gear", "A 4-ounce vial."],
  ["Pole", "5 cp", 7, "Adventuring gear", "10 feet long. Can touch something up to 10 feet away, and gives Advantage on Strength (Athletics) checks to Long or High Jump."],
  ["Pot, Iron", "2 gp", 10, "Adventuring gear", "Holds up to 1 gallon."],
  ["Pouch", "5 sp", 1, "Adventuring gear", "Holds up to 6 pounds within one-fifth of a cubic foot."],
  ["Quiver", "1 gp", 1, "Adventuring gear", "Holds up to 20 arrows."],
  ["Ram, Portable", "4 gp", 35, "Adventuring gear", "Gives a +4 bonus to Strength checks to break doors. Advantage if another creature helps."],
  ["Rations", "5 sp", 2, "Adventuring gear", "One day of travel-ready food: jerky, dried fruit, hardtack and nuts."],
  ["Robe", "1 gp", 4, "Adventuring gear", "Vocational or ceremonial significance. Some events and places admit only people wearing one bearing certain colors or symbols."],
  ["Rope", "1 gp", 5, "Adventuring gear", "50 feet. Tie a knot with a DC 10 Dexterity (Sleight of Hand) check; bursting it takes DC 20 Strength (Athletics). Can bind an unwilling creature (Escape DC 15)."],
  ["Sack", "1 cp", 0.5, "Adventuring gear", "Holds up to 30 pounds within 1 cubic foot."],
  ["Shovel", "2 gp", 5, "Adventuring gear", "Working for 1 hour, you can dig a hole 5 feet on each side in soil or similar material."],
  ["Signal Whistle", "5 cp", 0, "Adventuring gear", "When blown, it can be heard up to 600 feet away."],
  ["Spikes, Iron", "1 gp", 5, "Adventuring gear", "A bundle of 10. Hammer one into wood, earth or a similar material to jam a door shut or tie a rope or chain to it."],
  ["Spyglass", "1,000 gp", 1, "Adventuring gear", "Objects viewed through it are magnified to twice their size."],
  ["String", "1 sp", 0, "Adventuring gear", "10 feet long."],
  ["Tent", "2 gp", 20, "Adventuring gear", "Sleeps up to two Small or Medium creatures."],
  ["Tinderbox", "5 sp", 1, "Adventuring gear", "Flint, fire steel and tinder. Lights a torch or anything with exposed fuel as a Bonus Action; other fires take 1 minute."],
  ["Torch", "1 cp", 1, "Adventuring gear", "Burns for 1 hour: Bright Light in a 20-foot radius and Dim Light for 20 more feet. As a weapon it deals 1 fire damage."],
  ["Vial", "1 gp", 0, "Adventuring gear", "Holds up to 4 ounces."],
  ["Waterskin", "2 sp", 5, "Adventuring gear", "Holds up to 4 pints. Weighs 5 pounds when full."],
  ["Acid", "25 gp", 1, "Consumables", "As an attack, throw the vial up to 20 feet at a creature or object (Dex save, DC 8 + Dex mod + proficiency bonus). On a failure it takes 2d6 acid damage."],
  ["Alchemist's Fire", "50 gp", 1, "Consumables", "As an attack, throw the flask up to 20 feet (Dex save, DC 8 + Dex mod + proficiency bonus). On a failure the target takes 1d4 fire damage and starts burning."],
  ["Antitoxin", "50 gp", 0, "Consumables", "As a Bonus Action, drink it to gain Advantage on saves against the Poisoned condition for 1 hour."],
  ["Holy Water", "25 gp", 1, "Consumables", "As an attack, throw the flask up to 20 feet (Dex save, DC 8 + Dex mod + proficiency bonus). A Fiend or Undead that fails takes 2d8 radiant damage."],
  ["Oil", "1 sp", 1, "Consumables", "Fuel for a lamp or lantern. Thrown up to 20 feet, it covers a creature; if it then takes fire damage it takes 5 extra fire damage."],
  ["Poison, Basic", "100 gp", 0, "Consumables", "As a Bonus Action, coat one weapon or up to three pieces of ammunition. For 1 minute, a hit deals an extra 1d4 poison damage."],
  ["Potion of Healing", "50 gp", 0.5, "Consumables", "As a Bonus Action, drink it or give it to someone within 5 feet to regain 2d4 + 2 Hit Points."],
  ["Spell Scroll (Cantrip)", "30 gp", 0, "Consumables", "Holds one cantrip. If the spell is on your class's list, you can cast it from the scroll without components."],
  ["Spell Scroll (Level 1)", "50 gp", 0, "Consumables", "Holds one level 1 spell. If the spell is on your class's list, you can cast it from the scroll without components."],
  ["Arrows (20)", "1 gp", 1, "Ammunition", "Ammunition for bows. Stored in a quiver."],
  ["Bolts (20)", "1 gp", 1.5, "Ammunition", "Ammunition for crossbows. Stored in a case."],
  ["Firearm Bullets (10)", "3 gp", 2, "Ammunition", "Ammunition for muskets and pistols. Stored in a pouch."],
  ["Needles (50)", "1 gp", 1, "Ammunition", "Ammunition for blowguns. Stored in a pouch."],
  ["Sling Bullets (20)", "4 cp", 1.5, "Ammunition", "Ammunition for slings. Stored in a pouch."],
  ["Arcane Focus: Crystal", "10 gp", 1, "Spellcasting focus", "A Sorcerer, Warlock or Wizard can use it as a Spellcasting Focus."],
  ["Arcane Focus: Orb", "20 gp", 3, "Spellcasting focus", "A Sorcerer, Warlock or Wizard can use it as a Spellcasting Focus."],
  ["Arcane Focus: Rod", "10 gp", 2, "Spellcasting focus", "A Sorcerer, Warlock or Wizard can use it as a Spellcasting Focus."],
  ["Arcane Focus: Staff", "5 gp", 4, "Spellcasting focus", "A Sorcerer, Warlock or Wizard can use it as a Spellcasting Focus. Also works as a Quarterstaff."],
  ["Arcane Focus: Wand", "10 gp", 1, "Spellcasting focus", "A Sorcerer, Warlock or Wizard can use it as a Spellcasting Focus."],
  ["Druidic Focus: Sprig of Mistletoe", "1 gp", 0, "Spellcasting focus", "A Druid or Ranger can use it as a Spellcasting Focus."],
  ["Druidic Focus: Wooden Staff", "5 gp", 4, "Spellcasting focus", "A Druid or Ranger can use it as a Spellcasting Focus. Also works as a Quarterstaff."],
  ["Druidic Focus: Yew Wand", "10 gp", 1, "Spellcasting focus", "A Druid or Ranger can use it as a Spellcasting Focus."],
  ["Holy Symbol: Amulet", "5 gp", 1, "Spellcasting focus", "A Cleric or Paladin can use it as a Spellcasting Focus. Worn or held."],
  ["Holy Symbol: Emblem", "5 gp", 0, "Spellcasting focus", "A Cleric or Paladin can use it as a Spellcasting Focus. Borne on fabric or a Shield."],
  ["Holy Symbol: Reliquary", "5 gp", 2, "Spellcasting focus", "A Cleric or Paladin can use it as a Spellcasting Focus. Held."],
  ["Burglar's Pack", "16 gp", 42, "Equipment packs", "Backpack, Ball Bearings, Bell, 10 Candles, Crowbar, Hooded Lantern, 7 flasks of Oil, 5 days of Rations, Rope, Tinderbox and Waterskin."],
  ["Diplomat's Pack", "39 gp", 39, "Equipment packs", "Chest, Fine Clothes, Ink, 5 Ink Pens, Lamp, 2 Map or Scroll Cases, 4 flasks of Oil, 5 sheets of Paper, 5 sheets of Parchment, Perfume and Tinderbox."],
  ["Dungeoneer's Pack", "12 gp", 55, "Equipment packs", "Backpack, Caltrops, Crowbar, 2 flasks of Oil, 10 days of Rations, Rope, Tinderbox, 10 Torches and Waterskin."],
  ["Entertainer's Pack", "40 gp", 58, "Equipment packs", "Backpack, Bedroll, Bell, Bullseye Lantern, 3 Costumes, Mirror, 8 flasks of Oil, 9 days of Rations, Tinderbox and Waterskin."],
  ["Explorer's Pack", "10 gp", 55, "Equipment packs", "Backpack, Bedroll, 2 flasks of Oil, 10 days of Rations, Rope, Tinderbox, 10 Torches and Waterskin."],
  ["Priest's Pack", "33 gp", 29, "Equipment packs", "Backpack, Blanket, Holy Water, Lamp, 7 days of Rations, Robe and Tinderbox."],
  ["Scholar's Pack", "40 gp", 22, "Equipment packs", "Backpack, Book, Ink, Ink Pen, Lamp, 10 flasks of Oil, 10 sheets of Parchment and Tinderbox."],
  ["Alchemist's Supplies", "50 gp", 8, "Tools", "Ability: Intelligence. Identify a substance (DC 15) or start a fire (DC 15). Craft Acid, Alchemist's Fire, Component Pouch, Oil, Paper, Perfume."],
  ["Brewer's Supplies", "20 gp", 9, "Tools", "Ability: Intelligence. Detect poisoned drink (DC 15) or identify alcohol (DC 10). Craft Antitoxin."],
  ["Calligrapher's Supplies", "10 gp", 5, "Tools", "Ability: Dexterity. Write text with impressive flourishes that guard against forgery (DC 15). Craft Ink, Spell Scroll."],
  ["Carpenter's Tools", "8 gp", 6, "Tools", "Ability: Strength. Seal or pry open a door or container (DC 20). Craft Club, Greatclub, Quarterstaff, Barrel, Chest, Ladder, Pole, Portable Ram, Torch."],
  ["Cartographer's Tools", "15 gp", 6, "Tools", "Ability: Wisdom. Draft a map of a small area (DC 15). Craft Map."],
  ["Cobbler's Tools", "5 gp", 5, "Tools", "Ability: Dexterity. Modify footwear to give Advantage on your next Dexterity (Acrobatics) check (DC 10). Craft Climber's Kit."],
  ["Cook's Utensils", "1 gp", 8, "Tools", "Ability: Wisdom. Improve food's flavor (DC 10) or detect spoiled or poisoned food (DC 15). Craft Rations."],
  ["Glassblower's Tools", "30 gp", 5, "Tools", "Ability: Intelligence. Discern what a glass object held in the past 24 hours (DC 15). Craft Glass Bottle, Magnifying Glass, Spyglass, Vial."],
  ["Jeweler's Tools", "25 gp", 2, "Tools", "Ability: Intelligence. Discern a gem's value (DC 15). Craft Arcane Focus, Holy Symbol."],
  ["Leatherworker's Tools", "5 gp", 5, "Tools", "Ability: Dexterity. Add a design to a leather item (DC 10). Craft Sling, Whip, Hide Armor, Leather Armor, Studded Leather Armor, Backpack, Crossbow Bolt Case, Map or Scroll Case, Parchment, Pouch, Quiver, Waterskin."],
  ["Mason's Tools", "10 gp", 8, "Tools", "Ability: Strength. Chisel a symbol or hole in stone (DC 10). Craft Block and Tackle."],
  ["Painter's Supplies", "10 gp", 5, "Tools", "Ability: Wisdom. Paint a recognizable image of something you've seen (DC 10). Craft Druidic Focus, Holy Symbol."],
  ["Potter's Tools", "10 gp", 3, "Tools", "Ability: Intelligence. Discern what a ceramic object held in the past 24 hours (DC 15). Craft Jug, Lamp."],
  ["Smith's Tools", "20 gp", 8, "Tools", "Ability: Strength. Pry open a door or container (DC 20). Craft any Melee weapon (except Club, Greatclub, Quarterstaff and Whip), Medium and Heavy armor, Ball Bearings, Bucket, Caltrops, Chain, Crowbar, Firearm Bullets, Grappling Hook, Iron Pot, Iron Spikes, Sling Bullets."],
  ["Tinker's Tools", "50 gp", 10, "Tools", "Ability: Dexterity. Assemble a Tiny item from scrap, which falls apart in 1 minute (DC 20). Craft Musket, Pistol, Bell, Bullseye Lantern, Flask, Hooded Lantern, Hunting Trap, Lock, Manacles, Mirror, Shovel, Signal Whistle, Tinderbox."],
  ["Weaver's Tools", "1 gp", 5, "Tools", "Ability: Dexterity. Mend a tear in clothing (DC 10) or sew a Tiny design (DC 10). Craft Padded Armor, Basket, Bedroll, Blanket, Fine Clothes, Net, Robe, Rope, Sack, String, Tent, Traveler's Clothes."],
  ["Woodcarver's Tools", "1 gp", 5, "Tools", "Ability: Dexterity. Carve a pattern in wood (DC 10). Craft Club, Greatclub, Quarterstaff, ranged weapons (except Pistol, Musket and Sling), Arcane Focus, Arrows, Bolts, Druidic Focus, Ink Pen, Needles."],
  ["Disguise Kit", "25 gp", 3, "Tools", "Ability: Charisma. Apply makeup (DC 10). Craft Costume."],
  ["Forgery Kit", "15 gp", 5, "Tools", "Ability: Dexterity. Mimic 10 or fewer words of someone else's handwriting (DC 15) or duplicate a wax seal (DC 20)."],
  ["Herbalism Kit", "5 gp", 3, "Tools", "Ability: Intelligence. Identify a plant (DC 10). Craft Antitoxin, Candle, Healer's Kit, Potion of Healing."],
  ["Navigator's Tools", "25 gp", 2, "Tools", "Ability: Wisdom. Plot a course (DC 10) or determine position by stargazing (DC 15)."],
  ["Poisoner's Kit", "50 gp", 2, "Tools", "Ability: Intelligence. Detect a poisoned object (DC 10). Craft Basic Poison."],
  ["Thieves' Tools", "25 gp", 1, "Tools", "Ability: Dexterity. Pick a lock (DC 15) or disarm a trap (DC 15)."],
  ["Bagpipes", "30 gp", 6, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Drum", "6 gp", 3, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Dulcimer", "25 gp", 10, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Flute", "2 gp", 1, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Horn", "3 gp", 2, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Lute", "35 gp", 2, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Lyre", "30 gp", 2, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Pan Flute", "12 gp", 2, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Shawm", "2 gp", 1, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Viol", "30 gp", 1, "Musical instruments", "Ability: Charisma. Play a known tune (DC 10) or improvise a song (DC 15)."],
  ["Dice Set", "1 sp", 0, "Gaming sets", "Ability: Wisdom. Discern whether someone is cheating (DC 10) or win the game (DC 20)."],
  ["Dragonchess Set", "1 gp", 0, "Gaming sets", "Ability: Wisdom. Discern whether someone is cheating (DC 10) or win the game (DC 20)."],
  ["Playing Card Set", "5 sp", 0, "Gaming sets", "Ability: Wisdom. Discern whether someone is cheating (DC 10) or win the game (DC 20)."],
  ["Three-Dragon Ante Set", "1 gp", 0, "Gaming sets", "Ability: Wisdom. Discern whether someone is cheating (DC 10) or win the game (DC 20)."]];

const CONDITIONS = ["Blinded", "Charmed", "Deafened", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"];
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
// Species that ask for a lineage or ancestry in the builder, and what the choice is called.
const LINEAGES = {
  Dragonborn: ["Black", "Blue", "Brass", "Bronze", "Copper", "Gold", "Green", "Red", "Silver", "White"],
  Elf: ["Drow", "High Elf", "Wood Elf"], Gnome: ["Forest Gnome", "Rock Gnome"], Goliath: ["Cloud", "Fire", "Frost", "Hill", "Stone", "Storm"],
  Tiefling: ["Abyssal", "Chthonic", "Infernal"]
};
const LINEAGE_LABEL = { Dragonborn: "Draconic ancestry", Goliath: "Giant ancestry" };
const ORIGIN_FEATS = ["Alert", "Magic Initiate", "Savage Attacker", "Skilled"];
// Proficiencies a class gives when you multiclass into it (2024 rules). skills: how many, from: which list ("any" or the class list).
const MC_PROFS = {
  Barbarian: { armor: "Shields", weapons: "Martial weapons" },
  Bard: { armor: "Light armor", skills: 1, from: "any", tools: "instrument" },
  Cleric: { armor: "Light and medium armor; shields" },
  Druid: { armor: "Light armor; shields" },
  Fighter: { armor: "Light and medium armor; shields", weapons: "Martial weapons" },
  Monk: {},
  Paladin: { armor: "Light and medium armor; shields", weapons: "Martial weapons" },
  Ranger: { armor: "Light and medium armor; shields", weapons: "Martial weapons", skills: 1, from: "class" },
  Rogue: { armor: "Light armor", skills: 1, from: "class", tool: "Thieves' Tools" },
  Sorcerer: {},
  Warlock: { armor: "Light armor" },
  Wizard: {}
};
// Tools a class always gives at level 1 (not when multiclassing, except Rogue's, which MC_PROFS covers).
const CLASS_TOOLS = { Druid: ["Herbalism Kit"], Rogue: ["Thieves' Tools"] };
// Languages a class teaches you.
const CLASS_LANGS = { Druid: ["Druidic"], Rogue: ["Thieves' Cant"] };
const LANGUAGES = ["Common Sign Language", "Draconic", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc"];
const RARE_LANGUAGES = ["Abyssal", "Celestial", "Deep Speech", "Druidic", "Infernal", "Primordial", "Sylvan", "Thieves' Cant", "Undercommon"];
const ALIGNMENTS = ["Lawful Good", "Neutral Good", "Chaotic Good", "Lawful Neutral", "Neutral", "Chaotic Neutral", "Lawful Evil", "Neutral Evil", "Chaotic Evil", "Unaligned"];
const ARTISAN_TOOLS = ["Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools",
  "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools"];
const INSTRUMENTS = ["Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan Flute", "Shawm", "Viol"];
const GAMING_SETS = ["Dice Set", "Dragonchess Set", "Playing Card Set", "Three-Dragon Ante Set"];
// [name, warlock level needed, summary]
const INVOCATIONS = [
  ["Armor of Shadows", 1, "Cast Mage Armor on yourself without a spell slot."], ["Eldritch Mind", 1, "Advantage on Constitution saves to keep Concentration."],
  ["Pact of the Blade", 1, "Bonus action: conjure or bond a pact weapon; use Charisma for its attacks and deal necrotic, psychic or radiant damage."],
  ["Pact of the Chain", 1, "Find Familiar with special forms (imp, pseudodragon, quasit, skeleton, slaad tadpole, sphinx of wonder, sprite, venomous snake)."],
  ["Pact of the Tome", 1, "A Book of Shadows with three cantrips and two ritual level 1 spells from any class, always prepared."],
  ["Agonizing Blast", 2, "Add your Charisma modifier to the damage of one Warlock damage cantrip."], ["Devil's Sight", 2, "See normally in magical and nonmagical darkness within 120 feet."],
  ["Eldritch Spear", 2, "One Warlock damage cantrip with 10+ ft range reaches 30 × warlock level feet farther."], ["Fiendish Vigor", 2, "Cast False Life on yourself without a slot, taking the maximum temp HP."],
  ["Lessons of the First Ones", 2, "Gain one Origin feat."], ["Mask of Many Faces", 2, "Cast Disguise Self without a spell slot."], ["Misty Visions", 2, "Cast Silent Image without a spell slot."],
  ["Otherworldly Leap", 2, "Cast Jump on yourself without a spell slot."], ["Repelling Blast", 2, "When a Warlock cantrip hits a Large or smaller creature, push it up to 10 feet."],
  ["Ascendant Step", 5, "Cast Levitate on yourself without a spell slot."], ["Eldritch Smite", 5, "Pact of the Blade: spend a Pact slot on a hit for +1d8 force per slot level plus 1d8, and knock the target Prone."],
  ["Gaze of Two Minds", 5, "Bonus action: perceive through a willing creature's senses."], ["Gift of the Depths", 5, "Breathe underwater, swim speed equal to your speed, Water Breathing once per Long Rest."],
  ["Investment of the Chain Master", 5, "Pact of the Chain: your familiar gets a fly or swim speed, a bonus-action attack, your save DC and resistance when you take damage."],
  ["Master of Myriad Forms", 5, "Cast Alter Self without a spell slot."], ["One with Shadows", 5, "While in dim light or darkness, cast Invisibility on yourself without a slot."],
  ["Thirsting Blade", 5, "Pact of the Blade: attack twice with your pact weapon when you take the Attack action."],
  ["Whispers of the Grave", 7, "Cast Speak with Dead without a spell slot."], ["Gift of the Protectors", 9, "Pact of the Tome: names in your book drop to 1 HP instead of 0, once per Long Rest."],
  ["Lifedrinker", 9, "Pact of the Blade: +1d6 necrotic, psychic or radiant on a hit, and spend a Hit Die to heal."], ["Visions of Distant Realms", 9, "Cast Arcane Eye without a spell slot."],
  ["Devouring Blade", 12, "Thirsting Blade gives you two extra attacks."], ["Witch Sight", 15, "Truesight 30 feet."]];
const METAMAGIC = [
  ["Careful Spell", 1, "1 point: chosen creatures automatically succeed on the spell's save and take no damage on a success."], ["Distant Spell", 1, "1 point: double the range, or touch becomes 30 ft."],
  ["Empowered Spell", 1, "1 point: reroll up to your Cha modifier in damage dice."], ["Extended Spell", 1, "1 point: double the duration (max 24 hours); advantage on its Concentration saves."],
  ["Heightened Spell", 1, "2 points: one target has disadvantage on its first save against the spell."], ["Quickened Spell", 1, "2 points: cast an Action spell as a Bonus Action."],
  ["Seeking Spell", 1, "1 point: reroll a missed spell attack."], ["Subtle Spell", 1, "1 point: no Verbal, Somatic or Material (without cost) components."],
  ["Transmuted Spell", 1, "1 point: change the damage type to acid, cold, fire, lightning, poison or thunder."], ["Twinned Spell", 1, "1 point: a single-target spell that could be upcast targets one more creature."]];
// Choices a class asks for as you level. key: what it's called; kind decides the picker:
//   pick (one of from), feat (a Fighting Style feat), expertise (n of your skills), skill (n of from), lang (n languages),
//   tool (n of a tool list), mastery (count[lv] weapon kinds), list (count[lv] of INVOCATIONS or METAMAGIC).
// start: only for the class you start with; mc: only when you multiclass into it.
const lvls = (...pairs) => Array.from({ length: 20 }, (_, i) => { let v = 0; for (const [l, n] of pairs) if (i + 1 >= l) v = n; return v; });
const CLASS_CHOICES = {
  Barbarian: [{ at: 1, key: "Weapon Mastery", kind: "mastery", count: lvls([1, 2], [4, 3], [10, 4]), weapons: "melee" },
    { at: 3, key: "Primal Knowledge", kind: "skill", n: 1, from: "class" }],
  Bard: [{ at: 1, key: "Musical instruments", kind: "tool", n: 3, from: "instrument", start: true }, { at: 1, key: "Multiclass skill", kind: "skill", n: 1, from: "any", mc: true },
    { at: 1, key: "Multiclass instrument", kind: "tool", n: 1, from: "instrument", mc: true },
    { at: 2, key: "Expertise", kind: "expertise", n: 2 }, { at: 9, key: "Expertise (level 9)", kind: "expertise", n: 2 }],
  Cleric: [{ at: 1, key: "Divine Order", kind: "pick", from: [["Protector", "Training with Martial weapons and Heavy armor."], ["Thaumaturge", "One extra Cleric cantrip, and add your Wisdom modifier (min +1) to Arcana and Religion checks."]] },
    { at: 7, key: "Blessed Strikes", kind: "pick", from: [["Divine Strike", "Once per turn, a weapon hit deals +1d8 necrotic or radiant (2d8 at level 14)."], ["Potent Spellcasting", "Add your Wisdom modifier to Cleric cantrip damage."]] }],
  Druid: [{ at: 1, key: "Primal Order", kind: "pick", from: [["Magician", "One extra Druid cantrip, and add your Wisdom modifier (min +1) to Arcana and Nature checks."], ["Warden", "Training with Martial weapons and Medium armor."]] },
    { at: 7, key: "Elemental Fury", kind: "pick", from: [["Potent Spellcasting", "Add your Wisdom modifier to Druid cantrip damage."], ["Primal Strike", "Once per turn, a weapon or Wild Shape hit deals +1d8 cold, fire, lightning or thunder (2d8 at level 15)."]] }],
  Fighter: [{ at: 1, key: "Fighting Style", kind: "feat" }, { at: 1, key: "Weapon Mastery", kind: "mastery", count: lvls([1, 3], [4, 4], [10, 5], [16, 6]), weapons: "all" }],
  Monk: [{ at: 1, key: "Tool or instrument", kind: "tool", n: 1, from: "artisanOrInstrument", start: true }],
  Paladin: [{ at: 1, key: "Weapon Mastery", kind: "mastery", count: lvls([1, 2]), weapons: "all" }, { at: 2, key: "Fighting Style", kind: "feat" }],
  Ranger: [{ at: 1, key: "Weapon Mastery", kind: "mastery", count: lvls([1, 2]), weapons: "all" }, { at: 1, key: "Multiclass skill", kind: "skill", n: 1, from: "class", mc: true },
    { at: 2, key: "Deft Explorer", kind: "expertise", n: 1 }, { at: 2, key: "Deft Explorer languages", kind: "lang", n: 2 }, { at: 2, key: "Fighting Style", kind: "feat" },
    { at: 9, key: "Expertise", kind: "expertise", n: 2 }],
  Rogue: [{ at: 1, key: "Expertise", kind: "expertise", n: 2 }, { at: 1, key: "Thieves' Cant language", kind: "lang", n: 1 }, { at: 1, key: "Multiclass skill", kind: "skill", n: 1, from: "class", mc: true },
    { at: 1, key: "Weapon Mastery", kind: "mastery", count: lvls([1, 2]), weapons: "rogue" }, { at: 6, key: "Expertise (level 6)", kind: "expertise", n: 2 }],
  Sorcerer: [{ at: 2, key: "Metamagic", kind: "list", from: "metamagic", count: lvls([2, 2], [10, 4], [17, 6]) }],
  Warlock: [{ at: 1, key: "Eldritch Invocations", kind: "list", from: "invocations", count: lvls([1, 1], [2, 3], [5, 5], [7, 6], [9, 7], [12, 8], [15, 9], [18, 10]) }],
  Wizard: [{ at: 2, key: "Scholar", kind: "expertise", n: 1, from: ["Arcana", "History", "Investigation", "Medicine", "Nature", "Religion"] }]
};
// Starting equipment (option A, and B for Fighter). Option "gold only" is the class's gold. [name, how many]
const START_GEAR = {
  Barbarian: [{ items: [["Greataxe"], ["Handaxe", 4], ["Explorer's Pack"]], gp: 15 }],
  Bard: [{ items: [["Leather Armor"], ["Dagger", 2], ["Musical instrument"], ["Entertainer's Pack"]], gp: 19 }],
  Cleric: [{ items: [["Chain Shirt"], ["Shield"], ["Mace"], ["Holy Symbol: Amulet"], ["Priest's Pack"]], gp: 7 }],
  Druid: [{ items: [["Leather Armor"], ["Shield"], ["Sickle"], ["Druidic Focus: Wooden Staff"], ["Explorer's Pack"], ["Herbalism Kit"]], gp: 9 }],
  Fighter: [{ label: "Heavy armor and great weapon", items: [["Chain Mail"], ["Greatsword"], ["Flail"], ["Javelin", 8], ["Dungeoneer's Pack"]], gp: 4 },
    { label: "Light armor and bow", items: [["Studded Leather Armor"], ["Scimitar"], ["Shortsword"], ["Longbow"], ["Arrows (20)"], ["Quiver"], ["Dungeoneer's Pack"]], gp: 11 }],
  Monk: [{ items: [["Spear"], ["Dagger", 5], ["Artisan's tools or instrument"], ["Explorer's Pack"]], gp: 11 }],
  Paladin: [{ items: [["Chain Mail"], ["Shield"], ["Longsword"], ["Javelin", 6], ["Holy Symbol: Amulet"], ["Priest's Pack"]], gp: 9 }],
  Ranger: [{ items: [["Studded Leather Armor"], ["Scimitar"], ["Shortsword"], ["Longbow"], ["Arrows (20)"], ["Quiver"], ["Druidic Focus: Sprig of Mistletoe"], ["Explorer's Pack"]], gp: 7 }],
  Rogue: [{ items: [["Leather Armor"], ["Dagger", 2], ["Shortsword"], ["Shortbow"], ["Arrows (20)"], ["Quiver"], ["Thieves' Tools"], ["Burglar's Pack"]], gp: 8 }],
  Sorcerer: [{ items: [["Spear"], ["Dagger", 2], ["Arcane Focus: Crystal"], ["Dungeoneer's Pack"]], gp: 28 }],
  Warlock: [{ items: [["Leather Armor"], ["Sickle"], ["Dagger", 2], ["Arcane Focus: Orb"], ["Book"], ["Scholar's Pack"]], gp: 15 }],
  Wizard: [{ items: [["Dagger", 2], ["Arcane Focus: Staff"], ["Robe"], ["Spellbook"], ["Scholar's Pack"]], gp: 5 }]
};
const BG_GEAR = {
  Acolyte: { items: [["Calligrapher's Supplies"], ["Book"], ["Holy Symbol: Amulet"], ["Parchment", 10], ["Robe"]], gp: 8 },
  Criminal: { items: [["Dagger", 2], ["Thieves' Tools"], ["Crowbar"], ["Pouch", 2], ["Clothes, Traveler's"]], gp: 16 },
  Sage: { items: [["Quarterstaff"], ["Calligrapher's Supplies"], ["Book"], ["Parchment", 8], ["Robe"]], gp: 8 },
  Soldier: { items: [["Spear"], ["Shortbow"], ["Arrows (20)"], ["Gaming set"], ["Healer's Kit"], ["Quiver"], ["Clothes, Traveler's"]], gp: 14 }
};
// Spells a species or lineage gives: [spell, spell level, character level].
const SPECIES_SPELLS = {
  Drow: [["Dancing Lights", 0, 1], ["Faerie Fire", 1, 3], ["Darkness", 2, 5]], "High Elf": [["Prestidigitation", 0, 1], ["Detect Magic", 1, 3], ["Misty Step", 2, 5]],
  "Wood Elf": [["Druidcraft", 0, 1], ["Longstrider", 1, 3], ["Pass without Trace", 2, 5]], "Forest Gnome": [["Minor Illusion", 0, 1], ["Speak with Animals", 1, 1]],
  "Rock Gnome": [["Mending", 0, 1], ["Prestidigitation", 0, 1]], Tiefling: [["Thaumaturgy", 0, 1]],
  Abyssal: [["Poison Spray", 0, 1], ["Ray of Sickness", 1, 3], ["Hold Person", 2, 5]], Chthonic: [["Chill Touch", 0, 1], ["False Life", 1, 3], ["Ray of Enfeeblement", 2, 5]],
  Infernal: [["Fire Bolt", 0, 1], ["Hellish Rebuke", 1, 3], ["Darkness", 2, 5]]
};
// Filled from the campaign's content library (the DM's books) at run time; see Engine.useContent.
const SUBCLASSES = {};
const SPELLS = [];
const ITEMS = [];
const FEATURES = [];
const SOURCE = {};
const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

g.SRD = { ABILS, ABIL_NAME, SKILLS, ALL_SKILLS, SPECIES, FEATS, BACKGROUNDS, CLASSES, FULL_SLOTS, PACT, SPELLCASTING, SUB_CASTERS, ARMOR, WEAPONS, GEAR, CONDITIONS, STANDARD_ARRAY, POINT_COST,
  LINEAGES, LINEAGE_LABEL, ORIGIN_FEATS, SUBCLASSES, SPELLS, ITEMS, FEATURES, SOURCE,
  MC_PROFS, CLASS_TOOLS, CLASS_LANGS, LANGUAGES, RARE_LANGUAGES, ALIGNMENTS, ARTISAN_TOOLS, INSTRUMENTS, GAMING_SETS, INVOCATIONS, METAMAGIC, CLASS_CHOICES, START_GEAR, BG_GEAR, SPECIES_SPELLS };
})(typeof window !== "undefined" ? window : globalThis);
