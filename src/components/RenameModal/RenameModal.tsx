import { useState, useEffect, useRef } from 'react'

interface RenameModalProps {
  isOpen: boolean
  currentTitle: string
  onClose: () => void
  onRename: (newTitle: string) => void
}

export default function RenameModal({
  isOpen,
  currentTitle,
  onClose,
  onRename,
}: RenameModalProps) {
  const [title, setTitle] = useState(currentTitle)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTitle(currentTitle)
      // Focus and select all text when modal opens
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.select()
        }
      }, 100)
    }
  }, [isOpen, currentTitle])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (title.trim() && title.trim() !== currentTitle) {
      onRename(title.trim())
    } else {
      onClose()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-effect border border-border/20 rounded-2xl p-6 max-w-md w-full mx-4 shadow-elegant-xl">
        <h3 className="text-lg font-semibold mb-4 text-foreground/95">
          Rename Conversation
        </h3>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 border border-border/20 rounded-xl bg-background/50 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            placeholder="Enter conversation title..."
            maxLength={100}
          />
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm elegant-hover rounded-xl transition-all text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || title.trim() === currentTitle}
              className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              Rename
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}