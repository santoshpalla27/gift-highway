import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'
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

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

export function isImage(mimeType: string) {
  return mimeType.startsWith('image/')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function uploadToR2Web(uploadUrl: string, uri: string, mimeType: string, onProgress: (pct: number) => void): Promise<void> {
  return fetch(uri)
    .then(r => r.blob())
    .then(blob => new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
      }
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)))
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(blob)
    }))
}

async function uploadToR2Native(uploadUrl: string, uri: string, mimeType: string, onProgress: (pct: number) => void): Promise<void> {
  // Ensure the URI has the file:// scheme or content:// scheme
  const fileUri = uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`

  // Verify the file exists before attempting upload
  const info = await FileSystem.getInfoAsync(fileUri)
  if (!info.exists) {
    throw new Error('File not found at the given path')
  }

  // Use the same XMLHttpRequest approach as the web. 
  // expo-file-system's createUploadTask on Android often strips Content-Type 
  // or mangles the presigned URL query parameters, causing R2 to return 403.
  // React Native's fetch and XHR support local file URIs and raw binary PUTs natively.
  try {
    const response = await fetch(fileUri)
    const blob = await response.blob()

    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('PUT', uploadUrl)
      xhr.setRequestHeader('Content-Type', mimeType)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve()
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`))
        }
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.send(blob)
    })
  } catch (err) {
    throw new Error(`Upload failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export const attachmentService = {
  getUploadURL: async (orderId: string, fileName: string, mimeType: string, sizeBytes: number) => {
    const res = await apiClient.post<{ upload_url: string; file_key: string; file_url: string }>(
      `/orders/${orderId}/attachments/upload-url`,
      { file_name: fileName, mime_type: mimeType, size_bytes: sizeBytes },
    )
    return res.data
  },

  uploadToR2: (uploadUrl: string, uri: string, mimeType: string, onProgress: (pct: number) => void): Promise<void> => {
    if (Platform.OS === 'web') {
      return uploadToR2Web(uploadUrl, uri, mimeType, onProgress)
    }
    return uploadToR2Native(uploadUrl, uri, mimeType, onProgress)
  },

  confirmUpload: async (orderId: string, data: {
    file_name: string; file_key: string; file_url: string; mime_type: string; size_bytes: number
  }): Promise<Attachment> => {
    const res = await apiClient.post<{ attachment: Attachment }>(`/orders/${orderId}/attachments`, data)
    return res.data.attachment
  },

  getSignedUrl: async (orderId: string, fileKey: string): Promise<string> => {
    const res = await apiClient.get<{ url: string }>(
      `/orders/${orderId}/attachments/signed-url?key=${encodeURIComponent(fileKey)}`,
    )
    return res.data.url
  },

  getDownloadUrl: async (orderId: string, fileKey: string, fileName: string): Promise<string> => {
    const res = await apiClient.get<{ url: string }>(
      `/orders/${orderId}/attachments/download-url?key=${encodeURIComponent(fileKey)}&name=${encodeURIComponent(fileName)}`,
    )
    return res.data.url
  },

  deleteAttachment: async (orderId: string, attachmentId: string): Promise<void> => {
    await apiClient.delete(`/orders/${orderId}/attachments/${attachmentId}`)
  },
}
