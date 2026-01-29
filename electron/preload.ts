import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('electronAPI', {
  getActiveConnection: () => ipcRenderer.invoke('get-active-connection'),
  getLocalDevices: () => ipcRenderer.invoke('get-local-devices'),
  getNetworkUsage: () => ipcRenderer.invoke('get-network-usage'),
})
