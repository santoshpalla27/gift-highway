import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
} from 'react-native'
import { useCallback, useEffect, useState } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import DateTimePicker from '@react-native-community/datetimepicker'
import { adminService, AuditStatus } from '../../../services/adminService'
import { useAuthStore } from '../../../store/authStore'
import { formatDate, formatDateTime, datePickerToIST } from '../../../utils/date'

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1')

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

function toYMD(d: Date) {
  return datePickerToIST(d)
}

function StatusIndicator({ ok }: { ok: boolean }) {
  return <View style={[S.dot, { backgroundColor: ok ? '#10B981' : '#EF4444' }]} />
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={S.infoRow}>
      <Text style={S.infoLabel}>{label}</Text>
      <Text style={S.infoValue} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={S.card}>
      <Text style={S.cardTitle}>{title}</Text>
      {children}
    </View>
  )
}

type DownloadRange = 'all' | 'today' | 'month' | 'custom'

// ─── Date Picker Sheet (iOS) ──────────────────────────────────────────────────
function DatePickerModal({
  visible,
  value,
  onCancel,
  onDone,
  insetBottom,
}: {
  visible: boolean
  value: Date
  onCancel: () => void
  onDone: (d: Date) => void
  insetBottom: number
}) {
  const [temp, setTemp] = useState(value)
  useEffect(() => { if (visible) setTemp(value) }, [visible, value])
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' }}>
        <View style={{ backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: Math.max(insetBottom + 8, 24) }}>
          <View style={S.pickerHeader}>
            <TouchableOpacity onPress={onCancel}>
              <Text style={S.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDone(temp)}>
              <Text style={S.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={temp}
            mode="date"
            display="spinner"
            onChange={(_, d) => { if (d) setTemp(d) }}
            style={{ width: '100%', height: 216 }}
          />
        </View>
      </View>
    </Modal>
  )
}

