import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import wifi from 'node-wifi'
import find from 'local-devices'
import si from 'systeminformation'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize wifi logic
wifi.init({
  iface: null
})

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#e61e2a'
    },
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Set CSP headers
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*"]
      }
    })
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// IPC Handlers
ipcMain.handle('get-active-connection', async () => {
  try {
    const defaultIfaceName = await si.networkInterfaceDefault()
    const allInterfaces = await si.networkInterfaces()

    // Find the actual interface object
    const iface = allInterfaces.find(i => i.iface === defaultIfaceName) || allInterfaces.find(i => i.operstate === 'up' && i.ip4 !== '')

    if (!iface) {
      return {
        ssid: 'No Connection',
        type: 'none',
        status: 'down',
        ip4: '0.0.0.0',
        speed: 0
      }
    }

    let stats = {
      ssid: iface.iface,
      signal_level: 100,
      security: 'N/A',
      type: iface.type,
      speed: iface.speed || 0,
      status: iface.operstate,
      ip4: iface.ip4,
      mac: iface.mac,
      iface: iface.iface
    }

    // Attempt to get WiFi SSID if it's a wireless interface
    if (iface.type === 'wireless') {
      try {
        const connections = await wifi.getCurrentConnections()
        if (connections && connections.length > 0) {
          stats.ssid = connections[0].ssid || iface.iface
          stats.signal_level = connections[0].signal_level
          stats.security = connections[0].security
        }
      } catch (wErr) {
        console.warn("WiFi info fetch failed, falling back to iface name", wErr)
      }
    } else {
      stats.ssid = 'Ethernet Connection'
    }

    return stats
  } catch (error) {
    console.error('Connection check error:', error)
    return null
  }
})

let isScanning = false
ipcMain.handle('get-local-devices', async () => {
  if (isScanning) return []
  isScanning = true
  try {
    // local-devices can sometimes be slow or hang. 
    // We wrap it to ensure it doesn't block the UI forever.
    const devices = await Promise.race([
      find(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000))
    ])
    return devices
  } catch (error) {
    console.error('Local devices scan error:', error)
    return []
  } finally {
    isScanning = false
  }
})

// Cache network stats to calculate rate correctly if needed, 
// though si.networkStats() usually does this internally if called periodically.
ipcMain.handle('get-network-usage', async () => {
  try {
    const defaultIface = await si.networkInterfaceDefault()
    const stats = await si.networkStats(defaultIface)

    if (stats && stats.length > 0) {
      return stats[0]
    }

    // Fallback to all stats if default fails
    const allStats = await si.networkStats()
    return allStats.find(s => s.rx_sec > 0 || s.tx_sec > 0) || allStats[0] || null
  } catch (error) {
    console.error('Network usage error:', error)
    return null
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
