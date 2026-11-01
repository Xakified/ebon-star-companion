// Campaign save files: one JSON file per campaign, written atomically, with rolling backups beside it.
// Plain Node (no Electron) so it can be tested on its own.
const fs = require("fs");
const path = require("path");

const FORMAT = "ebon-dm-campaign";
const EXT = ".dmcampaign";
const BACKUP_EVERY_MS = 10 * 60 * 1000; // at most one backup copy per 10 minutes of editing
const KEEP_RECENT = 40;                 // newest backups always kept
const KEEP_DAILY_DAYS = 90;             // plus the last copy of each day for this many days

function emptyCampaign(name) {
  return { format: FORMAT, version: 1, name, created: Date.now(), savedAt: null, pages: {}, sessions: {}, items: {}, table: null, ui: {} };
}

function validate(obj) {
  if (!obj || typeof obj !== "object" || obj.format !== FORMAT) throw new Error("This file isn't a DM Screen campaign.");
  for (const k of ["pages", "sessions", "items"]) if (!obj[k] || typeof obj[k] !== "object") obj[k] = {};
  if (!obj.ui || typeof obj.ui !== "object") obj.ui = {};
  if (obj.table === undefined) obj.table = null;
  return obj;
}

function read(file) {
  return validate(JSON.parse(fs.readFileSync(file, "utf8")));
}

function backupDir(file) {
  return path.join(path.dirname(file), path.basename(file, EXT) + " backups");
}

