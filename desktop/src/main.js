// Ebon Star DM Screen: desktop shell. The page itself is app/index.html (built from the web version);
// this process owns the campaign file, backups, the player window and the Claude API key.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const os = require("os");
const C = require("./campaign");
const { Companion } = require("./companion");
const updater = require("./updater");

const PAGE = path.join(__dirname, "..", "app", "index.html");
const PRELOAD = path.join(__dirname, "preload.js");
const SETTINGS = () => path.join(app.getPath("userData"), "settings.json");
const MODEL = "claude-opus-5-5";

let settings = {};
let current = null;        // OpenCampaign
let dmWin = null, playersWin = null, keyWin = null, connectWin = null;
const running = new Map(); // Claude requests by id, for Stop

/* ---------- settings ---------- */
function loadSettings() { try { settings = JSON.parse(fs.readFileSync(SETTINGS(), "utf8")); } catch (e) { settings = {}; } }
function saveSettings() { try { fs.mkdirSync(path.dirname(SETTINGS()), { recursive: true }); fs.writeFileSync(SETTINGS(), JSON.stringify(settings, null, 2)); } catch (e) {} }
function getKey() {
  if (!settings.apiKey) return "";
  try { return settings.apiKeyEnc ? safeStorage.decryptString(Buffer.from(settings.apiKey, "base64")) : settings.apiKey; } catch (e) { return ""; }
}
function setKey(k) {
  if (!k) { delete settings.apiKey; delete settings.apiKeyEnc; }
  else if (safeStorage.isEncryptionAvailable()) { settings.apiKey = safeStorage.encryptString(k).toString("base64"); settings.apiKeyEnc = true; }
  else { settings.apiKey = k; settings.apiKeyEnc = false; }
  saveSettings(); buildMenu();
}

/* ---------- Companion (players' phone app) ---------- */
// The sign-in for this computer's DM Suite is kept in settings; the link to the Companion campaign lives in the campaign file.
const companionStorage = {
  getItem: k => (settings.companionAuth || {})[k] ?? null,
  setItem: (k, v) => { (settings.companionAuth ||= {})[k] = v; saveSettings(); },
  removeItem: k => { if (settings.companionAuth) { delete settings.companionAuth[k]; saveSettings(); } },
};
let companionStatus = { state: "off" };
const companion = new Companion({
  storage: companionStorage,
  onParty: list => { if (dmWin && !dmWin.isDestroyed()) dmWin.webContents.send("companion:party", list); },
  onStatus: st => { companionStatus = st; if (dmWin && !dmWin.isDestroyed()) dmWin.webContents.send("companion:status", st); buildMenu(); },
});
function startCompanion() {
  companion.stop();
  const link = current && current.camp.companion;
  if (link && link.url) companion.start(link).catch(() => {});
}
function askForCompanion() {
  if (!current) return;
  if (connectWin && !connectWin.isDestroyed()) { connectWin.focus(); return; }
  connectWin = new BrowserWindow({ width: 540, height: 400, resizable: false, minimizable: false, maximizable: false, parent: dmWin || undefined, modal: !!dmWin, title: "Connect to Companion", autoHideMenuBar: true, backgroundColor: "#171b26", webPreferences });
  guard(connectWin);
  connectWin.on("closed", () => { connectWin = null; });
  connectWin.loadFile(path.join(__dirname, "connect.html"));
}
async function disconnectCompanion() {
  if (!current || !current.camp.companion) return;
  const ok = await dialog.showMessageBox(dmWin, { type: "question", buttons: ["Disconnect", "Cancel"], defaultId: 1, cancelId: 1,
    message: "Disconnect this campaign from the Companion?", detail: "Your party list and tracker keep their current numbers but stop syncing. Players' sheets aren't changed. You can reconnect with a new code from the Companion." });
  if (ok.response !== 0) return;
  delete current.camp.companion; current.touch();
  companion.stop();
}

/* ---------- campaign files ---------- */
function title() {
  const name = current ? path.basename(current.file, C.EXT) : "No campaign";
  return `${current && current.dirty ? "• " : ""}${name} — Ebon Star DM Screen`;
}
function refreshTitle() { if (dmWin && !dmWin.isDestroyed()) dmWin.setTitle(title()); }

