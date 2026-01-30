import { useState, useEffect } from 'react'
import { settings, SETTINGS_KEYS } from '../shared/settingsStore'
import { saveApiKey, getApiKey, deleteApiKey, hasApiKey } from '../utils/secureStorage'
import { Provider, AddProviderRequest, UpdateProviderRequest } from '../types/provider'
import { applyTheme, setupSystemThemeListener } from '../shared/theme'
import { modelsService } from '../services/modelsService'
import { useAppStore } from '../stores/appStore'
import * as windowManager from '../utils/windowManager'
import { telemetryService } from '../services/telemetryService'

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  sendMessage: 'enter' | 'cmd-enter'
  globalHotkey: string
  showPricing: boolean
  showConversationSettings: boolean
  providers: Record<string, Provider>
  hasCompletedOnboarding: boolean
  userName: string
  titleGenerationModel: string | null
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  sendMessage: 'enter',
  globalHotkey: '',
  showPricing: false,
  showConversationSettings: false,
  hasCompletedOnboarding: false,
  userName: '',
  providers: {},
  titleGenerationModel: null
}

// Singleton settings manager to ensure all hook instances share the same state
class SettingsManager {
  private _settings: AppSettings = DEFAULT_SETTINGS
  private _isLoading = true
  private _listeners = new Set<() => void>()

  get settings() { return this._settings }
  get isLoading() { return this._isLoading }

  updateSettings(newSettings: AppSettings) {
    this._settings = newSettings
    this.notifyListeners()
  }

  setLoading(loading: boolean) {
    this._isLoading = loading
    this.notifyListeners()
  }

  subscribe(listener: () => void) {
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  private notifyListeners() {
    this._listeners.forEach(listener => listener())
  }
}

const settingsManager = new SettingsManager()

export function useSettings() {
  const [, forceUpdate] = useState({})
  const updateProviders = useAppStore((state) => state.updateProviders)
  
  // Subscribe to settings manager updates
  useEffect(() => {
    const unsubscribe = settingsManager.subscribe(() => {
      forceUpdate({})
    })
    return () => {
      unsubscribe()
    }
  }, [])

  // Load settings on mount (only once globally)
  useEffect(() => {
    if (settingsManager.isLoading) {
      loadSettings()
    }
  }, [])

  // Listen for reload settings events from other windows
  useEffect(() => {
    const handleReloadSettings = () => {
      loadSettings()
    }
    
    window.addEventListener('reloadSettings', handleReloadSettings)
    return () => {
      window.removeEventListener('reloadSettings', handleReloadSettings)
    }
  }, [])

  // Apply theme when settings finish loading and set up system listener
  useEffect(() => {
    if (!settingsManager.isLoading && settingsManager.settings.theme) {
      applyTheme(settingsManager.settings.theme)
      
      // Set up system theme listener for system theme mode
      const cleanup = setupSystemThemeListener(settingsManager.settings.theme)
      return cleanup || undefined
    }
  }, [settingsManager.isLoading, settingsManager.settings.theme])

  // Check API keys on mount and when providers change
  useEffect(() => {
    if (!settingsManager.isLoading && Object.keys(settingsManager.settings.providers).length > 0) {
      checkProviderApiKeys()
    }
  }, [settingsManager.isLoading, Object.keys(settingsManager.settings.providers).length])

  // Register global shortcut when settings load and cleanup on unmount
  useEffect(() => {
    let cleanup: (() => Promise<void>) | undefined
    
    const registerShortcut = async () => {
      if (!settingsManager.isLoading && settingsManager.settings.globalHotkey) {
        try {
          cleanup = await windowManager.registerGlobalShortcut(settingsManager.settings.globalHotkey)
        } catch (error) {
          console.error('Failed to register initial global shortcut:', error)
        }
      }
    }
    
    registerShortcut()
    
    // Cleanup on unmount
    return () => {
      if (cleanup) {
        cleanup()
      }
    }
  }, [settingsManager.isLoading, settingsManager.settings.globalHotkey])

  const loadSettings = async () => {
    settingsManager.setLoading(true)
    try {
      const loadedSettings: Partial<AppSettings> = {}
      
      // Load each setting individually
      for (const settingKey of Object.values(SETTINGS_KEYS)) {
        const value = await settings.get(settingKey)
        if (value !== null) {
          (loadedSettings as any)[settingKey] = value
        }
      }

      settingsManager.updateSettings({ ...settingsManager.settings, ...loadedSettings })
    } catch (error) {
      console.error('Failed to load settings:', error)
    } finally {
      settingsManager.setLoading(false)
    }
  }

  const updateSetting = async <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ) => {
    try {
      await settings.set(key, value)
      const newSettings = { ...settingsManager.settings, [key]: value }
      
      // Apply theme immediately when it changes
      if (key === 'theme') {
        applyTheme(value as string)
      }
      
      // Sync providers with Zustand store for immediate reactivity
      if (key === 'providers') {
        updateProviders((value as Record<string, Provider>) || {})
      }
      
      settingsManager.updateSettings(newSettings)
      
      // Notify other windows about settings changes
      import('../utils/messageSync').then(({ messageSync }) => {
        messageSync.notifySettingsUpdate()
      }).catch(() => {})
    } catch (error) {
      console.error(`Failed to update setting ${key}:`, error)
      throw error
    }
  }

