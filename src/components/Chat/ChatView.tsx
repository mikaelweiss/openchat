import { ChevronDown, Copy, Eye, Volume2, FileText, Search, Plus, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import MessageList from './MessageList'
import MessageInput, { MessageInputHandle } from './MessageInput'
import ModelLoadingBanner from './ModelLoadingBanner'
import ConversationSettingsModal, { ConversationSettings } from './ConversationSettingsModal'
import { useRef, RefObject, useState, useEffect, useMemo, forwardRef, useImperativeHandle, useCallback } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useSettings } from '../../hooks/useSettings'
import { useProviders, useMessages, useConversations } from '../../stores/appStore'
import { type PendingConversation } from '../../stores/appStore'
import { type Conversation } from '../../shared/conversationStore'
import { type CreateMessageInput } from '../../shared/messageStore'
import { chatService } from '../../services/chatService'
import { telemetryService } from '../../services/telemetryService'
import { ollamaService } from '../../services/ollamaService'
import { toolService } from '../../services/toolService'
import { shouldSearch } from '../../types/search'
import { useSearchStore } from '../../stores/searchStore'
import clsx from 'clsx'
import EmptyState from '../EmptyState/EmptyState'
import { getConversationModelDisplay } from '../../utils/conversationUtils'
import Logo from '../../assets/Logo.svg'
import { showMainWindow } from '../../utils/windowManager'

interface ChatViewProps {
  conversationId?: number | 'pending' | null
  onOpenSettings?: () => void
  messageInputRef?: RefObject<MessageInputHandle | null>
  onSelectConversation?: (conversationId: number | 'pending' | null) => void
  isMiniWindow?: boolean
  modelSelectorOpen?: boolean
  onToggleModelSelector?: () => void
}

interface ModelCapabilityIconsProps {
  capabilities?: {
    vision?: boolean
    audio?: boolean
    files?: boolean
  }
  className?: string
}

function ModelCapabilityIcons({ capabilities, className = '' }: ModelCapabilityIconsProps) {
  if (!capabilities) return null

  const capabilityItems = [
    {
      key: 'vision' as const,
      icon: Eye,
      enabled: capabilities.vision,
      color: 'text-primary',
      grayColor: 'text-muted-foreground/50',
      title: 'Vision/Images'
    },
    {
      key: 'audio' as const,
      icon: Volume2,
      enabled: capabilities.audio,
      color: 'text-primary',
      grayColor: 'text-muted-foreground/50',
      title: 'Audio Input'
    },
    {
      key: 'files' as const,
      icon: FileText,
      enabled: capabilities.files,
      color: 'text-primary',
      grayColor: 'text-muted-foreground/50',
      title: 'File Input'
    }
  ]

  return (
    <div className={clsx("flex items-center gap-1", className)}>
      {capabilityItems.map(({ key, icon: Icon, enabled, color, grayColor, title }) => {
        if (!enabled) return null
        
        return (
          <div
            key={key}
            className={clsx("w-4 h-4", enabled ? color : grayColor)}
            title={title}
          >
            <Icon className="w-4 h-4" />
          </div>
        )
      })}
    </div>
  )
}

function getModelButtonTooltip(incompatibilityReason?: string | null, isAtMaxSelection?: boolean, isAtMaxLocalSelection?: boolean): string | undefined {
  if (incompatibilityReason) return incompatibilityReason;
  if (isAtMaxSelection) return 'Maximum 5 models can be selected';
  if (isAtMaxLocalSelection) return 'Maximum 1 local model can be selected';
  return undefined;
}

export interface ChatViewHandle {
  handleNextModel: () => void
  handlePreviousModel: () => void
}

