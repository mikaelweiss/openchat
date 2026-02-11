import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Zap, Command } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'

interface HotkeyScreenProps {
  onNext: () => void
  onBack: () => void
}

const isMac = navigator.platform.toLowerCase().includes('mac')

const presetHotkeys = [
  { value: isMac ? 'Command+Shift+O' : 'Control+Shift+O' },
  { value: isMac ? 'Command+Alt+C' : 'Control+Alt+C' },
  { value: isMac ? 'Command+Shift+Space' : 'Control+Shift+Space' },
  { value: 'F1' },
]

function formatHotkeyDisplay(hotkey: string): string {
  if (!hotkey || !hotkey.trim()) return ''
  return hotkey.split('+').map(key => {
    switch (key.toLowerCase()) {
      case 'control': case 'ctrl': return '^'
      case 'command': case 'cmd': return '⌘'
      case 'alt': return '⌥'
      case 'shift': return '⇧'
      case 'space': return 'Space'
      default: return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
    }
  }).join(' ')
}

export default function HotkeyScreen({ onNext, onBack }: HotkeyScreenProps) {
  const { globalHotkey, handleGlobalHotkeyChange } = useSettings()
  const [hotkey, setHotkey] = useState(globalHotkey || '')
  const [isRecording, setIsRecording] = useState(false)
  const [capturedKeys, setCapturedKeys] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isRecording) return

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const keys = []
      if (e.ctrlKey) keys.push('Control')
      if (e.metaKey) keys.push('Command')
      if (e.altKey) keys.push('Alt')
      if (e.shiftKey) keys.push('Shift')

      // Add the main key if it's not a modifier
      if (!['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
        if (e.key === ' ') {
          keys.push('Space')
        } else if (e.code.startsWith('Key')) {
          keys.push(e.code.replace('Key', ''))
        } else if (e.key.length === 1) {
          keys.push(e.key.toUpperCase())
        } else {
          keys.push(e.key)
        }
      }

      if (keys.length > 0) {
        setCapturedKeys(keys)

        // Auto-save if we have at least one modifier + one key
        const modifiers = keys.filter(k => ['Control', 'Command', 'Alt', 'Shift'].includes(k))
        const nonModifiers = keys.filter(k => !['Control', 'Command', 'Alt', 'Shift'].includes(k))

        if (modifiers.length > 0 && nonModifiers.length > 0) {
          const hotkeyString = keys.join('+')
          setHotkey(hotkeyString)
          setIsRecording(false)
          setCapturedKeys([])
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
    }
  }, [isRecording])

  const handleStartRecording = () => {
    setIsRecording(true)
    setCapturedKeys([])
    inputRef.current?.focus()
  }

  const handleStopRecording = () => {
    setIsRecording(false)
    setCapturedKeys([])
  }

  const handlePresetSelect = (presetValue: string) => {
    setHotkey(presetValue)
  }

  const handleContinue = async () => {
    if (hotkey) {
      await handleGlobalHotkeyChange(hotkey)
    }
    onNext()
  }

  const displayHotkey = isRecording && capturedKeys.length > 0
    ? capturedKeys.join(' + ')
    : formatHotkeyDisplay(hotkey)

  return (
    <div className="flex-1 flex flex-col p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Zap className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Access Open Chat from anywhere</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Set up a global hotkey to quickly open Open Chat from any application on your system.
        </p>
      </div>

      {/* Hotkey input */}
      <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
        <div className="space-y-6">
          <div>
            <label htmlFor="hotkey" className="block text-sm font-medium text-foreground mb-2">
              Global Hotkey
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="hotkey"
                type="text"
                value={displayHotkey}
                readOnly
                placeholder={isRecording ? "Press your desired hotkey combination..." : "Click to record hotkey"}
                onClick={handleStartRecording}
                className={`w-full px-4 py-3 bg-background border rounded-lg text-foreground placeholder:text-muted-foreground cursor-pointer font-mono ${
                  isRecording ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'
                }`}
              />
              {isRecording && (
                <button
                  onClick={handleStopRecording}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-xs bg-primary text-primary-foreground rounded"
                >
                  Stop
                </button>
              )}
            </div>
            {isRecording && (
              <p className="text-xs text-muted-foreground mt-1">
                Press a key combination (e.g., Cmd+Shift+O)
              </p>
            )}
          </div>

          {/* Preset options */}
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Or choose a preset:</p>
            <div className="grid grid-cols-2 gap-3">
              {presetHotkeys.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetSelect(preset.value)}
                  className={`px-4 py-3 rounded-lg border text-sm font-mono transition-colors ${
                    hotkey === preset.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border hover:border-primary/50 text-foreground hover:bg-accent'
                  }`}
                >
                  {formatHotkeyDisplay(preset.value)}
                </button>
              ))}
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start space-x-3 p-4 bg-accent/50 rounded-lg border border-border">
            <Command className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm">
              <p className="text-foreground font-medium mb-1">Quick Access</p>
              <p className="text-muted-foreground">
                Once set, you can press your hotkey from any application to instantly open Open Chat.
                You can always change or disable this later in settings.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center pt-6 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>
        
        <button
          onClick={handleContinue}
          className="flex items-center space-x-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <span>{hotkey ? 'Continue' : 'Skip for now'}</span>
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}