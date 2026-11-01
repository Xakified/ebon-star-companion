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

// Keeps one open campaign in memory and saves it after edits settle.
class OpenCampaign {
  constructor(file, camp, { delay = 1500, onSaved = () => {}, onError = () => {} } = {}) {
    this.file = file; this.camp = camp; this.delay = delay;
    this.onSaved = onSaved; this.onError = onError;
    this.dirty = false; this.timer = null; this.lastBackup = 0;
  }
  touch() { this.dirty = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.save(), this.delay); }
  save() {
    clearTimeout(this.timer); this.timer = null;
    if (!this.dirty) return true;
    try {
      if (Date.now() - this.lastBackup > BACKUP_EVERY_MS) { backup(this.file); this.lastBackup = Date.now(); }
      write(this.file, this.camp);
      this.dirty = false; this.onSaved(this);
      return true;
    } catch (e) { this.onError(e); return false; }
  }
  setDoc(col, id, data) { (this.camp[col] ||= {})[id] = data; this.touch(); }
  deleteDoc(col, id) { if (this.camp[col]) delete this.camp[col][id]; this.touch(); }
  setTable(json) { try { this.camp.table = JSON.parse(json); this.touch(); } catch (e) {} }
  setUi(k, v) { this.camp.ui[k] = v; this.touch(); }
}

module.exports = { FORMAT, EXT, emptyCampaign, read, write, backup, backupDir, prune, validate, OpenCampaign };
