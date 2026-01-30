import { format } from 'date-fns'
import { Star, Trash2, Search } from 'lucide-react'
import clsx from 'clsx'
import { useState, useMemo } from 'react'
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
  searchQuery?: string
}

export default function MobileConversationList({ onSelectConversation, searchQuery = '' }: MobileConversationListProps) {
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

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations

    const query = searchQuery.toLowerCase()
    return conversations.filter(conv => {
      if (conv.title.toLowerCase().includes(query)) {
        return true
      }

      const messages = getMessages(conv.id)
      return messages.some(msg =>
        msg.text?.toLowerCase().includes(query)
      )
    })
  }, [conversations, searchQuery, getMessages])

  const getConversationsByDate = () => {
    const favorites = filteredConversations.filter(conv => isPersistentConversation(conv) && conv.is_favorite)
    const regular = filteredConversations.filter(conv => !isPersistentConversation(conv) || !conv.is_favorite)

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

  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text

    const lowerText = text.toLowerCase()
    const lowerQuery = query.toLowerCase()
    const index = lowerText.indexOf(lowerQuery)

    if (index === -1) return text

    return (
      <>
        {text.slice(0, index)}
        <span className="bg-primary/30 rounded px-0.5">{text.slice(index, index + query.length)}</span>
        {text.slice(index + query.length)}
      </>
    )
  }

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
            <span className="truncate text-foreground/90">
              {searchQuery ? highlightMatch(conversation.title, searchQuery) : conversation.title}
            </span>
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

  if (filteredConversations.length === 0) {
    if (searchQuery.trim()) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
          <Search className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm">No results for "{searchQuery}"</p>
        </div>
      )
    }
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
