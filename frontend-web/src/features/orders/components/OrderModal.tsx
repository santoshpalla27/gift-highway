import { useState, useEffect, useLayoutEffect, useRef, useId } from 'react'
import { useCreateOrder, useUpdateOrder, useUsersForAssignment } from '../hooks/useOrders'
import type { Order } from '../../../services/orderService'
import { staffPortalApi } from '../../../services/portalService'
import { DateInput } from '../../../components/system/DateInput'
import './OrderModal.css'

interface Props {
  order?: Order | null
  onClose: () => void
  onSuccess?: (message: string) => void
  canReassign?: boolean
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { error?: string } }; message?: string }
    if (e.response?.data?.error) return e.response.data.error
    if (e.message) return e.message
  }
  return fallback
}

export function OrderModal({ order, onClose, onSuccess, canReassign = true }: Props) {
  const isEdit = !!order
  const { mutate: createOrder, isPending: creating } = useCreateOrder()
  const { mutate: updateOrder, isPending: updating } = useUpdateOrder()
  const { data: users = [] } = useUsersForAssignment()

  const [orderDescription, setOrderDescription] = useState('')
  const [orderSource, setOrderSource] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<string>('medium')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [orderValue, setOrderValue] = useState('')
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMenuHeight, setAssignMenuHeight] = useState(260)
  const assignRef = useRef<HTMLDivElement>(null)
  const assignTriggerRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const assignMenuId = useId()
  const [error, setError] = useState('')
  const [createPortal, _setCreatePortal] = useState(false)

  useLayoutEffect(() => {
    if (!assignOpen) return
    const measure = () => {
      if (!assignRef.current || !bodyRef.current) return
      const available = assignRef.current.getBoundingClientRect().top - bodyRef.current.getBoundingClientRect().top - 12
      setAssignMenuHeight(Math.max(0, Math.min(260, available)))
    }
    measure()
    const card = bodyRef.current
    card?.addEventListener('scroll', measure)
    window.addEventListener('resize', measure)
    return () => { card?.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [assignOpen])

  useEffect(() => {
    if (!assignOpen) return
    const dismiss = (event: PointerEvent) => {
      if (!assignRef.current?.contains(event.target as Node)) setAssignOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setAssignOpen(false)
        assignTriggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape) }
  }, [assignOpen])

  useEffect(() => {
    if (order) {
      setOrderDescription(order.order_description ?? '')
      setOrderSource(order.order_source ?? '')
      setCustomerName(order.customer_name)
      setContactNumber(order.contact_number ?? '')
      setDescription(order.description)
      setPriority(order.priority)
      setAssignedTo(order.assigned_to ?? [])
      setDueDate(order.due_date ?? '')
      setDueTime(order.due_time ?? '')
      setOrderValue(order.order_value != null ? String(order.order_value) : '')
    }
  }, [order])

  const isPending = creating || updating

  const toggleUser = (id: string) => {
    setAssignedTo(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = () => {
    if (!orderDescription.trim() || !customerName.trim()) {
      setError('Order Description and Customer Name are required.')
      return
    }
    if (isPending) return
    setError('')
    const parsedOrderValue = orderValue.trim() !== '' ? parseFloat(orderValue) : null
    const payload = {
      order_description: orderDescription.trim(),
      order_source: orderSource || undefined,
      customer_name: customerName.trim(),
      contact_number: contactNumber.trim(),
      description: description.trim(),
      priority,
      assigned_to: assignedTo,
      due_date: dueDate || null,
      due_time: dueTime || null,
      order_value: canReassign ? parsedOrderValue : undefined,
    }
    if (isEdit) {
      updateOrder({ id: order!.id, data: payload }, {
        onSuccess: () => { onClose(); onSuccess?.('Order updated successfully') },
        onError: (err) => setError(extractErrorMessage(err, 'Failed to update order. Please try again.')),
      })
    } else {
      createOrder(payload, {
        onSuccess: async (created) => {
          if (createPortal) {
            try { await staffPortalApi.createPortal(created.id, customerName.trim()) } catch (_) {}
          }
          onClose()
          onSuccess?.('Order created successfully')
        },
        onError: (err) => setError(extractErrorMessage(err, 'Failed to create order. Please try again.')),
      })
    }
  }

  return (
    <div 
      onMouseDown={e => { if (e.target === e.currentTarget) (window as any)._modalClickDown = true }}
      onMouseUp={e => { if (e.target === e.currentTarget && (window as any)._modalClickDown) onClose(); (window as any)._modalClickDown = false }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
        animation: 'fadeIn 0.2s ease',
      }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .modal-input {
          width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #E2E8F0;
          font-size: 14px; color: #0F172A; background: #FFFFFF; box-sizing: border-box;
          outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .modal-input:focus { border-color: #94A3B8; box-shadow: 0 0 0 2px rgba(226,232,240,0.5); }
        .modal-label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
        .order-assignment .assign-trigger { display: flex; align-items: center; gap: 10px; min-height: 44px; text-align: left; cursor: pointer; }
        .assign-value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .assign-count { background: #EEF2FF; color: #4338CA; border-radius: 6px; padding: 2px 7px; font-size: 12px; font-weight: 600; }
        .assign-menu { position: absolute; bottom: calc(100% + 6px); left: 0; right: 0; z-index: 100; overflow-y: auto; overscroll-behavior: contain; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; box-shadow: 0 -4px 24px rgba(15,23,42,.12); }
        .assign-menu-heading { padding: 12px 14px; border-bottom: 1px solid #F1F5F9; font-size: 13px; font-weight: 600; color: #0F172A; }
        .assign-menu-heading span { display: block; margin-top: 3px; font-size: 12px; font-weight: 400; color: #64748B; }
        .order-assignment .assign-option { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 48px; margin: 0; padding: 10px 14px; border: 0; border-bottom: 1px solid #F1F5F9; background: #FFFFFF; text-align: left; font: inherit; color: #334155; cursor: pointer; }
        .order-assignment .assign-option:hover, .order-assignment .assign-option:focus-within { background: #F8FAFC; }
        .order-assignment .assign-option.is-selected { background: #EEF2FF; color: #3730A3; }
        .assign-avatar { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex-shrink: 0; border-radius: 50%; background: #F1F5F9; color: #64748B; font-size: 11px; font-weight: 700; }
        .assign-option-name { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 14px; }
        .assign-option input { width: 17px; height: 17px; flex-shrink: 0; accent-color: #4F46E5; cursor: pointer; }
        .assign-check { color: #4F46E5; font-weight: 700; }
        .order-assignment :is(button, input):focus-visible { outline: 2px solid #6366F1; outline-offset: -3px; }
      `}</style>

      <div ref={cardRef} className="order-dialog" role="dialog" aria-modal="true" aria-labelledby={assignMenuId + '-title'} style={{
        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '640px',
        maxHeight: 'min(900px, calc(100dvh - 32px))', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        margin: '16px', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="order-dialog-header" style={{ padding: '24px 32px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 id={assignMenuId + '-title'} style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.025em' }}>
              {isEdit ? 'Edit Order' : 'Create Order'}
            </h2>
            <div style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
              {isEdit ? `Updating Order #${order!.order_number}` : 'Add the details, set a deadline, and assign your team.'}
            </div>
          </div>
          <button type="button" aria-label="Close order dialog" className="order-dialog-close"
            onClick={onClose}
            style={{
              background: '#F8FAFC', padding: '6px', border: '1px solid #E2E8F0', borderRadius: '8px',
              cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', transition: 'all 0.15s ease'
            }}
            onMouseOver={e => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#0F172A' }}
            onMouseOut={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.color = '#64748B' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="order-dialog-body">
          {error && (
            <div role="alert" style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <div className="order-dialog-grid">
            <h3 className="order-section-heading">Order details</h3>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label">Order ID</label>
              <div className="modal-input" style={{ background: '#F8FAFC', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span>{isEdit ? `Order #${order!.order_number} (auto-generated)` : 'Auto-assigned on creation'}</span>
              </div>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label" htmlFor="order-field-0">Order Description *</label>
              <input id="order-field-0" className="modal-input" value={orderDescription} onChange={e => setOrderDescription(e.target.value)} placeholder="e.g. Wedding Cake - John" />
            </div>
            <div className="order-full-width">
              <label className="modal-label" htmlFor="order-field-1">Order Source</label>
              <select id="order-field-1" className="modal-input" value={orderSource} onChange={e => setOrderSource(e.target.value)}>
                <option value="">— None —</option>
                <option value="amazon">Amazon</option>
                <option value="b2b">B2B</option>
                <option value="store">Store</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="online">Online</option>
                <option value="google_ads">Google Ads</option>
                <option value="insta_ads">Insta Ads</option>
              </select>
            </div>
            <h3 className="order-section-heading order-section-divider">Customer information</h3>
            <div>
              <label className="modal-label" htmlFor="order-field-2">Customer Name *</label>
              <input id="order-field-2" className="modal-input" value={customerName} onChange={e => setCustomerName(e.target.value)} />
            </div>
            <div>
              <label className="modal-label" htmlFor="order-field-3">Contact Number</label>
              <input id="order-field-3" className="modal-input" value={contactNumber} onChange={e => setContactNumber(e.target.value)} type="tel" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label" htmlFor="order-field-4">Description</label>
              <textarea id="order-field-4"
                className="modal-input"
                style={{ minHeight: '80px', resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <h3 className="order-section-heading order-section-divider">Scheduling &amp; assignment</h3>
            <div style={!canReassign ? { gridColumn: '1 / -1' } : {}}>
              <label className="modal-label" htmlFor="order-field-5">Priority</label>
              <select id="order-field-5" className="modal-input" value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            {canReassign && (
              <div>
                <label className="modal-label" htmlFor="order-value">
                  Order Value
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 500, color: '#8B5CF6', background: '#EDE9FE', padding: '1px 7px', borderRadius: 999 }}>Admin only</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 14, fontWeight: 600, color: '#475569', pointerEvents: 'none', userSelect: 'none'
                  }}>₹</span>
                  <input
                    className="modal-input"
                    style={{ paddingLeft: 28 }}
                    id="order-value"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 5000"
                    value={orderValue}
                    onChange={e => setOrderValue(e.target.value)}
                    onWheel={e => e.currentTarget.blur()}
                  />
                </div>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label">Due Date</label>
              <div className="order-date-fields">
                <DateInput value={dueDate} onChange={setDueDate} className="modal-input" style={{ flex: 1 }} />
                <input className="modal-input" type="time" aria-label="Due time" value={dueTime} onChange={e => setDueTime(e.target.value)} onClick={e => (e.currentTarget as any).showPicker?.() } style={{ width: '140px', flexShrink: 0, cursor: 'pointer' }} />
              </div>
            </div>
            {canReassign && <div ref={assignRef} className="order-assignment" style={{ gridColumn: '1 / -1', position: 'relative' }}>
              <label className="modal-label" htmlFor={assignMenuId + '-trigger'}>Assign To</label>
              <button ref={assignTriggerRef} id={assignMenuId + '-trigger'} type="button"
                className="modal-input assign-trigger" aria-expanded={assignOpen} aria-controls={assignOpen ? assignMenuId : undefined}
                onClick={() => setAssignOpen(open => !open)}>
                <span className="assign-value" style={{ color: assignedTo.length ? '#0F172A' : '#64748B' }}>
                  {assignedTo.length === 0 ? 'Unassigned' : users.filter(u => assignedTo.includes(u.id)).map(u => u.name).join(', ')}
                </span>
                {assignedTo.length > 0 && <span className="assign-count">{assignedTo.length}</span>}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0, transform: assignOpen ? 'rotate(180deg)' : undefined }}><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {assignOpen && <div id={assignMenuId} className="assign-menu" role="group" aria-label="Assign team members" style={{ maxHeight: assignMenuHeight }}>
                <div className="assign-menu-heading">Assign team members<span>Select one or more</span></div>
                <button type="button" className="assign-option" aria-pressed={assignedTo.length === 0} onClick={() => setAssignedTo([])}>
                  <span className="assign-avatar">—</span><span className="assign-option-name">Unassigned</span>
                  {assignedTo.length === 0 && <span aria-hidden="true" className="assign-check">✓</span>}
                </button>
                {users.map(u => {
                  const selected = assignedTo.includes(u.id)
                  return <label key={u.id} className={'assign-option' + (selected ? ' is-selected' : '')}>
                    <span className="assign-avatar" aria-hidden="true">{u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                    <span className="assign-option-name">{u.name}</span>
                    <input type="checkbox" checked={selected} onChange={() => toggleUser(u.id)} />
                  </label>
                })}
              </div>}
            </div>}
          </div>
        </div>

        {/* PORTAL HIDDEN: "Generate customer portal link" checkbox removed — see docs/portal-hidden.md to restore */}

        {/* Footer */}
        <div className="order-dialog-footer" style={{ padding: '20px 32px', borderTop: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
          <span className="order-required-note">* Required fields</span>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: '1px solid #E2E8F0',
              background: '#FFFFFF', color: '#475569', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.background = '#F8FAFC'}
            onMouseOut={e => e.currentTarget.style.background = '#FFFFFF'}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            style={{
              padding: '10px 24px', borderRadius: '8px', border: 'none',
              background: isPending ? '#64748B' : '#0F172A', color: '#FFFFFF',
              fontSize: '14px', fontWeight: 600, cursor: isPending ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px', justifyContent: 'center'
            }}
            onMouseOver={e => { if (!isPending) e.currentTarget.style.background = '#1E293B' }}
            onMouseOut={e => { if (!isPending) e.currentTarget.style.background = '#0F172A' }}
          >
            {isPending && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 0.8s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </svg>
            )}
            {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}

