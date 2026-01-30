import { createPortal } from 'react-dom'
import { useEffect, useRef } from 'react'
import { Star, StarOff, Trash2, Edit3 } from 'lucide-react'

interface ContextMenuProps {
  x: number
  y: number
  isVisible: boolean
  onClose: () => void
  isFavorite: boolean
  onToggleFavorite: () => void
  onDelete: () => void
  onRename: () => void
}

export default function ContextMenu({
  x,
  y,
  isVisible,
  onClose,
  isFavorite,
  onToggleFavorite,
  onDelete,
  onRename,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isVisible) return

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isVisible, onClose])

  if (!isVisible) return null

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 bg-popover border border-border rounded-md shadow-md py-1 min-w-[160px]"
      style={{
        left: x,
        top: y,
      }}
    >
      <button
        className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
        onClick={() => {
          onToggleFavorite()
          onClose()
        }}
      >
        {isFavorite ? (
          <>
            <StarOff className="h-4 w-4" />
            Remove from favorites
          </>
        ) : (
          <>
            <Star className="h-4 w-4" />
            Add to favorites
          </>
        )}
      </button>
      <button
        className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
        onClick={() => {
          onRename()
          onClose()
        }}
      >
        <Edit3 className="h-4 w-4" />
        Rename conversation
      </button>
      <div className="h-px bg-border mx-1 my-1" />
      <button
        className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-accent transition-colors text-left text-destructive hover:text-destructive"
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <Trash2 className="h-4 w-4" />
        Delete conversation
      </button>
    </div>,
    document.body
  )
}