function openCampaign(file) {
  let camp;
  try { camp = C.read(file); }
  catch (e) { dialog.showErrorBox("Couldn't open that campaign", `${file}\n\n${e.message}`); return false; }
  if (current) current.close();
  current = new C.OpenCampaign(file, camp, {
    who: os.hostname(),
    onSaved: refreshTitle,
    onExternal: fromOtherComputer,
    onError: e => dialog.showErrorBox("Couldn't save the campaign", `${e.message}\n\nYour changes are still open. Try File > Save a Copy As to keep them somewhere else.`),
  });
  current.watch();
  const touch = current.touch.bind(current);
  current.touch = () => { touch(); refreshTitle(); };
  // A copy of the file as it was when opened, so a bad session can always be rolled back.
  try { C.backup(file, "opened"); current.lastBackup = Date.now(); } catch (e) {}
  settings.lastFile = file;
  settings.recent = [file, ...(settings.recent || []).filter(f => f !== file)].slice(0, 8);
  saveSettings(); buildMenu();
  if (playersWin && !playersWin.isDestroyed()) playersWin.close();
  showDm();
  startCompanion();
  setTimeout(offerConflictCopies, 1500);
  return true;
}

// The campaign file changed on disk because the other computer saved (through OneDrive, Dropbox…), and its
// edits are now merged in. Update what's on screen: lore, sessions and items in place, the rest by reloading.
function fromOtherComputer({ changed, conflicts, kept, by }) {
  for (const col of changed.filter(k => ["pages", "sessions", "items"].includes(k)))
    for (const w of [dmWin, playersWin]) if (w && !w.isDestroyed()) w.webContents.send("db:changed", col, current.camp[col] || {});
  if (changed.includes("companion")) { startCompanion(); buildMenu(); }
  if (changed.some(k => ["table", "ui"].includes(k)) && dmWin && !dmWin.isDestroyed()) dmWin.loadFile(PAGE);
  refreshTitle();
  if (conflicts.length && dmWin && !dmWin.isDestroyed()) {
    const list = conflicts.slice(0, 8).map(c => `• ${c}`).join("\n") + (conflicts.length > 8 ? `\n• and ${conflicts.length - 8} more` : "");
    dialog.showMessageBox(dmWin, {
      type: "info", buttons: ["OK", "Open Backups Folder"], defaultId: 0,
      message: `This campaign was also changed on ${by || "another computer"}`,
      detail: `Their other edits are merged in. These were changed on both computers, so this computer's version was kept:\n\n${list}\n\nTheir version is saved as a backup${kept ? ` (${path.basename(kept)})` : ""}, so File > Restore from Backup can bring it back.`,
    }).then(r => { if (r.response === 1 && kept) shell.showItemInFolder(kept); });
  }
}

// A sync service's conflict copy sits next to the file (both computers saved while one was offline): offer to merge it.
async function offerConflictCopies() {
  if (!current) return;
  for (const copy of C.conflictCopies(current.file)) {
    let theirs;
    try { theirs = C.read(copy); } catch (e) { continue; }
    const r = await dialog.showMessageBox(dmWin, {
      type: "question", buttons: ["Merge It In", "Not Now"], defaultId: 0, cancelId: 1,
      message: "Found another copy of this campaign",
      detail: `${path.basename(copy)}\n\nYour sync service made this copy because both computers saved while one was offline. Merging adds anything that's only in that copy. Where both have a different version of the same thing, the one already open is kept. The copy then moves into the backups folder.`,
    });
    if (r.response !== 0 || !current) return;
    const before = current.camp;
    const { camp, conflicts } = C.merge({}, before, theirs);
    camp.savedAt = before.savedAt; camp.savedBy = before.savedBy;
    current.camp = camp; current.touch(); current.save();
    try { fs.mkdirSync(C.backupDir(current.file), { recursive: true }); fs.renameSync(copy, path.join(C.backupDir(current.file), path.basename(copy))); } catch (e) {}
    fromOtherComputer({ changed: C.changedParts(before, camp), conflicts: [], kept: null, by: "" });
  }
}

async function newCampaign() {
  const r = await dialog.showSaveDialog(dmWin || undefined, {
    title: "New campaign", buttonLabel: "Create",
    defaultPath: path.join(app.getPath("documents"), "My Campaign" + C.EXT),
    filters: [{ name: "DM Screen campaign", extensions: [C.EXT.slice(1)] }],
  });
  if (r.canceled || !r.filePath) return false;
  const file = r.filePath.endsWith(C.EXT) ? r.filePath : r.filePath + C.EXT;
  C.write(file, C.emptyCampaign(path.basename(file, C.EXT)));
  return openCampaign(file);
}

