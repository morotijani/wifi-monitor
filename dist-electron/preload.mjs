"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  getActiveConnection: () => electron.ipcRenderer.invoke("get-active-connection"),
  getLocalDevices: () => electron.ipcRenderer.invoke("get-local-devices"),
  getNetworkUsage: () => electron.ipcRenderer.invoke("get-network-usage")
});
