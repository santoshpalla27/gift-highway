import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../../../services/apiClient'

interface AuditStatus {
  storage_configured: boolean
  email_configured: boolean
  csv_exists: boolean
  csv_size_bytes: number
  csv_row_count: number
  csv_last_modified: string | null
  email_to: string
  next_daily_report: string
  next_monthly_report: string
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
      background: ok ? '#10B981' : '#EF4444', flexShrink: 0,
    }} />
  )
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #F1F5F9' }}>
      <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#111827', fontWeight: 600, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  })
}

export function AuditPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<AuditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const fetchStatus = () => {
    setLoading(true); setError(false)
    apiClient.get<AuditStatus>('/admin/audit/status')
      .then(r => setStatus(r.data))
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchStatus() }, [])

  const handleTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      const res = await apiClient.post<{ ok: boolean; message: string }>('/admin/audit/test')
      setTestResult({ ok: true, message: res.data.message })
    } catch {
      setTestResult({ ok: false, message: 'R2 write test failed — check server logs.' })
    } finally {
      setTesting(false)
    }
  }

  const handleDownload = async (range: 'all' | 'today' | 'month' | 'custom') => {
    if (range === 'custom' && (!fromDate || !toDate)) return
    setDownloading(range)
    try {
      const params = range === 'custom'
        ? `range=custom&from=${fromDate}&to=${toDate}`
        : `range=${range}`
      const res = await apiClient.get(`/admin/audit/download?${params}`, { responseType: 'blob' })
      const disposition = res.headers['content-disposition'] ?? ''
      const match = disposition.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `orders_${range}_${new Date().toISOString().slice(0, 10)}.csv`
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Download failed. The CSV may not exist yet — create some orders first.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', padding: '32px 24px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => navigate('/admin/users')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#6B7280', display: 'flex' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Audit Log</h1>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '3px 0 0 0' }}>Backup CSV status and manual export</p>
          </div>
        </div>
        <button
          onClick={fetchStatus}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading status…</div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <div style={{ color: '#EF4444', fontSize: 14, marginBottom: 12 }}>Failed to load audit status.</div>
          <button onClick={fetchStatus} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Retry</button>
        </div>
      ) : status && (
        <>
          {/* System Status card */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 16 }}>System Status</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'R2 Storage', ok: status.storage_configured, okText: 'Connected', failText: 'Not configured — set AUDIT_R2_BUCKET' },
                { label: 'Email Reports', ok: status.email_configured, okText: `Enabled → ${status.email_to}`, failText: 'Not configured — set SMTP_USER / SMTP_PASS / AUDIT_EMAIL_TO' },
                { label: 'CSV File', ok: status.csv_exists, okText: 'Found on R2', failText: 'Not created yet — create your first order to generate it' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusDot ok={row.ok} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#374151', minWidth: 110 }}>{row.label}</span>
                  <span style={{ fontSize: 13, color: row.ok ? '#059669' : '#DC2626' }}>{row.ok ? row.okText : row.failText}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CSV Details card */}
          {status.csv_exists && (
            <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>CSV File Details</div>
              <InfoRow label="Orders logged" value={status.csv_row_count.toLocaleString()} />
              <InfoRow label="File size" value={formatBytes(status.csv_size_bytes)} />
              <InfoRow label="Last updated" value={status.csv_last_modified ? formatDateTime(status.csv_last_modified) : '—'} />
            </div>
          )}

          {/* Schedule card */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Report Schedule</div>
            <InfoRow label="Next daily report" value={formatDateTime(status.next_daily_report)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
              <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 500 }}>Next monthly report</span>
              <span style={{ fontSize: 13, color: '#111827', fontWeight: 600 }}>{formatDateTime(status.next_monthly_report)}</span>
            </div>
          </div>

          {/* Download */}
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Manual Export</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 18, lineHeight: 1.6 }}>
              Download the audit CSV filtered by time range. Each file contains order ID, customer name, contact, status, assigned staff, and timestamps.
            </div>

            {!status.storage_configured ? (
              <div style={{ fontSize: 13, color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px' }}>
                Audit storage is not configured. Set <code style={{ fontFamily: 'monospace', fontSize: 12 }}>AUDIT_R2_BUCKET</code> in your environment to enable exports.
              </div>
            ) : (
              <>
                {!status.csv_exists && (
                  <div style={{ fontSize: 13, color: '#92400E', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                    No audit CSV found yet. Only orders created after the audit feature was enabled are logged — existing orders from before are not included.
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {([
                    { range: 'all'   as const, label: 'All Orders', desc: 'Every order ever logged', primary: true },
                    { range: 'month' as const, label: 'This Month', desc: new Date().toLocaleString('default', { month: 'long', year: 'numeric' }), primary: false },
                    { range: 'today' as const, label: 'Today',      desc: new Date().toLocaleDateString(), primary: false },
                  ]).map(({ range, label, desc, primary }) => {
                    const isDisabled = !status.csv_exists || downloading !== null
                    return (
                      <button
                        key={range}
                        onClick={() => !isDisabled && handleDownload(range)}
                        disabled={isDisabled}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '10px 18px', borderRadius: 8,
                          border: primary ? 'none' : '1px solid #E5E7EB',
                          background: primary ? (isDisabled ? '#6B7280' : '#111827') : '#fff',
                          color: primary ? '#fff' : (isDisabled ? '#9CA3AF' : '#374151'),
                          fontSize: 13, fontWeight: 600,
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          opacity: downloading !== null && downloading !== range ? 0.5 : 1,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        <span>
                          {downloading === range ? 'Downloading…' : label}
                          <span style={{ display: 'block', fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{desc}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>

                {/* Custom date range */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 10 }}>Custom Range</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', background: '#fff' }} />
                    <span style={{ fontSize: 13, color: '#9CA3AF' }}>to</span>
                    <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                      style={{ padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 13, color: '#374151', background: '#fff' }} />
                    <button
                      onClick={() => handleDownload('custom')}
                      disabled={!status.csv_exists || !fromDate || !toDate || downloading !== null}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 7,
                        border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600,
                        color: (!fromDate || !toDate || !status.csv_exists) ? '#9CA3AF' : '#374151',
                        cursor: (!fromDate || !toDate || !status.csv_exists) ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      {downloading === 'custom' ? 'Downloading…' : 'Download'}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* R2 connection test */}
            {status.storage_configured && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#374151', cursor: testing ? 'not-allowed' : 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                  {testing ? 'Testing…' : 'Test R2 Connection'}
                </button>
                {testResult && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: testResult.ok ? '#059669' : '#DC2626' }}>
                    {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
