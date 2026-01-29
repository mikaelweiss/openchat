import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sun, Moon, Monitor, Check, Plus } from 'lucide-react'
import clsx from 'clsx'
import { useSettings } from '../../hooks/useSettings'
import { useProviders } from '../../stores/appStore'
import Logo from '../../assets/Logo.svg'
import MobileProviderSettings from './MobileProviderSettings'
import MobileAddProvider from './MobileAddProvider'

const providerPresets = [
  { id: 'openai', name: 'OpenAI', apiKeyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', name: 'Anthropic', apiKeyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'inception-labs', name: 'Inception Labs', apiKeyUrl: 'https://api.inceptionlabs.ai' },
  { id: 'deep-infra', name: 'Deep Infra', apiKeyUrl: 'https://deepinfra.com/dash/api_keys' },
  { id: 'openrouter', name: 'Open Router', apiKeyUrl: 'https://openrouter.ai/keys' },
  { id: 'groq', name: 'Groq', apiKeyUrl: 'https://console.groq.com/keys' },
  { id: 'xai', name: 'xAI', apiKeyUrl: 'https://console.x.ai/team/api-keys' },
  { id: 'google-ai', name: 'Google AI', apiKeyUrl: 'https://aistudio.google.com/app/apikey' },
  { id: 'fireworks-ai', name: 'Fireworks AI', apiKeyUrl: 'https://fireworks.ai/api-keys' },
  { id: 'together-ai', name: 'Together AI', apiKeyUrl: 'https://api.together.xyz/settings/api-keys' },
  { id: 'cerebras-cloud', name: 'Cerebras Cloud', apiKeyUrl: 'https://cloud.cerebras.ai/platform' },
  { id: 'cohere', name: 'Cohere', apiKeyUrl: 'https://dashboard.cohere.ai/api-keys' },
  { id: 'local', name: 'Local', isLocal: true }
]

interface MobileSettingsProps {
  onBack: () => void
}

export default function MobileSettings({ onBack }: MobileSettingsProps) {
  const {
    theme,
    handleThemeChange,
    addProvider,
    updateProvider,
    removeProvider,
    refreshProviderModels
  } = useSettings()
  const { providers } = useProviders()

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [showAddProvider, setShowAddProvider] = useState(false)

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor }
  ]

  const allProviders = Object.entries(providers || {})

  const handleUpdateApiKey = async (providerId: string, apiKey: string) => {
    await updateProvider(providerId, { apiKey })
  }

  const handleAddProvider = async (name: string, endpoint: string, apiKey?: string, isLocal?: boolean) => {
    await addProvider({ name, endpoint, apiKey, isLocal })
  }

  const getProviderPreset = (providerId: string) => {
    return providerPresets.find(p =>
      p.id === providerId ||
      p.name.toLowerCase().replace(/\s+/g, '-') === providerId
    )
  }

  if (showAddProvider) {
    return (
      <MobileAddProvider
        onBack={() => setShowAddProvider(false)}
        onAddProvider={handleAddProvider}
        existingProviderIds={Object.keys(providers || {})}
      />
    )
  }

  if (selectedProviderId && providers[selectedProviderId]) {
    return (
      <MobileProviderSettings
        providerId={selectedProviderId}
        provider={providers[selectedProviderId]}
        onBack={() => setSelectedProviderId(null)}
        onUpdateApiKey={handleUpdateApiKey}
        onRefreshModels={refreshProviderModels}
        onRemoveProvider={removeProvider}
        providerPreset={getProviderPreset(selectedProviderId)}
      />
    )
  }

  return (
    <div className="mobile-app h-screen flex flex-col bg-background text-foreground">
      <header className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="font-semibold text-foreground/95">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">APPEARANCE</h2>
            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              {themeOptions.map((option, index) => {
                const Icon = option.icon
                const isSelected = theme === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-3',
                      index !== themeOptions.length - 1 && 'border-b border-border/10',
                      'active:bg-accent/50 transition-colors'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-foreground/90">{option.label}</span>
                    </div>
                    {isSelected && <Check className="h-5 w-5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-semibold text-muted-foreground">PROVIDERS</h2>
              <button
                onClick={() => setShowAddProvider(true)}
                className="flex items-center gap-1 text-sm text-primary"
              >
                <Plus className="h-4 w-4" />
                Add
              </button>
            </div>
            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              {allProviders.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">No providers configured</p>
                  <button
                    onClick={() => setShowAddProvider(true)}
                    className="mt-3 px-4 py-2 text-sm bg-primary text-white rounded-xl active:bg-primary/90 transition-colors"
                  >
                    Add Provider
                  </button>
                </div>
              ) : (
                allProviders.map(([id, provider], index) => (
                  <button
                    key={id}
                    onClick={() => setSelectedProviderId(id)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-3',
                      index !== allProviders.length - 1 && 'border-b border-border/10',
                      'active:bg-accent/50 transition-colors'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={clsx(
                        'w-2 h-2 rounded-full',
                        provider.connected ? 'bg-green-500' : 'bg-gray-400'
                      )} />
                      <div className="text-left">
                        <span className="text-foreground/90 font-medium">{provider.name}</span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {provider.enabledModels?.length || 0} model
                          {(provider.enabledModels?.length || 0) !== 1 ? 's' : ''} enabled
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </button>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">ABOUT</h2>
            <div className="bg-card rounded-2xl border border-border/20 p-4">
              <div className="flex items-center gap-3 mb-3">
                <img src={Logo} alt="Open Chat" className="h-10 w-10" />
                <div>
                  <h3 className="font-semibold text-foreground/95">Open Chat</h3>
                  <p className="text-xs text-muted-foreground">Version 1.0.0</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                A modern AI chat application for desktop and mobile.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
