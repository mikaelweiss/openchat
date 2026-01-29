import { useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, Server, Cloud } from 'lucide-react'
import clsx from 'clsx'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ProviderPreset } from '../../types/provider'

const providerPresets: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    description: 'GPT-4, GPT-3.5, and other OpenAI models',
    apiKeyUrl: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    endpoint: 'https://api.anthropic.com/v1',
    description: 'Claude 3.5 Sonnet, Claude 3 Opus, and other Claude models',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'inception-labs',
    name: 'Inception Labs',
    endpoint: 'https://api.inceptionlabs.ai/v1',
    description: 'Advanced AI models from Inception Labs',
    apiKeyUrl: 'https://api.inceptionlabs.ai'
  },
  {
    id: 'deep-infra',
    name: 'Deep Infra',
    endpoint: 'https://api.deepinfra.com/v1/openai',
    description: 'GPU-accelerated inference for open-source models',
    apiKeyUrl: 'https://deepinfra.com/dash/api_keys'
  },
  {
    id: 'openrouter',
    name: 'Open Router',
    endpoint: 'https://openrouter.ai/api/v1',
    description: 'Access to 400+ models with rich metadata',
    apiKeyUrl: 'https://openrouter.ai/keys'
  },
  {
    id: 'groq',
    name: 'Groq',
    endpoint: 'https://api.groq.com/openai/v1',
    description: 'Fast inference for Llama, Mixtral models',
    apiKeyUrl: 'https://console.groq.com/keys'
  },
  {
    id: 'xai',
    name: 'xAI',
    endpoint: 'https://api.x.ai/v1',
    description: 'Grok models from xAI',
    apiKeyUrl: 'https://console.x.ai/team/api-keys'
  },
  {
    id: 'google-ai',
    name: 'Google AI',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    description: 'Gemini models with native multimodal capabilities',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey'
  },
  {
    id: 'fireworks-ai',
    name: 'Fireworks AI',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    description: 'Fast inference platform for open-source models',
    apiKeyUrl: 'https://fireworks.ai/api-keys'
  },
  {
    id: 'together-ai',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    description: 'Collaborative AI platform with diverse models',
    apiKeyUrl: 'https://api.together.xyz/settings/api-keys'
  },
  {
    id: 'cerebras-cloud',
    name: 'Cerebras Cloud',
    endpoint: 'https://api.cerebras.ai/v1',
    description: 'Ultra-fast inference on Cerebras hardware',
    apiKeyUrl: 'https://cloud.cerebras.ai/platform'
  },
  {
    id: 'cohere',
    name: 'Cohere',
    endpoint: 'https://api.cohere.ai/compatibility/v1',
    description: 'Command and embedding models from Cohere',
    apiKeyUrl: 'https://dashboard.cohere.ai/api-keys'
  },
  {
    id: 'local',
    name: 'Local',
    endpoint: 'http://localhost:11434',
    description: 'Local models via Ollama - auto-detects installation',
    isLocal: true
  }
]

interface MobileAddProviderProps {
  onBack: () => void
  onAddProvider: (name: string, endpoint: string, apiKey?: string, isLocal?: boolean) => Promise<void>
  existingProviderIds: string[]
}

