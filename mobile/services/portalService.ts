import { apiClient } from './apiClient'

export interface PortalStatus {
  token: string
  customer_name: string
  enabled: boolean
  created_at: string
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

  listAttachments: (orderId: string) =>
    apiClient.get<{ attachments: PortalAttachment[] }>(`/orders/${orderId}/portal/attachments`).then(r => r.data.attachments ?? []),

  getAttachmentUploadURL: (orderId: string, fileName: string) =>
    apiClient.post<{ upload_url: string; content_type: string; s3_key: string }>(
      `/orders/${orderId}/portal/attachments/upload-url`,
      { file_name: fileName },
    ).then(r => r.data),

  confirmAttachment: (orderId: string, payload: { s3_key: string; file_name: string; file_type: string; file_size: number }) =>
    apiClient.post<PortalAttachment>(`/orders/${orderId}/portal/attachments/confirm`, payload).then(r => r.data),

  getAttachmentDownloadURL: (orderId: string, attId: number, fileName: string) =>
    apiClient.get<{ url: string }>(
      `/orders/${orderId}/portal/attachments/${attId}/download-url?name=${encodeURIComponent(fileName)}`,
    ).then(r => r.data.url),
}

export function getPortalURL(token: string): string {
  const apiBase = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1'
  const webBase = (process.env.EXPO_PUBLIC_WEB_URL ?? apiBase.replace(/\/api\/v1\/?$/, '').replace(/:8080$/, ':3000'))
  return `${webBase}/portal/${token}`
}