function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Copy the file as it is on disk into the backups folder, then prune.
function backup(file, reason = "") {
  if (!fs.existsSync(file)) return null;
  const dir = backupDir(file);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${path.basename(file, EXT)} ${stamp()}${reason ? " " + reason : ""}${EXT}`);
  fs.copyFileSync(file, dest);
  prune(dir);
  return dest;
}

function prune(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith(EXT)).map(f => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
  const keep = new Set(files.slice(0, KEEP_RECENT).map(x => x.f));
  const seenDay = new Set(), cutoff = Date.now() - KEEP_DAILY_DAYS * 864e5;
  for (const x of files) {
    const day = new Date(x.t).toDateString();
    if (x.t >= cutoff && !seenDay.has(day)) { seenDay.add(day); keep.add(x.f); }
  }
  for (const x of files) if (!keep.has(x.f)) fs.rmSync(path.join(dir, x.f), { force: true });
}

// Atomic write: a crash mid-save leaves the previous file intact.
function write(file, camp) {
  camp.savedAt = Date.now();
  const tmp = file + ".saving";
  const fd = fs.openSync(tmp, "w");
  try { fs.writeSync(fd, JSON.stringify(camp)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

/* ---------- two computers, one file ----------
   The campaign file can sit in a synced folder (OneDrive, Dropbox, Google Drive) and be open on two computers.
   Each open campaign remembers the file as it last read or wrote it (the base). When the file changes underneath it,
   the other computer's edits are merged in instead of being overwritten: per lore page, session and item, and per
   section for everything else. Where both computers changed the same thing, this computer's version wins and the
   other one is kept as a backup. */
const DOC_COLS = ["pages", "sessions", "items"];
const SKIP = new Set(["savedAt", "savedBy"]);
const J = v => (v === undefined ? undefined : JSON.stringify(v));
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

// Three-way pick: keep whichever side changed; if both did differently, keep ours and report it.
function pick(b, o, t, conflicts, label) {
  const sb = J(b), so = J(o), st = J(t);
  if (so === st || so === sb) return t;
  if (st === sb) return o;
  conflicts.push(label);
  return o;
}

// base = the file as this computer last saw it, ours = this computer now, theirs = the file now.
// Pass base {} to merge two copies with no common ancestor (everything only one side has is kept).
function merge(base, ours, theirs) {
  base = base || {};
  const out = {}, conflicts = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    let v;
    if (DOC_COLS.includes(k)) {
      const b = base[k] || {}, o = ours[k] || {}, t = theirs[k] || {};
      v = {};
      for (const id of new Set([...Object.keys(b), ...Object.keys(o), ...Object.keys(t)])) {
        const d = pick(b[id], o[id], t[id], conflicts, docLabel(k, id, o[id] || t[id]));
        if (d !== undefined) v[id] = d;
      }
    } else v = pick(base[k], ours[k], theirs[k], conflicts, SECTION[k] || k);
    if (v !== undefined) out[k] = clone(v);
  }
  out.savedAt = theirs.savedAt; out.savedBy = theirs.savedBy;
  return { camp: validate(out), conflicts };
}
const SECTION = { table: "the initiative tracker, loot and party", ui: "screen layout", companion: "the Companion link", name: "the campaign name" };
const COL_NAME = { pages: "lore page", sessions: "session", items: "item" };
function docLabel(col, id, d) {
  const n = d && (d.title || d.name);
  return `${COL_NAME[col] || col} "${n || id}"`;
}

// Which parts differ between two versions, so the page can update just those.
function changedParts(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(k => !SKIP.has(k) && J(a[k]) !== J(b[k]));
}

const sig = st => `${st.mtimeMs}:${st.size}`;
function stat(file) { try { return sig(fs.statSync(file)); } catch (e) { return null; } }

// Keeps one open campaign in memory and saves it after edits settle.
class OpenCampaign {
  constructor(file, camp, { delay = 1500, onSaved = () => {}, onError = () => {}, onExternal = () => {}, who = "" } = {}) {
    this.file = file; this.camp = camp; this.delay = delay;
    this.onSaved = onSaved; this.onError = onError; this.onExternal = onExternal; this.who = who;
    this.dirty = false; this.timer = null; this.lastBackup = 0;
    this.base = clone(camp); this.diskSig = stat(file);
  }
  touch() { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), this.delay); }

  // Pull in the file if another computer changed it. Returns what changed here, or null.
  sync() {
    const s = stat(this.file);
    if (!s || s === this.diskSig) return null;
    let theirs;
    try { theirs = read(this.file); } catch (e) { return null; } // half-synced: try again next time
    this.diskSig = s;
    if (theirs.savedAt && theirs.savedAt === this.base.savedAt && theirs.savedBy === this.base.savedBy) return null;
    const before = this.camp;
    const { camp, conflicts } = merge(this.base, before, theirs);
    let kept = null;
    if (conflicts.length) { try { kept = backup(this.file, "from other computer"); } catch (e) {} }
    this.camp = camp; this.base = theirs;
    // Anything of ours that the file doesn't have yet still needs saving.
    if (changedParts(camp, theirs).length) this.touch(); else { this.dirty = false; clearTimeout(this.timer); this.timer = null; }
    const info = { changed: changedParts(before, camp), conflicts, kept, by: theirs.savedBy || "" };
    this.onExternal(info);
    return info;
  }
  watch(ms = 2000) {
    this.unwatch();
    this.watcher = () => { try { this.sync(); } catch (e) {} };
    fs.watchFile(this.file, { interval: ms }, this.watcher);
  }
  unwatch() { if (this.watcher) fs.unwatchFile(this.file, this.watcher); this.watcher = null; }
  close() { this.save(); this.unwatch(); clearTimeout(this.timer); }

  save() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.dirty) return true;
    try {
      this.sync(); // never write over the other computer's newer save
      if (!this.dirty) return true;
      clearTimeout(this.timer); this.timer = null;
      if (Date.now() - this.lastBackup > BACKUP_EVERY_MS) { backup(this.file); this.lastBackup = Date.now(); }
      this.camp.savedBy = this.who;
      write(this.file, this.camp);
      this.base = clone(this.camp); this.diskSig = stat(this.file);
      this.dirty = false; this.onSaved(this);
      return true;
    } catch (e) { this.onError(e); return false; }
  }
  // Only real changes count, so a page re-saving the same thing doesn't bounce saves between computers.
  setDoc(col, id, data) { const c = (this.camp[col] ||= {}); if (J(c[id]) === J(data)) return; c[id] = data; this.touch(); }
  deleteDoc(col, id) { if (!this.camp[col] || !(id in this.camp[col])) return; delete this.camp[col][id]; this.touch(); }
  setTable(json) { try { const t = JSON.parse(json); if (J(t) === J(this.camp.table)) return; this.camp.table = t; this.touch(); } catch (e) {} }
  setUi(k, v) { if (J(this.camp.ui[k]) === J(v)) return; this.camp.ui[k] = v; this.touch(); }
}

// Copies a sync service made when both computers saved at once, e.g. "Ebon Star-LAPTOP.dmcampaign" (OneDrive)
// or "Ebon Star (Xak's conflicted copy 2026-11-01).dmcampaign" (Dropbox).
function conflictCopies(file) {
  const dir = path.dirname(file), base = path.basename(file, EXT).toLowerCase();
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return []; }
  return names.filter(n => {
    if (!n.toLowerCase().endsWith(EXT)) return false;
    const stem = n.slice(0, -EXT.length).toLowerCase();
    if (stem === base || !stem.startsWith(base)) return false;
    const rest = stem.slice(base.length);
    return /^-[^ ]+$/.test(rest) || /conflict/.test(rest) || /^ \(\d+\)$/.test(rest);
  }).map(n => path.join(dir, n));
}

module.exports = { FORMAT, EXT, emptyCampaign, read, write, backup, backupDir, prune, validate, merge, changedParts, conflictCopies, OpenCampaign };