async function chooseCampaign() {
  const r = await dialog.showOpenDialog(dmWin || undefined, {
    title: "Open campaign", properties: ["openFile"],
    defaultPath: settings.lastFile ? path.dirname(settings.lastFile) : app.getPath("documents"),
    filters: [{ name: "DM Screen campaign", extensions: [C.EXT.slice(1)] }],
  });
  if (r.canceled || !r.filePaths[0]) return false;
  return openCampaign(r.filePaths[0]);
}

async function saveCopyAs() {
  if (!current) return;
  const r = await dialog.showSaveDialog(dmWin, {
    title: "Save a copy", defaultPath: path.join(path.dirname(current.file), `${path.basename(current.file, C.EXT)} copy${C.EXT}`),
    filters: [{ name: "DM Screen campaign", extensions: [C.EXT.slice(1)] }],
  });
  if (r.canceled || !r.filePath) return;
  current.save();
  C.write(r.filePath, JSON.parse(JSON.stringify(current.camp)));
}

async function restoreBackup() {
  if (!current) return;
  const dir = C.backupDir(current.file);
  const r = await dialog.showOpenDialog(dmWin, {
    title: "Restore from a backup", defaultPath: fs.existsSync(dir) ? dir : path.dirname(current.file), properties: ["openFile"],
    filters: [{ name: "DM Screen campaign", extensions: [C.EXT.slice(1)] }],
  });
  if (r.canceled || !r.filePaths[0]) return;
  let camp;
  try { camp = C.read(r.filePaths[0]); } catch (e) { dialog.showErrorBox("That backup can't be read", e.message); return; }
  const ok = await dialog.showMessageBox(dmWin, {
    type: "warning", buttons: ["Restore", "Cancel"], defaultId: 1, cancelId: 1,
    message: `Replace the open campaign with this backup?`,
    detail: `${path.basename(r.filePaths[0])}\n\nThe campaign as it is now is backed up first, so you can undo this.`,
  });
  if (ok.response !== 0) return;
  current.save();
  C.backup(current.file, "before restore");
  C.write(current.file, camp);
  openCampaign(current.file);
}

async function welcome() {
  for (;;) {
  const r = await dialog.showMessageBox({
    type: "none", title: "Ebon Star DM Screen", message: "Open a campaign to start",
    detail: "Everything you do is saved into a campaign file you choose, with automatic backup copies next to it.",
    buttons: ["Open campaign…", "New campaign…", "Quit"], defaultId: 0, cancelId: 2,
  });
  if (r.response === 2) { app.quit(); return; }
  if (r.response === 0 ? await chooseCampaign() : await newCampaign()) return;
  }
}

/* ---------- windows ---------- */
const webPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true };
function guard(win) {
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
}
function showDm() {
  if (dmWin && !dmWin.isDestroyed()) { dmWin.loadFile(PAGE); refreshTitle(); return; }
  dmWin = new BrowserWindow({ width: 1320, height: 900, minWidth: 720, minHeight: 500, title: title(), backgroundColor: "#0f121a", webPreferences });
  guard(dmWin);
  dmWin.on("page-title-updated", e => { e.preventDefault(); refreshTitle(); });
  dmWin.on("closed", () => { dmWin = null; if (playersWin && !playersWin.isDestroyed()) playersWin.close(); });
  dmWin.loadFile(PAGE);
}
function openPlayers() {
  if (playersWin && !playersWin.isDestroyed()) { playersWin.show(); playersWin.focus(); return; }
  playersWin = new BrowserWindow({ width: 1100, height: 760, title: "Player Screen", backgroundColor: "#0f121a", autoHideMenuBar: true, webPreferences });
  guard(playersWin);
  playersWin.on("page-title-updated", e => e.preventDefault());
  playersWin.on("closed", () => { playersWin = null; });
  playersWin.loadFile(PAGE, { hash: "players" });
}
function broadcast(sender, col) {
  for (const w of [dmWin, playersWin]) if (w && !w.isDestroyed() && w.webContents !== sender) w.webContents.send("db:changed", col, current.camp[col] || {});
}

