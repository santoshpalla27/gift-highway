import { useState, useCallback, useRef, useEffect } from 'react'
import { ScrollView, Alert } from 'react-native'
import { staffPortalApi, type PortalMessage, type PortalAttachment } from '../../../services/portalService'
import { attachmentService, ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '../../../services/attachmentService'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { parsePortalMsg, getPortalMsgPreview } from './useOrderDetail'

export type { PortalMessage, PortalAttachment }

export type UploadingPortalFile = {
  id: string
  name: string
  mime: string
  progress: number
  previewUri?: string
  done?: boolean
  error?: string
}

export function usePortalChat(orderId: string, initialAttachments: PortalAttachment[], onAttachmentsChange: (a: PortalAttachment[]) => void, refreshRef: React.MutableRefObject<(() => void) | null>) {
  const [messages, setMessages] = useState<PortalMessage[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(true)
  const [replyTo, setReplyTo] = useState<PortalMessage | null>(null)
  const [inputText, setInputText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploadingFiles, setUploadingFiles] = useState<UploadingPortalFile[]>([])
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const msgYPos = useRef<Record<number, number>>({})
  const scrollRef = useRef<ScrollView>(null)

  const load = useCallback(async () => {
    try {
      const [msgs, atts] = await Promise.all([
        staffPortalApi.getMessages(orderId),
        staffPortalApi.listAttachments(orderId),
      ])
      setMessages(msgs)
      onAttachmentsChange(atts)
    } catch { /* ignore */ }
  }, [orderId, onAttachmentsChange])

  // Expose a refresh function for socket-triggered refreshes from parent
  useEffect(() => {
    refreshRef.current = () => {
      staffPortalApi.getMessages(orderId).then(setMessages).catch(() => {})
      staffPortalApi.listAttachments(orderId).then(onAttachmentsChange).catch(() => {})
    }
    return () => { refreshRef.current = null }
  }, [orderId, refreshRef, onAttachmentsChange])

  // Initial load
  useEffect(() => {
    staffPortalApi.getMessages(orderId)
      .then(msgs => {
        setMessages(msgs)
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 120)
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false))
  }, [orderId])

  const highlightMsg = useCallback((msgId: number) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedMsgId(msgId)
    const y = msgYPos.current[msgId]
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true })
    highlightTimerRef.current = setTimeout(() => setHighlightedMsgId(null), 5000)
  }, [])

  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || sending) return
    const replyPrefix = replyTo ? `[reply:${replyTo.id}]\n` : ''
    setInputText('')
    setReplyTo(null)
    setSending(true)
    try {
      const msg = await staffPortalApi.sendReply(orderId, replyPrefix + text)
      setMessages(prev => [...prev, msg])
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50)
    } catch {
      Alert.alert('Error', 'Could not send message')
      setInputText(text)
    } finally {
      setSending(false)
    }
  }, [inputText, sending, replyTo, orderId])

  const runPortalUpload = useCallback(async (uid: string, uri: string, name: string, _mime: string, size: number) => {
    try {
      const { upload_url, content_type, s3_key } = await staffPortalApi.getAttachmentUploadURL(orderId, name)
      await attachmentService.uploadToR2(upload_url, uri, content_type, pct =>
        setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, progress: pct } : f))
      )
      const fileExt = '.' + (name.split('.').pop() ?? '').toLowerCase()
      await staffPortalApi.confirmAttachment(orderId, { s3_key, file_name: name, file_type: fileExt, file_size: size })
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, done: true, progress: 100 } : f))
      await load()
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100)
      setTimeout(() => setUploadingFiles(prev => prev.filter(f => f.id !== uid)), 1500)
    } catch {
      setUploadingFiles(prev => prev.map(f => f.id === uid ? { ...f, error: 'Upload failed' } : f))
    }
  }, [orderId, load])

  const uploadPortalFile = useCallback(async (uri: string, name: string, mimeType: string, size: number) => {
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) { Alert.alert('Error', `"${name}" has an unsupported file type.`); return }
    if (size > MAX_FILE_SIZE) { Alert.alert('Error', `"${name}" exceeds the 50 MB limit.`); return }
    const uid = `portal-${Date.now()}`
    setUploadingFiles(prev => [...prev, { id: uid, name, mime: mimeType, progress: 0, previewUri: mimeType.startsWith('image/') ? uri : undefined }])
    runPortalUpload(uid, uri, name, mimeType, size)
  }, [runPortalUpload])

  const handlePickImage = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { Alert.alert('Permission required', 'Allow photo access to upload images.'); return }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsMultipleSelection: true, quality: 1 })
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadPortalFile(asset.uri, asset.fileName ?? `photo-${Date.now()}.jpg`, asset.mimeType ?? 'image/jpeg', asset.fileSize ?? 0)
      }
    }
  }, [uploadPortalFile])

  const handlePickDocument = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true })
    if (!result.canceled) {
      for (const asset of result.assets) {
        await uploadPortalFile(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream', asset.size ?? 0)
      }
    }
  }, [uploadPortalFile])

  const removeMessage = useCallback((msgId: number) => {
    setMessages(prev => prev.filter(m => m.id !== msgId))
  }, [])

  return {
    messages, loadingMsgs, scrollRef, msgYPos,
    replyTo, setReplyTo,
    inputText, setInputText,
    sending, handleSend,
    uploadingFiles,
    highlightedMsgId, highlightMsg,
    removeMessage,
    handlePickImage, handlePickDocument,
    // expose parsed preview helper for reply bar
    getPortalMsgPreview,
    parsePortalMsg,
  }
}
