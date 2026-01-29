import { format } from 'date-fns'
import { Star, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { useState } from 'react'
import { useConversations, useAppStore } from '../../stores/appStore'
import { type Conversation } from '../../shared/conversationStore'
import { type PendingConversation } from '../../stores/appStore'
import { getConversationModelDisplay } from '../../utils/conversationUtils'

type SidebarConversation = Conversation | (PendingConversation & { id: 'pending', is_favorite?: boolean })

const isPersistentConversation = (conv: SidebarConversation): conv is Conversation => {
  return typeof conv.id === 'number'
}

interface MobileConversationListProps {
  onSelectConversation: (id: number | 'pending' | null) => void
}

export default function MobileConversationList({ onSelectConversation }: MobileConversationListProps) {
  const { conversations, deleteConversation, selectedConversationId } = useConversations()
  const getMessages = useAppStore((state) => state.getMessages)
  const [deletingId, setDeletingId] = useState<number | 'pending' | null>(null)

  const handleDelete = async (e: React.MouseEvent, id: number | 'pending') => {
    e.stopPropagation()
    setDeletingId(id)

    try {
      await deleteConversation(id)
    } catch (err) {
      console.error('Failed to delete conversation:', err)
    } finally {
      setDeletingId(null)
    }
  }

  const getConversationsByDate = () => {
    const favorites = conversations.filter(conv => isPersistentConversation(conv) && conv.is_favorite)
    const regular = conversations.filter(conv => !isPersistentConversation(conv) || !conv.is_favorite)

    const regularByDate = regular.reduce((acc, conv) => {
      const date = new Date(conv.updated_at)
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)

      let dateKey: string
      if (date.toDateString() === today.toDateString()) {
        dateKey = 'Today'
      } else if (date.toDateString() === yesterday.toDateString()) {
        dateKey = 'Yesterday'
      } else {
        dateKey = format(date, 'MMMM d, yyyy')
      }

      if (!acc[dateKey]) acc[dateKey] = []
      acc[dateKey].push(conv)
      return acc
    }, {} as Record<string, SidebarConversation[]>)

    return { favorites, regularByDate: Object.entries(regularByDate) }
  }

  const { favorites, regularByDate } = getConversationsByDate()

  const renderConversation = (conversation: SidebarConversation) => {
    const isSelected = selectedConversationId === conversation.id
    const isDeleting = deletingId === conversation.id
    const messages = getMessages(conversation.id)
    const modelDisplay = getConversationModelDisplay(conversation.model, messages)

    return (
      <div
        key={conversation.id}
        className={clsx(
          'group relative mx-3 rounded-xl overflow-hidden transition-all duration-200',
          isSelected && 'bg-gradient-subtle border border-primary/20',
          isDeleting && 'opacity-50 pointer-events-none'
        )}
      >
        <button
          onClick={() => onSelectConversation(conversation.id)}
          className="w-full text-left px-4 py-3"
        >
          <div className="flex items-center gap-2 font-medium text-sm pr-8">
            {isPersistentConversation(conversation) && conversation.is_favorite && (
              <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0" />
            )}
            <span className="truncate text-foreground/90">{conversation.title}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {modelDisplay} • {format(new Date(conversation.updated_at), 'h:mm a')}
          </div>
        </button>
        <button
          onClick={(e) => handleDelete(e, conversation.id)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-all text-muted-foreground active:bg-destructive/20 active:text-destructive"
          aria-label="Delete conversation"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }

  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No conversations yet
      </div>
    )
  }

  return (
    <div className="py-2">
      {favorites.length > 0 && (
        <div className="mb-4">
          <div className="px-6 py-2 text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Star className="h-3 w-3 fill-primary text-primary" />
            FAVORITES
          </div>
          <div className="space-y-1">
            {favorites.map(renderConversation)}
          </div>
        </div>
      )}

      {regularByDate.map(([dateKey, convs]) => (
        <div key={dateKey} className="mb-4">
          <div className="px-6 py-2 text-xs font-semibold text-muted-foreground tracking-wide">
            {dateKey.toUpperCase()}
          </div>
          <div className="space-y-1">
            {convs.map(renderConversation)}
          </div>
        </div>
      ))}
    </div>
  )
}
