import { useState, useEffect } from 'react'
import { useCreateOrder, useUpdateOrder, useUsersForAssignment } from '../hooks/useOrders'
import type { Order } from '../../../services/orderService'

interface Props {
  order?: Order | null
  onClose: () => void
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export function OrderModal({ order, onClose }: Props) {
  const isEdit = !!order
  const { mutate: createOrder, isPending: creating } = useCreateOrder()
  const { mutate: updateOrder, isPending: updating } = useUpdateOrder()
  const { data: users = [] } = useUsersForAssignment()

  const [title, setTitle] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<string>('medium')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (order) {
      setTitle(order.title)
      setCustomerName(order.customer_name)
      setContactNumber(order.contact_number ?? '')
      setDescription(order.description)
      setPriority(order.priority)
      setAssignedTo(order.assigned_to ?? '')
      setDueDate(order.due_date ?? '')
    }
  }, [order])

  const isPending = creating || updating

  const handleSubmit = () => {
    if (!title.trim() || !customerName.trim()) {
      setError('Title and Customer Name are required.')
      return
    }
    setError('')
    const payload = {
      title: title.trim(),
      customer_name: customerName.trim(),
      contact_number: contactNumber.trim(),
      description: description.trim(),
      priority,
      assigned_to: assignedTo || null,
      due_date: dueDate || null,
    }
    if (isEdit) {
      updateOrder({ id: order!.id, data: payload }, { onSuccess: onClose })
    } else {
      createOrder(payload, { onSuccess: onClose })
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '520px',
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        margin: '16px',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#111827' }}>
              {isEdit ? 'Edit Order' : 'Create Order'}
            </div>
            <div style={{ fontSize: '13px', color: '#6B7280', marginTop: '2px' }}>
              {isEdit ? `Editing #${order!.order_number}` : 'Fill in the details below'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#9CA3AF' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#DC2626' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Title *</label>
              <input style={inputStyle} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Wedding Banner" />
            </div>
            <div>
              <label style={labelStyle}>Customer Name *</label>
              <input style={inputStyle} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Rahul Sharma" />
            </div>
            <div>
              <label style={labelStyle}>Contact Number</label>
              <input style={inputStyle} value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g. +91 98765 43210" type="tel" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Description</label>
              <textarea
                style={{ ...inputStyle, minHeight: '72px', resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Additional details..."
              />
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select style={inputStyle} value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input style={inputStyle} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Assign To</label>
              <select style={inputStyle} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button onClick={onClose} disabled={isPending} style={cancelBtnStyle}>Cancel</button>
            <button onClick={handleSubmit} disabled={isPending} style={submitBtnStyle}>
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #D1D5DB',
  fontSize: '14px', color: '#111827', background: '#fff', boxSizing: 'border-box',
  outline: 'none',
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '9px 18px', borderRadius: '8px', border: '1px solid #E5E7EB',
  background: '#fff', color: '#374151', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
}
const submitBtnStyle: React.CSSProperties = {
  padding: '9px 18px', borderRadius: '8px', border: 'none',
  background: '#4F46E5', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
}
