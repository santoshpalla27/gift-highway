import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orderService, OrderEvent } from '../../../services/orderService'
import { useUpdateOrderStatus } from '../hooks/useOrders'
import { OrderModal } from '../components/OrderModal'
import { useAuthStore } from '../../../store/authStore'
import { useOrderPermissions } from '../hooks/useOrderPermissions'
import { Skeleton } from '../../../components/system/Skeleton'
import { useSocketEvent } from '../../../providers/SocketProvider'
import type { Order } from '../../../services/orderService'

// ─── Meta maps ───────────────────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  new:         { label: 'Yet to Start', color: '#6B7280', bg: '#F3F4F6' },
  in_progress: { label: 'Working',      color: '#3B82F6', bg: '#EFF6FF' },
  completed:   { label: 'Done',         color: '#10B981', bg: '#ECFDF5' },
}
const PRIORITY_META: Record<string, { label: string; color: string; bg: string }> = {
  low:    { label: 'Low',    color: '#6B7280', bg: '#F3F4F6' },
  medium: { label: 'Medium', color: '#F59E0B', bg: '#FFFBEB' },
  high:   { label: 'High',   color: '#8B5CF6', bg: '#F3E8FF' },
  urgent: { label: 'Urgent', color: '#EF4444', bg: '#FEF2F2' },
}
const STATUS_OPTIONS = ['new', 'in_progress', 'completed'] as const

function chip(meta: { label: string; color: string; bg: string }) {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 10px', borderRadius: 9999,
    fontSize: 12, fontWeight: 600,
    color: meta.color, background: meta.bg,
  } as React.CSSProperties
}

