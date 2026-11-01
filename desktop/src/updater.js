// Updates the app's own files (src/, app/) from GitHub without a reinstall.
// The latest version is published in the ebon-star-companion repo under desktop/ (see tools/publish-update.js):
// desktop/update.json lists the version and a SHA-256 for every file. New versions are downloaded into
// <userData>/updates/<version>/ and src/boot.js runs them on the next start.
const { app, dialog, net, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const BASE = process.env.DM_UPDATE_BASE || "https://raw.githubusercontent.com/Xakified/ebon-star-companion/main/desktop/";
const EVERY = 6 * 60 * 60 * 1000;

const boot = global.dmBoot || (() => {
  const v = require("../package.json").version;
  return { shellVersion: v, version: v, updatesDir: path.join(app.getPath("userData"), "updates"),
    cmp: (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }),
    readState: () => ({}), writeState: () => {}, markBad: () => {}, ok: () => {} };
})();

let busy = null, ready = null, timer = null, getWin = () => null, beforeRestart = () => {};

async function get(url, as) {
  const r = await net.fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} from ${url}`);
  return as === "json" ? r.json() : Buffer.from(await r.arrayBuffer());
}

const safePath = p => typeof p === "string" && /^(package\.json|(src|app)\/[A-Za-z0-9._\/-]+)$/.test(p) && !p.split("/").includes("..");

// Downloads and verifies every file into a temp folder, then moves it into place in one step.
async function download(info) {
  const files = Object.entries(info.files || {});
  if (!files.length || !files.some(([p]) => p === "src/main.js")) throw new Error("update.json has no files");
  const dest = path.join(boot.updatesDir, info.version), tmp = dest + ".download";
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const [p, sha] of files) {
    if (!safePath(p)) throw new Error(`unexpected file in update: ${p}`);
    const buf = await get(BASE + p);
    if (crypto.createHash("sha256").update(buf).digest("hex") !== sha) throw new Error(`${p} didn't match its checksum (GitHub may still be catching up; try again in a few minutes)`);
    fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true });
    fs.writeFileSync(path.join(tmp, p), buf);
  }
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(tmp, dest);
  const s = boot.readState();
  if (boot.version !== boot.shellVersion) s.previous = boot.version; else delete s.previous;
  s.current = info.version; delete s.trying;
  boot.writeState(s);
  // Keep only the version that's running and the new one.
  for (const d of fs.readdirSync(boot.updatesDir)) {
    if (d !== info.version && d !== boot.version && d !== "state.json") fs.rmSync(path.join(boot.updatesDir, d), { recursive: true, force: true });
  }
}

async function offerRestart(info) {
  const r = await dialog.showMessageBox(getWin() || undefined, {
    type: "info", title: "Update ready", buttons: ["Restart Now", "Later"], defaultId: 0, cancelId: 1,
    message: `Ebon Star DM Screen ${info.version} is ready`,
    detail: `${info.notes ? info.notes + "\n\n" : ""}Restart to use it, or it starts automatically next time you open the app. Your campaign is saved first.`,
  });
  if (r.response === 0) restart();
}

function restart() { beforeRestart(); app.relaunch(); app.quit(); }

async function check(manual) {
  if (ready) { if (manual) await offerRestart(ready); return; }
  if (busy) { if (manual) dialog.showMessageBox(getWin() || undefined, { type: "info", message: "Already checking for updates…" }); return; }
  busy = (async () => {
    const info = await get(BASE + "update.json", "json");
    if (!info || !info.version || boot.cmp(info.version, boot.version) <= 0) {
      if (manual) await dialog.showMessageBox(getWin() || undefined, { type: "info", title: "Up to date", message: "You're up to date", detail: `Version ${boot.version}` });
      return;
    }
    if ((boot.readState().bad || []).includes(info.version)) {
      if (manual) await dialog.showMessageBox(getWin() || undefined, { type: "warning", title: "Update skipped", message: `Version ${info.version} didn't start properly on this computer, so it's switched off`, detail: "A newer version will install when it's published." });
      return;
    }
    if (info.minShell && boot.cmp(info.minShell, boot.shellVersion) > 0) {
      const s = boot.readState();
      if (manual || s.toldReinstall !== info.version) {
        s.toldReinstall = info.version; boot.writeState(s);
        await dialog.showMessageBox(getWin() || undefined, { type: "info", title: "New version needs a fresh download",
          message: `Version ${info.version} can't install itself`,
          detail: `It changes parts of the app that only a full download can replace. Get the new "Ebon Star DM Screen - Windows.zip" from your DM Suite project and unzip it over this copy. Your campaign and settings stay where they are.` });
      }
      return;
    }
    await download(info);
    ready = info;
    await offerRestart(info);
  })().catch(e => {
    if (manual) dialog.showMessageBox(getWin() || undefined, { type: "warning", title: "Couldn't check for updates", message: "Couldn't check for updates", detail: String(e && e.message || e) });
  }).finally(() => { busy = null; });
  return busy;
}

// Goes back to the update before this one (or the version that came in the zip), and keeps this one switched off.
const back = () => { const p = boot.readState().previous; return p && fs.existsSync(path.join(boot.updatesDir, p)) ? p : boot.shellVersion; };

async function undo() {
  if (boot.version === boot.shellVersion) return;
  const r = await dialog.showMessageBox(getWin() || undefined, { type: "question", buttons: ["Go Back and Restart", "Cancel"], defaultId: 1, cancelId: 1,
    message: `Go back to version ${back()}?`, detail: `Version ${boot.version} stays switched off on this computer. A newer update will still install when it's published.` });
  if (r.response !== 0) return;
  boot.markBad(boot.version, "undone from the Help menu");
  restart();
}

function start(opts) {
  getWin = opts.getWin || getWin;
  beforeRestart = opts.beforeRestart || beforeRestart;
  boot.ok();
  if (!app.isPackaged) return; // running from source: don't replace the code being edited
  setTimeout(() => check(false), 8000);
  timer = setInterval(() => check(false), EVERY);
}

module.exports = { back, start, check, undo, started: () => boot.ok(), version: boot.version, shellVersion: boot.shellVersion, get readyVersion() { return ready && ready.version; } };