const ChatView = forwardRef<ChatViewHandle, ChatViewProps>(function ChatView({ conversationId, messageInputRef: externalMessageInputRef, onSelectConversation, isMiniWindow = false, modelSelectorOpen = false, onToggleModelSelector }: ChatViewProps, ref) {
  const internalMessageInputRef = useRef<MessageInputHandle>(null)
  const messageInputRef = externalMessageInputRef || internalMessageInputRef
  
  // Model selector state (now managed by parent App component)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedModelIndex, setHighlightedModelIndex] = useState(0)
  const [selectedModel, setSelectedModel] = useState<{provider: string, model: string} | null>(null)
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedModels, setSelectedModels] = useState<Array<{provider: string, model: string}>>([])
  const [copiedConversation, setCopiedConversation] = useState(false)
  const [showConversationSettings, setShowConversationSettings] = useState(false)
  const [conversationSettings, setConversationSettings] = useState<ConversationSettings | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const modelSelectorButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, right: 0 })
  const [isLoading, setIsLoading] = useState(false)
  // Model loading banner state
  const [showModelBanner, setShowModelBanner] = useState(false)
  
  // Track the last loaded local model for cleanup when switching
  const [lastLoadedLocalModel, setLastLoadedLocalModel] = useState<string | null>(null)

  // Auto-scroll state
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [userHasScrolledUp, setUserHasScrolledUp] = useState(false)
  const wasStreamingRef = useRef(false)
  const prevMessagesLengthRef = useRef(0)

  // Use Zustand stores
  const {
    messages,
    streamingMessage: zustandStreamingMessage,
    streamingMessagesByModel,
    searchQueries,
    addMessage: addMessageToStore,
    loadMessages,
    setStreamingMessage,
    clearStreamingMessage,
    setStreamingAbortController,
    getStreamingAbortController,
    addSearchQuery,
    clearSearchQueries
  } = useMessages(conversationId ?? null)
  
  const { 
    conversations,
    getConversation,
    updateConversation, 
    createPendingConversation,
    commitPendingConversation
  } = useConversations()
  const { getProviderApiKey } = useSettings()
  const { providers } = useProviders()
  const isCurrentConversationWaiting = conversationId ?
    !!getStreamingAbortController(conversationId) : false
  
  const [currentConversation, setCurrentConversation] = useState<Conversation | PendingConversation | null>(null)
  
  // Debug: Log when ChatView's providers change from Zustand
  useEffect(() => {
    if (providers) {
      console.log('ChatView: Zustand providers changed')
      console.log('ChatView: Provider keys:', Object.keys(providers))
      if (providers.anthropic) {
        console.log('ChatView: Anthropic enabled models:', providers.anthropic.enabledModels)
      }
    }
  }, [providers])
  
  // Get current attachments from MessageInput to determine required capabilities
  const [requiredCapabilities, setRequiredCapabilities] = useState<{
    vision: boolean
    audio: boolean
    files: boolean
  }>({ vision: false, audio: false, files: false })
  
  // Create a stable dependency for enabled models
  const enabledModelsString = useMemo(() => {
    if (!providers) return ''
    return Object.entries(providers)
      .map(([providerId, provider]) => `${providerId}:${provider.enabledModels?.join(',') || ''}`)
      .join('|')
  }, [providers])

  // Get available models from providers
  const availableModels = useMemo(() => {
    if (!providers) return []
    const models: Array<{provider: string, model: string, capabilities?: any}> = []
    
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
    
    // Add a debug log to see when this recalculates
    console.log('ChatView: Available models updated:', models.length, 'models found')
    console.log('ChatView: enabledModelsString:', enabledModelsString)
    console.log('ChatView: Full providers object keys:', Object.keys(providers || {}))
    Object.entries(providers || {}).forEach(([id, provider]) => {
      console.log(`ChatView: Provider ${id} enabled models:`, provider.enabledModels)
    })
    
    return models
  }, [providers, enabledModelsString])
  
  // Group models by provider
  const modelsByProvider = useMemo(() => {
    const grouped: Record<string, any[]> = {}
    availableModels.forEach(model => {
      const providerName = providers?.[model.provider]?.name || model.provider
      if (!grouped[providerName]) {
        grouped[providerName] = []
      }
      grouped[providerName].push(model)
    })
    
    // Sort models within each provider group alphabetically
    Object.keys(grouped).forEach(providerName => {
      grouped[providerName].sort((a, b) => a.model.localeCompare(b.model))
    })
    
    return grouped
  }, [availableModels, providers])

  // Filter models based on search query
  const filteredModelsByProvider = useMemo(() => {
    if (!searchQuery.trim()) return modelsByProvider
    
    const filtered: Record<string, any[]> = {}
    Object.entries(modelsByProvider).forEach(([providerName, models]) => {
      const filteredModels = models.filter(model => 
        model.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        providerName.toLowerCase().includes(searchQuery.toLowerCase())
      )
      if (filteredModels.length > 0) {
        // Sort filtered models alphabetically as well
        filtered[providerName] = filteredModels.sort((a, b) => a.model.localeCompare(b.model))
      }
    })
    return filtered
  }, [modelsByProvider, searchQuery])

  // Get all models as a flat array for keyboard navigation
  const allFilteredModels = useMemo(() => {
    const models: any[] = []
    Object.entries(filteredModelsByProvider).forEach(([providerName, providerModels]) => {
      providerModels.forEach(model => {
        models.push({ ...model, providerName })
      })
    })
    return models
  }, [filteredModelsByProvider])

  // Function to navigate to next/previous model
  const navigateToModel = (direction: 'next' | 'previous') => {
    const compatibleModels = availableModels.filter(m => isModelCompatible(m))
    if (compatibleModels.length === 0) return
    
    const currentModelIndex = compatibleModels.findIndex(m => 
      m.provider === selectedModel?.provider && m.model === selectedModel?.model
    )
    
    let nextIndex: number
    if (direction === 'next') {
      nextIndex = currentModelIndex === -1 ? 0 : (currentModelIndex + 1) % compatibleModels.length
    } else {
      nextIndex = currentModelIndex === -1 ? compatibleModels.length - 1 : 
                 currentModelIndex === 0 ? compatibleModels.length - 1 : currentModelIndex - 1
    }
    
    const nextModel = compatibleModels[nextIndex]
    if (nextModel) {
      handleModelSelect({ provider: nextModel.provider, model: nextModel.model }, false)
    }
  }

  // Expose navigation functions to parent via ref
  useImperativeHandle(ref, () => ({
    handleNextModel: () => navigateToModel('next'),
    handlePreviousModel: () => navigateToModel('previous')
  }), [availableModels, selectedModel, requiredCapabilities])

  // Load current conversation details
  useEffect(() => {
    const loadConversation = async () => {
      if (conversationId) {
        try {
          const conv = getConversation(conversationId)
          setCurrentConversation(conv)
          // Set selected model from conversation
          if (conv?.provider && conv?.model) {
            setSelectedModel({ provider: conv.provider, model: conv.model })
          }
          
          // Load conversation settings
          if (conv?.settings) {
            try {
              const parsedSettings = JSON.parse(conv.settings)
              setConversationSettings(parsedSettings)
            } catch (err) {
              console.error('Failed to parse conversation settings:', err)
              setConversationSettings(null)
            }
          } else {
            setConversationSettings(null)
          }
          
          // Load messages if it's a persistent conversation
          if (typeof conversationId === 'number') {
            await loadMessages(conversationId)
          }
        } catch (err) {
          console.error('Failed to load conversation:', err)
        }
      } else {
        setCurrentConversation(null)
        setSelectedModel(null)
        setConversationSettings(null)
      }
    }
    loadConversation()
  }, [conversationId, getConversation, loadMessages, conversations])
  
  // Reset highlighted index when search query changes or model selector opens/closes
  useEffect(() => {
    const compatibleModels = allFilteredModels.filter(m => isModelCompatible(m))
    setHighlightedModelIndex(compatibleModels.length > 0 ? 0 : -1) // Start with first model if available
  }, [searchQuery, modelSelectorOpen, allFilteredModels])
  
  // Clear search when model selector closes and auto-focus when it opens
  useEffect(() => {
    if (!modelSelectorOpen) {
      setSearchQuery('')
    } else {
      // Auto-focus the search input when model selector opens
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [modelSelectorOpen])
  
  // Model selector keyboard shortcuts are now handled by the global keyboard shortcut hook in App.tsx

  // Click outside to close model selector
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelSelectorOpen && dropdownRef.current && modelSelectorButtonRef.current && 
          !dropdownRef.current.contains(event.target as Node) && 
          !modelSelectorButtonRef.current.contains(event.target as Node)) {
        onToggleModelSelector?.()
      }
    }

    if (modelSelectorOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [modelSelectorOpen])
  
  // Auto-select model logic: always ensure a model is selected
  useEffect(() => {
    // If we have available models
    if (availableModels.length > 0) {
      // Get conversation directly from store to avoid race condition with state
      const conversation = conversationId ? getConversation(conversationId) : null

      // Check if current selected model is still available
      if (selectedModel) {
        const isModelStillAvailable = availableModels.some(
          model => model.provider === selectedModel.provider && model.model === selectedModel.model
        )

        if (!isModelStillAvailable) {
          console.log('Selected model is no longer available, auto-selecting first available')
          // Auto-select the first available model
          const firstModel = availableModels[0]
          setSelectedModel({ provider: firstModel.provider, model: firstModel.model })

          // Update conversation if applicable
          if (conversationId) {
            updateConversation(conversationId, {
              provider: firstModel.provider,
              model: firstModel.model
            }).catch(err => console.error('Failed to update conversation model:', err))
          }
        }
      } else if (!conversation?.model) {
        // No model selected and no conversation model, auto-select first available
        console.log('No model selected, auto-selecting first available')
        const firstModel = availableModels[0]
        setSelectedModel({ provider: firstModel.provider, model: firstModel.model })

        // Update conversation if applicable
        if (conversationId) {
          updateConversation(conversationId, {
            provider: firstModel.provider,
            model: firstModel.model
          }).catch(err => console.error('Failed to update conversation model:', err))
        }
      }
    } else {
      // No models available
      setSelectedModel(null)
    }
  }, [availableModels, selectedModel, conversationId, updateConversation, getConversation])
  
  // Auto-focus input when app opens and model is ready
  useEffect(() => {
    const focusInput = () => {
      // Only focus if there's a model available and input is not disabled
      const hasModel = (currentConversation?.model || selectedModel?.model)
      const isInputEnabled = conversationId && hasModel
      
      if (isInputEnabled && messageInputRef.current?.focus) {
        // Small delay to ensure everything is rendered
        setTimeout(() => {
          messageInputRef.current?.focus()
        }, 150)
      }
    }
    
    focusInput()
  }, [conversationId, currentConversation?.model, selectedModel?.model, messageInputRef])

  // Auto-scroll handling
  const isStreaming = !!(zustandStreamingMessage || (streamingMessagesByModel && streamingMessagesByModel.size > 0))

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
    const threshold = 100

    if (distanceFromBottom > threshold) {
      setUserHasScrolledUp(true)
    } else {
      setUserHasScrolledUp(false)
    }
  }, [])

  useEffect(() => {
    if (isStreaming && !userHasScrolledUp && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [isStreaming, userHasScrolledUp, zustandStreamingMessage, streamingMessagesByModel])

  useEffect(() => {
    const wasStreaming = wasStreamingRef.current
    wasStreamingRef.current = isStreaming

    if (wasStreaming && !isStreaming && !userHasScrolledUp) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
        }
      })
    }

    if (!isStreaming) {
      setUserHasScrolledUp(false)
    }
  }, [isStreaming, userHasScrolledUp])

  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
        }
      })
    }
    prevMessagesLengthRef.current = messages.length
  }, [messages.length])

  // Function to check if a model is local
  const isModelLocal = (model: {provider: string, model: string}) => {
    const provider = providers?.[model.provider]
    return provider?.isLocal === true
  }

  // Function to check if a model is compatible with current attachments
  const isModelCompatible = (model: any) => {
    if (!model.capabilities) return true // If no capabilities info, allow selection
    
    // Check if model has all required capabilities
    if (requiredCapabilities.vision && !model.capabilities.vision) return false
    if (requiredCapabilities.audio && !model.capabilities.audio) return false
    if (requiredCapabilities.files && !model.capabilities.files) return false
    
    return true
  }

  // Function to get tooltip text for incompatible models
  const getIncompatibilityReason = (model: any) => {
    if (!model.capabilities) return null
    
    const missing: string[] = []
    if (requiredCapabilities.vision && !model.capabilities.vision) missing.push('image')
    if (requiredCapabilities.audio && !model.capabilities.audio) missing.push('audio')
    if (requiredCapabilities.files && !model.capabilities.files) missing.push('file')
    
    if (missing.length === 0) return null
    
    const attachmentTypes = missing.join(', ')
    return `Remove ${attachmentTypes} attachment${missing.length > 1 ? 's' : ''} to switch to this model`
  }

  // Function to check if the current model is a local model
  const isCurrentModelLocal = useMemo(() => {
    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    const effectiveModel = currentConversation?.model || selectedModel?.model
    
    if (!effectiveProvider || !effectiveModel) return false
    
    const provider = providers?.[effectiveProvider]
    return provider?.isLocal === true
  }, [currentConversation?.provider, selectedModel?.provider, providers])

  const maxTemperature = useMemo(() => {
    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    if (!effectiveProvider || !providers) return 2
    const providerEndpoint = providers[effectiveProvider]?.endpoint || ''
    return providerEndpoint.includes('anthropic.com') ? 1 : 2
  }, [currentConversation?.provider, selectedModel?.provider, providers])

  // Get the current model name for the banner
  const currentModelName = useMemo(() => {
    return currentConversation?.model || selectedModel?.model || ''
  }, [currentConversation?.model, selectedModel?.model])

  // Get the local model name for the banner (single mode or multi-select mode)
  const localModelName = useMemo(() => {
    if (isMultiSelectMode) {
      // In multi-select mode, find the first local model
      const localModel = selectedModels.find(m => isModelLocal(m))
      return localModel?.model || ''
    } else {
      // In single mode, use current model if it's local
      return isCurrentModelLocal ? currentModelName : ''
    }
  }, [isMultiSelectMode, selectedModels, isCurrentModelLocal, currentModelName])

  // Update banner visibility based on local model selection
  useEffect(() => {
    // Show banner if current model is local OR if in multi-select mode and any selected model is local
    const hasLocalModelInMultiSelect = isMultiSelectMode && selectedModels.some(m => isModelLocal(m))
    const shouldShowBanner = (isCurrentModelLocal && !!currentModelName) || hasLocalModelInMultiSelect
    setShowModelBanner(shouldShowBanner)
  }, [isCurrentModelLocal, currentModelName, isMultiSelectMode, selectedModels])

  // Handle model switching - unload previous local model when switching to a different model
  useEffect(() => {
    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    const effectiveModel = currentConversation?.model || selectedModel?.model
    
    // Check if current model is local
    const provider = effectiveProvider && providers ? providers[effectiveProvider] : null
    const isLocalModel = provider?.isLocal === true
    
    // If we're switching models and there was a previously loaded local model
    if (lastLoadedLocalModel && 
        (effectiveModel !== lastLoadedLocalModel || !isLocalModel)) {
      
      console.log(`Model switched from ${lastLoadedLocalModel} to ${effectiveModel || 'none'}, unloading previous model`)
      
      // Unload the previous local model (non-blocking)
      ollamaService.unloadModel(lastLoadedLocalModel).then(() => {
        console.log(`Successfully unloaded previous model: ${lastLoadedLocalModel}`)
      }).catch(error => {
        console.warn(`Failed to unload previous model ${lastLoadedLocalModel}:`, error)
      })
      
      // Clear the tracked model
      setLastLoadedLocalModel(null)
    }
  }, [currentConversation?.provider, currentConversation?.model, selectedModel?.provider, selectedModel?.model, providers, lastLoadedLocalModel])
  
  // Function to get the index of a model in the compatible models list
  const getModelIndex = (model: any) => {
    const compatibleModels = allFilteredModels.filter(m => isModelCompatible(m))
    return compatibleModels.findIndex(m => 
      m.provider === model.provider && m.model === model.model
    )
  }

  // Function to check if a model is currently highlighted (unified hover and keyboard)
  const isModelHighlighted = (model: any) => {
    const compatibleModels = allFilteredModels.filter(m => isModelCompatible(m))
    if (highlightedModelIndex < 0 || highlightedModelIndex >= compatibleModels.length) return false
    const highlightedModel = compatibleModels[highlightedModelIndex]
    return highlightedModel.provider === model.provider && highlightedModel.model === model.model
  }

  // Function to handle mouse enter on a model
  const handleModelMouseEnter = (model: any) => {
    const modelIndex = getModelIndex(model)
    if (modelIndex !== -1) {
      setHighlightedModelIndex(modelIndex)
    }
  }
  
  // Handle model selection
  const handleModelSelect = async (model: {provider: string, model: string}, shouldCloseModal = true) => {
    setSelectedModel(model)
    if (shouldCloseModal) {
      onToggleModelSelector?.()
    }
    
    // Update conversation with new model
    if (conversationId) {
      try {
        await updateConversation(conversationId, {
          provider: model.provider,
          model: model.model
        })
        
        // Update local state immediately to reflect the change
        setCurrentConversation((prev) => prev ? {
          ...prev,
          provider: model.provider,
          model: model.model
        } : null)
      } catch (err) {
        console.error('Failed to update conversation model:', err)
      }
    }
    
    // Focus the input field after model selection (only if modal was closed)
    if (shouldCloseModal) {
      setTimeout(() => {
        messageInputRef.current?.focus()
      }, 100)
    }
  }
  
  // Handle conversation copy
  const handleCopyConversation = async () => {
    if (messages.length < 1) return
    
    try {
      const conversationText = messages
        .map(msg => {
          const role = msg.role === 'user' ? 'You' : 'Assistant'
          return `${role}: ${msg.text || ''}`
        })
        .join('\n\n')
      
      await navigator.clipboard.writeText(conversationText)
      setCopiedConversation(true)
      setTimeout(() => setCopiedConversation(false), 2000)
    } catch (err) {
      console.error('Failed to copy conversation:', err)
    }
  }
  
  // Handle new conversation creation
  const handleNewConversation = async () => {
    try {
      // Use current conversation's model if available, otherwise empty
      const provider = currentConversation?.provider || ''
      const model = currentConversation?.model || ''
      
      // Create a pending conversation
      createPendingConversation('New Conversation', provider, model)
      
      // Focus the message input after a short delay
      setTimeout(() => {
        messageInputRef.current?.focus()
      }, 100)
    } catch (err) {
      console.error('Failed to create new conversation:', err)
    }
  }

  // Handle conversation settings save
  const handleSaveConversationSettings = async (newSettings: ConversationSettings) => {
    if (!conversationId) return
    
    try {
      const settingsJson = JSON.stringify(newSettings)
      await updateConversation(conversationId, { settings: settingsJson })
      setConversationSettings(newSettings)
      
      // Update local state immediately to reflect the change
      setCurrentConversation((prev) => prev ? {
        ...prev,
        settings: settingsJson
      } : null)
    } catch (err) {
      console.error('Failed to save conversation settings:', err)
    }
  }
  
  const handleSend = async (message: string, attachments?: Array<{path: string, base64: string, mimeType: string, name: string, type: 'image' | 'audio' | 'file'}>, reasoningEffort?: 'none' | 'low' | 'medium' | 'high', enableSearch?: boolean) => {
    if (!conversationId || !message.trim()) return
    
    // Get effective provider and model (prefer conversation, fallback to selected)
    const effectiveProvider = currentConversation?.provider || selectedModel?.provider
    const effectiveModel = currentConversation?.model || selectedModel?.model
    
    if (!effectiveProvider || !effectiveModel) {
      console.error('No provider or model selected')
      return
    }
    
    // Check if we have a configured provider
    const provider = providers[effectiveProvider]
    
    if (!provider || !provider.connected) {
      console.error('No active provider configured')
      return
    }
    
    let activeConversationId = conversationId
    
    try {
      setIsLoading(true)
      clearStreamingMessage(conversationId)
      
      // If this is a pending conversation, commit it to persistent before sending message
      if (conversationId === 'pending') {
        console.log('Committing pending conversation to persistent before sending message')
        
        // Update the pending conversation with effective provider/model before committing
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
          // Update current conversation state
          const promotedConv = getConversation(persistentId)
          if (promotedConv) {
            setCurrentConversation(promotedConv)
          }
        } else {
          console.error('Failed to commit pending conversation')
          return
        }
      } else if (activeConversationId && (!currentConversation?.provider || !currentConversation?.model)) {
        // Update existing conversation with effective provider/model
        await updateConversation(activeConversationId, {
          provider: effectiveProvider,
          model: effectiveModel
        })
        setCurrentConversation(prev => prev ? {
          ...prev,
          provider: effectiveProvider,
          model: effectiveModel
        } : null)
      }
      
      // Create abort controller for cancellation
      const controller = new AbortController()
      setStreamingAbortController(activeConversationId, controller)
      
      // Build user message with attachments
      const userMessage: CreateMessageInput = {
        role: 'user',
        text: message,
      }
      
      // Handle attachments
      if (attachments && attachments.length > 0) {
        // Handle image attachments
        const images = attachments
          .filter(att => att.type === 'image')
          .map(att => ({
            file_path: att.base64, // Store base64 data
            mime_type: att.mimeType,
            url: `data:${att.mimeType};base64,${att.base64}`
          }))
        
        if (images.length > 0) {
          userMessage.images = images
        }
        
        // Handle audio attachments
        const audioFiles = attachments
          .filter(att => att.type === 'audio')
          .map(att => ({
            file_path: att.base64, // Store base64 data
            mime_type: att.mimeType,
            url: `data:${att.mimeType};base64,${att.base64}`
          }))
        
        if (audioFiles.length > 0) {
          userMessage.audio = audioFiles
        }
        
        // Handle file attachments  
        const files = attachments
          .filter(att => att.type === 'file')
          .map(att => ({
            path: att.path,
            name: att.name,
            type: att.mimeType,
            content: att.base64 // Store base64 content for sending to providers
          }))
        
        if (files.length > 0) {
          userMessage.files = files
        }
      }
      
      // Add user message to store (which handles both draft and persistent)
      const userMessageId = await addMessageToStore(activeConversationId, userMessage)
      
      // Track message sent event
      telemetryService.trackMessageSent(effectiveProvider, effectiveModel, message.length)
      
      // Determine if tools should be enabled
      const searchStore = useSearchStore.getState()
      const shouldEnableSearch = enableSearch || (searchStore.settings.autoDetectNeeded && shouldSearch(message))
      let availableTools: any[] = []
      
      if (shouldEnableSearch) {
        try {
          availableTools = await toolService.getAvailableTools()
        } catch (error) {
          console.error('Failed to get available tools:', error)
        }
      }

      // Create model configurations for the new interface
      const modelConfigs = await chatService.createModelConfigs(
        isMultiSelectMode && selectedModels.length > 0
          ? selectedModels
          : [{ provider: effectiveProvider, model: effectiveModel }],
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

      // Add tools to model configs if available
      const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      let effectiveSystemPrompt = currentConversation?.system_prompt || undefined
      if (availableTools.length > 0) {
        modelConfigs.forEach(config => {
          config.tools = availableTools
        })

        // Enhance system prompt to explicitly instruct the AI to use search when available
        if (shouldEnableSearch) {
          const searchInstruction = "You have access to a web search tool. You MUST use the web_search function to find current information before responding. This is especially important for questions about recent events, current information, or facts that may have changed.\n\nWhen using search results in your response:\n1. ALWAYS cite your sources using the format [number](url)\n2. Include all relevant information from the search results\n3. Make it easy for the user to verify information via the provided sources"

          effectiveSystemPrompt = effectiveSystemPrompt
            ? `${effectiveSystemPrompt}\n\n${searchInstruction}`
            : searchInstruction
        }
      }

      // Always add the current date to the system prompt
      const dateInstruction = `For your information, the current date is ${currentDate}`;
      effectiveSystemPrompt = effectiveSystemPrompt
        ? `${effectiveSystemPrompt}\n\n${dateInstruction}`
        : dateInstruction;

      // Track API performance per model
      const modelStartTimes = new Map<string, number>()

      // Send to AI provider(s) with streaming
      await chatService.sendMessage({
        conversationId: activeConversationId,
        userMessage,
        userMessageId: typeof userMessageId === 'number' ? userMessageId : undefined,
        systemPrompt: effectiveSystemPrompt,
        models: modelConfigs,
        signal: controller.signal,
        onStreamChunk: (content: string, modelId: string) => {
          // Handle multiple concurrent streams per model
          setStreamingMessage(activeConversationId, content, modelId)
          console.log(`Streaming from ${modelId}: ${content.slice(0, 50)}...`)
        },
        onSearchQuery: (query: string) => {
          // Track search queries for display
          addSearchQuery(activeConversationId, query)
          console.log(`Search query: ${query}`)
        },
        onStreamComplete: async (message: CreateMessageInput, modelId: string) => {
          // Add complete assistant message to store
          try {
            // Store model info for display in UI
            const [provider, modelWithSuffix] = modelId.split(':')
            // Handle both format: 'provider:model' and 'provider:model#2'
            const model = modelWithSuffix?.includes('#') ? modelWithSuffix.split('#')[0] : modelWithSuffix
            message.metadata = {
              ...message.metadata,
              modelId: `${provider}/${model}`
            }
            await addMessageToStore(activeConversationId, message)
            
            // Track API performance
            const startTime = modelStartTimes.get(modelId)
            if (startTime) {
              const duration = Date.now() - startTime
              telemetryService.trackAPIPerformance(provider, model, duration, true)
              modelStartTimes.delete(modelId)
            }
          } catch (err) {
            console.error('Failed to save assistant message:', err)
          }
          requestAnimationFrame(() => {
            clearStreamingMessage(activeConversationId, modelId)
          })
        },
        onModelStreamStart: (modelId: string) => {
          console.log(`Model ${modelId} started streaming`)
          // Record start time for this model
          modelStartTimes.set(modelId, Date.now())
        },
        onModelError: (error: Error, modelId: string) => {
          console.error(`Model ${modelId} error:`, error)
          
          // Track API error and performance
          const [provider, modelWithSuffix] = modelId.split(':')
          const model = modelWithSuffix?.includes('#') ? modelWithSuffix.split('#')[0] : modelWithSuffix
          
          // Track performance (failed)
          const startTime = modelStartTimes.get(modelId)
          if (startTime) {
            const duration = Date.now() - startTime
            telemetryService.trackAPIPerformance(provider, model, duration, false)
            modelStartTimes.delete(modelId)
          }
          
          // Track error type
          let errorType = 'unknown'
          const errorMessage = (error.message || '').toLowerCase()
          if (errorMessage.includes('rate limit')) {
            errorType = 'rate_limit'
            telemetryService.trackRateLimitError(provider, model)
          } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
            errorType = 'network'
          } else if (errorMessage.includes('auth') || errorMessage.includes('api key') || errorMessage.includes('unauthorized')) {
            errorType = 'auth'
          } else if (errorMessage.includes('timeout')) {
            errorType = 'timeout'
          }
          telemetryService.trackAPIError(provider, model, errorType)
          
          // Show error toast for individual model failures
          if ((window as any).showToast) {
            const suffix = modelWithSuffix?.includes('#') ? modelWithSuffix.split('#')[1] : ''
            ;(window as any).showToast({
              type: 'error',
              title: `${provider}/${model}${suffix ? `#${suffix}` : ''} failed`,
              message: error.message
            })
          }
        }
      })
      
      // Note: For streaming, the message is already saved in onStreamComplete
      // For non-streaming, we would need to save assistantMessage here, but currently we're always streaming
      
    } catch (err) {
      // Since we handle cancellation gracefully now, we shouldn't get cancelled errors
      console.error('Failed to send message:', err)
      // Show error toast
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
      clearSearchQueries(activeConversationId)
      setStreamingAbortController(activeConversationId, null)
    }
  }
  
  const handleCancel = async () => {
    if (conversationId) {
      const abortController = getStreamingAbortController(conversationId)
      if (abortController) {
        abortController.abort()
        
        // Save partial message if there's content
        if (zustandStreamingMessage.trim()) {
          try {
            const partialMessage: CreateMessageInput = {
              role: 'assistant',
              text: zustandStreamingMessage,
              processing_time_ms: Date.now() // We don't track start time, so use current time
            }
            await addMessageToStore(conversationId, partialMessage)
          } catch (err) {
            console.error('Failed to save partial message:', err)
          }
        }

        setIsLoading(false)
        setStreamingAbortController(conversationId, null)
        clearStreamingMessage(conversationId)
        clearSearchQueries(conversationId)
      }
    }
  }

  const handleStartDrag = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      const window = getCurrentWindow()
      await window.startDragging()
    } catch (error) {
      console.error('Failed to start dragging:', error)
    }
  }

  return (
    <div className="h-full flex flex-col min-w-0">
      
      {/* Header */}
      <div className="border-b border-border/10 pb-4 w-full glass-nav backdrop-blur-strong flex-shrink-0 select-none px-6 pt-8"
           onMouseDown={handleStartDrag}
      >
        <div className="flex items-center justify-between w-full gap-4">
          <div
            className="min-w-0 flex-1 select-none"
            onMouseDown={handleStartDrag}
          >
            <h2 className="text-lg font-semibold truncate text-foreground/95 tracking-tight">
              {currentConversation?.title || 'New Conversation'}
            </h2>
            <p className="text-sm text-muted-foreground/80 truncate">
              {isMultiSelectMode && selectedModels.length > 0 
                ? `Multi-Model (${selectedModels.length} selected)` 
                : (() => {
                    const modelDisplay = getConversationModelDisplay(currentConversation?.model || selectedModel?.model, messages)
                    const provider = currentConversation?.provider || selectedModel?.provider || 'No Provider'
                    return modelDisplay === 'Multi-Model' 
                      ? modelDisplay
                      : `${provider} • ${modelDisplay}`
                  })()
              }
            </p>
          </div>
          
          <div className="flex-shrink-0 flex items-center gap-2">
            {/* Copy conversation button - only show if there's at least one message */}
            {messages.length >= 1 && (
              <button
                onClick={handleCopyConversation}
                className="copy-conversation-btn p-2 elegant-hover rounded-xl transition-all duration-200 hover:scale-105 shadow-elegant text-muted-foreground hover:text-primary"
                title="Copy conversation"
                aria-label="Copy conversation to clipboard"
              >
                {copiedConversation ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            )}
            
            {/* Model selector or Add Provider button */}
            {messages.length < 1 && (
              availableModels.length === 0 ? (
                // Show Add Provider button when no models are available
                <button
                  onClick={() => {
                    // Open settings modal to provider section
                    const event = new CustomEvent('openSettings', { detail: { section: 'providers' } })
                    window.dispatchEvent(event)
                  }}
                  className="elegant-button flex items-center gap-2 px-4 py-2 text-white rounded-xl text-sm font-medium"
                  aria-label="Add AI provider"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Provider</span>
                </button>
              ) : (
                <div className="relative">
                  <button
                    ref={modelSelectorButtonRef}
                    onClick={() => {
                      if (!modelSelectorOpen && modelSelectorButtonRef.current) {
                        const rect = modelSelectorButtonRef.current.getBoundingClientRect()
                        setDropdownPosition({
                          top: rect.bottom + 8,
                          right: window.innerWidth - rect.right
                        })
                      }
                      onToggleModelSelector?.()
                    }}
                    className="flex items-center gap-2 px-4 py-2 elegant-hover rounded-xl transition-all duration-200 hover:scale-105 text-sm shadow-elegant border border-border/20 text-muted-foreground hover:text-primary hover:border-primary/30"
                    aria-label={selectedModel && selectedModel.model ? `Selected model: ${selectedModel.model}` : 'Select AI model'}
                    aria-expanded={modelSelectorOpen}
                    aria-haspopup="listbox"
                  >
                    <span className={(!selectedModel || !selectedModel.model) && (!isMultiSelectMode || selectedModels.length === 0) ? 'text-muted-foreground' : 'text-foreground/90'}>
                      {isMultiSelectMode 
                        ? selectedModels.length > 0 
                          ? `${selectedModels.length} model${selectedModels.length !== 1 ? 's' : ''}`
                          : 'Select Models'
                        : selectedModel && selectedModel.model 
                          ? selectedModel.model 
                          : 'Select Model'
                      }
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )
            )}
            
            {/* New conversation button - only show if there's at least one message */}
            {messages.length >= 1 && (
              <button
                onClick={handleNewConversation}
                className="new-conversation-btn p-2 elegant-hover rounded-xl transition-all duration-200 hover:scale-105 shadow-elegant text-muted-foreground hover:text-primary"
                title="New conversation"
                aria-label="Start new conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
            {isMiniWindow && (
              <button
                onClick={async () => {
                  try {
                    await showMainWindow()
                  } catch (error) {
                    console.error('Failed to show main window:', error)
                  }
                }}
                className="p-1.5 elegant-hover rounded-xl transition-all duration-200 hover:scale-105 hover:opacity-80"
                title="Open main window"
                aria-label="Open main window"
              >
                <img src={Logo} alt="Open Chat" className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0">
        {/* Model Loading Banner - only show for local models */}
        {showModelBanner && (
          <ModelLoadingBanner 
            modelName={localModelName}
            onModelStatusChange={(status) => {
              // Track when a local model is successfully loaded
              if (status.status === 'loaded') {
                setLastLoadedLocalModel(status.name)
              } else if (status.status === 'not_loaded' || status.status === 'error') {
                // If this specific model failed to load or was unloaded, clear tracking
                if (lastLoadedLocalModel === status.name) {
                  setLastLoadedLocalModel(null)
                }
              }
            }}
          />
        )}
        
        {/* Messages - this should be the scrollable area */}
        <div className="flex-1 min-h-0">
          <MessageList
            messages={messages}
            streamingMessage={zustandStreamingMessage}
            streamingMessagesByModel={streamingMessagesByModel}
            searchQueries={searchQueries}
            isLoading={isLoading && isCurrentConversationWaiting}
            expectedModels={isMultiSelectMode && selectedModels.length > 0 ? selectedModels : []}
            scrollContainerRef={scrollContainerRef}
            onScroll={handleScroll}
          />
        </div>

      {/* Input - fixed at bottom */}
      <div className="flex-shrink-0">
        <MessageInput
          ref={messageInputRef}
          onSend={handleSend}
          onCancel={handleCancel}
          disabled={!conversationId || (!currentConversation?.provider && !selectedModel?.provider) || (!currentConversation?.model && !selectedModel?.model)}
          isLoading={isLoading && isCurrentConversationWaiting}
          noProvider={!currentConversation?.model && !selectedModel?.model}
          messages={messages}
          modelCapabilities={
            (currentConversation?.model && providers?.[currentConversation.provider]?.modelCapabilities?.[currentConversation.model]) ||
            (selectedModel?.model && providers?.[selectedModel.provider]?.modelCapabilities?.[selectedModel.model]) || {
              vision: false,
              audio: false,
              files: false,
              thinking: false
            }
          }
          onOpenConversationSettings={() => setShowConversationSettings(true)}
          onAttachmentsChange={setRequiredCapabilities}
        />
      </div>
      </div>

      {/* Conversation Settings Modal */}
      <ConversationSettingsModal
        isOpen={showConversationSettings}
        onClose={() => setShowConversationSettings(false)}
        settings={conversationSettings}
        onSave={handleSaveConversationSettings}
        conversationId={conversationId || null}
        maxTemperature={maxTemperature}
      />

      {/* Model Selector Dropdown - Rendered as Portal */}
      {modelSelectorOpen && createPortal(
        <div 
          ref={dropdownRef} 
          className="w-80 glass-effect border border-border/20 rounded-2xl shadow-elegant-xl z-[99999] max-h-80 overflow-y-auto overflow-x-hidden"
          style={{ 
            position: 'fixed', 
            top: dropdownPosition.top, 
            right: dropdownPosition.right,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {/* Search bar - frozen at top */}
          <div className="sticky top-0 glass-nav backdrop-blur-strong border-b border-border/10 p-3 z-10">
            <div className="elegant-input-container flex items-center gap-2 px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search models..."
                data-model-search-input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  const compatibleModels = allFilteredModels.filter(m => isModelCompatible(m))
                  
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setHighlightedModelIndex(prev => 
                      prev < compatibleModels.length - 1 ? prev + 1 : 0
                    )
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setHighlightedModelIndex(prev => 
                      prev > 0 ? prev - 1 : compatibleModels.length - 1
                    )
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    if (highlightedModelIndex >= 0 && highlightedModelIndex < compatibleModels.length) {
                      const selectedModel = compatibleModels[highlightedModelIndex]
                      handleModelSelect({ provider: selectedModel.provider, model: selectedModel.model })
                    }
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onToggleModelSelector?.()
                  }
                }}
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground text-foreground"
              />
            </div>
          </div>
          
          {/* Multi-Select option at top - hidden in mini window */}
          {!isMiniWindow && (
            <div className="border-b border-border/10">
              <button
                onClick={() => {
                  setIsMultiSelectMode(!isMultiSelectMode)
                  if (!isMultiSelectMode && selectedModel) {
                    // When entering multi-select, add current model to selection
                    setSelectedModels([selectedModel])
                  } else if (isMultiSelectMode) {
                    // When exiting multi-select, clear selections and use first selected model
                    if (selectedModels.length > 0) {
                      setSelectedModel(selectedModels[0])
                    }
                    setSelectedModels([])
                  }
                }}
                className={clsx(
                  'w-full text-left px-4 py-3 transition-all duration-200 elegant-hover flex items-center justify-between',
                  isMultiSelectMode 
                    ? 'bg-gradient-subtle border-l-2 border-l-primary text-primary' 
                    : 'text-foreground/90 hover:bg-surface-hover'
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200",
                    isMultiSelectMode 
                      ? "bg-primary border-primary" 
                      : "border-border hover:border-primary/50"
                  )}>
                    {isMultiSelectMode && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div>
                    <div className="font-medium text-sm">Multi-Select</div>
                    <div className="text-xs text-muted-foreground">
                      {isMultiSelectMode 
                        ? `${selectedModels.length}/5 model${selectedModels.length !== 1 ? 's' : ''} selected`
                        : 'Message multiple models at once (max 5)'
                      }
                    </div>
                  </div>
                </div>
              </button>
            </div>
          )}
          
          {Object.entries(filteredModelsByProvider).length === 0 ? (
            <div className="py-4">
              <EmptyState
                type="no-results"
                title={searchQuery ? "No models found" : "No models available"}
                description={searchQuery ? `No models matching "${searchQuery}"` : "Check your provider settings"}
                className="scale-75"
              />
            </div>
          ) : (
            Object.entries(filteredModelsByProvider).map(([providerName, models]) => (
              <div key={providerName} className="mb-2">
                <div className="px-4 py-3 text-xs font-semibold text-muted-foreground glass-nav backdrop-blur-strong border-b border-border/10 tracking-wide">
                  {providerName.toUpperCase()}
                </div>
                <div className="p-1 pr-3">
                  {models.map((model) => {
                    const compatible = isModelCompatible(model)
                    const incompatibilityReason = getIncompatibilityReason(model)
                    const isSelected = selectedModel?.provider === model.provider && selectedModel?.model === model.model
                    const isSelectedInMulti = selectedModels.some(m => m.provider === model.provider && m.model === model.model)
                    const isHighlighted = isModelHighlighted(model)
                    const currentLocalCount = selectedModels.filter(m => isModelLocal(m)).length
                    const isAtMaxSelection = isMultiSelectMode && selectedModels.length >= 5 && !isSelectedInMulti
                    const isAtMaxLocalSelection = isMultiSelectMode && isModelLocal(model) && currentLocalCount >= 1 && !isSelectedInMulti
                    
                    return (
                      <button
                        key={`${model.provider}-${model.model}`}
                        onClick={() => {
                          if (!compatible) return
                          if (isMultiSelectMode) {
                            // In multi-select mode, toggle selection
                            if (isSelectedInMulti) {
                              setSelectedModels(prev => prev.filter(m => !(m.provider === model.provider && m.model === model.model)))
                            } else if (selectedModels.length < 5 && !isAtMaxLocalSelection) {
                              setSelectedModels(prev => [...prev, { provider: model.provider, model: model.model }])
                            }
                          } else {
                            handleModelSelect({ provider: model.provider, model: model.model })
                          }
                        }}
                        onMouseEnter={() => handleModelMouseEnter(model)}
                        className={clsx(
                          'w-full text-left px-3 py-2 transition-all duration-200 rounded-xl mx-1 my-0.5',
                          !compatible || isAtMaxSelection || isAtMaxLocalSelection
                            ? 'cursor-not-allowed opacity-50' 
                            : 'cursor-pointer elegant-hover',
                          (isSelected && !isMultiSelectMode) || (isSelectedInMulti && isMultiSelectMode)
                            ? 'bg-gradient-subtle border border-primary/20'
                            : isHighlighted
                            ? 'bg-surface-hover'
                            : ''
                        )}
                        disabled={!compatible || isAtMaxSelection || isAtMaxLocalSelection}
                        title={getModelButtonTooltip(incompatibilityReason, isAtMaxSelection, isAtMaxLocalSelection)}
                        data-model-id={`${model.provider}-${model.model}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {isMultiSelectMode && (
                              <div className={clsx(
                                "w-4 h-4 rounded border flex items-center justify-center transition-all duration-200",
                                isSelectedInMulti 
                                  ? "bg-primary border-primary" 
                                  : "border-border"
                              )}>
                                {isSelectedInMulti && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                              </div>
                            )}
                            <div className={clsx(
                              "font-medium text-sm",
                              !compatible || isAtMaxSelection || isAtMaxLocalSelection ? "text-muted-foreground" : "text-foreground/90"
                            )}>
                              {model.model}
                            </div>
                          </div>
                          <ModelCapabilityIcons 
                            capabilities={model.capabilities} 
                            className={!compatible ? "opacity-50" : ""}
                          />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
})

export default ChatView
