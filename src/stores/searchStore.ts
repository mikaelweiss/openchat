import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { SearchSettings, SearchEngineConfig, SearchEngineKind } from '../types/search'
import { saveApiKey, getApiKey, deleteApiKey } from '../utils/secureStorage'

interface SearchStore {
  settings: SearchSettings
  updateSettings: (settings: Partial<SearchSettings>) => void
  addSearchEngine: (config: SearchEngineConfig) => Promise<void>
  updateSearchEngine: (index: number, config: SearchEngineConfig) => Promise<void>
  removeSearchEngine: (index: number) => Promise<void>
  setDefaultEngine: (engine: SearchEngineKind) => void
  setAutoDetect: (enabled: boolean) => void
  getEngineApiKey: (engine: SearchEngineKind) => Promise<string | null>
  hasValidEngine: () => Promise<boolean>
}

const defaultSettings: SearchSettings = {
  engines: [
    { kind: 'duckduckgo' } // Default fallback that requires no API key
  ],
  defaultEngine: 'duckduckgo',
  autoDetectNeeded: false
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,

      updateSettings: (newSettings) => 
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        })),

      addSearchEngine: async (config) => {
        console.log('Adding search engine:', config);
        
        // Save API key if needed
        if ('apiKey' in config && config.apiKey) {
          console.log(`Saving API key for search-${config.kind}, length: ${config.apiKey.length}`);
          try {
            await saveApiKey(`search-${config.kind}`, config.apiKey);
            console.log(`API key saved successfully for search-${config.kind}`);
            
            // Verify it was saved
            const retrieved = await getApiKey(`search-${config.kind}`);
            console.log(`Verification - retrieved key length: ${retrieved?.length || 'null'}`);
          } catch (error) {
            console.error(`Failed to save API key for search-${config.kind}:`, error);
            throw error;
          }
        }
        
        // Save Google CSE cx parameter separately
        if (config.kind === 'google' && 'cx' in config && config.cx) {
          console.log(`Saving Google CSE cx parameter: ${config.cx}`);
          await saveApiKey(`search-google-cx`, config.cx);
        }
        
        set((state) => ({
          settings: {
            ...state.settings,
            engines: [...state.settings.engines, config]
          }
        }))
        
        console.log('Search engine added to store');
      },

      updateSearchEngine: async (index, config) => {
        const state = get()
        const engines = [...state.settings.engines]
        
        if (index >= 0 && index < engines.length) {
          const oldConfig = engines[index]
          
          // Handle API key updates
          if ('apiKey' in config && config.apiKey) {
            await saveApiKey(`search-${config.kind}`, config.apiKey)
          } else if ('apiKey' in oldConfig && oldConfig.kind === config.kind) {
            // Remove old API key if engine type changed or key was removed
            await deleteApiKey(`search-${oldConfig.kind}`)
          }
          
          // Handle Google CSE cx parameter
          if (config.kind === 'google' && 'cx' in config && config.cx) {
            await saveApiKey(`search-google-cx`, config.cx)
          } else if (oldConfig.kind === 'google' && config.kind !== 'google') {
            // Remove cx if changing away from Google
            await deleteApiKey(`search-google-cx`)
          }
          
          engines[index] = config
          
          set((state) => ({
            settings: {
              ...state.settings,
              engines
            }
          }))
        }
      },

      removeSearchEngine: async (index) => {
        const state = get()
        const engines = [...state.settings.engines]
        
        if (index >= 0 && index < engines.length) {
          const config = engines[index]
          
          // Remove API key if it exists
          if ('apiKey' in config) {
            await deleteApiKey(`search-${config.kind}`)
          }
          
          // Remove Google CSE cx if it's a Google engine
          if (config.kind === 'google') {
            await deleteApiKey(`search-google-cx`)
          }
          
          engines.splice(index, 1)
          
          set((state) => ({
            settings: {
              ...state.settings,
              engines
            }
          }))
        }
      },

      setDefaultEngine: (engine) => 
        set((state) => ({
          settings: {
            ...state.settings,
            defaultEngine: engine
          }
        })),

      setAutoDetect: (enabled) =>
        set((state) => ({
          settings: {
            ...state.settings,
            autoDetectNeeded: enabled
          }
        })),

      getEngineApiKey: async (engine) => {
        return await getApiKey(`search-${engine}`)
      },

      hasValidEngine: async () => {
        const state = get()
        console.log('Checking for valid engines, current engines:', state.settings.engines);
        
        // Check if we have at least one configured engine
        for (const config of state.settings.engines) {
          console.log('Checking engine:', config);
          
          if (config.kind === 'duckduckgo') {
            console.log('DuckDuckGo found - no API key needed');
            return true // No API key needed
          }
          
          if ('apiKey' in config) {
            console.log(`Checking API key for ${config.kind}`);
            const key = await getApiKey(`search-${config.kind}`)
            console.log(`Retrieved key for ${config.kind}, length: ${key?.length || 'null'}`);
            if (key && key.trim()) {
              console.log(`Valid API key found for ${config.kind}`);
              return true
            } else {
              console.log(`No valid API key found for ${config.kind}`);
            }
          }
        }
        
        console.log('No valid engines found');
        return false
      }
    }),
    {
      name: 'search-settings',
      // Only persist basic settings, not API keys (those go to secure storage)
      partialize: (state) => ({
        settings: {
          engines: state.settings.engines.map(engine => 
            'apiKey' in engine 
              ? { ...engine, apiKey: '' } // Remove API key from persisted state
              : engine
          ),
          defaultEngine: state.settings.defaultEngine,
          autoDetectNeeded: state.settings.autoDetectNeeded
        }
      })
    }
  )
)
