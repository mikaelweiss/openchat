import { Menu, Plus, ChevronDown } from 'lucide-react'
import clsx from 'clsx'

interface MobileHeaderProps {
  title: string
  subtitle?: string
  onMenuPress: () => void
  onNewChat: () => void
  onTitlePress?: () => void
}

export default function MobileHeader({
  title,
  subtitle,
  onMenuPress,
  onNewChat,
  onTitlePress
}: MobileHeaderProps) {
  return (
    <header className="mobile-header flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
      <button
        onClick={onMenuPress}
        className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-6 w-6" />
      </button>

      <button
        onClick={onTitlePress}
        disabled={!onTitlePress}
        className={clsx(
          'flex-1 flex flex-col items-center justify-center px-4 min-w-0',
          onTitlePress && 'active:opacity-70 transition-opacity'
        )}
      >
        <div className="flex items-center gap-1 max-w-full">
          <h1 className="font-semibold text-foreground/95 truncate">
            {title}
          </h1>
          {onTitlePress && <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
        </div>
        {subtitle && (
          <span className="text-xs text-muted-foreground truncate max-w-full">
            {subtitle}
          </span>
        )}
      </button>

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
