import { useState, useEffect } from 'react'
import { useCreateOrder, useUpdateOrder, useUsersForAssignment } from '../hooks/useOrders'
import type { Order } from '../../../services/orderService'

interface Props {
  order?: Order | null
  onClose: () => void
  onSuccess?: (message: string) => void
}

const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const

export function OrderModal({ order, onClose, onSuccess }: Props) {
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
      updateOrder({ id: order!.id, data: payload }, {
        onSuccess: () => { onClose(); onSuccess?.('Order updated successfully') },
        onError: () => setError('Failed to update order. Please try again.'),
      })
    } else {
      createOrder(payload, {
        onSuccess: () => { onClose(); onSuccess?.('Order created successfully') },
        onError: () => setError('Failed to create order. Please try again.'),
      })
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)',
      animation: 'fadeIn 0.2s ease',
    }} onClick={onClose}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .modal-input {
          width: 100%; padding: 10px 14px; border-radius: 8px; border: 1px solid #E2E8F0;
          font-size: 14px; color: #0F172A; background: #FFFFFF; box-sizing: border-box;
          outline: none; transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .modal-input:focus { border-color: #94A3B8; box-shadow: 0 0 0 2px rgba(226,232,240,0.5); }
        .modal-input::placeholder { color: #94A3B8; }
        .modal-label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
      `}</style>
      
      <div style={{
        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '560px',
        maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        margin: '16px', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '24px 32px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.01em' }}>
              {isEdit ? 'Edit Order' : 'Create Order'}
            </div>
            <div style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
              {isEdit ? `Updating order #${order!.order_number}` : 'Fill in the operational details'}
            </div>
          </div>
          <button 
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
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {error && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label">Title *</label>
              <input className="modal-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Website Redesign" />
            </div>
            <div>
              <label className="modal-label">Customer Name *</label>
              <input className="modal-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="e.g. Acme Corp" />
            </div>
            <div>
              <label className="modal-label">Contact Number</label>
              <input className="modal-input" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="e.g. +91 98765 43210" type="tel" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label">Description</label>
              <textarea
                className="modal-input"
                style={{ minHeight: '80px', resize: 'vertical' }}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Include any specific operational requirements..."
              />
            </div>
            <div>
              <label className="modal-label">Priority</label>
              <select className="modal-input" value={priority} onChange={e => setPriority(e.target.value)}>
                {PRIORITIES.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="modal-label">Due Date</label>
              <input className="modal-input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label className="modal-label">Assign To</label>
              <select className="modal-input" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '20px 32px', borderTop: '1px solid #F1F5F9', background: '#FAFAFA', display: 'flex', gap: '12px', justifyContent: 'flex-end', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
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
              background: '#0F172A', color: '#FFFFFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              transition: 'background 0.15s ease', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
            onMouseOver={e => e.currentTarget.style.background = '#1E293B'}
            onMouseOut={e => e.currentTarget.style.background = '#0F172A'}
          >
            {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
