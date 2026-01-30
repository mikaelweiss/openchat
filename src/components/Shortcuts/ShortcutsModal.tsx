import { X } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'

interface ShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  description: string
}

interface ShortcutCategory {
  name: string
  shortcuts: ShortcutItem[]
}

export default function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null

  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const modKey = isMac ? '⌘' : 'Ctrl'
  
  const { settings } = useSettings()
  const sendKey = settings?.sendMessage || 'enter'
  const globalHotkey = settings?.globalHotkey || ''

  // Dynamic message shortcuts based on setting
  const messageShortcuts = sendKey === 'cmd-enter' 
    ? [
        { keys: [modKey, 'Enter'], description: 'Send message' },
        { keys: ['Enter'], description: 'New line in message' },
      ]
    : [
        { keys: ['Enter'], description: 'Send message' },
        { keys: ['Shift', 'Enter'], description: 'New line in message' },
      ]

  // Parse global hotkey string into key array
  const parseGlobalHotkey = (hotkey: string): string[] => {
    if (!hotkey || !hotkey.trim()) {
      return ['None']
    }
    
    return hotkey.split('+').map(key => {
      // Convert key names to display format
      switch (key.toLowerCase()) {
        case 'control':
        case 'ctrl':
          return isMac ? '⌃' : 'Ctrl'
        case 'command':
        case 'cmd':
          return '⌘'
        case 'alt':
          return isMac ? '⌥' : 'Alt'
        case 'shift':
          return isMac ? '⇧' : 'Shift'
        case 'space':
          return 'Space'
        default:
          return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
      }
    })
  }

  const globalShortcutDescription = globalHotkey && globalHotkey.trim() 
    ? 'Open app & toggle mini window (system-wide)'
    : 'No global shortcut set'

  const shortcutCategories: ShortcutCategory[] = [
    {
      name: 'Global',
      shortcuts: [
        { keys: parseGlobalHotkey(globalHotkey), description: globalShortcutDescription },
      ]
    },
    {
      name: 'General',
      shortcuts: [
        { keys: [modKey, 'N'], description: 'Start new chat' },
        { keys: [modKey, 'T'], description: 'Start new chat' },
        { keys: [modKey, 'S'], description: 'Toggle sidebar' },
        { keys: [modKey, ','], description: 'Open settings' },
        { keys: [modKey, '/'], description: 'Toggle keyboard shortcuts' },
        { keys: [modKey, 'Shift', 'T'], description: 'Toggle theme (light/dark)' },
        { keys: [modKey, 'Shift', 'F'], description: 'Focus sidebar search' },
        { keys: [modKey, isMac ? '⌥' : 'Alt', 'F'], description: 'Send feedback' },
        { keys: [modKey, 'L'], description: 'Focus message input' },
        { keys: [modKey, '.'], description: 'Toggle model selector' },
        { keys: [modKey, 'J'], description: 'Switch to next model' },
        { keys: [modKey, 'K'], description: 'Switch to previous model' },
      ]
    },
    {
      name: 'Messages',
      shortcuts: messageShortcuts
    },
    {
      name: 'Navigation',
      shortcuts: [
        { keys: ['Esc'], description: 'Close dialog/modal' },
      ]
    }
  ]

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-background border border-border rounded-xl w-[600px] max-h-[500px] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-muted-foreground scrollbar-track-transparent">
          <div className="space-y-6">
            {shortcutCategories.map((category) => (
              <div key={category.name}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  {category.name}
                </h3>
                <div className="space-y-2">
                  {category.shortcuts.map((shortcut, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-sm">{shortcut.description}</span>
                      <div className="flex items-center gap-1">
                        {shortcut.keys.map((key, keyIndex) => (
                          <span key={keyIndex}>
                            <kbd className="px-2 py-1 text-xs font-semibold text-foreground bg-secondary border border-border rounded">
                              {key}
                            </kbd>
                            {keyIndex < shortcut.keys.length - 1 && (
                              <span className="mx-1 text-xs text-muted-foreground">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}