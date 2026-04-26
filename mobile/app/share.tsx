import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useShareIntentContext } from 'expo-share-intent'
import { useAuthStore } from '../store/authStore'
import { orderService, Order } from '../services/orderService'
import { attachmentService, formatBytes } from '../services/attachmentService'

// ── Helpers ───────────────────────────────────────────────────────────────────

function mimeIcon(mime: string): { name: string; color: string } {
  if (mime.startsWith('image/'))  return { name: 'image-outline',        color: '#6366F1' }
  if (mime.includes('pdf'))       return { name: 'document-text-outline', color: '#EF4444' }
  if (mime.includes('word'))      return { name: 'document-outline',      color: '#3B82F6' }
  if (mime.includes('excel') || mime.includes('spreadsheet'))
                                  return { name: 'grid-outline',          color: '#10B981' }
  if (mime.startsWith('video/'))  return { name: 'videocam-outline',      color: '#F59E0B' }
  return { name: 'attach-outline', color: '#6B7280' }
}

const STATUS_COLORS: Record<string, string> = {
  new:         '#6B7280',
  in_progress: '#6366F1',
  completed:   '#10B981',
}
const STATUS_LABELS: Record<string, string> = {
  new:         'New',
  in_progress: 'In Progress',
  completed:   'Completed',
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileProgress {
  fileName: string
  mimeType: string
  sizeBytes: number
  progress: number   // 0–100
  done: boolean
  error: string | null
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ShareScreen() {
  const insets = useSafeAreaInsets()
  const { shareIntent, resetShareIntent } = useShareIntentContext()
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)

  const [orders, setOrders]             = useState<Order[]>([])
  const [search, setSearch]             = useState('')
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [fileProgress, setFileProgress]   = useState<FileProgress[]>([])
  const [uploading, setUploading]         = useState(false)
  const [uploadDone, setUploadDone]       = useState(false)

  // Files from the share intent
  const sharedFiles = shareIntent?.files ?? []

  // ── Load orders ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return
    orderService.listOrders({ limit: 100 })
      .then(res => setOrders(res.orders))
      .catch(() => {})
      .finally(() => setLoadingOrders(false))
  }, [isAuthenticated])

  // ── Filtered order list ──────────────────────────────────────────────────

  const filteredOrders = search.trim()
    ? orders.filter(o => {
        const q = search.toLowerCase()
        return (
          o.title.toLowerCase().includes(q) ||
          o.customer_name.toLowerCase().includes(q) ||
          String(o.order_number).includes(q)
        )
      })
    : orders

  // ── Upload logic ─────────────────────────────────────────────────────────

  const handleUpload = useCallback(async () => {
    if (!selectedOrder || sharedFiles.length === 0) return

    const initial: FileProgress[] = sharedFiles.map(f => ({
      fileName:  f.fileName ?? 'file',
      mimeType:  f.mimeType ?? 'application/octet-stream',
      sizeBytes: f.size ?? 0,
      progress:  0,
      done:      false,
      error:     null,
    }))
    setFileProgress(initial)
    setUploading(true)

    let anyError = false

    for (let i = 0; i < sharedFiles.length; i++) {
      const file     = sharedFiles[i]
      const fileName = file.fileName ?? `file_${i + 1}`
      const mimeType = file.mimeType ?? 'application/octet-stream'
      const fileSize = file.size ?? 0

      const update = (patch: Partial<FileProgress>) =>
        setFileProgress(prev => prev.map((f, idx) => idx === i ? { ...f, ...patch } : f))

      try {
        const { upload_url, file_key, file_url } = await attachmentService.getUploadURL(
          selectedOrder.id, fileName, mimeType, fileSize,
        )

        await attachmentService.uploadToR2(upload_url, file.path, mimeType, pct => {
          update({ progress: pct })
        })

        await attachmentService.confirmUpload(selectedOrder.id, {
          file_name:  fileName,
          file_key,
          file_url,
          mime_type:  mimeType,
          size_bytes: fileSize,
        })

        update({ progress: 100, done: true })
      } catch {
        update({ error: 'Upload failed' })
        anyError = true
      }
    }

    setUploading(false)
    if (!anyError) {
      setUploadDone(true)
    }
  }, [selectedOrder, sharedFiles])

  const handleClose = useCallback(() => {
    resetShareIntent()
    if (router.canGoBack()) {
      router.back()
    } else {
      router.replace('/(app)')
    }
  }, [resetShareIntent])

  // ── Not authenticated ────────────────────────────────────────────────────

  if (!isAuthenticated) {
    return (
      <View style={[S.center, { paddingTop: insets.top }]}>
        <Ionicons name="lock-closed-outline" size={48} color="#9CA3AF" />
        <Text style={S.emptyTitle}>Sign in required</Text>
        <Text style={S.emptyBody}>Please open Gift Highway and sign in first.</Text>
        <TouchableOpacity style={S.closeBtn} onPress={handleClose}>
          <Text style={S.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── No files ─────────────────────────────────────────────────────────────

  if (sharedFiles.length === 0) {
    return (
      <View style={[S.center, { paddingTop: insets.top }]}>
        <Ionicons name="attach-outline" size={48} color="#9CA3AF" />
        <Text style={S.emptyTitle}>No files received</Text>
        <TouchableOpacity style={S.closeBtn} onPress={handleClose}>
          <Text style={S.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Success state ────────────────────────────────────────────────────────

  if (uploadDone) {
    return (
      <View style={[S.center, { paddingTop: insets.top }]}>
        <View style={S.successIcon}>
          <Ionicons name="checkmark" size={36} color="#fff" />
        </View>
        <Text style={S.successTitle}>Uploaded!</Text>
        <Text style={S.successBody}>
          {sharedFiles.length} {sharedFiles.length === 1 ? 'file' : 'files'} added to{' '}
          <Text style={{ fontWeight: '700' }}>Order #{selectedOrder?.order_number}</Text>
        </Text>
        <TouchableOpacity style={S.uploadBtn} onPress={handleClose}>
          <Text style={S.uploadBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    )
  }

  // ── Main screen ──────────────────────────────────────────────────────────

  return (
    <View style={[S.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={S.header}>
        <TouchableOpacity onPress={handleClose} disabled={uploading} style={S.headerClose}>
          <Ionicons name="close" size={22} color="#111827" />
        </TouchableOpacity>
        <Text style={S.headerTitle}>Share to Gift Highway</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Files preview */}
      <View style={S.filesSection}>
        <Text style={S.sectionLabel}>
          {sharedFiles.length === 1 ? '1 FILE' : `${sharedFiles.length} FILES`}
        </Text>
        <View style={S.filesList}>
          {sharedFiles.map((file, i) => {
            const prog = fileProgress[i]
            const icon = mimeIcon(file.mimeType ?? '')
            return (
              <View key={i} style={S.fileRow}>
                <View style={[S.fileIconWrap, { backgroundColor: icon.color + '18' }]}>
                  <Ionicons name={icon.name as any} size={20} color={icon.color} />
                </View>
                <View style={S.fileInfo}>
                  <Text style={S.fileName} numberOfLines={1}>{file.fileName ?? 'file'}</Text>
                  <Text style={S.fileSize}>{file.size ? formatBytes(file.size) : ''}</Text>
                  {prog && !prog.done && !prog.error && (
                    <View style={S.progressBar}>
                      <View style={[S.progressFill, { width: `${prog.progress}%` as any }]} />
                    </View>
                  )}
                  {prog?.error && <Text style={S.fileError}>{prog.error}</Text>}
                </View>
                {prog?.done && (
                  <Ionicons name="checkmark-circle" size={20} color="#10B981" />
                )}
                {uploading && !prog?.done && !prog?.error && (
                  <ActivityIndicator size="small" color="#6366F1" />
                )}
              </View>
            )
          })}
        </View>
      </View>

      <View style={S.divider} />

      {/* Order search */}
      <View style={S.searchWrap}>
        <Ionicons name="search-outline" size={16} color="#9CA3AF" style={S.searchIcon} />
        <TextInput
          style={S.searchInput}
          placeholder="Search orders..."
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          editable={!uploading}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>

      {/* Order list */}
      {loadingOrders ? (
        <View style={S.listLoader}>
          <ActivityIndicator color="#6366F1" />
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={o => o.id}
          style={S.list}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={S.emptyList}>
              <Text style={S.emptyListText}>No orders found</Text>
            </View>
          }
          renderItem={({ item }) => {
            const selected = selectedOrder?.id === item.id
            return (
              <TouchableOpacity
                style={[S.orderRow, selected && S.orderRowSelected]}
                onPress={() => !uploading && setSelectedOrder(item)}
                activeOpacity={0.7}
              >
                <View style={S.orderLeft}>
                  <View style={S.orderNumBadge}>
                    <Text style={S.orderNumText}>#{item.order_number}</Text>
                  </View>
                  <View style={S.orderMeta}>
                    <Text style={[S.orderTitle, selected && S.orderTitleSelected]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={S.orderCustomer} numberOfLines={1}>{item.customer_name}</Text>
                  </View>
                </View>
                <View style={S.orderRight}>
                  <View style={[S.statusBadge, { backgroundColor: STATUS_COLORS[item.status] + '18' }]}>
                    <Text style={[S.statusText, { color: STATUS_COLORS[item.status] }]}>
                      {STATUS_LABELS[item.status] ?? item.status}
                    </Text>
                  </View>
                  {selected && <Ionicons name="checkmark-circle" size={20} color="#6366F1" style={{ marginTop: 4 }} />}
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}

      {/* Upload button */}
      <View style={[S.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[S.uploadBtn, (!selectedOrder || uploading) && S.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={!selectedOrder || uploading}
          activeOpacity={0.8}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={S.uploadBtnText}>
                {selectedOrder
                  ? `Upload to Order #${selectedOrder.order_number}`
                  : 'Select an order above'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#F9FAFB' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  headerClose: { width: 38, alignItems: 'flex-start' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },

  // Files section
  filesSection: { backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5, marginBottom: 10 },
  filesList: { gap: 8 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F9FAFB', borderRadius: 10,
    padding: 10, borderWidth: 1, borderColor: '#F3F4F6',
  },
  fileIconWrap: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1, gap: 2 },
  fileName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  fileSize: { fontSize: 11, color: '#9CA3AF' },
  fileError: { fontSize: 11, color: '#EF4444', marginTop: 2 },
  progressBar: { height: 3, backgroundColor: '#E5E7EB', borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#6366F1', borderRadius: 2 },

  divider: { height: 8, backgroundColor: '#F3F4F6' },

  // Search
  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    margin: 12, paddingHorizontal: 12,
    backgroundColor: '#fff', borderRadius: 10,
    borderWidth: 1, borderColor: '#E5E7EB',
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },

  // Order list
  list: { flex: 1 },
  listLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyList: { padding: 32, alignItems: 'center' },
  emptyListText: { color: '#9CA3AF', fontSize: 14 },

  orderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 12, marginBottom: 6,
    backgroundColor: '#fff', borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: '#E5E7EB',
  },
  orderRowSelected: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  orderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  orderNumBadge: {
    backgroundColor: '#F3F4F6', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
    minWidth: 36, alignItems: 'center',
  },
  orderNumText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  orderMeta: { flex: 1 },
  orderTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  orderTitleSelected: { color: '#4F46E5' },
  orderCustomer: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  orderRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 },
  statusText: { fontSize: 10, fontWeight: '700' },

  // Footer
  footer: { backgroundColor: '#fff', padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#6366F1', borderRadius: 12,
    paddingVertical: 14,
  },
  uploadBtnDisabled: { backgroundColor: '#C7D2FE' },
  uploadBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Empty / auth screens
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 16, marginBottom: 6 },
  emptyBody:  { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
  closeBtn: {
    marginTop: 24, backgroundColor: '#6366F1', borderRadius: 12,
    paddingHorizontal: 32, paddingVertical: 12,
  },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Success screen
  successIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 16 },
  successBody:  { fontSize: 14, color: '#6B7280', marginTop: 8, textAlign: 'center', lineHeight: 22 },
})
