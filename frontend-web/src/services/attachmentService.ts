import { apiClient } from './apiClient'

export interface Attachment {
  id: string
  order_id: string
  uploaded_by: string
  uploader_name: string
  file_name: string
  file_key: string
  file_url: string
  mime_type: string
  size_bytes: number
  created_at: string
}

export const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword', 'application/vnd.ms-excel',
  'text/plain',
]

export const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20 MB

export function isImage(mimeType: string) {
  return mimeType.startsWith('image/')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const attachmentService = {
  getUploadURL: async (orderId: string, fileName: string, mimeType: string, sizeBytes: number) => {
    const res = await apiClient.post<{ upload_url: string; file_key: string; file_url: string }>(
      `/orders/${orderId}/attachments/upload-url`,
      { file_name: fileName, mime_type: mimeType, size_bytes: sizeBytes },
    )
    return res.data
  },

  uploadToR2: (uploadUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', file.type)
      xhr.upload.onprogress = e => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(file)
    })
  },

  confirmUpload: async (orderId: string, data: {
    file_name: string; file_key: string; file_url: string; mime_type: string; size_bytes: number
  }): Promise<Attachment> => {
    const res = await apiClient.post<{ attachment: Attachment }>(`/orders/${orderId}/attachments`, data)
    return res.data.attachment
  },

  listAttachments: async (orderId: string): Promise<Attachment[]> => {
    const res = await apiClient.get<{ attachments: Attachment[] }>(`/orders/${orderId}/attachments`)
    return res.data.attachments
  },

  getSignedUrl: async (orderId: string, fileKey: string): Promise<string> => {
    const res = await apiClient.get<{ url: string }>(
      `/orders/${orderId}/attachments/signed-url?key=${encodeURIComponent(fileKey)}`,
    )
    return res.data.url
  },

  deleteAttachment: async (orderId: string, attachmentId: string): Promise<void> => {
    await apiClient.delete(`/orders/${orderId}/attachments/${attachmentId}`)
  },
}