function askForKey() {
  if (keyWin && !keyWin.isDestroyed()) { keyWin.focus(); return; }
  keyWin = new BrowserWindow({ width: 520, height: 330, resizable: false, minimizable: false, maximizable: false, parent: dmWin || undefined, modal: !!dmWin, title: "Claude API key", autoHideMenuBar: true, backgroundColor: "#171b26", webPreferences });
  guard(keyWin);
  keyWin.on("closed", () => { keyWin = null; });
  keyWin.loadFile(path.join(__dirname, "key.html"), { hash: getKey() ? "has" : "" });
}

/* ---------- menu ---------- */
function buildMenu() {
  const mac = process.platform === "darwin";
  const recent = (settings.recent || []).filter(f => fs.existsSync(f));
  const template = [
    ...(mac ? [{ role: "appMenu" }] : []),
    { label: "File", submenu: [
      { label: "New Campaign…", accelerator: "CmdOrCtrl+Shift+N", click: newCampaign },
      { label: "Open Campaign…", accelerator: "CmdOrCtrl+O", click: chooseCampaign },
      { label: "Open Recent", enabled: recent.length > 0, submenu: recent.map(f => ({ label: path.basename(f, C.EXT), sublabel: f, click: () => openCampaign(f) })) },
      { type: "separator" },
      { label: "Save Now", accelerator: "CmdOrCtrl+S", enabled: !!current, click: () => { current.dirty = true; current.save(); } },
      { label: "Save a Copy As…", enabled: !!current, click: saveCopyAs },
      { label: "Back Up Now", enabled: !!current, click: () => { current.save(); const f = C.backup(current.file, "manual"); f && shell.showItemInFolder(f); } },
      { label: "Restore from Backup…", enabled: !!current, click: restoreBackup },
      { type: "separator" },
      { label: "Show Campaign File", enabled: !!current, click: () => shell.showItemInFolder(current.file) },
      { label: "Open Backups Folder", enabled: !!current, click: () => { const d = C.backupDir(current.file); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); } },
      ...(mac ? [] : [{ type: "separator" }, { role: "quit" }]),
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Player Screen", accelerator: "CmdOrCtrl+P", click: openPlayers },
      { type: "separator" },
      { role: "reload" }, { role: "togglefullscreen" },
      { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" },
      { type: "separator" }, { role: "toggleDevTools" },
    ] },
    { label: "Companion", submenu: [
      { label: current && current.camp.companion ? companionStatus.state === "unlinked" ? `${current.camp.companion.name}: not connected on this computer yet` : `Connected to ${current.camp.companion.name} (${companionStatus.state === "live" ? "live" : companionStatus.state})` : "Not connected", enabled: false },
      { label: current && current.camp.companion ? "Connect with a New Code…" : "Connect to Companion…", enabled: !!current, click: askForCompanion },
      { label: "Refresh Party Now", enabled: !!(current && current.camp.companion), click: () => companion.refresh().catch(e => dialog.showErrorBox("Couldn't reach the Companion", e.message)) },
      { label: "Disconnect", enabled: !!(current && current.camp.companion), click: disconnectCompanion },
    ] },
    { label: "Claude", submenu: [
      { label: getKey() ? "Change API Key…" : "Set API Key…", click: askForKey },
      { label: "Remove API Key", enabled: !!getKey(), click: () => setKey("") },
      { type: "separator" },
      { label: "Get an API Key…", click: () => shell.openExternal("https://platform.claude.com/settings/keys") },
    ] },
    { label: "Help", submenu: [
      { label: `Version ${updater.version}${updater.version !== updater.shellVersion ? ` (updated from ${updater.shellVersion})` : ""}`, enabled: false },
      { label: updater.readyVersion ? `Restart to Use ${updater.readyVersion}` : "Check for Updates…", click: () => updater.check(true).then(buildMenu) },
      { label: `Go Back to Version ${updater.back()}…`, visible: updater.version !== updater.shellVersion, click: updater.undo },
    ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- IPC from the page ---------- */
ipcMain.on("camp:get", e => { e.returnValue = current ? current.camp : C.emptyCampaign("Untitled"); });
ipcMain.handle("db:set", (e, col, id, data) => { if (!current) throw new Error("No campaign open"); current.setDoc(col, id, data); broadcast(e.sender, col); return true; });
ipcMain.handle("db:delete", (e, col, id) => { if (!current) throw new Error("No campaign open"); current.deleteDoc(col, id); broadcast(e.sender, col); return true; });
ipcMain.on("table:set", (e, json) => { if (current && dmWin && e.sender === dmWin.webContents) current.setTable(json); });
ipcMain.on("ui:set", (e, k, v) => { if (current && dmWin && e.sender === dmWin.webContents) current.setUi(k, v); });
ipcMain.on("players:open", openPlayers);
ipcMain.on("key:submit", (_e, k) => { k = String(k || "").trim(); if (k) setKey(k); if (keyWin) keyWin.close(); });
ipcMain.on("key:cancel", () => { if (keyWin) keyWin.close(); });
ipcMain.handle("companion:connect", async (_e, code) => {
  if (!current) return { error: "Open a campaign first." };
  try {
    const link = await companion.connect(code);
    current.camp.companion = link; current.touch(); buildMenu();
    if (connectWin) connectWin.close();
    return { ok: true, name: link.name };
  } catch (e) { return { error: e.message }; }
});
ipcMain.on("companion:cancel", () => { if (connectWin) connectWin.close(); });
ipcMain.handle("companion:get", () => ({ status: companionStatus, party: companion.party }));
ipcMain.handle("companion:patch", async (_e, id, patch) => { try { await companion.patch(id, patch); return { ok: true }; } catch (e) { return { error: e.message }; } });

ipcMain.handle("file:save", async (_e, filename, data) => {
  const r = await dialog.showSaveDialog(dmWin, { defaultPath: path.join(app.getPath("documents"), path.basename(String(filename))) });
  if (r.canceled || !r.filePath) return { error: "declined" };
  try { fs.writeFileSync(r.filePath, data, "utf8"); return { status: "saved" }; } catch (e) { return { error: "unavailable" }; }
});

ipcMain.on("claude:abort", (_e, reqId) => running.get(reqId)?.abort());
ipcMain.handle("claude:run", async (e, reqId, prompt) => {
  const key = getKey();
  if (!key) { askForKey(); return { error: "not_granted", message: "Add your Claude API key under Claude > Set API Key." }; }
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: key });
  const ctl = new AbortController();
  running.set(reqId, ctl);
  let text = "";
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    }, { signal: ctl.signal });
    stream.on("text", (_delta, snapshot) => { text = snapshot; if (!e.sender.isDestroyed()) e.sender.send("claude:text", reqId, snapshot); });
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") return { error: "refused", message: "Claude declined this request.", text };
    text = msg.content.filter(b => b.type === "text").map(b => b.text).join("");
    if (!text.trim()) return { error: "empty_completion" };
    return { text, truncated: msg.stop_reason === "max_tokens" };
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError || ctl.signal.aborted) return { error: "cancelled", text };
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) { askForKey(); return { error: "not_granted", message: "Claude rejected the API key. Check it under Claude > Set API Key." }; }
    if (err instanceof Anthropic.RateLimitError) return { error: "rate_limited" };
    if (err instanceof Anthropic.BadRequestError) return { error: "invalid_request", message: err.message };
    if (err instanceof Anthropic.APIConnectionError) return { error: "upstream_error", message: "Couldn't reach Claude. Check your internet connection." };
    return { error: "upstream_error", message: err && err.message };
  } finally { running.delete(reqId); }
});

