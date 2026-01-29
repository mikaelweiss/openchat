import { ChevronLeft, ChevronRight, ChevronDown, Settings, Trash2, Star, MessageSquare, Search, X } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open } from '@tauri-apps/plugin-shell'
import { useConversations, useAppStore } from '../../stores/appStore'
import { type Conversation } from '../../shared/conversationStore'
import { type PendingConversation } from '../../stores/appStore'
import { getConversationModelDisplay } from '../../utils/conversationUtils'

// Helper type for sidebar display
type SidebarConversation = Conversation | (PendingConversation & { id: 'pending', is_favorite?: boolean })

// Helper function to check if conversation is persistent
const isPersistentConversation = (conv: SidebarConversation): conv is Conversation => {
  return typeof conv.id === 'number'
}
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import ContextMenu from '../ContextMenu/ContextMenu'
import EmptyState from '../EmptyState/EmptyState'
import { ConversationListSkeleton } from '../Skeleton/Skeleton'
import RenameModal from '../RenameModal/RenameModal'
import Logo from '../../assets/Logo.svg'

export interface SidebarHandle {
  focusSearch: () => void
}

interface SidebarProps {
  isOpen: boolean
  width: number
  onToggle: () => void
  onWidthChange: (width: number) => void
  onOpenSettings: () => void
  onOpenShortcuts: () => void
  selectedConversationId?: number | 'pending' | null
  onSelectConversation?: (conversationId: number | 'pending' | null) => void
  onDeleteConversation?: (deletedId: number | 'pending') => void
}

