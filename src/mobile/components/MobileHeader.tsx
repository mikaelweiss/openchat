import { Menu, Plus } from 'lucide-react'

interface MobileHeaderProps {
  title: string
  onMenuPress: () => void
  onNewChat: () => void
}

export default function MobileHeader({ title, onMenuPress, onNewChat }: MobileHeaderProps) {
  return (
    <header className="mobile-header flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
      <button
        onClick={onMenuPress}
        className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <h1 className="flex-1 text-center font-semibold text-foreground/95 truncate px-4">
        {title}
      </h1>

      <button
        onClick={onNewChat}
        className="p-2 -mr-2 rounded-xl elegant-hover text-muted-foreground hover:text-primary transition-colors"
        aria-label="New chat"
      >
        <Plus className="h-6 w-6" />
      </button>
    </header>
  )
}
