import { X, Plus } from 'lucide-react'
import clsx from 'clsx'

interface OpenTab {
  id: number | 'pending'
  title: string
}

interface TabsProps {
  openTabs: OpenTab[]
  activeTabId: number | 'pending' | null
  onSwitchTab: (tabId: number | 'pending') => void
  onCloseTab: (tabId: number | 'pending') => void
  onNewTab: () => void
}

export default function Tabs({ openTabs, activeTabId, onSwitchTab, onCloseTab, onNewTab }: TabsProps) {
  return (
    <div className="flex items-center border-b border-border/10 glass-nav backdrop-blur-strong px-4 py-2">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar flex-1">
        {openTabs.map((tab) => (
          <div
            key={tab.id}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 cursor-pointer select-none",
              "border border-transparent",
              activeTabId === tab.id
                ? "bg-gradient-subtle border-primary/20 text-foreground/95 font-medium" 
                : "elegant-hover text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onSwitchTab(tab.id)}
          >
            <span className="truncate max-w-[160px]">{tab.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
              className="p-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        
        <button
          onClick={onNewTab}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all duration-200 cursor-pointer select-none elegant-hover text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}