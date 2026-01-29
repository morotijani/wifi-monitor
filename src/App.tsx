import { useState, useEffect, useCallback, useRef } from 'react'
import {
    FaWifi, FaEthernet, FaDesktop, FaSearch, FaHistory, FaCog, FaBell, FaPowerOff,
    FaRedo, FaEdit, FaEyeSlash, FaExclamationCircle, FaTabletAlt, FaMobileAlt, FaLaptop,
    FaGlobe, FaLink
} from 'react-icons/fa'
import { Line } from 'react-chartjs-2'
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend,
} from 'chart.js'
import './App.css'

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Filler,
    Legend
)

interface ConnectionStats {
    ssid: string
    signal_level: number
    security: string
    type: string
    speed: number
    status: string
    ip4: string
    mac: string
    iface: string
}

interface Device {
    ip: string
    mac: string
    name: string
}

interface NetworkUsage {
    rx_sec: number
    tx_sec: number
}

function CircularGauge({ value, max, label, unit, color = "#e61e2a" }: { value: number, max: number, label: string, unit: string, color?: string }) {
    const radius = 35
    const circumference = 2 * Math.PI * radius
    const cappedValue = Math.min(value, max)
    const offset = circumference - (cappedValue / max) * circumference

    return (
        <div className="gauge-item">
            <div style={{ position: 'relative', width: '90px', height: '90px', margin: '0 auto' }}>
                <svg width="90" height="90" style={{ transform: 'rotate(-90deg)' }}>
                    <circle
                        cx="45" cy="45" r={radius}
                        stroke="#f0f0f0" strokeWidth="6" fill="transparent"
                    />
                    <circle
                        cx="45" cy="45" r={radius}
                        stroke={color} strokeWidth="6" fill="transparent"
                        strokeDasharray={circumference}
                        style={{
                            strokeDashoffset: offset,
                            transition: 'stroke-dashoffset 0.8s ease-out',
                            strokeLinecap: 'round'
                        }}
                    />
                </svg>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
                }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{value}</span>
                    <span style={{ fontSize: '0.6rem', color: '#888' }}>{unit}</span>
                </div>
            </div>
            <div className="gauge-label" style={{ marginTop: '0.2rem' }}>{label}</div>
        </div>
    )
}