  const resetSettings = async () => {
    try {
      await settings.clear()
      settingsManager.updateSettings(DEFAULT_SETTINGS)
    } catch (error) {
      console.error('Failed to reset settings:', error)
      throw error
    }
  }

  const getSetting = <K extends keyof AppSettings>(key: K): AppSettings[K] => {
    return settingsManager.settings[key]
  }

  const updateProviderSetting = async (providerId: string, providerData: AppSettings['providers'][string]) => {
    console.log(`Updating provider setting for ${providerId}`)
    console.log('Provider data being set:', providerData.enabledModels)
    
    const newProviders = { ...settingsManager.settings.providers, [providerId]: providerData }
    await updateSetting('providers', newProviders)
    
    console.log('updateProviderSetting completed')
  }

  // Direct handlers for SettingsModal compatibility
  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    await updateSetting('theme', newTheme)
  }

  const handleSendKeyChange = async (newSendKey: 'enter' | 'cmd-enter') => {
    await updateSetting('sendMessage', newSendKey)
  }

  const handleGlobalHotkeyChange = async (newHotkey: string) => {
    await updateSetting('globalHotkey', newHotkey)
    
    // Register the global shortcut with Tauri
    try {
      await windowManager.registerGlobalShortcut(newHotkey)
    } catch (error) {
      console.error('Failed to register global shortcut:', error)
      // Don't throw error here to prevent UI issues, just log it
    }
  }

  const handleShowPricingChange = async (show: boolean) => {
    await updateSetting('showPricing', show)
  }

  const handleShowConversationSettingsChange = async (show: boolean) => {
    await updateSetting('showConversationSettings', show)
  }


  const handleToggleModel = async (providerId: string, modelName: string, enabled: boolean) => {
    const provider = settingsManager.settings.providers[providerId]
    if (!provider) return

    const enabledModels = enabled
      ? [...provider.enabledModels, modelName]
      : provider.enabledModels.filter(m => m !== modelName)

    console.log(`Toggling model ${modelName} to ${enabled} for provider ${providerId}`)
    console.log('Previous enabled models:', provider.enabledModels)
    console.log('New enabled models:', enabledModels)

    await updateProviderSetting(providerId, {
      ...provider,
      enabledModels
    })
    
    console.log('Model toggle completed')
  }

  const handleCapabilityToggle = async (
    modelId: string,
    providerId: string,
    capability: 'vision' | 'audio' | 'files' | 'image' | 'thinking' | 'tools' | 'webSearch',
    enabled: boolean
  ) => {
    const provider = settingsManager.settings.providers[providerId]
    if (!provider) return

    const modelCapabilities = {
      ...provider.modelCapabilities,
      [modelId]: {
        ...provider.modelCapabilities[modelId],
        [capability]: enabled
      }
    }

    await updateProviderSetting(providerId, {
      ...provider,
      modelCapabilities
    })
  }

  const addProvider = async (request: AddProviderRequest): Promise<void> => {
    try {
      const providerId = request.name.toLowerCase().replace(/\s+/g, '-')
      
      // Save API key to keychain if provided
      if (request.apiKey && !request.isLocal) {
        await saveApiKey(providerId, request.apiKey)
      }

      // Create provider object
      const provider: Provider = {
        id: providerId,
        name: request.name,
        endpoint: request.endpoint,
        models: [],
        enabledModels: [],
        modelCapabilities: {},
        connected: false,
        isLocal: request.isLocal || false,
        hasApiKey: !!request.apiKey && !request.isLocal
      }

      // Save provider to settings
      await updateProviderSetting(providerId, provider)

      // Automatically fetch models for the new provider
      try {
        // Get API key if needed
        const apiKey = provider.isLocal ? undefined : await getApiKey(providerId)
        
        // Fetch and enrich models
        const enrichedModels = await modelsService.fetchModelsForProvider(
          providerId,
          provider.endpoint,
          apiKey || undefined,
          provider.isLocal
        )

        // Update provider with new models and capabilities
        const modelNames = enrichedModels.map(model => model.id)
        const modelCapabilities = enrichedModels.reduce((acc, model) => {
          acc[model.id] = model.capabilities
          return acc
        }, {} as Record<string, any>)

        // Auto-select first three models for new providers
        const enabledModels = modelNames.slice(0, 3)

        await updateProviderSetting(providerId, {
          ...provider,
          models: modelNames,
          enabledModels,
          modelCapabilities,
          connected: true
        })
        
        // Track provider configuration with first enabled model
        const defaultModel = enabledModels[0] || 'unknown'
        await telemetryService.trackProviderConfigured(provider.name, defaultModel)
      } catch (error) {
        // Don't fail the provider creation if model fetching fails
        console.warn(`Failed to fetch models for new provider ${providerId}:`, error)
      }
    } catch (error) {
      console.error('Failed to add provider:', error)
      throw error
    }
  }

  const updateProvider = async (providerId: string, request: UpdateProviderRequest): Promise<void> => {
    try {
      const provider = settingsManager.settings.providers[providerId]
      if (!provider) throw new Error('Provider not found')

      // Update API key if provided
      if (request.apiKey !== undefined) {
        if (request.apiKey && !provider.isLocal) {
          await saveApiKey(providerId, request.apiKey)
        } else if (!request.apiKey && !provider.isLocal) {
          await deleteApiKey(providerId)
        }
      }

      // Update provider object
      const updatedProvider: Provider = {
        ...provider,
        ...(request.name && { name: request.name }),
        ...(request.endpoint && { endpoint: request.endpoint }),
        ...(request.models && { models: request.models }),
        ...(request.enabledModels && { enabledModels: request.enabledModels }),
        ...(request.modelCapabilities && { modelCapabilities: request.modelCapabilities }),
        ...(request.apiKey !== undefined && { hasApiKey: !!request.apiKey && !provider.isLocal })
      }

      await updateProviderSetting(providerId, updatedProvider)
    } catch (error) {
      console.error('Failed to update provider:', error)
      throw error
    }
  }

  const removeProvider = async (providerId: string): Promise<void> => {
    try {
      const provider = settingsManager.settings.providers[providerId]
      if (!provider) return

      // Delete API key from keychain
      if (provider.hasApiKey) {
        await deleteApiKey(providerId)
      }

      // Remove provider from settings
      const newProviders = { ...settingsManager.settings.providers }
      delete newProviders[providerId]
      await updateSetting('providers', newProviders)
    } catch (error) {
      console.error('Failed to remove provider:', error)
      throw error
    }
  }

  const updateProviderApiKey = async (providerId: string, apiKey: string): Promise<void> => {
    try {
      const provider = settingsManager.settings.providers[providerId]
      if (!provider) throw new Error('Provider not found')

      if (provider.isLocal) {
        throw new Error('Local providers do not use API keys')
      }

      if (apiKey) {
        await saveApiKey(providerId, apiKey)
      } else {
        await deleteApiKey(providerId)
      }

      // Update provider hasApiKey flag
      await updateProviderSetting(providerId, {
        ...provider,
        hasApiKey: !!apiKey
      })
    } catch (error) {
      console.error('Failed to update provider API key:', error)
      throw error
    }
  }

  const getProviderApiKey = async (providerId: string): Promise<string | null> => {
    try {
      const provider = settingsManager.settings.providers[providerId]
      if (!provider || provider.isLocal) return null
      
      return await getApiKey(providerId)
    } catch (error) {
      console.error('Failed to get provider API key:', error)
      return null
    }
  }

  const checkProviderApiKeys = async (): Promise<void> => {
    try {
      const updatedProviders = { ...settingsManager.settings.providers }
      let hasChanges = false

      for (const [providerId, provider] of Object.entries(updatedProviders)) {
        if (!provider.isLocal) {
          const hasKey = await hasApiKey(providerId)
          if (provider.hasApiKey !== hasKey) {
            updatedProviders[providerId] = { ...provider, hasApiKey: hasKey }
            hasChanges = true
          }
        }
      }

      if (hasChanges) {
        await updateSetting('providers', updatedProviders)
      }
    } catch (error) {
      console.error('Failed to check provider API keys:', error)
    }
  }

  const refreshProviderModels = async (providerId: string): Promise<void> => {
    try {
      const provider = settingsManager.settings.providers[providerId]
      if (!provider) throw new Error('Provider not found')

      // Get API key if needed
      const apiKey = provider.isLocal ? undefined : await getApiKey(providerId)
      
      // Fetch and enrich models
      const enrichedModels = await modelsService.fetchModelsForProvider(
        providerId,
        provider.endpoint,
        apiKey || undefined,
        provider.isLocal
      )

      // Update provider with new models and capabilities
      const modelNames = enrichedModels.map(model => model.id)
      const modelCapabilities = enrichedModels.reduce((acc, model) => {
        acc[model.id] = model.capabilities
        return acc
      }, {} as Record<string, any>)

      // Auto-select first three models for new providers
      const isNewProvider = provider.models.length === 0
      const enabledModels = isNewProvider 
        ? modelNames.slice(0, 3)  // Select first 3 models for new providers
        : provider.enabledModels   // Keep existing selection for refresh

      await updateProviderSetting(providerId, {
        ...provider,
        models: modelNames,
        enabledModels,
        modelCapabilities,
        connected: true
      })

    } catch (error) {
      console.error(`Failed to refresh models for provider ${providerId}:`, error)
      
      // Mark provider as disconnected
      const provider = settingsManager.settings.providers[providerId]
      if (provider) {
        await updateProviderSetting(providerId, {
          ...provider,
          connected: false
        })
      }
      
      throw error
    }
  }

  const handleUserNameChange = async (newUserName: string) => {
    await updateSetting('userName', newUserName)
  }

  const handleOnboardingCompletion = async (completed: boolean = true) => {
    await updateSetting('hasCompletedOnboarding', completed)
    
    // Track onboarding completion
    if (completed) {
      await telemetryService.trackOnboardingCompleted()
    }
  }

  const handleTitleGenerationModelChange = async (model: string | null) => {
    await updateSetting('titleGenerationModel', model)
  }

  return {
    // Settings data (for direct access)
    settings: settingsManager.settings,
    
    // Individual setting values (for SettingsModal compatibility)
    theme: settingsManager.settings.theme,
    sendKey: settingsManager.settings.sendMessage,
    globalHotkey: settingsManager.settings.globalHotkey,
    showPricing: settingsManager.settings.showPricing,
    showConversationSettings: settingsManager.settings.showConversationSettings,
    providers: settingsManager.settings.providers,
    hasCompletedOnboarding: settingsManager.settings.hasCompletedOnboarding,
    userName: settingsManager.settings.userName,
    titleGenerationModel: settingsManager.settings.titleGenerationModel,
    
    // State
    isLoading: settingsManager.isLoading,
    
    // Generic methods
    updateSetting,
    updateProviderSetting,
    resetSettings,
    getSetting,
    reloadSettings: loadSettings,
    
    // SettingsModal handlers
    handleThemeChange,
    handleSendKeyChange,
    handleGlobalHotkeyChange,
    handleShowPricingChange,
    handleShowConversationSettingsChange,
    handleToggleModel,
    handleCapabilityToggle,
    handleUserNameChange,
    handleOnboardingCompletion,
    handleTitleGenerationModelChange,
    
    // Provider management
    addProvider,
    updateProvider,
    removeProvider,
    updateProviderApiKey,
    getProviderApiKey,
    checkProviderApiKeys,
    refreshProviderModels,
  }
}
