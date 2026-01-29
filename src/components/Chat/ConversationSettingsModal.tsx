import { X, RotateCcw, Settings } from 'lucide-react'
import { useState, useEffect } from 'react'
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

interface ConversationSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  settings: ConversationSettings | null
  onSave: (settings: ConversationSettings) => void
  conversationId: number | 'pending' | null
  maxTemperature?: number
}

export default function ConversationSettingsModal({
  isOpen,
  onClose,
  settings,
  onSave,
  maxTemperature = 2
}: ConversationSettingsModalProps) {
  const [formSettings, setFormSettings] = useState<ConversationSettings>(settings || defaultSettings)
  const [stopSequences, setStopSequences] = useState<string>((settings?.stop || []).join('\n'))

  useEffect(() => {
    if (isOpen) {
      setFormSettings(settings || defaultSettings)
      setStopSequences((settings?.stop || []).join('\n'))
    }
  }, [isOpen, settings])

  const handleSave = () => {
    const updatedSettings = {
      ...formSettings,
      stop: stopSequences.split('\n').filter(s => s.trim() !== '').slice(0, 4) // Max 4 stop sequences
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[80vh] glass-effect border border-border/20 rounded-2xl shadow-elegant-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 glass-nav backdrop-blur-strong border-b border-border/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Conversation Settings</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="p-2 elegant-hover rounded-xl text-muted-foreground hover:text-primary transition-colors"
                title="Reset to defaults"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 elegant-hover rounded-xl text-muted-foreground hover:text-primary transition-colors"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize AI behavior for this conversation
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)] elegant-scrollbar">
          <div className="space-y-6">
            
            {/* Temperature */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Temperature</label>
                <span className="text-sm text-muted-foreground">{formSettings.temperature}</span>
              </div>
              <input
                type="range"
                min="0"
                max={maxTemperature}
                step="0.1"
                value={Math.min(formSettings.temperature, maxTemperature)}
                onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Controls randomness. Lower values (0.2) make output focused, higher values (0.8) make it creative.
              </p>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Max Tokens</label>
                <input
                  type="number"
                  min="1"
                  max="4096"
                  value={formSettings.max_tokens}
                  onChange={(e) => updateSetting('max_tokens', parseInt(e.target.value) || 1)}
                  className="w-20 px-2 py-1 text-sm elegant-input-container rounded-lg text-right"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum number of tokens to generate in the response.
              </p>
            </div>

            {/* Top P */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Top P</label>
                <span className="text-sm text-muted-foreground">{formSettings.top_p}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={formSettings.top_p}
                onChange={(e) => updateSetting('top_p', parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Alternative to temperature. 0.1 means only tokens with top 10% probability are considered.
              </p>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-4 border-t border-border/10">
              <h3 className="text-sm font-semibold text-foreground mb-4">Advanced Settings</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Frequency Penalty */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Frequency Penalty</label>
                    <span className="text-sm text-muted-foreground">{formSettings.frequency_penalty}</span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={formSettings.frequency_penalty}
                    onChange={(e) => updateSetting('frequency_penalty', parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Penalizes repeated tokens based on frequency of use.
                  </p>
                </div>

                {/* Presence Penalty */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Presence Penalty</label>
                    <span className="text-sm text-muted-foreground">{formSettings.presence_penalty}</span>
                  </div>
                  <input
                    type="range"
                    min="-2"
                    max="2"
                    step="0.1"
                    value={formSettings.presence_penalty}
                    onChange={(e) => updateSetting('presence_penalty', parseFloat(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <p className="text-xs text-muted-foreground">
                    Penalizes tokens that have already appeared.
                  </p>
                </div>

                {/* N (Number of completions) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Number of Completions</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={formSettings.n}
                      onChange={(e) => updateSetting('n', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 text-sm elegant-input-container rounded-lg text-right"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Number of response alternatives to generate (max 10).
                  </p>
                </div>

                {/* Seed */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Seed</label>
                    <input
                      type="number"
                      min="0"
                      value={formSettings.seed || ''}
                      onChange={(e) => updateSetting('seed', e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Random"
                      className="w-24 px-2 py-1 text-sm elegant-input-container rounded-lg text-right"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Deterministic seed for reproducible results (beta).
                  </p>
                </div>

              </div>
            </div>

            {/* Stop Sequences */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Stop Sequences</label>
              <textarea
                value={stopSequences}
                onChange={(e) => setStopSequences(e.target.value)}
                placeholder="Enter stop sequences, one per line (max 4)"
                rows={3}
                className={clsx(
                  'w-full px-3 py-2 elegant-input-container rounded-lg text-sm',
                  'placeholder:text-muted-foreground resize-none elegant-scrollbar'
                )}
              />
              <p className="text-xs text-muted-foreground">
                Sequences where AI will stop generating. One per line, maximum 4 sequences.
              </p>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 glass-nav backdrop-blur-strong border-t border-border/10 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium elegant-hover rounded-xl text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium elegant-button rounded-xl text-white"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}