import { useState, useEffect } from 'react'
import { X, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

export interface ConversationSettings {
  temperature: number
  max_tokens: number
  top_p: number
  frequency_penalty: number
  presence_penalty: number
  stop: string[]
  n: number
  seed?: number
}

export const defaultSettings: ConversationSettings = {
  temperature: 1.0,
  max_tokens: 4096,
  top_p: 1.0,
  frequency_penalty: 0.0,
  presence_penalty: 0.0,
  stop: [],
  n: 1,
  seed: undefined
}

interface MobileConversationSettingsProps {
  isOpen: boolean
  onClose: () => void
  settings: ConversationSettings | null
  onSave: (settings: ConversationSettings) => void
}

export default function MobileConversationSettings({
  isOpen,
  onClose,
  settings,
  onSave
}: MobileConversationSettingsProps) {
  const [formSettings, setFormSettings] = useState<ConversationSettings>(settings || defaultSettings)
  const [stopSequences, setStopSequences] = useState<string>((settings?.stop || []).join('\n'))
  const [showAdvanced, setShowAdvanced] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setFormSettings(settings || defaultSettings)
      setStopSequences((settings?.stop || []).join('\n'))
    }
  }, [isOpen, settings])

  const handleSave = () => {
    const updatedSettings = {
      ...formSettings,
      stop: stopSequences.split('\n').filter(s => s.trim() !== '').slice(0, 4)
    }
    onSave(updatedSettings)
    onClose()
  }

  const handleReset = () => {
    setFormSettings(defaultSettings)
    setStopSequences(defaultSettings.stop.join('\n'))
  }

  const updateSetting = (key: keyof ConversationSettings, value: any) => {
    setFormSettings(prev => ({
      ...prev,
      [key]: value
    }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative w-full max-h-[85vh] bg-background rounded-t-3xl overflow-hidden animate-slide-up">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/10">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Conversation Settings</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="p-2 rounded-xl elegant-hover text-muted-foreground hover:text-primary transition-colors"
              aria-label="Reset to defaults"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl elegant-hover text-muted-foreground hover:text-primary transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(85vh-130px)] p-4 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Temperature</label>
              <span className="text-sm text-muted-foreground px-2 py-0.5 bg-secondary rounded-lg">
                {formSettings.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={formSettings.temperature}
              onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
              className="w-full accent-primary h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Lower = focused, Higher = creative
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Max Tokens</label>
              <input
                type="number"
                min="1"
                max="32000"
                value={formSettings.max_tokens}
                onChange={(e) => updateSetting('max_tokens', parseInt(e.target.value) || 1)}
                className="w-24 px-3 py-1.5 text-sm bg-secondary rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Maximum response length
            </p>
          </section>

          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">Top P</label>
              <span className="text-sm text-muted-foreground px-2 py-0.5 bg-secondary rounded-lg">
                {formSettings.top_p.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={formSettings.top_p}
              onChange={(e) => updateSetting('top_p', parseFloat(e.target.value))}
              className="w-full accent-primary h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Nucleus sampling threshold
            </p>
          </section>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full flex items-center justify-between px-4 py-3 bg-secondary rounded-xl"
          >
            <span className="font-medium text-foreground/90">Advanced Settings</span>
            {showAdvanced ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </button>

          {showAdvanced && (
            <div className="space-y-6 pt-2">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Frequency Penalty</label>
                  <span className="text-sm text-muted-foreground px-2 py-0.5 bg-secondary rounded-lg">
                    {formSettings.frequency_penalty.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={formSettings.frequency_penalty}
                  onChange={(e) => updateSetting('frequency_penalty', parseFloat(e.target.value))}
                  className="w-full accent-primary h-2"
                />
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Presence Penalty</label>
                  <span className="text-sm text-muted-foreground px-2 py-0.5 bg-secondary rounded-lg">
                    {formSettings.presence_penalty.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="-2"
                  max="2"
                  step="0.1"
                  value={formSettings.presence_penalty}
                  onChange={(e) => updateSetting('presence_penalty', parseFloat(e.target.value))}
                  className="w-full accent-primary h-2"
                />
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Completions (N)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formSettings.n}
                    onChange={(e) => updateSetting('n', parseInt(e.target.value) || 1)}
                    className="w-16 px-3 py-1.5 text-sm bg-secondary rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Seed</label>
                  <input
                    type="number"
                    min="0"
                    value={formSettings.seed || ''}
                    onChange={(e) => updateSetting('seed', e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Random"
                    className="w-24 px-3 py-1.5 text-sm bg-secondary rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </section>

              <section>
                <label className="text-sm font-medium text-foreground mb-2 block">Stop Sequences</label>
                <textarea
                  value={stopSequences}
                  onChange={(e) => setStopSequences(e.target.value)}
                  placeholder="One per line (max 4)"
                  rows={3}
                  className={clsx(
                    'w-full px-4 py-3 bg-secondary rounded-xl text-sm',
                    'placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary'
                  )}
                />
              </section>
            </div>
          )}
        </div>

        <div className="px-4 py-4 border-t border-border/10 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl bg-secondary text-foreground font-medium active:bg-accent transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-3 rounded-xl bg-primary text-white font-medium active:bg-primary/90 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
