import { useState, useEffect } from 'react'
import MobileHeader from './mobile/components/MobileHeader'
import MobileDrawer from './mobile/components/MobileDrawer'
import MobileChatView from './mobile/components/MobileChatView'
import MobileSettings from './mobile/components/MobileSettings'
import ToastContainer from './components/Toast/Toast'
import { TELEMETRY_CONFIG } from './shared/constants'
import { useConversations, useAppStore } from './stores/appStore'
import { initializeAppStore } from './stores/appStore'
import { telemetryService } from './services/telemetryService'

function MobileApp() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [appStartTime] = useState(() => Date.now())

  const {
    conversations,
    selectedConversationId,
    setSelectedConversation,
    createPendingConversation,
    getConversation
  } = useConversations()

  const currentConversation = selectedConversationId ? getConversation(selectedConversationId) : null

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

  if (showSettings) {
    return (
      <MobileSettings onBack={() => setShowSettings(false)} />
    )
  }

  return (
    <div className="mobile-app h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <MobileHeader
        title={currentConversation?.title || 'New Conversation'}
        onMenuPress={() => setDrawerOpen(true)}
        onNewChat={handleNewChat}
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

      <ToastContainer />
    </div>
  )
}

export default MobileApp
