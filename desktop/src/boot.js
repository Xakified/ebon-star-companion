// Starts the app. This file only changes with a full reinstall; everything else can be updated in place.
// Updates are downloaded by src/updater.js into <userData>/updates/<version>/ (same layout as this folder:
// package.json, src/, app/). If a newer one is there and hasn't failed before, run it instead of the built-in copy.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const SHELL = path.join(__dirname, "..");
const shellVersion = require("../package.json").version;
const UPDATES = path.join(app.getPath("userData"), "updates");
const STATE = path.join(UPDATES, "state.json");

const cmp = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const readState = () => { try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (e) { return {}; } };
const writeState = s => { try { fs.mkdirSync(UPDATES, { recursive: true }); fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch (e) {} };
// Switches a version off for good and goes back to the update before it (or the built-in copy).
function markBad(v, why) {
  const s = readState();
  s.bad = [...new Set([...(s.bad || []), v])];
  s.lastError = `${v}: ${why}`;
  if (s.current === v) { s.current = s.previous; delete s.previous; }
  delete s.trying;
  writeState(s);
}

// Updated code still uses the packages that shipped with this install.
process.env.NODE_PATH = [path.join(SHELL, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
Module._initPaths();

const usable = (s, v) => app.isPackaged && v && cmp(v, shellVersion) > 0 && !(s.bad || []).includes(v) && fs.existsSync(path.join(UPDATES, v, "src", "main.js"));
let state = readState(), pick = null;
if (usable(state, state.current) && state.trying === state.current) {
  markBad(state.current, "it didn't finish starting last time"); // crashed or hung before reporting in
  state = readState();
}
if (usable(state, state.current)) pick = state.current;

global.dmBoot = {
  shellVersion,
  version: pick || shellVersion,
  dir: pick ? path.join(UPDATES, pick) : SHELL,
  updatesDir: UPDATES,
  cmp, readState, writeState, markBad,
  // main.js calls this once it has started properly, so the next launch trusts this version.
  ok() { if (pick) { const s = readState(); if (s.trying === pick) { delete s.trying; writeState(s); } } },
};

if (pick) {
  writeState({ ...state, trying: pick });
  try { require(path.join(UPDATES, pick, "src", "main.js")); }
  catch (e) {
    // The update couldn't even load: forget it and start again on the built-in version.
    markBad(pick, e && e.message);
    app.relaunch(); app.exit(0);
  }
} else {
  require("./main.js");
}
