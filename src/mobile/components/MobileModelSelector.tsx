import { useMemo } from 'react'
import { X, Check, Eye, Volume2, FileText, Brain, Zap } from 'lucide-react'
import clsx from 'clsx'
import { useProviders } from '../../stores/appStore'
import { type ModelCapabilities } from '../../types/provider'

interface MobileModelSelectorProps {
  isOpen: boolean
  onClose: () => void
  selectedProvider?: string
  selectedModel?: string
  onSelect: (provider: string, model: string) => void
}

export default function MobileModelSelector({
  isOpen,
  onClose,
  selectedProvider,
  selectedModel,
  onSelect
}: MobileModelSelectorProps) {
  const { providers } = useProviders()

  const groupedModels = useMemo(() => {
    if (!providers) return []

    const groups: Array<{
      providerId: string
      providerName: string
      models: Array<{
        name: string
        capabilities?: ModelCapabilities
      }>
    }> = []

    Object.entries(providers).forEach(([providerId, provider]) => {
      if (provider.connected && provider.enabledModels && provider.enabledModels.length > 0) {
        groups.push({
          providerId,
          providerName: provider.name,
          models: provider.enabledModels.map(modelName => ({
            name: modelName,
            capabilities: provider.modelCapabilities?.[modelName]
          }))
        })
      }
    })

    return groups
  }, [providers])

  const handleSelect = (providerId: string, modelName: string) => {
    onSelect(providerId, modelName)
    onClose()
  }

  if (!isOpen) return null

  const CapabilityBadge = ({ icon: Icon, label }: { icon: any; label: string }) => (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative w-full max-h-[70vh] bg-background rounded-t-3xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/10">
          <h2 className="text-lg font-semibold text-foreground">Select Model</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl elegant-hover text-muted-foreground hover:text-primary transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(70vh-65px)]">
          {groupedModels.length === 0 ? (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p className="text-sm">No models available</p>
              <p className="text-xs mt-1">Configure a provider in Settings</p>
            </div>
          ) : (
            groupedModels.map(group => (
              <div key={group.providerId} className="py-2">
                <div className="px-4 py-2 text-xs font-semibold text-muted-foreground tracking-wide">
                  {group.providerName.toUpperCase()}
                </div>
                <div className="space-y-0.5">
                  {group.models.map(model => {
                    const isSelected = selectedProvider === group.providerId && selectedModel === model.name
                    const caps = model.capabilities

                    return (
                      <button
                        key={model.name}
                        onClick={() => handleSelect(group.providerId, model.name)}
                        className={clsx(
                          'w-full flex items-start justify-between px-4 py-3 transition-colors',
                          isSelected
                            ? 'bg-primary/10'
                            : 'active:bg-accent/50'
                        )}
                      >
                        <div className="flex-1 text-left">
                          <div className="flex items-center gap-2">
                            <span className={clsx(
                              'font-medium text-sm',
                              isSelected ? 'text-primary' : 'text-foreground/90'
                            )}>
                              {model.name}
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>
                          {caps && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {caps.vision && <CapabilityBadge icon={Eye} label="Vision" />}
                              {caps.audio && <CapabilityBadge icon={Volume2} label="Audio" />}
                              {caps.files && <CapabilityBadge icon={FileText} label="Files" />}
                              {caps.thinking && <CapabilityBadge icon={Brain} label="Thinking" />}
                              {caps.tools && <CapabilityBadge icon={Zap} label="Tools" />}
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
