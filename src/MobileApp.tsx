import { useState, useEffect, useMemo, useRef } from 'react'
import MobileHeader from './mobile/components/MobileHeader'
import MobileDrawer from './mobile/components/MobileDrawer'
import MobileChatView from './mobile/components/MobileChatView'
import MobileSettings from './mobile/components/MobileSettings'
import MobileModelSelector from './mobile/components/MobileModelSelector'
import MobileOnboarding from './mobile/components/MobileOnboarding'
import ToastContainer from './components/Toast/Toast'
import { TELEMETRY_CONFIG } from './shared/constants'
import { useConversations, useAppStore, useProviders } from './stores/appStore'
import { initializeAppStore } from './stores/appStore'
import { telemetryService } from './services/telemetryService'
import { useSettings } from './hooks/useSettings'

function MobileApp() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [appStartTime] = useState(() => Date.now())

  const {
    conversations,
    selectedConversationId,
    setSelectedConversation,
    createPendingConversation,
    getConversation,
    updateConversation
  } = useConversations()

  useProviders()
  const { settings } = useSettings()

  const currentConversation = selectedConversationId ? getConversation(selectedConversationId) : null

  const showOnboarding = settings?.hasCompletedOnboarding === false
  const appRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const initialHeight = window.innerHeight

    const handleVisualViewportResize = () => {
      if (window.visualViewport && appRef.current) {
        const viewport = window.visualViewport
        const keyboardOpen = viewport.height < initialHeight * 0.8

        if (keyboardOpen) {
          appRef.current.style.height = `${viewport.height}px`
        } else {
          appRef.current.style.height = ''
        }
        window.scrollTo(0, 0)
      }
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleVisualViewportResize)
      window.visualViewport.addEventListener('scroll', () => window.scrollTo(0, 0))
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleVisualViewportResize)
      }
    }
  }, [])

  useEffect(() => {
    const initialize = async () => {
      telemetryService.initialize({
        appID: TELEMETRY_CONFIG.APP_ID,
        testMode: TELEMETRY_CONFIG.TEST_MODE,
      }).then(() => {
        telemetryService.trackAppLaunched()
        const startupTime = Date.now() - appStartTime
        telemetryService.trackAppStartupTime(startupTime)
      }).catch(error => {
        console.warn('Telemetry initialization failed:', error)
      })

      await initializeAppStore()
    }

    initialize()
  }, [])

  useEffect(() => {
    if (!selectedConversationId && conversations.length === 0) {
      createPendingConversation('New Conversation', '', '')
    }
  }, [conversations.length, selectedConversationId, createPendingConversation])

  const currentModel = useMemo(() => {
    if (!currentConversation?.model || !currentConversation?.provider) {
      return null
    }
    return {
      provider: currentConversation.provider,
      model: currentConversation.model
    }
  }, [currentConversation?.model, currentConversation?.provider])

  const modelDisplayName = useMemo(() => {
    if (!currentModel) return null
    return currentModel.model
  }, [currentModel])

  const handleSelectConversation = (id: number | 'pending' | null) => {
    setSelectedConversation(id)
    setDrawerOpen(false)
  }

  const handleNewChat = () => {
    if (!selectedConversationId) return

    const messages = useAppStore.getState().getMessages(selectedConversationId)
    if (messages.length < 1) return

    let provider = ''
    let model = ''

    if (conversations.length > 0) {
      const lastConversation = conversations[0]
      provider = lastConversation.provider || ''
      model = lastConversation.model || ''
    }

    createPendingConversation('New Conversation', provider, model)
    setDrawerOpen(false)
  }

  const handleModelSelect = async (provider: string, model: string) => {
    if (selectedConversationId) {
      try {
        await updateConversation(selectedConversationId, { provider, model })
      } catch (err) {
        console.error('Failed to update conversation model:', err)
      }
    }
  }

  if (showOnboarding) {
    return <MobileOnboarding onComplete={() => {}} />
  }

  if (showSettings) {
    return (
      <MobileSettings onBack={() => {
        setShowSettings(false)
        setDrawerOpen(true)
      }} />
    )
  }

  return (
    <div ref={appRef} className="mobile-app flex flex-col bg-background text-foreground overflow-hidden">
      <MobileHeader
        title={currentConversation?.title || 'New Conversation'}
        subtitle={modelDisplayName || undefined}
        onMenuPress={() => setDrawerOpen(true)}
        onNewChat={handleNewChat}
        onTitlePress={() => setShowModelSelector(true)}
      />

      <MobileChatView
        conversationId={selectedConversationId}
        onSelectConversation={setSelectedConversation}
      />

      <MobileDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSelectConversation={handleSelectConversation}
        onOpenSettings={() => {
          setDrawerOpen(false)
          setShowSettings(true)
        }}
      />

      <MobileModelSelector
        isOpen={showModelSelector}
        onClose={() => setShowModelSelector(false)}
        selectedProvider={currentModel?.provider}
        selectedModel={currentModel?.model}
        onSelect={handleModelSelect}
      />

      <ToastContainer mobile />
    </div>
  )
}

export default MobileApp
