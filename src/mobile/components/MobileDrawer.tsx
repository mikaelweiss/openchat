import { useState } from 'react'
import { X, Settings, Search } from 'lucide-react'
import clsx from 'clsx'
import MobileConversationList from './MobileConversationList'
import Logo from '../../assets/Logo.svg'

interface MobileDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSelectConversation: (id: number | 'pending' | null) => void
  onOpenSettings: () => void
}

export default function MobileDrawer({ isOpen, onClose, onSelectConversation, onOpenSettings }: MobileDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const handleClose = () => {
    setSearchQuery('')
    onClose()
  }

  const handleSelectConversation = (id: number | 'pending' | null) => {
    setSearchQuery('')
    onSelectConversation(id)
  }

  return (
    <div
      className={clsx(
        'mobile-drawer fixed inset-0 z-50 transition-opacity duration-300',
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
    >
      <div
        className="mobile-drawer-backdrop absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      <div
        className={clsx(
          'mobile-drawer-content absolute left-0 top-0 h-full bg-background border-r border-border/10 flex flex-col transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/10">
          <div className="flex items-center gap-3">
            <img src={Logo} alt="Open Chat" className="h-6 w-6" />
            <h2 className="text-lg font-semibold text-foreground/95">Open Chat</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 -mr-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-secondary rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground active:bg-accent/50"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <MobileConversationList
            onSelectConversation={handleSelectConversation}
            searchQuery={searchQuery}
          />
        </div>

        <div className="border-t border-border/10 p-4">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings className="h-5 w-5" />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </div>
    </div>
  )
}
