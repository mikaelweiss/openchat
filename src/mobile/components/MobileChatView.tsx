import { useState, useEffect, useMemo } from 'react'
import { Settings } from 'lucide-react'
import clsx from 'clsx'
import MessageList from '../../components/Chat/MessageList'
import MobileMessageInput from './MobileMessageInput'
import MobileConversationSettings, {
  type ConversationSettings,
  defaultSettings
} from './MobileConversationSettings'
import { useProviders, useMessages, useConversations } from '../../stores/appStore'
import { type PendingConversation } from '../../stores/appStore'
import { type Conversation } from '../../shared/conversationStore'
import { type CreateMessageInput } from '../../shared/messageStore'
import { chatService } from '../../services/chatService'
import { telemetryService } from '../../services/telemetryService'
import { useSettings } from '../../hooks/useSettings'

interface MobileChatViewProps {
  conversationId?: number | 'pending' | null
  onSelectConversation?: (conversationId: number | 'pending' | null) => void
}

export default function MobileChatView({ conversationId, onSelectConversation }: MobileChatViewProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [currentConversation, setCurrentConversation] = useState<Conversation | PendingConversation | null>(null)
  const [selectedModel, setSelectedModel] = useState<{ provider: string; model: string } | null>(null)
  const [showConversationSettings, setShowConversationSettings] = useState(false)
  const [conversationSettings, setConversationSettings] = useState<ConversationSettings | null>(null)

  const {
    messages,
    streamingMessage,
    streamingMessagesByModel,
    addMessage: addMessageToStore,
    loadMessages,
    setStreamingMessage,
    clearStreamingMessage,
    setStreamingAbortController,
    getStreamingAbortController
  } = useMessages(conversationId ?? null)

  const {
    getConversation,
    updateConversation,
    commitPendingConversation,
    conversations
  } = useConversations()

  const { getProviderApiKey } = useSettings()
  const { providers } = useProviders()

  const isCurrentConversationWaiting = conversationId
    ? !!getStreamingAbortController(conversationId)
    : false

  const availableModels = useMemo(() => {
    if (!providers) return []
    const models: Array<{ provider: string; model: string; capabilities?: any }> = []

    Object.entries(providers).forEach(([providerId, provider]) => {
      if (provider.connected && provider.enabledModels) {
        provider.enabledModels.forEach(modelName => {
          models.push({
            provider: providerId,
            model: modelName,
            capabilities: provider.modelCapabilities?.[modelName]
          })
        })
      }
    })

    return models
  }, [providers])

  useEffect(() => {
    const loadConversation = async () => {
      if (conversationId) {
        const conv = getConversation(conversationId)
        setCurrentConversation(conv)

        if (conv?.provider && conv?.model) {
          setSelectedModel({ provider: conv.provider, model: conv.model })
        }

        if (typeof conversationId === 'number') {
          await loadMessages(conversationId)
        }
      } else {
        setCurrentConversation(null)
        setSelectedModel(null)
      }
    }
    loadConversation()
  }, [conversationId, getConversation, loadMessages, conversations])

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel && !currentConversation?.model) {
      const firstModel = availableModels[0]
      setSelectedModel({ provider: firstModel.provider, model: firstModel.model })

      if (conversationId) {
        updateConversation(conversationId, {
          provider: firstModel.provider,
          model: firstModel.model
        }).catch(err => console.error('Failed to update conversation model:', err))
      }
    }
  }, [availableModels, selectedModel, conversationId, updateConversation, currentConversation?.model])

  const handleSend = async (
    message: string,
    attachments?: Array<{path: string; base64: string; mimeType: string; name: string; type: 'image' | 'audio' | 'file'}>,
    reasoningEffort?: 'none' | 'low' | 'medium' | 'high'
  ) => {
    if (!conversationId || (!message.trim() && !attachments?.length)) return

    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    const effectiveModel = currentConversation?.model || selectedModel?.model

    if (!effectiveProvider || !effectiveModel) {
      console.error('No provider or model selected')
      return
    }

    const provider = providers[effectiveProvider]
    if (!provider || !provider.connected) {
      console.error('No active provider configured')
      return
    }

    let activeConversationId = conversationId

    try {
      setIsLoading(true)
      clearStreamingMessage(conversationId)

      if (conversationId === 'pending') {
        if (!currentConversation?.provider || !currentConversation?.model) {
          await updateConversation('pending', {
            provider: effectiveProvider,
            model: effectiveModel
          })
        }

        const persistentId = await commitPendingConversation()
        if (persistentId) {
          activeConversationId = persistentId
          onSelectConversation?.(persistentId)
          const promotedConv = getConversation(persistentId)
          if (promotedConv) {
            setCurrentConversation(promotedConv)
          }
        } else {
          console.error('Failed to commit pending conversation')
          return
        }
      } else if (activeConversationId && (!currentConversation?.provider || !currentConversation?.model)) {
        await updateConversation(activeConversationId, {
          provider: effectiveProvider,
          model: effectiveModel
        })
        setCurrentConversation(prev =>
          prev
            ? {
                ...prev,
                provider: effectiveProvider,
                model: effectiveModel
              }
            : null
        )
      }

      const controller = new AbortController()
      setStreamingAbortController(activeConversationId, controller)

      const userMessage: CreateMessageInput = {
        role: 'user',
        text: message
      }

      if (attachments && attachments.length > 0) {
        const images = attachments
          .filter(att => att.type === 'image')
          .map(att => ({
            file_path: att.base64,
            mime_type: att.mimeType,
            url: `data:${att.mimeType};base64,${att.base64}`
          }))

        if (images.length > 0) {
          userMessage.images = images
        }

        const audioFiles = attachments
          .filter(att => att.type === 'audio')
          .map(att => ({
            file_path: att.base64,
            mime_type: att.mimeType,
            url: `data:${att.mimeType};base64,${att.base64}`
          }))

        if (audioFiles.length > 0) {
          userMessage.audio = audioFiles
        }

        const files = attachments
          .filter(att => att.type === 'file')
          .map(att => ({
            path: att.path,
            name: att.name,
            type: att.mimeType,
            content: att.base64
          }))

        if (files.length > 0) {
          userMessage.files = files
        }
      }

      const userMessageId = await addMessageToStore(activeConversationId, userMessage)
      telemetryService.trackMessageSent(effectiveProvider, effectiveModel, message.length)

      const modelConfigs = await chatService.createModelConfigs(
        [{ provider: effectiveProvider, model: effectiveModel }],
        providers,
        getProviderApiKey,
        {
          ...(conversationSettings && {
            temperature: conversationSettings.temperature,
            maxTokens: conversationSettings.max_tokens,
            topP: conversationSettings.top_p,
            frequencyPenalty: conversationSettings.frequency_penalty,
            presencePenalty: conversationSettings.presence_penalty,
            stop: conversationSettings.stop.length > 0 ? conversationSettings.stop : undefined,
            n: conversationSettings.n,
            seed: conversationSettings.seed,
          }),
          reasoningEffort
        }
      )

      await chatService.sendMessage({
        conversationId: activeConversationId,
        userMessage,
        userMessageId: typeof userMessageId === 'number' ? userMessageId : undefined,
        systemPrompt: currentConversation?.system_prompt || undefined,
        models: modelConfigs,
        signal: controller.signal,
        onStreamChunk: (content: string, modelId: string) => {
          setStreamingMessage(activeConversationId, content, modelId)
        },
        onStreamComplete: async (assistantMessage: CreateMessageInput, modelId: string) => {
          try {
            const [provider, modelWithSuffix] = modelId.split(':')
            const model = modelWithSuffix?.includes('#')
              ? modelWithSuffix.split('#')[0]
              : modelWithSuffix
            assistantMessage.metadata = {
              ...assistantMessage.metadata,
              modelId: `${provider}/${model}`
            }
            await addMessageToStore(activeConversationId, assistantMessage)
          } catch (err) {
            console.error('Failed to save assistant message:', err)
          }
          clearStreamingMessage(activeConversationId, modelId)
        },
        onModelStreamStart: (modelId: string) => {
          console.log(`Model ${modelId} started streaming`)
        },
        onModelError: (error: Error, modelId: string) => {
          console.error(`Model ${modelId} error:`, error)
          if ((window as any).showToast) {
            const [provider, modelWithSuffix] = modelId.split(':')
            const model = modelWithSuffix?.includes('#')
              ? modelWithSuffix.split('#')[0]
              : modelWithSuffix
            ;(window as any).showToast({
              type: 'error',
              title: `${provider}/${model} failed`,
              message: error.message
            })
          }
        }
      })
    } catch (err) {
      console.error('Failed to send message:', err)
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to send message',
          message: err instanceof Error ? err.message : 'An unknown error occurred'
        })
      }
    } finally {
      setIsLoading(false)
      clearStreamingMessage(activeConversationId)
      setStreamingAbortController(activeConversationId, null)
    }
  }

  const handleCancel = async () => {
    if (conversationId) {
      const abortController = getStreamingAbortController(conversationId)
      if (abortController) {
        abortController.abort()

        if (streamingMessage.trim()) {
          try {
            const partialMessage: CreateMessageInput = {
              role: 'assistant',
              text: streamingMessage,
              processing_time_ms: Date.now()
            }
            await addMessageToStore(conversationId, partialMessage)
          } catch (err) {
            console.error('Failed to save partial message:', err)
          }
        }

        setIsLoading(false)
        setStreamingAbortController(conversationId, null)
        clearStreamingMessage(conversationId)
      }
    }
  }

  const currentModelCapabilities = useMemo(() => {
    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    const effectiveModel = currentConversation?.model || selectedModel?.model

    if (!effectiveProvider || !effectiveModel || !providers) {
      return { vision: false, audio: false, files: false, thinking: false }
    }

    return (
      providers[effectiveProvider]?.modelCapabilities?.[effectiveModel] || {
        vision: false,
        audio: false,
        files: false,
        thinking: false
      }
    )
  }, [currentConversation, selectedModel, providers])

  const hasModel = !!(currentConversation?.model || selectedModel?.model)

  const handleSaveConversationSettings = (newSettings: ConversationSettings) => {
    setConversationSettings(newSettings)
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="mobile-messages-container">
        <MessageList
          messages={messages}
          streamingMessage={streamingMessage}
          streamingMessagesByModel={streamingMessagesByModel}
          isLoading={isLoading && isCurrentConversationWaiting}
        />

        {conversationId && hasModel && (
          <button
            onClick={() => setShowConversationSettings(true)}
            className={clsx(
              'absolute top-3 right-3 p-2.5 rounded-xl z-10 transition-all',
              'bg-background/80 backdrop-blur-sm border border-border/20',
              'text-muted-foreground active:text-primary active:bg-accent/50'
            )}
            aria-label="Conversation settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        )}
      </div>

      <MobileMessageInput
        onSend={handleSend}
        onCancel={handleCancel}
        disabled={!conversationId || !hasModel}
        isLoading={isLoading && isCurrentConversationWaiting}
        noProvider={!hasModel}
        modelCapabilities={currentModelCapabilities}
      />

      <MobileConversationSettings
        isOpen={showConversationSettings}
        onClose={() => setShowConversationSettings(false)}
        settings={conversationSettings || defaultSettings}
        onSave={handleSaveConversationSettings}
      />
    </div>
  )
}