/* ---------- app lifecycle ---------- */
const fileArg = argv => argv.slice(1).find(a => a.endsWith(C.EXT) && fs.existsSync(a));
if (!app.requestSingleInstanceLock()) { updater.started(); app.quit(); } // the copy already open takes over
app.on("second-instance", (_e, argv) => { const f = fileArg(argv); if (f) openCampaign(f); if (dmWin) { if (dmWin.isMinimized()) dmWin.restore(); dmWin.focus(); } });
let pendingOpen = null;
app.on("open-file", (e, f) => { e.preventDefault(); if (app.isReady()) openCampaign(f); else pendingOpen = f; });

app.whenReady().then(async () => {
  loadSettings();
  buildMenu();
  updater.start({ getWin: () => (dmWin && !dmWin.isDestroyed() ? dmWin : null), beforeRestart: () => { if (current) current.save(); } });
  const f = pendingOpen || fileArg(process.argv) || (settings.lastFile && fs.existsSync(settings.lastFile) ? settings.lastFile : null);
  if (!(f && openCampaign(f))) await welcome();
  app.on("activate", () => { if (!dmWin && current) showDm(); });
});
app.on("before-quit", () => { if (current) current.save(); });
app.on("window-all-closed", () => { if (current) current.save(); app.quit(); });