const Sidebar = forwardRef<SidebarHandle, SidebarProps>(({
  isOpen,
  width,
  onToggle,
  onWidthChange,
  onOpenSettings,
  onOpenShortcuts,
  selectedConversationId,
  onSelectConversation,
  onDeleteConversation,
}, ref) => {
  const { conversations, deleteConversation, toggleConversationFavorite, createPendingConversation, updateConversation } = useConversations()
  const getMessages = useAppStore((state) => state.getMessages)
  const searchInputRef = useRef<HTMLInputElement>(null)
  
  // For now, disable loading/error states - can be added back later
  const loading = false
  const error = null
  const [confirmDelete, setConfirmDelete] = useState<{ id: number | 'pending'; title: string } | null>(null)
  const [renameModal, setRenameModal] = useState<{ id: number | 'pending'; title: string } | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    conversation: SidebarConversation
  } | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<number | 'pending'>>(new Set())
  const [isFavoritesCollapsed, setIsFavoritesCollapsed] = useState(() => {
    const saved = localStorage.getItem('favoritesCollapsed')
    return saved === 'true'
  })
  const [searchQuery, setSearchQuery] = useState('')
  
  useImperativeHandle(ref, () => ({
    focusSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
  }))
  
  useEffect(() => {
    localStorage.setItem('favoritesCollapsed', isFavoritesCollapsed.toString())
  }, [isFavoritesCollapsed])
  
  // Clean up deleting state when conversations change
  useEffect(() => {
    const conversationIds = new Set(conversations.map(c => c.id))
    setDeletingIds(prev => {
      const newSet = new Set<number | 'pending'>()
      for (const id of prev) {
        if (conversationIds.has(id)) {
          newSet.add(id)
        }
      }
      return newSet
    })
  }, [conversations])
  
  const handleSelectConversation = (conversation: SidebarConversation) => {
    onSelectConversation?.(conversation.id)
  }
  
  const handleDeleteConversation = async (id: number | 'pending') => {
    // Start the deletion animation immediately
    setDeletingIds(prev => new Set(prev).add(id))
    setConfirmDelete(null)
    
    try {
      await deleteConversation(id)
      // Notify parent component that a conversation was deleted
      onDeleteConversation?.(id)
    } catch (err) {
      console.error('Failed to delete conversation:', err)
      // Remove from deleting state if deletion failed
      setDeletingIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  const handleDeleteClick = (e: React.MouseEvent, conversation: SidebarConversation) => {
    e.stopPropagation()
    
    // If Command key is held, delete immediately without confirmation
    if (e.metaKey) {
      handleDeleteConversation(conversation.id)
    } else {
      // Show confirmation dialog
      setConfirmDelete({ id: conversation.id, title: conversation.title })
    }
  }

  const handleContextMenu = (e: React.MouseEvent, conversation: SidebarConversation) => {
    e.preventDefault()
    e.stopPropagation()
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      conversation,
    })
  }

  const handleToggleFavorite = async (conversationId: number | 'pending') => {
    if (conversationId === 'pending') return // Can't favorite pending conversations
    
    try {
      await toggleConversationFavorite(conversationId)
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  const handleRename = async (id: number | 'pending', newTitle: string) => {
    if (!newTitle.trim()) return
    
    try {
      await updateConversation(id, { title: newTitle.trim() })
      setRenameModal(null)
    } catch (err) {
      console.error('Failed to rename conversation:', err)
    }
  }
  

  const handleStartDrag = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      const window = getCurrentWindow()
      await window.startDragging()
    } catch (error) {
      console.error('Failed to start dragging:', error)
    }
  }
  
  // Group conversations by date and favorites
  const getConversationsByDate = () => {
    // Filter conversations based on search query
    const filteredConversations = conversations.filter(conv => {
      if (searchQuery === '') return true
      
      const query = searchQuery.toLowerCase()
      
      // Search in conversation title
      if (conv.title.toLowerCase().includes(query)) return true
      
      // Search in message content
      const messages = getMessages(conv.id)
      return messages.some(message => 
        message.text?.toLowerCase().includes(query) || 
        message.thinking?.toLowerCase().includes(query)
      )
    })
    
    // Separate filtered conversations by favorite status
    const favorites = filteredConversations.filter(conv => isPersistentConversation(conv) && conv.is_favorite)
    const regular = filteredConversations.filter(conv => !isPersistentConversation(conv) || !conv.is_favorite)
    
    // Group regular conversations by date
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
    
    return {
      favorites,
      regularByDate: Object.entries(regularByDate)
    }
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(240, Math.min(480, startWidth + (e.clientX - startX)))
      onWidthChange(newWidth)
    }
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
    
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const { favorites, regularByDate } = getConversationsByDate()
  
  // Helper function to render a conversation item
  const renderConversation = (conversation: SidebarConversation) => {
    const isDeleting = deletingIds.has(conversation.id)
    const isSelected = selectedConversationId === conversation.id
    
    // Get messages for this conversation to check if it's multi-model
    const messages = getMessages(conversation.id)
    const modelDisplay = getConversationModelDisplay(conversation.model, messages)
    
    return (
      <div
        key={conversation.id}
        className={clsx(
          'group relative flex items-center elegant-hover mx-3 rounded-xl overflow-hidden elegant-fade-in',
          isSelected && 'bg-gradient-subtle border border-primary/20',
          isDeleting && 'opacity-0 scale-95 pointer-events-none'
        )}
        style={{
          maxHeight: isDeleting ? '0px' : '80px',
          marginBottom: isDeleting ? '0px' : '8px',
          paddingTop: isDeleting ? '0px' : undefined,
          paddingBottom: isDeleting ? '0px' : undefined
        }}
      >
        <button
          onClick={() => handleSelectConversation(conversation)}
          onContextMenu={(e) => handleContextMenu(e, conversation)}
          className="flex-1 min-w-0 px-4 py-3 text-left transition-all duration-200"
        >
          <div className="flex items-center gap-2 font-medium text-sm pr-8">
            {isPersistentConversation(conversation) && conversation.is_favorite && (
              <Star className="h-3 w-3 fill-primary text-primary flex-shrink-0 drop-shadow-sm" />
            )}
            <span className="truncate text-foreground/90">{conversation.title}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 truncate">
            {modelDisplay} • {format(new Date(conversation.updated_at), 'h:mm a')}
          </div>
        </button>
        <button
          onClick={(e) => handleDeleteClick(e, conversation)}
          className="absolute right-2 p-1.5 hover:bg-destructive/20 hover:text-destructive rounded-lg transition-all duration-200 opacity-0 group-hover:opacity-100 hover:scale-110"
          title="Delete conversation (hold ⌘ to skip confirmation)"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  }
  
  if (loading) {
    return (
      <div className={clsx('relative flex flex-col glass-nav border-r border-border/10', isOpen ? '' : 'w-0')} style={{ width: isOpen ? `${width}px` : '0px' }}>
        <div className={clsx('relative flex flex-col h-full', !isOpen && 'invisible')}>
          {/* Header skeleton */}
          <div className="h-6 glass-nav rounded-tl-lg" />
          <div className="px-6 py-4 border-b border-border/10 glass-nav">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-elegant rounded-lg flex items-center justify-center shadow-glow">
                  <img src={Logo} alt="Open Chat" className="h-5 w-5" />
                </div>
                <h1 className="text-lg font-semibold text-foreground/95">Open Chat</h1>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-2 elegant-hover rounded-lg transition-all text-sm font-mono text-muted-foreground">/</button>
                <button className="p-2 elegant-hover rounded-lg transition-all text-muted-foreground">
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          
          {/* Conversations skeleton */}
          <div className="flex-1 overflow-y-auto elegant-scrollbar">
            <ConversationListSkeleton />
          </div>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className={clsx('relative flex flex-col glass-nav border-r border-border/10', isOpen ? '' : 'w-0')} style={{ width: isOpen ? `${width}px` : '0px' }}>
        <div className={clsx('flex flex-col h-full justify-center items-center', !isOpen && 'invisible')}>
          <div className="text-destructive">Error: {error}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={clsx(
        "relative flex flex-col glass-nav border-r border-border/10",
        isOpen ? "" : "w-0"
      )}
      style={{ width: isOpen ? `${width}px` : "0px" }}
    >
      <div
        className={clsx(
          "relative flex flex-col h-full",
          !isOpen && "invisible"
        )}
      >
        {/* Search Bar */}
        <div className="absolute top-[97px] left-0 right-0 z-20 px-4 pb-3 glass-nav backdrop-blur-strong border-b border-border/10">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  searchInputRef.current?.blur()
                }
              }}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-10 py-2.5 bg-background/50 border border-border/30 rounded-xl text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted/20 rounded-md transition-colors"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Conversations List - Now extends full height behind header */}
        <div className="absolute inset-0 overflow-y-auto elegant-scrollbar pt-36 pb-20 glass-effect"
          style={{
            scrollbarWidth: 'none'
          }}
        >
          {conversations.length === 0 && (
            <EmptyState
              type="no-conversations"
              title="No conversations yet"
              description="Start a new conversation to begin chatting with AI"
              action={{
                label: "Start New Chat",
                onClick: () => {
                  // Create a new pending conversation
                  createPendingConversation(
                    "New Conversation",
                    "",
                    ""
                  );
                },
              }}
              className="h-full"
            />
          )}
          {/* Favorites Section */}
          {favorites.length > 0 && (
            <div>
              <button
                onClick={() => setIsFavoritesCollapsed(!isFavoritesCollapsed)}
                className="w-full px-6 py-3 text-xs font-semibold text-muted-foreground sticky top-0 z-10 glass-nav backdrop-blur-strong border-b border-border/10 flex items-center gap-2 elegant-hover transition-all"
              >
                <Star className="h-3 w-3 fill-primary text-primary drop-shadow-sm" />
                <span className="flex-1 text-left tracking-wide">
                  FAVORITES
                </span>
                <ChevronDown
                  className={clsx(
                    "h-3 w-3 transition-transform duration-200 text-primary/70",
                    isFavoritesCollapsed && "-rotate-90"
                  )}
                />
              </button>
              {!isFavoritesCollapsed && (
                <div className="space-y-1 mt-2">
                  {favorites.map(renderConversation)}
                </div>
              )}
            </div>
          )}

          {/* Regular Conversations by Date */}
          {regularByDate.map(([dateKey, convs]) => (
            <div key={dateKey}>
              <div className="px-6 py-3 text-xs font-semibold text-muted-foreground sticky top-0 z-10 glass-nav backdrop-blur-strong border-b border-border/10 tracking-wide">
                {dateKey.toUpperCase()}
              </div>
              <div className="space-y-1 mt-2">
                {convs.map(renderConversation)}
              </div>
            </div>
          ))}
        </div>

        {/* Header - Now positioned absolutely */}
        <div className="absolute top-0 left-0 right-0 z-20">

          {/* Header */}
          <div
            className="px-6 py-4 pt-11 border-b border-border/10 glass-nav backdrop-blur-strong select-none"
            onMouseDown={handleStartDrag}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={Logo} alt="Open Chat" className="h-5 w-5" />
                <h1 className="text-lg font-semibold text-foreground/95 tracking-tight">
                  Open Chat
                </h1>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={onOpenShortcuts}
                  className="p-2 elegant-hover rounded-lg transition-all text-sm font-mono text-muted-foreground hover:text-primary"
                  title="Keyboard Shortcuts"
                >
                  /
                </button>
                <button
                  onClick={onOpenSettings}
                  className="p-2 elegant-hover rounded-lg transition-all text-muted-foreground hover:text-primary"
                  title="Settings"
                >
                  <Settings className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Feedback Button - Now positioned absolutely */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/10 glass-nav backdrop-blur-strong shadow-elegant-xl z-50">
          <button
            onClick={async () => {
              try {
                await open('mailto:contact@weisssolutions.org')
              } catch (error) {
                console.error('Failed to open email client:', error)
              }
            }}
            className="ml-auto block p-2 elegant-hover rounded-lg transition-all text-muted-foreground hover:text-primary"
            title="Send Feedback"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Resize Handle */}
      {isOpen && (
        <div
          className="absolute -right-1 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors"
          onMouseDown={handleMouseDown}
        />
      )}

      {/* Toggle Button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-1/2 -translate-y-1/2 glass-effect border border-border/20 rounded-full p-1.5 elegant-hover no-drag z-50 text-muted-foreground hover:text-primary shadow-elegant hover:scale-110 transition-transform duration-200"
      >
        {isOpen ? (
          <ChevronLeft className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>

      {/* Confirmation Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-effect border border-border/20 rounded-2xl p-6 max-w-sm mx-4 shadow-elegant-xl">
            <h3 className="text-lg font-semibold mb-2 text-foreground/95">
              Delete Conversation
            </h3>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Are you sure you want to delete "{confirmDelete.title}"? This
              action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm elegant-hover rounded-xl transition-all text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteConversation(confirmDelete.id)}
                className="px-4 py-2 text-sm bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-xl transition-all hover:scale-105"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModal && (
        <RenameModal
          isOpen={!!renameModal}
          currentTitle={renameModal.title}
          onClose={() => setRenameModal(null)}
          onRename={(newTitle) => handleRename(renameModal.id, newTitle)}
        />
      )}

      {/* Context Menu */}
      <ContextMenu
        x={contextMenu?.x || 0}
        y={contextMenu?.y || 0}
        isVisible={!!contextMenu}
        onClose={() => setContextMenu(null)}
        isFavorite={contextMenu && isPersistentConversation(contextMenu.conversation) ? contextMenu.conversation.is_favorite : false}
        onToggleFavorite={() => {
          if (contextMenu) {
            handleToggleFavorite(contextMenu.conversation.id);
          }
        }}
        onDelete={() => {
          if (contextMenu) {
            setConfirmDelete({
              id: contextMenu.conversation.id,
              title: contextMenu.conversation.title,
            });
          }
        }}
        onRename={() => {
          if (contextMenu) {
            setRenameModal({
              id: contextMenu.conversation.id,
              title: contextMenu.conversation.title,
            });
          }
        }}
      />
    </div>
  );
})

export default Sidebar