export default function AuditScreen() {
  const insets = useSafeAreaInsets()
  const { accessToken } = useAuthStore()

  const [status, setStatus] = useState<AuditStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [downloading, setDownloading] = useState<DownloadRange | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Custom date range stored as YYYY-MM-DD strings
  const [fromDate, setFromDate] = useState(toYMD(new Date()))
  const [toDate, setToDate] = useState(toYMD(new Date()))

  // iOS picker state
  const [showFromPicker, setShowFromPicker] = useState(false)
  const [showToPicker, setShowToPicker] = useState(false)
  // Android inline picker state
  const [androidFromOpen, setAndroidFromOpen] = useState(false)
  const [androidToOpen, setAndroidToOpen] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const data = await adminService.getAuditStatus()
      setStatus(data)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await adminService.testAuditWrite()
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, message: 'R2 write test failed — check server logs.' })
    } finally {
      setTesting(false)
    }
  }

  const handleDownload = async (range: DownloadRange) => {
    if (!accessToken) return
    setDownloading(range)
    try {
      const suffix = range === 'custom'
        ? `range=custom&from=${fromDate}&to=${toDate}`
        : `range=${range}`
      const url = `${API_BASE_URL}/admin/audit/download?${suffix}`

      if (Platform.OS === 'web') {
        // Web: fetch as blob and trigger browser download
        const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) { alert('Download failed. The CSV may not exist yet.'); return }
        const blob = await res.blob()
        const disposition = res.headers.get('content-disposition') ?? ''
        const match = disposition.match(/filename="?([^"]+)"?/)
        const filename = match ? match[1] : `orders_${range}_${toYMD(new Date())}.csv`
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl; a.download = filename; a.click()
        URL.revokeObjectURL(objectUrl)
      } else {
        // Native: download to cache then share
        const FileSystem = await import('expo-file-system/legacy')
        const Sharing = await import('expo-sharing')
        const label = range === 'custom' ? `${fromDate}_to_${toDate}` : range === 'today' ? toYMD(new Date()) : range
        const dest = FileSystem.cacheDirectory + `orders_${label}.csv`
        const result = await FileSystem.downloadAsync(url, dest, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (result.status !== 200) {
          Alert.alert('Download failed', 'The server returned an error. Check that the CSV exists.')
          return
        }
        const canShare = await Sharing.isAvailableAsync()
        if (canShare) {
          await Sharing.shareAsync(result.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' })
        } else {
          Alert.alert('Saved', `CSV saved to:\n${result.uri}`)
        }
      }
    } catch {
      const msg = Platform.OS === 'web'
        ? 'Download failed. The CSV may not exist yet — create some orders first.'
        : 'Could not download the CSV. Make sure the audit CSV exists.'
      if (Platform.OS === 'web') alert(msg)
      else Alert.alert('Download failed', msg)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <View style={S.screen}>
      {/* Header */}
      <View style={[S.header, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity style={S.backBtn} onPress={() => router.navigate('/(app)/settings' as any)}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Audit Log</Text>
        <TouchableOpacity style={S.refreshBtn} onPress={fetchStatus} disabled={loading}>
          <Ionicons name="refresh" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={S.center}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={S.loadingText}>Loading status…</Text>
        </View>
      ) : error ? (
        <View style={S.center}>
          <Ionicons name="alert-circle-outline" size={44} color="#EF4444" />
          <Text style={S.errorText}>Failed to load audit status.</Text>
          <TouchableOpacity style={S.retryBtn} onPress={fetchStatus}>
            <Text style={S.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : status ? (
        <ScrollView
          contentContainerStyle={[S.scroll, { paddingBottom: Math.max(insets.bottom + 24, 40) }]}
          showsVerticalScrollIndicator={false}
        >
          {/* System Status */}
          <SectionCard title="SYSTEM STATUS">
            {([
              { label: 'R2 Storage', ok: status.storage_configured, detail: status.storage_configured ? 'Connected' : 'Not configured' },
              { label: 'Email Reports', ok: status.email_configured, detail: status.email_configured ? status.email_to : 'Not configured' },
              { label: 'CSV File', ok: status.csv_exists, detail: status.csv_exists ? 'Found on R2' : 'Not created yet' },
            ]).map((row, i, arr) => (
              <View key={row.label}>
                <View style={S.statusRow}>
                  <StatusIndicator ok={row.ok} />
                  <View style={S.statusBody}>
                    <Text style={S.statusLabel}>{row.label}</Text>
                    <Text style={[S.statusDetail, { color: row.ok ? '#059669' : '#DC2626' }]} numberOfLines={1}>
                      {row.detail}
                    </Text>
                  </View>
                </View>
                {i < arr.length - 1 && <View style={S.sep} />}
              </View>
            ))}
          </SectionCard>

          {/* CSV Details */}
          {status.csv_exists && (
            <SectionCard title="CSV FILE">
              <InfoRow label="Orders logged" value={status.csv_row_count.toLocaleString()} />
              <View style={S.sep} />
              <InfoRow label="File size" value={formatBytes(status.csv_size_bytes)} />
              <View style={S.sep} />
              <InfoRow label="Last updated" value={status.csv_last_modified ? formatDateTime(status.csv_last_modified) : '—'} />
            </SectionCard>
          )}

          {/* Schedule */}
          <SectionCard title="REPORT SCHEDULE">
            <InfoRow label="Next daily" value={formatDateTime(status.next_daily_report)} />
            <View style={S.sep} />
            <InfoRow label="Next monthly" value={formatDateTime(status.next_monthly_report)} />
          </SectionCard>

          {/* Export */}
          <SectionCard title="MANUAL EXPORT">
            {!status.storage_configured ? (
              <View style={S.alertBox}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={S.alertText}>Audit storage is not configured. Set AUDIT_R2_BUCKET in your environment.</Text>
              </View>
            ) : (
              <>
                {!status.csv_exists && (
                  <View style={[S.alertBox, S.alertWarn]}>
                    <Ionicons name="information-circle-outline" size={16} color="#92400E" />
                    <Text style={[S.alertText, { color: '#92400E' }]}>
                      No CSV yet. Create an order to generate the first audit entry.
                    </Text>
                  </View>
                )}

                {([
                  { range: 'all' as const, label: 'All Orders', icon: 'download-outline' as const, primary: true },
                  { range: 'month' as const, label: 'This Month', icon: 'calendar-outline' as const, primary: false },
                  { range: 'today' as const, label: 'Today', icon: 'today-outline' as const, primary: false },
                ]).map(({ range, label, icon, primary }) => {
                  const disabled = !status.csv_exists || downloading !== null
                  const isLoading = downloading === range
                  return (
                    <TouchableOpacity
                      key={range}
                      style={[S.dlBtn, primary && S.dlBtnPrimary, disabled && S.dlBtnDisabled, { marginBottom: 10 }]}
                      onPress={() => !disabled && handleDownload(range)}
                      disabled={disabled}
                      activeOpacity={0.7}
                    >
                      {isLoading
                        ? <ActivityIndicator size="small" color={primary ? '#fff' : '#4F46E5'} />
                        : <Ionicons name={icon} size={16} color={primary ? '#fff' : disabled ? '#9CA3AF' : '#4F46E5'} />
                      }
                      <Text style={[S.dlBtnText, primary && S.dlBtnTextPrimary, disabled && S.dlBtnTextDisabled]}>
                        {isLoading ? 'Downloading…' : label}
                      </Text>
                    </TouchableOpacity>
                  )
                })}

                {/* Custom range */}
                <View style={S.customSection}>
                  <Text style={S.customTitle}>Custom Range</Text>
                  <View style={S.dateRow}>
                    {/* From */}
                    <View style={S.datePickerWrap}>
                      <Text style={S.datePickerLabel}>From</Text>
                      <TouchableOpacity
                        style={S.datePicker}
                        onPress={() => {
                          if (Platform.OS === 'ios') setShowFromPicker(true)
                          else setAndroidFromOpen(true)
                        }}
                      >
                        <Text style={S.datePickerText}>{formatDate(fromDate)}</Text>
                        <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                    {/* To */}
                    <View style={S.datePickerWrap}>
                      <Text style={S.datePickerLabel}>To</Text>
                      <TouchableOpacity
                        style={S.datePicker}
                        onPress={() => {
                          if (Platform.OS === 'ios') setShowToPicker(true)
                          else setAndroidToOpen(true)
                        }}
                      >
                        <Text style={S.datePickerText}>{formatDate(toDate)}</Text>
                        <Ionicons name="calendar-outline" size={15} color="#6B7280" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Android inline pickers */}
                  {Platform.OS === 'android' && androidFromOpen && (
                    <DateTimePicker
                      value={new Date(fromDate + 'T00:00:00')}
                      mode="date"
                      display="default"
                      onChange={(event, d) => {
                        setAndroidFromOpen(false)
                        if (event.type === 'set' && d) setFromDate(toYMD(d))
                      }}
                    />
                  )}
                  {Platform.OS === 'android' && androidToOpen && (
                    <DateTimePicker
                      value={new Date(toDate + 'T00:00:00')}
                      mode="date"
                      display="default"
                      onChange={(event, d) => {
                        setAndroidToOpen(false)
                        if (event.type === 'set' && d) setToDate(toYMD(d))
                      }}
                    />
                  )}

                  <TouchableOpacity
                    style={[S.dlBtn, (!status.csv_exists || downloading !== null) && S.dlBtnDisabled]}
                    onPress={() => handleDownload('custom')}
                    disabled={!status.csv_exists || downloading !== null}
                    activeOpacity={0.7}
                  >
                    {downloading === 'custom'
                      ? <ActivityIndicator size="small" color="#4F46E5" />
                      : <Ionicons name="download-outline" size={16} color={!status.csv_exists ? '#9CA3AF' : '#4F46E5'} />
                    }
                    <Text style={[S.dlBtnText, (!status.csv_exists || downloading !== null) && S.dlBtnTextDisabled]}>
                      {downloading === 'custom' ? 'Downloading…' : 'Download Custom Range'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </SectionCard>

          {/* Test R2 */}
          {status.storage_configured && (
            <SectionCard title="DIAGNOSTICS">
              <TouchableOpacity
                style={[S.dlBtn, testing && S.dlBtnDisabled]}
                onPress={handleTest}
                disabled={testing}
                activeOpacity={0.7}
              >
                {testing
                  ? <ActivityIndicator size="small" color="#4F46E5" />
                  : <Ionicons name="shield-checkmark-outline" size={16} color="#4F46E5" />
                }
                <Text style={[S.dlBtnText, testing && S.dlBtnTextDisabled]}>
                  {testing ? 'Testing…' : 'Test R2 Connection'}
                </Text>
              </TouchableOpacity>

              {testResult && (
                <View style={[S.testResult, testResult.ok ? S.testResultOk : S.testResultFail]}>
                  <Ionicons
                    name={testResult.ok ? 'checkmark-circle' : 'close-circle'}
                    size={16}
                    color={testResult.ok ? '#059669' : '#DC2626'}
                  />
                  <Text style={[S.testResultText, { color: testResult.ok ? '#059669' : '#DC2626' }]}>
                    {testResult.message}
                  </Text>
                </View>
              )}
            </SectionCard>
          )}
        </ScrollView>
      ) : null}

      {/* iOS date picker modals */}
      {Platform.OS === 'ios' && (
        <>
          <DatePickerModal
            visible={showFromPicker}
            value={new Date(fromDate + 'T00:00:00')}
            onCancel={() => setShowFromPicker(false)}
            onDone={(d) => { setFromDate(toYMD(d)); setShowFromPicker(false) }}
            insetBottom={insets.bottom}
          />
          <DatePickerModal
            visible={showToPicker}
            value={new Date(toDate + 'T00:00:00')}
            onCancel={() => setShowToPicker(false)}
            onDone={(d) => { setToDate(toYMD(d)); setShowToPicker(false) }}
            insetBottom={insets.bottom}
          />
        </>
      )}
    </View>
  )
}

const S = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F5F6FA' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 8, marginLeft: -8 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', color: '#111827', marginLeft: 4 },
  refreshBtn: { padding: 8, marginRight: -8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#9CA3AF' },
  errorText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#EEF2FF', borderRadius: 8 },
  retryText: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },
  scroll: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cardTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.6, marginBottom: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  statusBody: { flex: 1 },
  statusLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  statusDetail: { fontSize: 12, marginTop: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: '#F3F4F6' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  infoLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#111827', maxWidth: '55%', textAlign: 'right' },
  alertBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12, marginBottom: 14,
  },
  alertWarn: { backgroundColor: '#FFFBEB' },
  alertText: { flex: 1, fontSize: 13, color: '#DC2626', lineHeight: 18 },
  dlBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E7FF', backgroundColor: '#EEF2FF',
  },
  dlBtnPrimary: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  dlBtnDisabled: { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' },
  dlBtnText: { fontSize: 14, fontWeight: '600', color: '#4F46E5' },
  dlBtnTextPrimary: { color: '#FFFFFF' },
  dlBtnTextDisabled: { color: '#9CA3AF' },
  customSection: { marginTop: 8, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6', gap: 10 },
  customTitle: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  dateRow: { flexDirection: 'row', gap: 10 },
  datePickerWrap: { flex: 1, gap: 4 },
  datePickerLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  datePicker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  datePickerText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  testResult: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 8 },
  testResultOk: { backgroundColor: '#ECFDF5' },
  testResultFail: { backgroundColor: '#FEF2F2' },
  testResultText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  pickerCancel: { fontSize: 16, color: '#6B7280', fontWeight: '600' },
  pickerDone: { fontSize: 16, color: '#6366F1', fontWeight: '700' },
})
