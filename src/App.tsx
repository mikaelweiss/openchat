import { useState, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar/Sidebar'
import ChatView from './components/Chat/ChatView'
import SettingsModal from './components/Settings/SettingsModal'
import ShortcutsModal from './components/Shortcuts/ShortcutsModal'
import ToastContainer from './components/Toast/Toast'
import OnboardingModal from './components/Onboarding/OnboardingModal'
import IntroAnimation from './components/IntroAnimation/IntroAnimation'
import Tabs from './components/Tabs/Tabs'
import { DEFAULT_SIDEBAR_WIDTH, TELEMETRY_CONFIG } from './shared/constants'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { MessageInputHandle } from './components/Chat/MessageInput'
import { useSettings } from './hooks/useSettings'
import { useConversations, useAppStore } from './stores/appStore'
import { initializeAppStore } from './stores/appStore'
import { messageSync } from './utils/messageSync'
import { telemetryService } from './services/telemetryService'
import { ollamaService } from './services/ollamaService'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { settings, SETTINGS_KEYS } from './shared/settingsStore'

function App() {
  // Check if we're in mini window mode
  const isMiniWindow = new URLSearchParams(window.location.search).get('window') === 'mini'
  
  const [showIntroAnimation, setShowIntroAnimation] = useState(false) // Will be set based on settings
  const [sidebarOpen, setSidebarOpen] = useState(!isMiniWindow) // Hide sidebar in mini window
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<'general' | 'models' | 'about'>('general')
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false)
  const [appStartTime] = useState(() => Date.now())
  
  // Tab management state
  const [openTabs, setOpenTabs] = useState<Array<{id: number | 'pending', title: string}>>([])
  const [activeTabId, setActiveTabId] = useState<number | 'pending' | null>(null)
  
  // Use Zustand store for conversations
  const { 
    conversations, 
    selectedConversationId, 
    setSelectedConversation,
    createPendingConversation,
    deleteConversation: deleteConversationFromStore,
    getConversation
  } = useConversations()
  const messageInputRef = useRef<MessageInputHandle>(null)
  
  // Initialize settings (theme will be applied in useSettings hook)
  const { handleThemeChange, theme, hasCompletedOnboarding, isLoading: settingsLoading, showTabs } = useSettings()
  
  // Check if intro has been shown before
  useEffect(() => {
    const checkIntroShown = async () => {
      if (isMiniWindow) return // Never show intro in mini window
      
      const hasShownIntro = await settings.get<boolean>(SETTINGS_KEYS.HAS_SHOWN_INTRO)
      if (!hasShownIntro) {
        setShowIntroAnimation(true)
      }
    }
    checkIntroShown()
  }, [isMiniWindow])
  
  // Initialize Zustand store and message sync
  useEffect(() => {
    const initialize = async () => {
      // Initialize TelemetryDeck (non-blocking)
      telemetryService.initialize({
        appID: TELEMETRY_CONFIG.APP_ID,
        testMode: TELEMETRY_CONFIG.TEST_MODE,
      }).then(() => {
        // Track app launch after initialization
        telemetryService.trackAppLaunched()
        // Track app startup time
        const startupTime = Date.now() - appStartTime
        telemetryService.trackAppStartupTime(startupTime)
      }).catch(error => {
        console.warn('Telemetry initialization failed:', error)
      })
      
      // Initialize store
      await initializeAppStore()
      
      // Auto-start Ollama (non-blocking)
      ollamaService.autoStartOllama().then(result => {
        if (result.success) {
          console.log('Ollama auto-start:', result.message)
        } else {
          console.warn('Ollama auto-start failed:', result.message)
        }
      }).catch(error => {
        console.warn('Ollama auto-start error:', error)
      })
      
      // Set up sync listeners
      await messageSync.setupListeners(
        (conversationId) => {
          // Reload messages for the updated conversation
          useAppStore.getState().loadMessages(conversationId)
        },
        () => {
          // Reload all settings when settings change
          const store = useAppStore.getState()
          store.loadProviders()
          
          // Also reload settings from the hook (this will apply theme)
          window.dispatchEvent(new CustomEvent('reloadSettings'))
        }
      )
    }
    
    initialize()
    
    // Cleanup on unmount
    return () => {
      messageSync.cleanup()
    }
  }, [])

  // Setup cleanup handler for app shutdown
  useEffect(() => {
    let unlisten: (() => void) | null = null

    const setupCleanup = async () => {
      try {
        const appWindow = getCurrentWindow()
        
        // Listen for the window close event
        unlisten = await appWindow.onCloseRequested(async () => {
          console.log('App close requested, stopping Ollama...')
          
          // Track session end
          try {
            await telemetryService.trackSessionEnd()
          } catch (error) {
            console.warn('Failed to track session end:', error)
          }
          
          // Stop Ollama completely (this automatically unloads all models)
          try {
            const result = await ollamaService.stopOllama()
            if (result.success) {
              console.log('Ollama cleanup completed:', result.message)
            } else {
              console.warn('Ollama cleanup warning:', result.message)
            }
          } catch (error) {
            console.warn('Failed to stop Ollama:', error)
          }
          
          // Allow the window to close after cleanup
          // Don't prevent the close, just clean up first
        })
      } catch (error) {
        console.warn('Failed to setup cleanup handler:', error)
      }
    }
    
    setupCleanup()
    
    // Cleanup the listener when component unmounts
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])  // No dependencies needed - this is a one-time setup

  // Check for app updates on startup
  useEffect(() => {
    // Don't check for updates in mini window mode
    if (isMiniWindow) {
      return
    }

    const checkForUpdates = async () => {
      const update = await check();
      if (update) {
        console.log(
          `found update ${update.version} from ${update.date} with notes ${update.body}`
        );
        let downloaded = 0;
        let contentLength = 0;
        // alternatively we could also call update.download() and update.install() separately
        await update.downloadAndInstall((event) => {
          switch (event.event) {
            case 'Started':
              contentLength = event.data.contentLength || 0;
              console.log(`started downloading ${event.data.contentLength || 0} bytes`);
              break;
            case 'Progress':
              downloaded += event.data.chunkLength || 0;
              console.log(`downloaded ${downloaded} from ${contentLength}`);
              break;
            case 'Finished':
              console.log('download finished');
              break;
          }
        });
      
        console.log('update installed');
        await relaunch();
      }
    }

    checkForUpdates();
  }, [isMiniWindow])
  
  // Reload state when window gains focus
  useEffect(() => {
    const handleFocus = async () => {
      const store = useAppStore.getState()
      
      // Reload providers from settings.json
      await store.loadProviders()
      
      // Reload conversations from SQLite
      await store.loadConversations()
    }
    
    // Load on focus
    window.addEventListener('focus', handleFocus)
    
    // Also reload when window becomes visible (for mini window toggle)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        handleFocus()
      }
    })
    
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [])
  
  // Listen for custom event to open settings to a specific section
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      const section = event.detail?.section
      if (section === 'providers') {
        setSettingsSection('models')
        setSettingsOpen(true)
        telemetryService.trackSettingsOpened('models')
      } else if (section === 'general' || section === 'models' || section === 'about') {
        setSettingsSection(section)
        setSettingsOpen(true)
        telemetryService.trackSettingsOpened(section)
      } else {
        setSettingsOpen(true)
        telemetryService.trackSettingsOpened('general')
      }
    }
    
    window.addEventListener('openSettings' as any, handleOpenSettings)
    return () => {
      window.removeEventListener('openSettings' as any, handleOpenSettings)
    }
  }, [])
  
  // Show onboarding if not completed
  useEffect(() => {
    if (!settingsLoading && !hasCompletedOnboarding && !isMiniWindow) {
      setOnboardingOpen(true)
    }
  }, [settingsLoading, hasCompletedOnboarding, isMiniWindow])

  // Listen for restart onboarding event
  useEffect(() => {
    const handleRestartOnboarding = () => {
      setOnboardingOpen(true)
    }
    
    window.addEventListener('restartOnboarding', handleRestartOnboarding)
    return () => {
      window.removeEventListener('restartOnboarding', handleRestartOnboarding)
    }
  }, [])
  
  // Listen for replay intro event
  useEffect(() => {
    const handleReplayIntro = () => {
      setShowIntroAnimation(true)
    }
    
    window.addEventListener('replayIntro', handleReplayIntro)
    return () => {
      window.removeEventListener('replayIntro', handleReplayIntro)
    }
  }, [])
  
  // Create initial pending conversation when app starts and no conversation is selected
  useEffect(() => {
    // Only create a new pending conversation if there's no selected conversation and no existing conversations
    if (!selectedConversationId && conversations.length === 0) {
      createPendingConversation('New Conversation', '', '')
    }
  }, [conversations.length, selectedConversationId, createPendingConversation])
  
  // Sync open tabs with the selected conversation
  useEffect(() => {
    if (selectedConversationId) {
      const conversation = getConversation(selectedConversationId)
      if (conversation) {
        const newTab = { id: selectedConversationId, title: conversation.title }
        
        // Manage tabs - ensure no duplicates and proper transitions
        setOpenTabs(prev => {
          // Check if we're transitioning from a pending to a persistent conversation
          const hadPendingTab = prev.some(tab => tab.id === 'pending')
          const isNewPersistentFromPending = selectedConversationId !== 'pending' && typeof selectedConversationId === 'number' && hadPendingTab
          
          if (isNewPersistentFromPending) {
            // Replace the pending tab with the new persistent tab
            return prev.map(tab => 
              tab.id === 'pending' 
                ? newTab 
                : tab
            )
          } else {
            // For all other cases, ensure no duplicate tabs exist
            // First, remove any existing tab with the same ID
            const filteredTabs = prev.filter(tab => tab.id !== selectedConversationId)
            // Then add the new/updated tab
            return [...filteredTabs, newTab]
          }
        })
        
        setActiveTabId(selectedConversationId)
      }
    }
  }, [selectedConversationId, getConversation])
  
  // Update tab titles when conversations change
  useEffect(() => {
    setOpenTabs(prevTabs => {
      let updated = false
      const newTabs = prevTabs.map(tab => {
        const conversation = getConversation(tab.id)
        if (conversation && conversation.title !== tab.title) {
          updated = true
          return { ...tab, title: conversation.title }
        }
        return tab
      })
      return updated ? newTabs : prevTabs
    })
  }, [conversations, getConversation])

  // Handle when a conversation is deleted
  const handleConversationDeleted = async (deletedId: number | 'pending') => {
    // Delete from store
    await deleteConversationFromStore(deletedId)
    
    // If the deleted conversation was the currently selected one, create a new pending chat
    if (selectedConversationId === deletedId) {
      try {
        // Get the last conversation's model to inherit it (if any)
        let provider = ''
        let model = ''
        
        if (conversations.length > 1) { // More than 1 because we haven't removed the deleted one from the array yet
          const lastConversation = conversations.find(conv => conv.id !== deletedId) || conversations[0]
          provider = lastConversation.provider || ''
          model = lastConversation.model || ''
        }
        
        // Create a new pending conversation
        createPendingConversation('New Conversation', provider, model)
        
        // Focus the message input after creating new conversation
        setTimeout(() => {
          messageInputRef.current?.focus()
        }, 100)
      } catch (err) {
        console.error('Failed to create new pending conversation after deletion:', err)
      }
    }
  }

  // Keyboard shortcut handlers
  const handleNewChat = () => {
    if (!selectedConversationId) {
      return
    }
    
    // Check if current conversation has messages
    const messages = useAppStore.getState().getMessages(selectedConversationId)
    if (messages.length < 1) {
      return // Don't create new chat if current one is empty
    }
    
    try {
      // Get the last conversation to use its model
      let provider = ''
      let model = ''
      
      if (conversations.length > 0) {
        const lastConversation = conversations[0] // conversations are sorted by most recent
        provider = lastConversation.provider || ''
        model = lastConversation.model || ''
      }
      
      // Create a new pending conversation
      createPendingConversation('New Conversation', provider, model)
      
      // Focus the message input after a short delay
      setTimeout(() => {
        messageInputRef.current?.focus()
      }, 100)
    } catch (err) {
      console.error('Failed to create conversation via keyboard shortcut:', err)
    }
  }

  const handleToggleSettings = () => {
    if (settingsOpen) {
      setSettingsOpen(false)
    } else {
      // Close other modals when opening settings
      setShortcutsOpen(false)
      setModelSelectorOpen(false)
      setSettingsOpen(true)
      telemetryService.trackSettingsOpened('general')
    }
  }

  const handleToggleShortcuts = () => {
    if (shortcutsOpen) {
      setShortcutsOpen(false)
    } else {
      // Close other modals when opening shortcuts
      setSettingsOpen(false)
      setModelSelectorOpen(false)
      setShortcutsOpen(true)
    }
  }

  const handleToggleModelSelector = () => {
    if (modelSelectorOpen) {
      setModelSelectorOpen(false)
    } else {
      // Close other modals when opening model selector
      setSettingsOpen(false)
      setShortcutsOpen(false)
      setModelSelectorOpen(true)
    }
  }

  const handleSendFeedback = () => {
    console.log('Send feedback triggered via keyboard shortcut')
    // Implementation would open feedback dialog or action
  }

  const handleFocusInput = () => {
    messageInputRef.current?.focus()
  }

  const handleCloseModal = () => {
    if (settingsOpen) {
      setSettingsOpen(false)
    } else if (shortcutsOpen) {
      setShortcutsOpen(false)
    } else if (modelSelectorOpen) {
      setModelSelectorOpen(false)
    }
  }

  const handleToggleTheme = () => {
    // Toggle between light and dark only
    const newTheme = theme === 'light' ? 'dark' : 'light'
    handleThemeChange(newTheme)
    telemetryService.trackThemeChanged(newTheme)
  }

  // Add escape key handler for mini window
  useEffect(() => {
    if (isMiniWindow) {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          window.close()
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMiniWindow])
  
  // Initialize keyboard shortcuts (disabled in mini window for certain shortcuts)
  useKeyboardShortcuts({
    onNewChat: handleNewChat,
    onToggleSidebar: () => setSidebarOpen(!sidebarOpen),
    onToggleSettings: isMiniWindow ? () => {} : handleToggleSettings,
    onToggleShortcuts: isMiniWindow ? () => {} : handleToggleShortcuts,
    onToggleModelSelector: isMiniWindow ? () => {} : handleToggleModelSelector,
    onSendFeedback: handleSendFeedback,
    onFocusInput: handleFocusInput,
    onCloseModal: handleCloseModal,
    onToggleTheme: handleToggleTheme,
    settingsOpen,
    shortcutsOpen,
    modelSelectorOpen
  })

  // Handle creating a new tab
  const handleNewTab = () => {
    // Create a new pending conversation for the new tab
    try {
      // Get the last conversation to use its model
      let provider = ''
      let model = ''
      
      if (conversations.length > 0) {
        const lastConversation = conversations[0] // conversations are sorted by most recent
        provider = lastConversation.provider || ''
        model = lastConversation.model || ''
      }
      
      // Create a new pending conversation
      createPendingConversation('New Conversation', provider, model)
      
      // Focus the message input after a short delay
      setTimeout(() => {
        messageInputRef.current?.focus()
      }, 100)
    } catch (err) {
      console.error('Failed to create new conversation for tab:', err)
    }
  }

  // Handle switching to a tab
  const handleSwitchTab = (tabId: number | 'pending') => {
    // Switch to existing conversation
    setSelectedConversation(tabId)
    setActiveTabId(tabId)
  }

  // Handle closing a tab
  const handleCloseTab = async (tabId: number | 'pending') => {
    // If closing the active tab, switch to another open tab if available
    if (tabId === activeTabId) {
      const otherTabs = openTabs.filter(tab => tab.id !== tabId)
      if (otherTabs.length > 0) {
        const newActiveTab = otherTabs[0]
        setSelectedConversation(newActiveTab.id)
        setActiveTabId(newActiveTab.id)
      } else {
        // No other tabs open, create a new one
        handleNewTab()
      }
    }
    
    // Remove the tab from open tabs
    setOpenTabs(prev => prev.filter(tab => tab.id !== tabId))
    
    // Delete the conversation
    await handleConversationDeleted(tabId)
    
    // If we've closed all tabs, make sure we have at least one pending conversation
    // This can happen if we close the last "New Conversation" tab
    if (openTabs.length === 1 && !selectedConversationId) {
      // Check if we need to create a new pending conversation
      const state = useAppStore.getState()
      if (!state.pendingConversation) {
        // Get the last conversation's model to inherit it (if any)
        let provider = ''
        let model = ''
        
        if (state.conversations.length > 0) {
          const lastConversation = state.conversations[0] // conversations are sorted by most recent
          provider = lastConversation.provider || ''
          model = lastConversation.model || ''
        }
        
        // Create a new pending conversation
        createPendingConversation('New Conversation', provider, model)
      }
    }
  }

  return (
    <>
      {showIntroAnimation && (
        <IntroAnimation onComplete={async () => {
          setShowIntroAnimation(false)
          // Save that the intro has been shown
          await settings.set(SETTINGS_KEYS.HAS_SHOWN_INTRO, true)
        }} />
      )}
      
      <div className={`flex h-screen bg-background text-foreground overflow-hidden ${isMiniWindow ? 'mini-window' : ''}`}>
        {!isMiniWindow && (
          <Sidebar
            isOpen={sidebarOpen}
            width={sidebarWidth}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            onWidthChange={setSidebarWidth}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            selectedConversationId={selectedConversationId}
            onSelectConversation={setSelectedConversation}
            onDeleteConversation={handleConversationDeleted}
          />
        )}
        
        <div className={`flex-1 min-w-0 flex ${!sidebarOpen ? '' : ''}`}>
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
            {/* Tabs Bar */}
            {!isMiniWindow && showTabs && (
              <Tabs
                openTabs={openTabs}
                activeTabId={activeTabId}
                onSwitchTab={handleSwitchTab}
                onCloseTab={handleCloseTab}
                onNewTab={handleNewTab}
              />
            )}
            
            <ChatView 
              conversationId={selectedConversationId}
              onOpenSettings={isMiniWindow ? () => {} : () => setSettingsOpen(true)} 
              messageInputRef={messageInputRef}
              onSelectConversation={setSelectedConversation}
              isMiniWindow={isMiniWindow}
              modelSelectorOpen={modelSelectorOpen}
              onToggleModelSelector={handleToggleModelSelector}
            />
          </div>
        </div>
        
        {!isMiniWindow && (
          <>
            <SettingsModal
              isOpen={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              initialSection={settingsSection}
            />
            
            <ShortcutsModal
              isOpen={shortcutsOpen}
              onClose={() => setShortcutsOpen(false)}
            />
            
            <OnboardingModal
              isOpen={onboardingOpen}
              onClose={() => setOnboardingOpen(false)}
            />
          </>
        )}

        <ToastContainer />
      </div>
    </>
  )
}

export default App
