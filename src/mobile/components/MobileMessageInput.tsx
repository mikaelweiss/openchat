import { useRef, useEffect, useState, useMemo } from 'react'
import { ArrowUp, Square, Paperclip, Brain, X, FileText, Image, Volume2 } from 'lucide-react'
import clsx from 'clsx'
import { open } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'

interface FileAttachment {
  path: string
  base64: string
  mimeType: string
  name: string
  type: 'image' | 'audio' | 'file'
}

interface MobileMessageInputProps {
  onSend: (
    message: string,
    attachments?: FileAttachment[],
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  ) => void
  onCancel?: () => void
  disabled?: boolean
  isLoading?: boolean
  noProvider?: boolean
  modelCapabilities?: {
    vision?: boolean
    audio?: boolean
    files?: boolean
    thinking?: boolean
  }
}

export default function MobileMessageInput({
  onSend,
  onCancel,
  disabled = false,
  isLoading = false,
  noProvider = false,
  modelCapabilities
}: MobileMessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [reasoningEffort, setReasoningEffort] = useState<'none' | 'low' | 'medium' | 'high'>('none')
  const [showReasoningOptions, setShowReasoningOptions] = useState(false)

  const placeholderTexts = [
    "What's on your mind?",
    'Ask me anything...',
    'Start a conversation...',
    'Type your message...',
    'What can I help you with?',
    'How can I assist you?',
    "Let's chat...",
    "What's your question?",
    'Ready when you are...'
  ]

  const selectedPlaceholder = useMemo(() => {
    return placeholderTexts[Math.floor(Math.random() * placeholderTexts.length)]
  }, [])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [message])

  const handleSubmit = () => {
    if (isLoading) {
      onCancel?.()
    } else if ((message.trim() || attachments.length > 0) && !disabled) {
      onSend(
        message,
        attachments.length > 0 ? attachments : undefined,
        reasoningEffort !== 'none' ? reasoningEffort : undefined
      )
      setMessage('')
      setAttachments([])
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleAttachFile = async () => {
    if (disabled) return

    try {
      const filters = []
      const supportedExtensions: string[] = []

      if (modelCapabilities?.vision) {
        const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']
        supportedExtensions.push(...imageExtensions)
        filters.push({ name: 'Images', extensions: imageExtensions })
      }

      if (modelCapabilities?.audio) {
        const audioExtensions = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma']
        supportedExtensions.push(...audioExtensions)
        filters.push({ name: 'Audio', extensions: audioExtensions })
      }

      if (modelCapabilities?.files) {
        const documentExtensions = ['txt', 'md', 'pdf', 'doc', 'docx', 'rtf', 'csv', 'json', 'xml', 'html']
        supportedExtensions.push(...documentExtensions)
        filters.push({ name: 'Documents', extensions: documentExtensions })
      }

      if (filters.length > 1) {
        filters.unshift({ name: 'All Supported Files', extensions: supportedExtensions })
      }

      if (filters.length === 0) return

      const selected = await open({ multiple: true, filters })
      if (!selected) return

      const selectedFiles = Array.isArray(selected) ? selected : [selected]
      const newAttachments: FileAttachment[] = []

      for (const filePath of selectedFiles) {
        try {
          const fileBytes = await readFile(filePath)
          const fileName = filePath.split(/[/\\]/).pop() || 'unknown'
          const fileExtension = fileName.split('.').pop()?.toLowerCase() || ''

          let fileType: 'image' | 'audio' | 'file' = 'file'
          let mimeType = 'application/octet-stream'

          if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(fileExtension)) {
            if (!modelCapabilities?.vision) continue
            fileType = 'image'
            mimeType = fileExtension === 'jpg' ? 'image/jpeg' : `image/${fileExtension}`
          } else if (fileExtension === 'svg') {
            if (!modelCapabilities?.vision) continue
            fileType = 'image'
            mimeType = 'image/svg+xml'
          } else if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'].includes(fileExtension)) {
            if (!modelCapabilities?.audio) continue
            fileType = 'audio'
            mimeType = fileExtension === 'mp3' ? 'audio/mpeg' : `audio/${fileExtension}`
          } else if (['txt', 'md', 'pdf', 'doc', 'docx', 'rtf', 'csv', 'json', 'xml', 'html'].includes(fileExtension)) {
            if (!modelCapabilities?.files) continue
            if (fileExtension === 'txt') mimeType = 'text/plain'
            else if (fileExtension === 'md') mimeType = 'text/markdown'
            else if (fileExtension === 'pdf') mimeType = 'application/pdf'
            else if (fileExtension === 'json') mimeType = 'application/json'
            else if (fileExtension === 'xml') mimeType = 'application/xml'
            else if (fileExtension === 'html') mimeType = 'text/html'
            else if (fileExtension === 'csv') mimeType = 'text/csv'
          } else {
            continue
          }

          const fileSizeLimit = 20 * 1024 * 1024
          if (fileBytes.length > fileSizeLimit) {
            if ((window as any).showToast) {
              (window as any).showToast({
                type: 'error',
                title: 'File Too Large',
                message: `${fileName} exceeds 20MB limit`,
                duration: 3000
              })
            }
            continue
          }

          let binaryString = ''
          const chunkSize = 8192
          for (let i = 0; i < fileBytes.length; i += chunkSize) {
            const chunk = fileBytes.slice(i, i + chunkSize)
            binaryString += String.fromCharCode(...chunk)
          }
          const base64 = btoa(binaryString)

          newAttachments.push({ path: filePath, base64, mimeType, name: fileName, type: fileType })
        } catch (error) {
          console.error('Failed to process file:', filePath, error)
        }
      }

      if (newAttachments.length > 0) {
        setAttachments([...attachments, ...newAttachments])
      }
    } catch (error) {
      console.error('Failed to attach file:', error)
    }
  }

  const handlePaste = async (e: React.ClipboardEvent) => {
    if (disabled || isLoading) return

    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]

      if (item.type.startsWith('image/')) {
        if (!modelCapabilities?.vision) return

        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue

        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              resolve(result.split(',')[1])
            }
            reader.onerror = reject
            reader.readAsDataURL(file)
          })

          const attachment: FileAttachment = {
            path: '',
            base64,
            mimeType: file.type,
            name: `pasted-image-${Date.now()}.${file.type.split('/')[1]}`,
            type: 'image'
          }

          setAttachments([...attachments, attachment])
        } catch (error) {
          console.error('Failed to process pasted image:', error)
        }
        break
      }
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index))
  }

  const getAttachmentIcon = (type: string) => {
    switch (type) {
      case 'image': return Image
      case 'audio': return Volume2
      default: return FileText
    }
  }

  const hasAttachmentSupport = modelCapabilities?.vision || modelCapabilities?.audio || modelCapabilities?.files

  return (
    <div className="mobile-input-container border-t border-border/10 px-3 pt-3 glass-nav backdrop-blur-strong">
      {attachments.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {attachments.map((attachment, index) => {
            const Icon = getAttachmentIcon(attachment.type)
            return (
              <div
                key={`${attachment.name}-${index}`}
                className="flex items-center gap-2 bg-secondary border border-border/20 rounded-xl px-3 py-2 text-sm"
              >
                <Icon className="h-4 w-4 text-primary" />
                <span className="truncate max-w-24" title={attachment.name}>
                  {attachment.name}
                </span>
                <button
                  onClick={() => removeAttachment(index)}
                  className="p-0.5 rounded-lg text-muted-foreground active:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex items-center gap-1">
          {hasAttachmentSupport && (
            <button
              onClick={handleAttachFile}
              disabled={disabled}
              className={clsx(
                'p-2.5 rounded-xl transition-colors',
                disabled
                  ? 'text-muted-foreground opacity-50'
                  : 'text-muted-foreground active:bg-accent/50 active:text-primary'
              )}
              aria-label="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          )}

          {modelCapabilities?.thinking && (
            <div className="relative">
              <button
                onClick={() => setShowReasoningOptions(!showReasoningOptions)}
                disabled={disabled}
                className={clsx(
                  'p-2.5 rounded-xl transition-colors flex items-center gap-1',
                  disabled
                    ? 'text-muted-foreground opacity-50'
                    : reasoningEffort !== 'none'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      : 'text-muted-foreground active:bg-purple-100 active:text-purple-600 dark:active:bg-purple-900/30'
                )}
                aria-label="Reasoning effort"
              >
                <Brain className="h-5 w-5" />
                {reasoningEffort !== 'none' && (
                  <span className="text-xs font-semibold">
                    {reasoningEffort === 'low' ? 'L' : reasoningEffort === 'medium' ? 'M' : 'H'}
                  </span>
                )}
              </button>

              {showReasoningOptions && (
                <div className="absolute bottom-full left-0 mb-2 w-32 bg-background border border-border/20 rounded-xl p-1 shadow-lg z-50">
                  {(['none', 'low', 'medium', 'high'] as const).map((effort) => (
                    <button
                      key={effort}
                      onClick={() => {
                        setReasoningEffort(effort)
                        setShowReasoningOptions(false)
                      }}
                      className={clsx(
                        'w-full text-left px-3 py-2.5 rounded-lg transition-colors text-sm capitalize',
                        reasoningEffort === effort
                          ? 'bg-primary text-white'
                          : 'text-foreground/90 active:bg-accent'
                      )}
                    >
                      {effort}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 elegant-input-container rounded-2xl">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => !disabled && setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={noProvider ? 'Add a provider to start chatting...' : selectedPlaceholder}
            className={clsx(
              'w-full resize-none bg-transparent px-4 py-3 min-h-[48px] max-h-[120px] focus:outline-none text-foreground',
              'font-medium placeholder:text-muted-foreground',
              disabled && 'text-muted-foreground'
            )}
            rows={1}
            disabled={disabled}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={disabled || (!isLoading && !message.trim() && attachments.length === 0)}
          className={clsx(
            'flex-shrink-0 w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center',
            disabled || (!isLoading && !message.trim() && attachments.length === 0)
              ? 'bg-muted text-muted-foreground'
              : isLoading
              ? 'bg-destructive text-destructive-foreground active:scale-95'
              : 'bg-primary text-white active:scale-95'
          )}
          aria-label={isLoading ? 'Stop generation' : 'Send message'}
        >
          {isLoading ? <Square className="h-5 w-5" /> : <ArrowUp className="h-5 w-5" />}
        </button>
      </div>
    </div>
  )
}
