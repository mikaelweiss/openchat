import { useRef, useEffect, useState, useMemo } from 'react'
import { ArrowUp, Square } from 'lucide-react'
import clsx from 'clsx'

interface MobileMessageInputProps {
  onSend: (message: string) => void
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
  noProvider = false
}: MobileMessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState('')

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
    } else if (message.trim() && !disabled) {
      onSend(message)
      setMessage('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="mobile-input-container border-t border-border/10 p-3 glass-nav backdrop-blur-strong">
      <div className="flex items-end gap-2">
        <div className="flex-1 elegant-input-container rounded-2xl">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={e => !disabled && setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
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
          disabled={disabled || (!isLoading && !message.trim())}
          className={clsx(
            'flex-shrink-0 w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center',
            disabled || (!isLoading && !message.trim())
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
