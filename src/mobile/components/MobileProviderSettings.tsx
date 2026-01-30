import { useState } from 'react'
import { ChevronLeft, RefreshCw, Trash2, Key, ExternalLink, AlertTriangle, Search, Eye, Volume2, FileText, ImageIcon, Brain, Hammer, Globe } from 'lucide-react'
import clsx from 'clsx'
import { Provider, ModelCapabilities } from '../../types/provider'
import { openUrl } from '@tauri-apps/plugin-opener'

interface MobileProviderSettingsProps {
  providerId: string
  provider: Provider
  onBack: () => void
  onUpdateApiKey: (providerId: string, apiKey: string) => Promise<void>
  onRefreshModels: (providerId: string) => Promise<void>
  onRemoveProvider: (providerId: string) => Promise<void>
  onToggleModel: (providerId: string, modelName: string, enabled: boolean) => void
  onCapabilityToggle: (modelId: string, providerId: string, capability: 'vision' | 'audio' | 'files' | 'image' | 'thinking' | 'tools' | 'webSearch', enabled: boolean) => void
  providerPreset?: { apiKeyUrl?: string }
}

function ModelCapabilityIcons({
  capabilities,
  modelId,
  providerId,
  onCapabilityToggle,
  expanded,
  onExpandToggle
}: {
  capabilities?: ModelCapabilities
  modelId?: string
  providerId?: string
  onCapabilityToggle?: (modelId: string, providerId: string, capability: 'vision' | 'audio' | 'files' | 'image' | 'thinking' | 'tools' | 'webSearch', enabled: boolean) => void
  expanded?: boolean
  onExpandToggle?: () => void
}) {
  if (!capabilities) return null

  const handleCapabilityClick = (capability: 'vision' | 'audio' | 'files' | 'image' | 'thinking' | 'tools' | 'webSearch') => {
    if (modelId && providerId && onCapabilityToggle) {
      const currentValue = capabilities[capability as keyof ModelCapabilities]
      onCapabilityToggle(modelId, providerId, capability, !currentValue)
    }
  }

  const capabilityItems = [
    { key: 'vision' as const, icon: Eye, enabled: capabilities.vision, color: 'text-blue-500', title: 'Vision' },
    { key: 'audio' as const, icon: Volume2, enabled: capabilities.audio, color: 'text-green-500', title: 'Audio' },
    { key: 'files' as const, icon: FileText, enabled: capabilities.files, color: 'text-orange-500', title: 'Files' },
    { key: 'image' as const, icon: ImageIcon, enabled: capabilities?.image || false, color: 'text-pink-500', title: 'Image' },
    { key: 'thinking' as const, icon: Brain, enabled: capabilities?.thinking || false, color: 'text-purple-500', title: 'Reasoning' },
    { key: 'tools' as const, icon: Hammer, enabled: capabilities?.tools || false, color: 'text-yellow-500', title: 'Tools' },
    { key: 'webSearch' as const, icon: Globe, enabled: capabilities?.webSearch || false, color: 'text-cyan-500', title: 'Web' }
  ]

  const isClickable = modelId && providerId && onCapabilityToggle
  const enabledCapabilities = capabilityItems.filter(item => item.enabled)
  const disabledCapabilities = capabilityItems.filter(item => !item.enabled)

  if (expanded) {
    return (
      <div className="mt-2 pt-2 border-t border-border/10">
        <div className="grid grid-cols-2 gap-2">
          {capabilityItems.map(({ key, icon: Icon, enabled, color, title }) => (
            <button
              key={key}
              onClick={() => isClickable && handleCapabilityClick(key)}
              className={clsx(
                "flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-left",
                enabled ? "bg-accent/30" : "bg-secondary/50",
                isClickable && "active:bg-accent/50"
              )}
            >
              <Icon className={clsx("w-4 h-4 flex-shrink-0", enabled ? color : "text-gray-400")} />
              <span className={clsx("text-xs", enabled ? "text-foreground" : "text-muted-foreground")}>
                {title}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={onExpandToggle}
          className="w-full mt-2 text-xs text-muted-foreground text-center py-1"
        >
          Collapse
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {enabledCapabilities.slice(0, 2).map(({ key, icon: Icon, color }) => (
        <div key={key} className="p-0.5">
          <Icon className={clsx("w-4 h-4", color)} />
        </div>
      ))}
      {(enabledCapabilities.length > 2 || disabledCapabilities.length > 0) && (
        <button
          onClick={onExpandToggle}
          className="text-xs text-primary px-1.5 py-0.5 rounded bg-primary/10 ml-1"
        >
          {enabledCapabilities.length > 2 ? `+${enabledCapabilities.length - 2}` : '···'}
        </button>
      )}
    </div>
  )
}

export default function MobileProviderSettings({
  providerId,
  provider,
  onBack,
  onUpdateApiKey,
  onRefreshModels,
  onRemoveProvider,
  onToggleModel,
  onCapabilityToggle,
  providerPreset
}: MobileProviderSettingsProps) {
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [isSavingKey, setIsSavingKey] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [latestOnly, setLatestOnly] = useState(false)
  const [showCapabilityLegend, setShowCapabilityLegend] = useState(false)
  const [expandedModel, setExpandedModel] = useState<string | null>(null)

  const handleRefreshModels = async () => {
    setIsRefreshing(true)
    try {
      await onRefreshModels(providerId)
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'success',
          title: 'Models Refreshed',
          message: `Successfully updated models for ${provider.name}.`,
          duration: 3000
        })
      }
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to Refresh',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleSaveApiKey = async () => {
    if (!newApiKey.trim()) return
    setIsSavingKey(true)
    try {
      await onUpdateApiKey(providerId, newApiKey)
      setNewApiKey('')
      setShowApiKeyInput(false)
      await onRefreshModels(providerId)
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'success',
          title: 'API Key Updated',
          message: 'API key has been successfully updated.',
          duration: 3000
        })
      }
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to Update',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      }
    } finally {
      setIsSavingKey(false)
    }
  }

  const handleRemoveProvider = async () => {
    try {
      await onRemoveProvider(providerId)
      onBack()
    } catch (error) {
      if ((window as any).showToast) {
        (window as any).showToast({
          type: 'error',
          title: 'Failed to Remove',
          message: error instanceof Error ? error.message : 'Unknown error',
          duration: 5000
        })
      }
    }
  }

  const handleOpenApiKeyUrl = async () => {
    if (providerPreset?.apiKeyUrl) {
      try {
        await openUrl(providerPreset.apiKeyUrl)
      } catch {
        window.open(providerPreset.apiKeyUrl, '_blank')
      }
    }
  }

  const hasDateSuffix = (modelName: string): boolean => {
    const datePatterns = [
      /-\d{8}$/,
      /-\d{4}-\d{2}-\d{2}$/,
      /-\d{4}$/,
      /-\d{6}$/,
    ]
    return datePatterns.some(pattern => pattern.test(modelName))
  }

  const getBaseModelName = (modelName: string): string => {
    return modelName
      .replace(/-\d{8}$/, '')
      .replace(/-\d{4}-\d{2}-\d{2}$/, '')
      .replace(/-\d{4}$/, '')
      .replace(/-\d{6}$/, '')
  }

  const allModels = provider.models || []

  let filteredModels = allModels.filter(model =>
    model.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (latestOnly) {
    const modelsByBase = filteredModels.reduce((acc, model) => {
      const baseName = getBaseModelName(model)
      if (!acc[baseName]) {
        acc[baseName] = []
      }
      acc[baseName].push(model)
      return acc
    }, {} as Record<string, string[]>)

    filteredModels = filteredModels.filter(model => {
      const baseName = getBaseModelName(model)
      const modelsWithSameBase = modelsByBase[baseName]

      if (modelsWithSameBase.length === 1) {
        return true
      }

      const hasNonDatedVersion = modelsWithSameBase.some(m => !hasDateSuffix(m))

      if (hasNonDatedVersion) {
        return !hasDateSuffix(model)
      }

      return true
    })
  }

  const sortedModels = filteredModels.sort((a, b) => a.localeCompare(b))

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
        <h1 className="font-semibold text-foreground/95">{provider.name}</h1>
        <div className={clsx(
          'w-2 h-2 rounded-full ml-auto',
          provider.connected ? 'bg-green-500' : 'bg-gray-400'
        )} />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-6">
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">STATUS</h2>
            <div className="bg-card rounded-2xl border border-border/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-foreground/90 font-medium">
                    {provider.connected ? 'Connected' : 'Disconnected'}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {provider.enabledModels?.length || 0} of {provider.models?.length || 0} models enabled
                  </p>
                </div>
                <button
                  onClick={handleRefreshModels}
                  disabled={isRefreshing}
                  className="p-3 rounded-xl bg-primary/10 text-primary active:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={clsx('h-5 w-5', isRefreshing && 'animate-spin')} />
                </button>
              </div>
            </div>
          </section>

          {!provider.isLocal && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">API KEY</h2>
              <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
                {showApiKeyInput ? (
                  <div className="p-4 space-y-4">
                    <input
                      type="password"
                      value={newApiKey}
                      onChange={(e) => setNewApiKey(e.target.value)}
                      placeholder="Enter new API key"
                      className="w-full px-4 py-3 bg-secondary rounded-xl focus:outline-none focus:ring-2 focus:ring-primary"
                      autoFocus
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setShowApiKeyInput(false)
                          setNewApiKey('')
                        }}
                        className="flex-1 px-4 py-3 rounded-xl bg-secondary text-foreground active:bg-accent transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveApiKey}
                        disabled={!newApiKey.trim() || isSavingKey}
                        className="flex-1 px-4 py-3 rounded-xl bg-primary text-white active:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isSavingKey ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setShowApiKeyInput(true)}
                      className="w-full flex items-center justify-between px-4 py-4 active:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Key className="h-5 w-5 text-muted-foreground" />
                        <span className="text-foreground/90">Update API Key</span>
                      </div>
                    </button>
                    {providerPreset?.apiKeyUrl && (
                      <button
                        onClick={handleOpenApiKeyUrl}
                        className="w-full flex items-center justify-between px-4 py-4 border-t border-border/10 active:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <ExternalLink className="h-5 w-5 text-muted-foreground" />
                          <span className="text-foreground/90">Get API Key</span>
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-semibold text-muted-foreground">MODELS</h2>
              <button
                onClick={() => setShowCapabilityLegend(!showCapabilityLegend)}
                className="text-xs text-primary"
              >
                {showCapabilityLegend ? 'Hide' : 'Show'} Legend
              </button>
            </div>

            {showCapabilityLegend && (
              <div className="bg-card rounded-2xl border border-border/20 p-4 mb-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <h5 className="font-medium mb-2 text-muted-foreground">Input</h5>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-blue-500" />
                        <span>Vision</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Volume2 className="w-4 h-4 text-green-500" />
                        <span>Audio</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-orange-500" />
                        <span>Files</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2 text-muted-foreground">Output</h5>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-pink-500" />
                        <span>Images</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4 text-purple-500" />
                        <span>Reasoning</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Hammer className="w-4 h-4 text-yellow-500" />
                        <span>Tools</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="w-4 h-4 text-cyan-500" />
                        <span>Web Search</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden mb-4">
              <div className="p-3 border-b border-border/10">
                <div className="flex items-center gap-3">
                  <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-secondary rounded-xl">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search models..."
                      className="flex-1 bg-transparent focus:outline-none text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    id="latest-only-mobile"
                    checked={latestOnly}
                    onChange={(e) => setLatestOnly(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <label htmlFor="latest-only-mobile" className="text-sm text-muted-foreground">
                    Latest only
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              {sortedModels.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  {allModels.length === 0 ? (
                    <>
                      <p className="text-sm">No models available</p>
                      <p className="text-xs mt-1">Refresh to fetch available models</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">No models match your search</p>
                      <p className="text-xs mt-1">Try a different search term</p>
                    </>
                  )}
                </div>
              ) : (
                sortedModels.map((modelName, index) => {
                  const isEnabled = provider.enabledModels?.includes(modelName)
                  const capabilities = provider.modelCapabilities?.[modelName]
                  const isExpanded = expandedModel === modelName

                  return (
                    <div
                      key={modelName}
                      className={clsx(
                        'px-4 py-3',
                        index !== sortedModels.length - 1 && 'border-b border-border/10'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => onToggleModel(providerId, modelName, e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className={clsx(
                            "text-sm block truncate",
                            isEnabled ? "text-foreground/90" : "text-muted-foreground"
                          )}>
                            {modelName}
                          </span>
                        </div>
                        {!isExpanded && (
                          <ModelCapabilityIcons
                            capabilities={capabilities}
                            modelId={modelName}
                            providerId={providerId}
                            onCapabilityToggle={onCapabilityToggle}
                            expanded={false}
                            onExpandToggle={() => setExpandedModel(modelName)}
                          />
                        )}
                      </div>
                      {isExpanded && (
                        <ModelCapabilityIcons
                          capabilities={capabilities}
                          modelId={modelName}
                          providerId={providerId}
                          onCapabilityToggle={onCapabilityToggle}
                          expanded={true}
                          onExpandToggle={() => setExpandedModel(null)}
                        />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">DANGER ZONE</h2>
            <div className="bg-card rounded-2xl border border-destructive/20 overflow-hidden">
              <button
                onClick={() => setShowRemoveConfirm(true)}
                className="w-full flex items-center justify-between px-4 py-4 active:bg-destructive/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <span className="text-destructive">Remove Provider</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      </div>

      {showRemoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowRemoveConfirm(false)} />
          <div className="relative w-full max-w-lg bg-background rounded-t-3xl p-6 pb-safe animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <h3 className="text-lg font-semibold">Remove Provider</h3>
            </div>
            <p className="text-muted-foreground mb-6">
              Are you sure you want to remove <span className="font-medium text-foreground">{provider.name}</span>?
              This will remove all configuration for this provider.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-secondary text-foreground active:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRemoveProvider}
                className="flex-1 px-4 py-3 rounded-xl bg-destructive text-white active:bg-destructive/90 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