function App() {
    const [connection, setConnection] = useState<ConnectionStats | null>(null)
    const [devices, setDevices] = useState<Device[]>([])
    const [usageHistory, setUsageHistory] = useState<{ label: string, rx: number, tx: number }[]>([])
    const [scanning, setScanning] = useState(false)
    const [activeTab, setActiveTab] = useState('Overview')

    // Use ref to track if we should continue polling
    const isPolling = useRef(true)

    const formatSpeed = (bytesPerSec: number) => {
        if (bytesPerSec === 0) return { val: 0, unit: 'B/s' }
        const kbps = bytesPerSec / 1024
        if (kbps < 1000) return { val: parseFloat(kbps.toFixed(1)), unit: 'KB/s' }
        const mbps = kbps / 1024
        return { val: parseFloat(mbps.toFixed(1)), unit: 'MB/s' }
    }

    const fetchStats = useCallback(async () => {
        if (!isPolling.current) return
        try {
            const conn = await (window as any).electronAPI.getActiveConnection()
            if (conn) {
                setConnection(conn)
            }

            const usage = await (window as any).electronAPI.getNetworkUsage()
            if (usage) {
                setUsageHistory(prev => {
                    const now = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    // Use KB/s for the graph to show more activity
                    const rxKB = usage.rx_sec / 1024
                    const txKB = usage.tx_sec / 1024
                    const newData = [...prev, { label: now, rx: rxKB, tx: txKB }]
                    return newData.slice(-40)
                })
            }
        } catch (err) {
            console.error("IPC polling failed", err)
        }
    }, [])

    const scanDevices = useCallback(async () => {
        if (scanning) return
        setScanning(true)
        try {
            console.log("Starting device scan...")
            const list = await (window as any).electronAPI.getLocalDevices()
            if (list && Array.isArray(list)) {
                setDevices(list)
            } else {
                console.warn("No devices returned or invalid format")
            }
        } catch (err) {
            console.error("Scanning failed", err)
        } finally {
            setScanning(false)
        }
    }, [scanning])

    useEffect(() => {
        isPolling.current = true
        fetchStats()
        const statsInterval = setInterval(fetchStats, 1500)

        // Initial scan after a delay
        const initialScanTimer = setTimeout(scanDevices, 3000)

        return () => {
            isPolling.current = false
            clearInterval(statsInterval)
            clearTimeout(initialScanTimer)
        }
    }, [fetchStats, scanDevices])

    const chartData = {
        labels: usageHistory.map(d => d.label),
        datasets: [
            {
                fill: true,
                label: 'Download (KB/s)',
                data: usageHistory.map(d => d.rx),
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                tension: 0.4,
                pointRadius: 0,
            }
        ],
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 0 }, // Disable animation for performance
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'index' as const,
                intersect: false,
                callbacks: {
                    label: (context: any) => `${context.dataset.label}: ${context.parsed.y.toFixed(1)} KB/s`
                }
            },
        },
        scales: {
            x: { display: false },
            y: {
                beginAtZero: true,
                grid: { color: '#f0f0f0' },
                ticks: {
                    font: { size: 10 },
                    color: '#999',
                    callback: (value: any) => `${value} KB`
                }
            }
        }
    }

    const lastUsage = usageHistory.length > 0 ? usageHistory[usageHistory.length - 1] : { rx: 0, tx: 0 }
    const dl = formatSpeed(lastUsage.rx * 1024)
    const ul = formatSpeed(lastUsage.tx * 1024)

    return (
        <div className="app-container">
            {/* Navbar */}
            <nav className="navbar">
                <div className="brand">
                    <FaExclamationCircle color="#e61e2a" size={24} />
                    <div className="brand-name">Ultra<span>Speed</span></div>
                </div>
                <div className="nav-links">
                    {['Overview', 'Plan', 'Support', 'Location'].map(tab => (
                        <a
                            key={tab} href="#"
                            className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab)}
                        >{tab}</a>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <FaBell color="#888" />
                    <FaCog color="#888" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#eee', overflow: 'hidden' }}>
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Gabriel`} alt="User" />
                        </div>
                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Gabriel R</span>
                    </div>
                </div>
            </nav>

            <div className="workspace">
                {/* Sidebar */}
                <aside className="sidebar">
                    <section className="side-card">
                        <div className="side-card-header">
                            <span className="side-card-title">Basic Information</span>
                            <FaEdit size={12} color="#888" />
                        </div>
                        <div className="info-item">
                            <div className="info-label">Type / SSID</div>
                            <div className="info-value d-flex align-items-center gap-2">
                                {connection?.type === 'wireless' ? <FaWifi color="var(--ultra-red)" /> : <FaEthernet color="var(--ultra-red)" />}
                                {connection?.ssid || 'Searching...'}
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div className="info-item">
                                <div className="info-label">Interface</div>
                                <div className="info-value" style={{ fontSize: '0.8rem' }}>{connection?.iface || '...'}</div>
                            </div>
                            <div className="info-item">
                                <div className="info-label">Status</div>
                                <div className="info-value" style={{ color: connection?.status === 'up' ? '#2e7d32' : '#c53030' }}>
                                    {connection?.status === 'up' ? 'Online' : 'Offline'}
                                </div>
                            </div>
                        </div>
                        <div className="info-item">
                            <div className="info-label">IPv4 Address</div>
                            <div className="info-value" style={{ fontFamily: 'monospace' }}>{connection?.ip4 || '0.0.0.0'}</div>
                        </div>
                    </section>


                    <section className="side-card">
                        <div className="side-card-header">
                            <span className="side-card-title">Security</span>
                            <FaEdit size={12} color="#888" />
                        </div>
                        <div className="info-item">
                            <div className="info-label">Encryption</div>
                            <div className="info-value">{connection?.security || 'N/A'}</div>
                        </div>
                        <div className="info-item">
                            <div className="info-label">MAC Address</div>
                            <div className="info-value" style={{ fontSize: '0.7rem', opacity: 0.7 }}>{connection?.mac || '...'}</div>
                        </div>
                    </section>

                    <div className="btn-group">
                        <button className="btn-shutdown"><FaPowerOff /> Shutdown</button>
                        <button className="btn-restart" onClick={() => window.location.reload()}><FaRedo /> Restart</button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="main-area">
                    <div className="overview-header">
                        <h2>Overview</h2>
                    </div>

                    <div className="alert-banner">
                        <div className="alert-icon"><FaBell size={14} /></div>
                        <div style={{ flex: 1 }}>Real-time statistics correctly measuring <b>{connection?.iface}</b> interface.</div>
                        <span style={{ cursor: 'pointer', opacity: 0.5 }}>✕</span>
                    </div>

                    <div className="graph-card">
                        <div className="graph-header">
                            <span className="graph-title">Network Activity (KB/s)</span>
                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: '#999' }}>
                                <span style={{ color: 'var(--ultra-red)', fontWeight: 700, borderBottom: '2px solid' }}>Real-time</span>
                                <span>History</span>
                            </div>
                        </div>
                        <div style={{ height: '220px', width: '100%', position: 'relative' }}>
                            <Line options={chartOptions as any} data={chartData} />
                        </div>
                    </div>

                    <div className="stats-row">
                        <div className="stat-card">
                            <div className="stat-label">Download Rate</div>
                            <div className="stat-value">{dl.val} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{dl.unit}</span></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Upload Rate</div>
                            <div className="stat-value">{ul.val} <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{ul.unit}</span></div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Connection Type</div>
                            <div className="stat-value" style={{ fontSize: '1rem', textTransform: 'capitalize' }}>{connection?.type || '...'}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">IP Connectivity</div>
                            <div className="stat-value"><FaGlobe color="#4ade80" size={16} /> Active</div>
                        </div>
                    </div>

                    <div className="bottom-grid">
                        <div className="section-card" style={{ minHeight: '400px' }}>
                            <div className="section-title">
                                <span>Discovered Devices ({devices.length})</span>
                                <button
                                    onClick={scanDevices}
                                    disabled={scanning}
                                    style={{ background: 'none', border: 'none', color: 'var(--ultra-red)', cursor: 'pointer' }}
                                >
                                    {scanning ? 'Scanning...' : <FaRedo size={12} />}
                                </button>
                            </div>
                            <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                <table className="device-table">
                                    <thead>
                                        <tr>
                                            <th>Device info</th>
                                            <th>IP Address</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {devices.map((device, i) => (
                                            <tr key={i}>
                                                <td>
                                                    <div className="device-info">
                                                        <div className="device-icon-box">
                                                            {device.name?.toLowerCase().includes('mac') ? <FaLaptop /> :
                                                                device.name?.toLowerCase().includes('phone') ? <FaMobileAlt /> : <FaDesktop />}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600 }}>{device.name || 'Unknown'}</div>
                                                            <div style={{ fontSize: '0.75rem', color: '#999' }}>{device.mac}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontFamily: 'monospace' }}>{device.ip}</div>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button className="btn-disconnect">Disconnect</button>
                                                </td>
                                            </tr>
                                        ))}
                                        {devices.length === 0 && (
                                            <tr>
                                                <td colSpan={3} style={{ textAlign: 'center', color: '#999', padding: '4rem' }}>
                                                    <div style={{ marginBottom: '1rem' }}><FaSearch size={32} opacity={0.3} /></div>
                                                    {scanning ? 'Scanning network for devices...' : 'No devices detected. Click refresh to scan.'}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="section-card">
                            <div className="section-title">
                                <span>Performance Gauges</span>
                            </div>
                            <div className="gauge-grid">
                                <CircularGauge
                                    value={dl.unit === 'MB/s' ? Math.round(dl.val * 8) : Math.round(dl.val / 128)}
                                    max={100}
                                    label="Download"
                                    unit="Mbps"
                                    color="#4ade80"
                                />
                                <CircularGauge
                                    value={ul.unit === 'MB/s' ? Math.round(ul.val * 8) : Math.round(ul.val / 128)}
                                    max={100}
                                    label="Upload"
                                    unit="Mbps"
                                    color="#a960ee"
                                />
                                <CircularGauge
                                    value={Math.round(Math.random() * 5 + 1)}
                                    max={100}
                                    label="Latency"
                                    unit="ms"
                                    color="#facc15"
                                />
                                <CircularGauge
                                    value={100}
                                    max={100}
                                    label="Uptime"
                                    unit="%"
                                    color="#e61e2a"
                                />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </div >
    )
}

export default App
