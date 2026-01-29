import { useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, Trash2, Key, ExternalLink, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { Provider } from '../../types/provider'
import { openUrl } from '@tauri-apps/plugin-opener'

interface MobileProviderSettingsProps {
  providerId: string
  provider: Provider
  onBack: () => void
  onUpdateApiKey: (providerId: string, apiKey: string) => Promise<void>
  onRefreshModels: (providerId: string) => Promise<void>
  onRemoveProvider: (providerId: string) => Promise<void>
  providerPreset?: { apiKeyUrl?: string }
}

export default function MobileProviderSettings({
  providerId,
  provider,
  onBack,
  onUpdateApiKey,
  onRefreshModels,
  onRemoveProvider,
  providerPreset
}: MobileProviderSettingsProps) {
  const [showApiKeyInput, setShowApiKeyInput] = useState(false)
  const [newApiKey, setNewApiKey] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [isSavingKey, setIsSavingKey] = useState(false)

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
        <h1 className="font-semibold text-foreground/95">{provider.name}</h1>
        <div className={clsx(
          'w-2 h-2 rounded-full ml-auto',
          provider.connected ? 'bg-green-500' : 'bg-gray-400'
        )} />
      </header>

      <div className="flex-1 overflow-y-auto">
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
                    {provider.enabledModels?.length || 0} model{(provider.enabledModels?.length || 0) !== 1 ? 's' : ''} enabled
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
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
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
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">ENABLED MODELS</h2>
            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              {provider.enabledModels?.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  <p className="text-sm">No models enabled</p>
                  <p className="text-xs mt-1">Refresh to fetch available models</p>
                </div>
              ) : (
                provider.enabledModels?.map((modelName, index) => (
                  <div
                    key={modelName}
                    className={clsx(
                      'px-4 py-3',
                      index !== (provider.enabledModels?.length || 0) - 1 && 'border-b border-border/10'
                    )}
                  >
                    <span className="text-foreground/90 text-sm">{modelName}</span>
                  </div>
                ))
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
