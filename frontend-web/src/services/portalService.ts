import axios from 'axios'
import { apiClient } from './apiClient'

// Public portal client — no auth, routes through the /portal proxy
const portalClient = axios.create({
  headers: { 'Content-Type': 'application/json' },
})

export interface PortalInfo {
  order_id: string
  customer_name: string
  enabled: boolean
}

export interface PortalMessage {
  id: number
  message: string
  portal_sender: string
  sender_type: 'customer' | 'staff'
  created_at: string
}

export interface PortalAttachment {
  id: number
  file_name: string
  file_type: string
  file_size: number
  view_url: string
  created_at: string
}

export interface PortalUploadURLResponse {
  upload_url: string
  content_type: string
  s3_key: string
}

export interface PortalStatus {
  token: string
  customer_name: string
  enabled: boolean
  created_at: string
}

// ── Public portal API (token-based) ──────────────────────────────────────────

export const publicPortalApi = {
  getPortal: (token: string) =>
    portalClient.get<PortalInfo>(`/api/portal/${token}`).then(r => r.data),

  getMessages: (token: string) =>
    portalClient.get<{ messages: PortalMessage[] }>(`/api/portal/${token}/messages`).then(r => r.data.messages),

  sendMessage: (token: string, message: string) =>
    portalClient.post<PortalMessage>(`/api/portal/${token}/messages`, { message }).then(r => r.data),

  getAttachments: (token: string) =>
    portalClient.get<{ attachments: PortalAttachment[] }>(`/api/portal/${token}/attachments`).then(r => r.data.attachments),

  getUploadURL: (token: string, fileName: string) =>
    portalClient.post<PortalUploadURLResponse>(`/api/portal/${token}/attachments/upload-url`, { file_name: fileName }).then(r => r.data),

  confirmAttachment: (token: string, payload: { s3_key: string; file_name: string; file_type: string; file_size: number }) =>
    portalClient.post<PortalAttachment>(`/api/portal/${token}/attachments`, payload).then(r => r.data),

  deleteMessage: (token: string, msgId: number) =>
    portalClient.delete(`/api/portal/${token}/messages/${msgId}`).then(r => r.data),
}

// ── Staff portal management API (authenticated) ───────────────────────────────

export const staffPortalApi = {
  createPortal: (orderId: string, customerName: string) =>
    apiClient.post<PortalStatus>(`/orders/${orderId}/portal`, { customer_name: customerName }).then(r => r.data),

  getPortal: (orderId: string) =>
    apiClient.get<PortalStatus>(`/orders/${orderId}/portal`).then(r => r.data),

  revokePortal: (orderId: string) =>
    apiClient.patch(`/orders/${orderId}/portal/revoke`).then(r => r.data),

  regenerateToken: (orderId: string) =>
    apiClient.post<PortalStatus>(`/orders/${orderId}/portal/regenerate`).then(r => r.data),

  sendReply: (orderId: string, message: string) =>
    apiClient.post<PortalMessage>(`/orders/${orderId}/portal/reply`, { message }).then(r => r.data),

  getMessages: (orderId: string) =>
    apiClient.get<{ messages: PortalMessage[] }>(`/orders/${orderId}/portal/messages`).then(r => r.data.messages),

  deleteAttachment: (orderId: string, attId: number) =>
    apiClient.delete(`/orders/${orderId}/portal/attachments/${attId}`).then(r => r.data),

  deleteMessage: (orderId: string, msgId: number) =>
    apiClient.delete(`/orders/${orderId}/portal/messages/${msgId}`).then(r => r.data),

  getAttachmentDownloadURL: (orderId: string, attId: number, fileName: string) =>
    apiClient.get<{ url: string }>(`/orders/${orderId}/portal/attachments/${attId}/download-url?name=${encodeURIComponent(fileName)}`).then(r => r.data.url),

  listAttachments: (orderId: string) =>
    apiClient.get<{ attachments: PortalAttachment[] }>(`/orders/${orderId}/portal/attachments`).then(r => r.data.attachments ?? []),

  getAttachmentUploadURL: (orderId: string, fileName: string) =>
    apiClient.post<PortalUploadURLResponse>(`/orders/${orderId}/portal/attachments/upload-url`, { file_name: fileName }).then(r => r.data),

  confirmAttachment: (orderId: string, payload: { s3_key: string; file_name: string; file_type: string; file_size: number }) =>
    apiClient.post<PortalAttachment>(`/orders/${orderId}/portal/attachments/confirm`, payload).then(r => r.data),
}

export function getPortalURL(token: string): string {
  return `${window.location.origin}/portal/${token}`
}