// ─── Timeline helpers ─────────────────────────────────────────────────────────

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 7200) return `${Math.floor(diffSec / 3600)}h ago`
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return time
  if (dDay.getTime() === yesterday.getTime()) return `Yesterday ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

function formatDateGroup(iso: string): string {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  const dDay = new Date(d); dDay.setHours(0, 0, 0, 0)
  if (dDay.getTime() === today.getTime()) return 'Today'
  if (dDay.getTime() === yesterday.getTime()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function groupByDate(events: OrderEvent[]): { label: string; events: OrderEvent[] }[] {
  const map = new Map<string, OrderEvent[]>()
  for (const ev of events) {
    const k = dayKey(ev.created_at)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(ev)
  }
  return Array.from(map.entries()).map(([k, evs]) => ({
    label: formatDateGroup(k + 'T12:00:00'),
    events: evs,
  }))
}

function DateDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
    </div>
  )
}

// ─── Extended event type for local optimistic state ──────────────────────────
type LocalOrderEvent = OrderEvent & { failed?: boolean; originalText?: string }

// ─── Timeline event renderer ─────────────────────────────────────────────────

function TimelineEvent({ event, isOptimistic, onRetry, onDelete }: {
  event: LocalOrderEvent
  isOptimistic?: boolean
  onRetry?: () => void
  onDelete?: () => void
}) {
  const isComment = event.type === 'comment_added'

  if (isComment) {
    const isFailed = event.failed
    return (
      <div style={{ display: 'flex', gap: 10, opacity: isOptimistic && !isFailed ? 0.6 : 1 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2,
        }}>
          {getInitials(event.actor_name)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{event.actor_name}</span>
            <span style={{ fontSize: 11, color: isFailed ? '#EF4444' : '#9CA3AF' }}>
              {isFailed ? 'Failed to send' : formatTimestamp(event.created_at)}
            </span>
            {onDelete && !isOptimistic && (
              <button
                onClick={onDelete}
                title="Delete comment"
                style={{
                  marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                  padding: '2px 4px', color: '#D1D5DB', lineHeight: 1,
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#D1D5DB')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
            )}
          </div>
          <div style={{
            background: isFailed ? '#FFF5F5' : '#FFFFFF',
            border: `1px solid ${isFailed ? '#FCA5A5' : '#E5E7EB'}`,
            borderRadius: '4px 12px 12px 12px',
            padding: '10px 14px', fontSize: 13.5, color: '#374151', lineHeight: 1.6,
            boxShadow: '0 1px 3px rgba(0,0,0,.04)',
          }}>
            {event.payload.text}
          </div>
          {isFailed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ fontSize: 12, color: '#EF4444' }}>Message not delivered.</span>
              <button
                onClick={onRetry}
                style={{
                  fontSize: 12, fontWeight: 600, color: '#6366F1',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  textDecoration: 'underline',
                }}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // System event
  let icon: React.ReactNode
  let text = ''

  switch (event.type) {
    case 'order_created':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      text = 'created this order'
      break
    case 'status_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      text = `Status changed: ${STATUS_META[event.payload.from]?.label ?? event.payload.from} → ${STATUS_META[event.payload.to]?.label ?? event.payload.to}`
      break
    case 'priority_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      text = `Priority changed: ${event.payload.from} → ${event.payload.to}`
      break
    case 'due_date_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      text = event.payload.to ? `Due date set to ${event.payload.to}` : 'Due date removed'
      break
    case 'assignees_changed':
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      text = event.payload.names ? `Assigned to ${event.payload.names}` : 'Assignees updated'
      break
    default:
      icon = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      text = 'Order details updated'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: '#F9FAFB', border: '1px solid #F3F4F6', borderRadius: 10,
      padding: '8px 12px',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', background: '#E5E7EB', color: '#6B7280',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {icon}
      </div>
      <span style={{ fontSize: 12.5, color: '#6B7280', flex: 1 }}>
        <span style={{ fontWeight: 600, color: '#374151' }}>{event.actor_name}</span>
        {' · '}{text}
      </span>
      <span style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {formatTimestamp(event.created_at)}
      </span>
    </div>
  )
}

// ─── Status dropdown for right panel ─────────────────────────────────────────

function StatusDropdown({ order, onUpdate }: { order: Order; onUpdate: (status: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const sm = STATUS_META[order.status] ?? STATUS_META.new

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', borderRadius: 8, border: '1.5px solid #E4E6EF',
          background: sm.bg, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          color: sm.color,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: sm.color, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{sm.label}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 999,
          background: '#FFFFFF', border: '1px solid #E4E6EF', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,.08)', padding: 4,
        }}>
          {STATUS_OPTIONS.map(s => {
            const m = STATUS_META[s]
            const active = order.status === s
            return (
              <div
                key={s}
                onClick={() => { if (!active) onUpdate(s); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 7, cursor: active ? 'default' : 'pointer',
                  background: active ? m.bg : 'transparent',
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? m.color : '#374151',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = '#F3F4F6' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? m.color : '#D1D5DB' }} />
                {m.label}
                {active && <svg style={{ marginLeft: 'auto' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Right panel section ──────────────────────────────────────────────────────

function PanelSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

const LIMIT = 30

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user } = useAuthStore()

  // ── Order data ──────────────────────────────────────────────────────────────
  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ['orders', id],
    queryFn: () => orderService.getOrder(id!),
    enabled: !!id,
  })

  // ── Events: state-based pagination ─────────────────────────────────────────
  const [evList, setEvList] = useState<OrderEvent[]>([])
  const [totalEvents, setTotalEvents] = useState(0)
  const [hasOlder, setHasOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [eventsLoading, setEventsLoading] = useState(true)
  const olderPageRef = useRef(2)
  const evListRef = useRef<OrderEvent[]>([])
  useEffect(() => { evListRef.current = evList }, [evList])

  // ── Delete confirmation ─────────────────────────────────────────────────────
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // ── Optimistic / failed comments ────────────────────────────────────────────
  const [optimisticEvents, setOptimisticEvents] = useState<LocalOrderEvent[]>([])
  const allEvents = [...evList, ...optimisticEvents]

  // ── Scroll / new-events badge ───────────────────────────────────────────────
  const [newCount, setNewCount] = useState(0)
  const atBottomRef = useRef(true)
  const timelineRef = useRef<HTMLDivElement>(null)
  const feedEndRef = useRef<HTMLDivElement>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [commentText, setCommentText] = useState('')

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) return
    setEventsLoading(true)
    orderService.listEvents(id, 1, LIMIT, 'desc').then(data => {
      setEvList([...data.events].reverse())
      setTotalEvents(data.total)
      setHasOlder(data.total > LIMIT)
      olderPageRef.current = 2
      setEventsLoading(false)
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50)
    })
  }, [id])

  // ── Load older ──────────────────────────────────────────────────────────────
  const loadOlder = async () => {
    if (loadingOlder || !id) return
    setLoadingOlder(true)
    const tl = timelineRef.current
    const prevScrollHeight = tl?.scrollHeight ?? 0
    try {
      const data = await orderService.listEvents(id, olderPageRef.current, LIMIT, 'desc')
      const older = [...data.events].reverse()
      setEvList(prev => [...older, ...prev])
      setTotalEvents(data.total)
      setHasOlder(olderPageRef.current * LIMIT < data.total)
      olderPageRef.current++
      requestAnimationFrame(() => {
        if (tl) tl.scrollTop = tl.scrollHeight - prevScrollHeight
      })
    } finally {
      setLoadingOlder(false)
    }
  }

  // ── Realtime: append new events ─────────────────────────────────────────────
  const fetchLatest = useCallback(async () => {
    if (!id) return
    const data = await orderService.listEvents(id, 1, LIMIT, 'desc')
    const latest = [...data.events].reverse()
    const existingIds = new Set(evListRef.current.map(e => e.id))
    const newEvs = latest.filter(e => !existingIds.has(e.id))
    if (newEvs.length === 0) return
    setEvList(prev => [...prev, ...newEvs])
    setOptimisticEvents(prev => prev.filter(e => e.failed))
    setTotalEvents(data.total)
    if (atBottomRef.current) {
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    } else {
      setNewCount(n => n + newEvs.length)
    }
  }, [id])

  // ── Realtime: react to socket events for this order ────────────────────────
  useSocketEvent(useCallback((event) => {
    if (event.type === 'order.event_added' && event.entity_id === id) {
      fetchLatest()
    }
    if (
      (event.type === 'order.updated' || event.type === 'order.status_changed') &&
      event.entity_id === id
    ) {
      qc.invalidateQueries({ queryKey: ['orders', id] })
    }
  }, [id, fetchLatest, qc]))

  // ── Scroll tracking ─────────────────────────────────────────────────────────
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = atBottom
    if (atBottom && newCount > 0) setNewCount(0)
  }
  const scrollToBottom = () => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setNewCount(0)
    atBottomRef.current = true
  }

  // ── Status ──────────────────────────────────────────────────────────────────
  const { mutate: updateStatus } = useUpdateOrderStatus()

  // ── Comment mutation ────────────────────────────────────────────────────────
  const { mutate: addComment, isPending: commenting } = useMutation({
    mutationFn: (text: string) => orderService.addComment(id!, text),
    onMutate: (text) => {
      const optId = `opt-${Date.now()}`
      const optimistic: LocalOrderEvent = {
        id: optId,
        order_id: id!,
        type: 'comment_added',
        actor_id: user?.id ?? null,
        actor_name: `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim(),
        payload: { text },
        created_at: new Date().toISOString(),
        originalText: text,
      }
      setOptimisticEvents(prev => [...prev, optimistic])
      setCommentText('')
      atBottomRef.current = true
      setTimeout(() => feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      return { optId }
    },
    onSuccess: () => {
      fetchLatest()
      qc.invalidateQueries({ queryKey: ['orders', id] })
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.optId) {
        setOptimisticEvents(prev =>
          prev.map(e => e.id === ctx.optId ? { ...e, failed: true } : e)
        )
      }
    },
  })

  const handleSend = (text?: string) => {
    const t = (text ?? commentText).trim()
    if (!t || commenting) return
    addComment(t)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleRetry = (ev: LocalOrderEvent) => {
    const text = ev.originalText ?? (ev.payload as Record<string, string>).text
    setOptimisticEvents(prev => prev.filter(e => e.id !== ev.id))
    if (text) handleSend(text)
  }

  // Must be called unconditionally before any early returns
  const perms = useOrderPermissions(order ?? null)

  const handleDeleteComment = (eventId: string) => setDeleteConfirmId(eventId)

  const confirmDelete = async () => {
    if (!id || !deleteConfirmId) return
    const eventId = deleteConfirmId
    setDeleteConfirmId(null)
    await orderService.deleteComment(id, eventId)
    setEvList(prev => prev.filter(e => e.id !== eventId))
  }

  if (orderLoading) {
    return (
      <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
        <Skeleton height={28} width={300} />
        <Skeleton height={18} width={200} />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Skeleton height={24} width={90} borderRadius={999} />
          <Skeleton height={24} width={70} borderRadius={999} />
        </div>
      </div>
    )
  }

  if (!order) return null

  const sm = STATUS_META[order.status] ?? STATUS_META.new
  const pm = PRIORITY_META[order.priority] ?? PRIORITY_META.medium
  const due = order.due_date ? new Date(order.due_date) : null
  const dueOverdue = due && due < new Date()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, background: '#F5F6FA', overflow: 'hidden' }}>
      <style>{`
        .composer-input {
          flex: 1; border: none; background: transparent; outline: none;
          font-size: 14px; color: #111827; resize: none; font-family: inherit;
          line-height: 1.5;
        }
        .composer-input::placeholder { color: #9CA3AF; }
        .panel-status-opt {
          padding: 8px 12px; border-radius: 8px; cursor: pointer;
          font-size: 13px; font-weight: 500; transition: background 0.1s;
        }
        .panel-status-opt:hover { background: #F3F4F6; }
        @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      {/* Top header bar */}
      <div style={{
        background: '#FFFFFF', borderBottom: '1px solid #E4E6EF',
        padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, padding: '4px 0' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Back
        </button>
        <div style={{ width: 1, height: 20, background: '#E4E6EF' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6366F1', fontFamily: 'monospace' }}>#{order.order_number}</span>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#111827', flex: 1 }}>{order.title}</span>
        {perms.canEditOrder && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => setShowEdit(true)}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #E4E6EF',
                background: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
              }}
            >
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Body: two columns */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — timeline + composer */}
        <div style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Timeline scroll area */}
          <div
            ref={timelineRef}
            onScroll={handleTimelineScroll}
            style={{ flex: 1, overflowY: 'auto', padding: '16px 28px 8px', position: 'relative' }}
          >
            {/* Load older button */}
            {!eventsLoading && hasOlder && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  style={{
                    background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 20,
                    padding: '6px 16px', fontSize: 12.5, fontWeight: 600, color: '#6B7280',
                    cursor: loadingOlder ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {loadingOlder
                    ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Loading…</>
                    : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>Load older updates</>
                  }
                </button>
              </div>
            )}

            {eventsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Skeleton width={32} height={32} borderRadius="50%" />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Skeleton width={120} height={13} />
                      <Skeleton width="70%" height={36} borderRadius={8} />
                    </div>
                  </div>
                ))}
              </div>
            ) : allEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>
                No activity yet. Be the first to leave a note.
              </div>
            ) : (
              groupByDate(allEvents).map(group => (
                <div key={group.label}>
                  <DateDivider label={group.label} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {group.events.map(ev => (
                      <div key={ev.id} style={{ animation: 'fadeSlideIn 0.2s ease' }}>
                        <TimelineEvent
                          event={ev as LocalOrderEvent}
                          isOptimistic={ev.id.startsWith('opt-')}
                          onRetry={() => handleRetry(ev as LocalOrderEvent)}
                          onDelete={perms.canDeleteComment && ev.type === 'comment_added' ? () => handleDeleteComment(ev.id) : undefined}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div ref={feedEndRef} style={{ height: 16 }} />
          </div>

          {/* New updates badge */}
          {newCount > 0 && (
            <div style={{ position: 'relative', height: 0, overflow: 'visible' }}>
              <button
                onClick={scrollToBottom}
                style={{
                  position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                  background: '#6366F1', color: '#FFFFFF', border: 'none', borderRadius: 20,
                  padding: '7px 16px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 4px 12px rgba(99,102,241,.35)',
                  animation: 'fadeSlideIn 0.2s ease',
                  zIndex: 10,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                {newCount} new update{newCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {/* Composer */}
          <div style={{
            borderTop: '1px solid #E4E6EF', background: '#FFFFFF', padding: '14px 20px',
            display: 'flex', gap: 12, alignItems: 'flex-end', flexShrink: 0,
          }}>
            <div style={{
              flex: 1, background: '#F9FAFB', border: '1.5px solid #E4E6EF', borderRadius: 10,
              padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8,
              transition: 'border-color 0.15s',
            }}
            onFocusCapture={e => (e.currentTarget.style.borderColor = '#6366F1')}
            onBlurCapture={e => (e.currentTarget.style.borderColor = '#E4E6EF')}
            >
              <textarea
                className="composer-input"
                rows={2}
                placeholder="Write an update… (Enter to send, Shift+Enter for new line)"
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={commenting}
              />
            </div>
            <button
              onClick={() => handleSend()}
              disabled={!commentText.trim() || commenting}
              style={{
                padding: '10px 18px', borderRadius: 10, border: 'none',
                background: commentText.trim() && !commenting ? '#6366F1' : '#E4E6EF',
                color: commentText.trim() && !commenting ? '#FFFFFF' : '#9CA3AF',
                fontSize: 13, fontWeight: 600,
                cursor: commentText.trim() && !commenting ? 'pointer' : 'default',
                transition: 'all 0.15s', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                minWidth: 90,
              }}
            >
              {commenting ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 0.8s linear infinite' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  Send
                </>
              )}
            </button>
          </div>
        </div>

        {/* RIGHT — metadata panel */}
        <div style={{
          width: 260, flexShrink: 0, borderLeft: '1px solid #E4E6EF', background: '#FFFFFF',
          overflowY: 'auto', padding: '24px 20px',
        }}>

          <PanelSection label="Customer">
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{order.customer_name}</div>
            {order.contact_number && (
              <div style={{ fontSize: 12.5, color: '#6B7280', marginTop: 2 }}>{order.contact_number}</div>
            )}
          </PanelSection>

          <PanelSection label="Status">
            {perms.canChangeStatus
              ? <StatusDropdown order={order} onUpdate={s => updateStatus({ id: order.id, status: s })} />
              : <span style={chip(sm)}>{sm.label}</span>
            }
          </PanelSection>

          <PanelSection label="Priority">
            <span style={chip(pm)}>{pm.label}</span>
          </PanelSection>

          {order.assigned_names && order.assigned_names.length > 0 && (
            <PanelSection label="Assigned to">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {order.assigned_names.map((name, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%', background: '#EEF2FF', color: '#6366F1',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, flexShrink: 0,
                    }}>
                      {getInitials(name)}
                    </div>
                    <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{name}</span>
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {due && (
            <PanelSection label="Due date">
              <span style={{ fontSize: 13, fontWeight: 600, color: dueOverdue ? '#EF4444' : '#111827' }}>
                {due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                {dueOverdue && ' · Overdue'}
              </span>
            </PanelSection>
          )}

          <PanelSection label="Created by">
            <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{order.created_by_name}</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
              {new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
          </PanelSection>

          {order.description && (
            <PanelSection label="Description">
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, margin: 0 }}>{order.description}</p>
            </PanelSection>
          )}
        </div>
      </div>

      {showEdit && (
        <OrderModal
          key={order.id}
          order={order}
          canReassign={perms.canReassign}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['orders', id] })
            qc.invalidateQueries({ queryKey: ['orders'] })
          }}
        />
      )}

      {deleteConfirmId && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(15,23,42,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
          onClick={() => setDeleteConfirmId(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FFFFFF', borderRadius: 14, padding: '28px 28px 22px',
              width: 320, boxShadow: '0 8px 32px rgba(0,0,0,.14)',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>Delete comment?</div>
            <div style={{ fontSize: 13.5, color: '#6B7280', lineHeight: 1.5 }}>
              This comment will be permanently removed and cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirmId(null)}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1.5px solid #E4E6EF',
                  background: '#FFFFFF', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#EF4444', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#FFFFFF',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
