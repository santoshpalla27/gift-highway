import { useEffect, useState } from 'react'
import { useSocketStatus } from '../../providers/SocketProvider'

export function ConnectionBanner() {
  const status = useSocketStatus()
  const [showConnected, setShowConnected] = useState(false)
  const [prevStatus, setPrevStatus] = useState(status)

  useEffect(() => {
    if (prevStatus !== 'connected' && status === 'connected') {
      setShowConnected(true)
      const t = setTimeout(() => setShowConnected(false), 2500)
      setPrevStatus(status)
      return () => clearTimeout(t)
    }
    setPrevStatus(status)
  }, [status])

  if (status === 'connected' && !showConnected) return null

  const isReconnecting = status === 'reconnecting'
  const isDisconnected = status === 'disconnected'
  const isConnected = showConnected && status === 'connected'

  const bg = isConnected ? '#D1FAE5' : isReconnecting ? '#FEF3C7' : '#FEE2E2'
  const color = isConnected ? '#065F46' : isReconnecting ? '#92400E' : '#991B1B'
  const borderColor = isConnected ? '#6EE7B7' : isReconnecting ? '#FCD34D' : '#FCA5A5'

  const icon = isConnected ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ) : isReconnecting ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
    </svg>
  )

  const message = isConnected
    ? 'Connected · Live updates restored'
    : isReconnecting
    ? 'Reconnecting · Live updates paused'
    : 'Connection lost · Live updates unavailable'

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '7px 16px', background: bg, color,
        borderBottom: `1px solid ${borderColor}`,
        fontSize: 12.5, fontWeight: 600,
        transition: 'background 0.3s ease',
      }}>
        {icon}
        {message}
      </div>
    </>
  )
}
