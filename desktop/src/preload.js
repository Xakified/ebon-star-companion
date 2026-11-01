// The bridge the page uses to reach the campaign file, Claude and the save dialog.
const { contextBridge, ipcRenderer } = require("electron");

const textListeners = new Map();
ipcRenderer.on("claude:text", (_e, reqId, text) => textListeners.get(reqId)?.(text));
const dbListeners = new Set();
const compParty = new Set(), compStatus = new Set();
ipcRenderer.on("companion:party", (_e, list) => compParty.forEach(fn => fn(list)));
ipcRenderer.on("companion:status", (_e, st) => compStatus.forEach(fn => fn(st)));
const compEvents = new Set();
ipcRenderer.on("companion:event", (_e, ev) => compEvents.forEach(fn => fn(ev)));
ipcRenderer.on("db:changed", (_e, col, data) => dbListeners.forEach(fn => fn(col, data)));

contextBridge.exposeInMainWorld("desktop", {
  getCampaign: () => ipcRenderer.sendSync("camp:get"),
  dbSet: (col, id, data) => ipcRenderer.invoke("db:set", col, id, data),
  dbDelete: (col, id) => ipcRenderer.invoke("db:delete", col, id),
  onDbChanged: fn => { dbListeners.add(fn); },
  setTable: json => ipcRenderer.send("table:set", json),
  setUi: (k, v) => ipcRenderer.send("ui:set", k, v),
  claudeRun: (reqId, prompt, onText) => {
    textListeners.set(reqId, onText);
    return ipcRenderer.invoke("claude:run", reqId, prompt).finally(() => textListeners.delete(reqId));
  },
  claudeAbort: reqId => ipcRenderer.send("claude:abort", reqId),
  saveFile: (filename, data) => ipcRenderer.invoke("file:save", filename, data),
  openPlayers: () => ipcRenderer.send("players:open"),
  submitKey: k => ipcRenderer.send("key:submit", k),
  cancelKey: () => ipcRenderer.send("key:cancel"),
  companionGet: () => ipcRenderer.invoke("companion:get"),
  companionPatch: (id, patch) => ipcRenderer.invoke("companion:patch", id, patch),
  companionCall: (method, args) => ipcRenderer.invoke("companion:call", method, args),
  onCompanionEvent: fn => { compEvents.add(fn); },
  onCompanionParty: fn => { compParty.add(fn); },
  onCompanionStatus: fn => { compStatus.add(fn); },
  companionConnect: code => ipcRenderer.invoke("companion:connect", code),
  companionCancel: () => ipcRenderer.send("companion:cancel"),
});
