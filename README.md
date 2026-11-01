# Ebon Star Companion (player app prototype)

A phone app for your players' characters that is connected to your campaign. Players build and level 5e characters (2024 rules, SRD 5.2 content). You see every sheet live and can send items, custom features and skills, spells, coins, XP, and level-ups straight to their phones.

It's an installable web app (PWA). Players open a link and tap **Add to Home Screen**, and it then opens full screen like any other app. There's no App Store involved.

## Try it now (demo mode, no account)

The quickest way is the published demo at https://claude.ai/artifact/WKw16SGHbU2i9WesVzTcMg. Tap **Load sample** to see the DM view with an example character. To rebuild that demo after making changes, run `python3 tools/make-artifact.py <out.html>` and republish it.

To run it locally:

Demo mode keeps everything in one browser, and each tab acts as a different person.

1. Serve the folder: `python3 -m http.server 8000` inside `player-app/`, then open `http://localhost:8000/?demo`.
2. In tab 1, click **Create campaign as DM** and note the code.
3. In tab 2, open the same address and join with the code. Build a character.
4. Back in tab 1, you'll see the character appear. Tap **Send** to give them an item, feature, spell, coins, XP or a level-up. It pops up in tab 2's inbox right away.

## Going live (about 15 minutes, free)

### 1. Supabase (database, sign-in, and live sync)
1. Create a free account at supabase.com, then create a **New project**. Any name works; pick a region near you.
2. Go to **SQL Editor > New query**, paste all of `supabase/schema.sql`, and click **Run**.
3. Go to **Authentication > Sign In / Providers** and turn on **Allow anonymous sign-ins**. Players don't need an email or password; their phone remembers them.
4. Go to **Project Settings > API** and copy the **Project URL** and the **anon public** key into `config.js`.

The anon key is meant to be public. The rules in `schema.sql` are what protect the data:
- Players can see and edit only their own characters.
- You (the DM) can see and edit every character in your campaign, and only you can send things.
- Your homebrew library is visible only to you.

### 2. Hosting
The app is a folder of static files, so any static host works. The easiest options:
- **Netlify Drop** (app.netlify.com/drop): drag the `player-app` folder onto the page, and you get a link immediately.
- **Cloudflare Pages** or **GitHub Pages**: also free, and better if you'll update the app often.

Phones require HTTPS to install the app, and all three of these hosts provide it.

### 3. Invite players
Open the app, create your campaign, and tap **Copy invite link**. The link fills in the join code automatically. On iPhone, players use Safari > Share > **Add to Home Screen**. On Android, Chrome offers **Install app**.

## What's in the prototype

**Players**
- A step-by-step builder: class, background (with the 2024 +2/+1 or +1/+1/+1 ability increases), species and lineage, abilities (standard array, point buy, or rolled), and skills. It covers all 12 SRD classes, 9 species, and 4 backgrounds.
- A phone sheet that does the math for you:
  - Combat basics: HP with damage, healing, and temp HP; AC from equipped armor, shields, magic bonuses, and Unarmored Defense; initiative; speed; saves; and skills with proficiency and expertise.
  - Tracking: attacks from equipped weapons with mastery properties, spell slots (including half casters and Warlock pact slots), and class resources such as Rage, Second Wind, Focus, and Sorcery Points.
  - Condition and rest tracking: death saves, conditions, short and long rests, Exhaustion 0 to 6 (2024 rules), and your Stress 0 to 4 house rule.
- Level-ups from 1 to 20: roll or average HP, pick a subclass at 3 (the SRD option or a custom one), and take ASIs or feats. Leveling can be triggered by XP or by a milestone you send.
- Custom features and skills, with optional limited uses that reset on a short rest, long rest, or dawn. Players can also add custom items and spells.
- An inbox for things the DM sends, with Accept and Decline.

**DM**
- A live party board showing HP bars, AC, passive Perception, initiative, conditions, Exhaustion, Stress, and anyone who is down.
- Any character's full sheet, which you can open and edit (for example, applying damage).
- **Send** to one player or everyone: items (rarity, attunement, +attack, +AC), custom features with uses, spells, coins, XP, and level-ups.
- A homebrew library to reuse anything you've sent, plus **Import from DM Suite**, which pulls the magic items from your `.dmcampaign` file.
- A history of sent things showing whether each was accepted or declined.

## Not yet (next stages)
- The full SRD spell list to pick from (players can type in spells or you can send them for now), and starting equipment packages.
- Subclass feature text beyond level 3, and multiclassing.
- A Party tab inside the DM Suite desktop app. Right now the DM side lives in this app.
- Linking an email so a player can move their character to a new phone. Anonymous sign-in is tied to the device.

## Session notes
Players press **Session notes** (top right) to write notes on the session being played, or on any earlier one if they remember something later. They can edit or delete their own notes. Only the player and the DM see a note.

The DM Suite decides which sessions exist: it publishes the played sessions and the one you've started with **Start session**, and it copies every note into the campaign file's session log. See the DM Screen README for that side.

Needs `supabase/fix-04-session-notes.sql` run once in the Supabase SQL Editor. Until then the button stays hidden. In demo mode every campaign gets a live "Session 1" to try it with.

## Moving a character to a new phone
A player's phone remembers them, so a new phone or cleared browser data makes them a new person. To give them their character back:
1. They open the Companion on the new device and join again with the campaign code.
2. You open their character, go to the **Notes** tab, and press **Move to another player**. Pick their new entry.

Needs `supabase/fix-03-move-character.sql` run once in the Supabase SQL Editor.

## Files
- `index.html`: the app (player and DM views)
- `srd.js`: rules data from SRD 5.2 (CC-BY-4.0)
- `engine.js`: the character math, level-ups, and applying DM grants (no UI, so it's testable in Node)
- `backend.js`: Supabase and demo storage with live sync
- `config.js`: your Supabase URL and key
- `supabase/schema.sql`: tables, security rules, and live-sync setup
- `sw.js`, `manifest.webmanifest`, `icon-*.png`: what makes it installable and work offline

## Legal
This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
