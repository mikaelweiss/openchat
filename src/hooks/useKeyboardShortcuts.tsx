import { useEffect } from 'react'
import { telemetryService } from '../services/telemetryService'

interface KeyboardShortcutsProps {
  onNewChat: () => void
  onToggleSidebar: () => void
  onToggleSettings: () => void
  onToggleShortcuts: () => void
  onToggleModelSelector: () => void
  onFocusSearch: () => void
  onSendFeedback: () => void
  onFocusInput: () => void
  onCloseModal: () => void
  onToggleTheme: () => void
  onNextModel: () => void
  onPreviousModel: () => void
  settingsOpen: boolean
  shortcutsOpen: boolean
  modelSelectorOpen: boolean
}

export const useKeyboardShortcuts = ({
  onNewChat,
  onToggleSidebar,
  onToggleSettings,
  onToggleShortcuts,
  onToggleModelSelector,
  onFocusSearch,
  onSendFeedback,
  onFocusInput,
  onCloseModal,
  onToggleTheme,
  onNextModel,
  onPreviousModel,
  settingsOpen,
  shortcutsOpen,
  modelSelectorOpen
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Handle Escape key - should work even in input fields when modals are open
      if (event.key === 'Escape' && (settingsOpen || shortcutsOpen || modelSelectorOpen)) {
        event.preventDefault()
        onCloseModal()
        telemetryService.trackKeyboardShortcut('Esc', 'close_modal')
        return
      }
      
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifierKey = isMac ? event.metaKey : event.ctrlKey
      
      // Only proceed if the appropriate modifier key is pressed
      if (!modifierKey) return
      
      switch (event.key.toLowerCase()) {
        case 'n':
          // Cmd/Ctrl + N - New chat
          event.preventDefault()
          onNewChat()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘N' : 'Ctrl+N', 'new_chat')
          break
          
        case 't':
          if (event.shiftKey) {
            // Cmd/Ctrl + Shift + T - Toggle theme
            event.preventDefault()
            onToggleTheme()
            telemetryService.trackKeyboardShortcut(isMac ? '⇧⌘T' : 'Ctrl+Shift+T', 'toggle_theme')
          } else {
            // Cmd/Ctrl + T - New chat (alternative)
            event.preventDefault()
            onNewChat()
            telemetryService.trackKeyboardShortcut(isMac ? '⌘T' : 'Ctrl+T', 'new_chat_alt')
          }
          break
          
        case 's':
          // Cmd/Ctrl + S - Toggle sidebar
          event.preventDefault()
          onToggleSidebar()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘S' : 'Ctrl+S', 'toggle_sidebar')
          break
          
        case ',':
          // Cmd/Ctrl + , - Toggle settings
          event.preventDefault()
          onToggleSettings()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘,' : 'Ctrl+,', 'toggle_settings')
          break
          
        case '/':
          // Cmd/Ctrl + / - Toggle keyboard shortcuts
          event.preventDefault()
          onToggleShortcuts()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘/' : 'Ctrl+/', 'toggle_shortcuts')
          break
          
        case 'f':
        case 'ƒ': // Mac Option+F produces this character
          if (event.shiftKey && !event.altKey) {
            // Cmd/Ctrl + Shift + F - Focus sidebar search
            event.preventDefault()
            onFocusSearch()
            telemetryService.trackKeyboardShortcut(isMac ? '⇧⌘F' : 'Ctrl+Shift+F', 'focus_search')
          } else if (event.altKey) {
            // Cmd/Ctrl + Alt + F - Send feedback (handles both 'f' and 'ƒ')
            event.preventDefault()
            onSendFeedback()
            telemetryService.trackKeyboardShortcut(isMac ? '⌥⌘F' : 'Ctrl+Alt+F', 'send_feedback')
          }
          break
          
        case 'l':
          // Cmd/Ctrl + L - Focus message input
          event.preventDefault()
          onFocusInput()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘L' : 'Ctrl+L', 'focus_input')
          break
          
        case '.':
          // Cmd/Ctrl + . - Toggle model selector
          event.preventDefault()
          onToggleModelSelector()
          telemetryService.trackKeyboardShortcut(isMac ? '⌘.' : 'Ctrl+.', 'toggle_model_selector')
          break
          
        case 'm':
          // Cmd/Ctrl + Shift + M - Toggle model selector (alternative)
          if (event.shiftKey) {
            event.preventDefault()
            onToggleModelSelector()
            telemetryService.trackKeyboardShortcut(isMac ? '⇧⌘M' : 'Ctrl+Shift+M', 'toggle_model_selector_alt')
            // Auto-focus the search input when model selector opens with this shortcut
            setTimeout(() => {
              const searchInput = document.querySelector('[data-model-search-input]') as HTMLInputElement
              if (searchInput) {
                searchInput.focus()
                searchInput.select()
              }
            }, 100)
          }
          break
          
        case 'j':
          // Cmd/Ctrl + J - Next model
          event.preventDefault()
          onNextModel()
          break
          
        case 'k':
          // Cmd/Ctrl + K - Previous model
          event.preventDefault()
          onPreviousModel()
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    onNewChat,
    onToggleSidebar,
    onToggleSettings,
    onToggleShortcuts,
    onToggleModelSelector,
    onFocusSearch,
    onSendFeedback,
    onFocusInput,
    onCloseModal,
    onToggleTheme,
    onNextModel,
    onPreviousModel,
    settingsOpen,
    shortcutsOpen,
    modelSelectorOpen
  ])
}