export default function MobileAddProvider({
  onBack,
  onAddProvider,
  existingProviderIds
}: MobileAddProviderProps) {
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [customProvider, setCustomProvider] = useState({ name: '', endpoint: '' })
  const [isAdding, setIsAdding] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  const availableCloudPresets = providerPresets.filter(preset => {
    if (preset.isLocal) return false
    const presetAsProviderId = preset.name.toLowerCase().replace(/\s+/g, '-')
    return !existingProviderIds.includes(preset.id) && !existingProviderIds.includes(presetAsProviderId)
  })

  const availableLocalPresets = providerPresets.filter(preset => {
    if (!preset.isLocal) return false
    const presetAsProviderId = preset.name.toLowerCase().replace(/\s+/g, '-')
    return !existingProviderIds.includes(preset.id) && !existingProviderIds.includes(presetAsProviderId)
  })

  const handleSelectPreset = async (preset: ProviderPreset) => {
    if (preset.isLocal) {
      setIsAdding(true)
      try {
        await onAddProvider(preset.name, preset.endpoint, undefined, true)
        if ((window as any).showToast) {
          (window as any).showToast({
            type: 'success',
            title: 'Provider Added',
            message: `${preset.name} has been successfully configured.`,
            duration: 3000
          })
        }
        onBack()
      } catch (error) {
        if ((window as any).showToast) {
          (window as any).showToast({
            type: 'error',
            title: 'Failed to Add Provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            duration: 5000
          })
        }
      } finally {
        setIsAdding(false)
      }
    } else {
      setSelectedPreset(preset)
      setApiKey('')
    }
  }

  const handleAddProvider = async () => {
    if (!selectedPreset || (!apiKey.trim() && !selectedPreset.isLocal)) return

    setIsAdding(true)
    try {
      await onAddProvider(
        selectedPreset.name,
        selectedPreset.endpoint,
        apiKey || undefined,
        selectedPreset.isLocal
      )
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'success',
          title: 'Provider Added',
          message: `${selectedPreset.name} has been successfully configured.`,
          duration: 3000
        })
      }
      onBack()
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to Add Provider',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleAddCustomProvider = async () => {
    if (!customProvider.name.trim() || !customProvider.endpoint.trim() || !apiKey.trim()) return

    setIsAdding(true)
    try {
      await onAddProvider(customProvider.name, customProvider.endpoint, apiKey, false)
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'success',
          title: 'Provider Added',
          message: `${customProvider.name} has been successfully configured.`,
          duration: 3000
        })
      }
      onBack()
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to Add Provider',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      }
    } finally {
      setIsAdding(false)
    }
  }

  const handleOpenApiKeyUrl = async () => {
    if (selectedPreset?.apiKeyUrl) {
      try {
        await openUrl(selectedPreset.apiKeyUrl)
      } catch {
        window.open(selectedPreset.apiKeyUrl, '_blank')
      }
    }
  }

  if (selectedPreset) {
    return (
      <div className="mobile-app flex flex-col bg-background text-foreground">
        <header className="mobile-header flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
          <button
            onClick={() => setSelectedPreset(null)}
            className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="font-semibold text-foreground/95">Configure {selectedPreset.name}</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto bg-background">
          <div className="p-4 space-y-6">
            <div className="text-sm text-muted-foreground">
              {selectedPreset.description}
            </div>

            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">API KEY</h2>
              <div className="space-y-4">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-4 py-3 bg-card border border-border/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
                {selectedPreset.apiKeyUrl && (
                  <button
                    onClick={handleOpenApiKeyUrl}
                    className="flex items-center gap-2 text-primary text-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Get API Key from {selectedPreset.name}
                  </button>
                )}
              </div>
            </section>

            <button
              onClick={handleAddProvider}
              disabled={!apiKey.trim() || isAdding}
              className="w-full px-4 py-4 rounded-2xl bg-primary text-white font-medium active:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (showCustom) {
    return (
      <div className="mobile-app flex flex-col bg-background text-foreground">
        <header className="mobile-header flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
          <button
            onClick={() => setShowCustom(false)}
            className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="font-semibold text-foreground/95">Custom Provider</h1>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto bg-background">
          <div className="p-4 space-y-6">
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">PROVIDER NAME</h2>
              <input
                type="text"
                value={customProvider.name}
                onChange={(e) => setCustomProvider({ ...customProvider, name: e.target.value })}
                placeholder="My Custom Provider"
                className="w-full px-4 py-3 bg-card border border-border/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </section>

            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">ENDPOINT URL</h2>
              <input
                type="url"
                value={customProvider.endpoint}
                onChange={(e) => setCustomProvider({ ...customProvider, endpoint: e.target.value })}
                placeholder="https://api.example.com/v1"
                className={clsx(
                  'w-full px-4 py-3 bg-card border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary',
                  customProvider.endpoint && !customProvider.endpoint.startsWith('http')
                    ? 'border-destructive'
                    : 'border-border/20'
                )}
              />
              {customProvider.endpoint && !customProvider.endpoint.startsWith('http') && (
                <p className="text-xs text-destructive mt-2 px-1">URL must start with http:// or https://</p>
              )}
            </section>

            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">API KEY</h2>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-4 py-3 bg-card border border-border/20 rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </section>

            <button
              onClick={handleAddCustomProvider}
              disabled={
                !customProvider.name.trim() ||
                !customProvider.endpoint.trim() ||
                !customProvider.endpoint.startsWith('http') ||
                !apiKey.trim() ||
                isAdding
              }
              className="w-full px-4 py-4 rounded-2xl bg-primary text-white font-medium active:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isAdding ? 'Adding...' : 'Add Provider'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mobile-app flex flex-col bg-background text-foreground">
      <header className="mobile-header flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border/10 glass-nav backdrop-blur-strong">
        <button
          onClick={onBack}
          className="p-2 -ml-2 rounded-xl elegant-hover text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Go back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <h1 className="font-semibold text-foreground/95">Add Provider</h1>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          {availableCloudPresets.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Cloud className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground">CLOUD PROVIDERS</h2>
              </div>
              <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
                {availableCloudPresets.map((preset, index) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-4 active:bg-accent/50 transition-colors',
                      index !== availableCloudPresets.length - 1 && 'border-b border-border/10'
                    )}
                  >
                    <div className="text-left">
                      <span className="text-foreground/90 font-medium">{preset.name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-3" />
                  </button>
                ))}
              </div>
            </section>
          )}

          {availableLocalPresets.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <Server className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-muted-foreground">LOCAL PROVIDERS</h2>
              </div>
              <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
                {availableLocalPresets.map((preset, index) => (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    disabled={isAdding}
                    className={clsx(
                      'w-full flex items-center justify-between px-4 py-4 active:bg-accent/50 transition-colors disabled:opacity-50',
                      index !== availableLocalPresets.length - 1 && 'border-b border-border/10'
                    )}
                  >
                    <div className="text-left">
                      <span className="text-foreground/90 font-medium">{preset.name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-3" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">CUSTOM</h2>
            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              <button
                onClick={() => setShowCustom(true)}
                className="w-full flex items-center justify-between px-4 py-4 active:bg-accent/50 transition-colors"
              >
                <div className="text-left">
                  <span className="text-foreground/90 font-medium">Custom Provider</span>
                  <p className="text-xs text-muted-foreground mt-0.5">Add a custom OpenAI-compatible endpoint</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-3" />
              </button>
            </div>
          </section>

          {availableCloudPresets.length === 0 && availableLocalPresets.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">All preset providers have been added</p>
              <p className="text-xs mt-1">You can still add custom providers</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
