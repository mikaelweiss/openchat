import { ChevronLeft, Sun, Moon, Monitor, Check } from 'lucide-react'
import clsx from 'clsx'
import { useSettings } from '../../hooks/useSettings'
import { useProviders } from '../../stores/appStore'
import Logo from '../../assets/Logo.svg'

interface MobileSettingsProps {
  onBack: () => void
}

export default function MobileSettings({ onBack }: MobileSettingsProps) {
  const { theme, handleThemeChange } = useSettings()
  const { providers } = useProviders()

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor }
  ]

  const connectedProviders = Object.entries(providers || {}).filter(
    ([_, provider]) => provider.connected
  )

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
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-1">CONNECTED PROVIDERS</h2>
            <div className="bg-card rounded-2xl border border-border/20 overflow-hidden">
              {connectedProviders.length === 0 ? (
                <div className="px-4 py-6 text-center text-muted-foreground">
                  <p className="text-sm">No providers connected</p>
                  <p className="text-xs mt-1">Configure providers in the desktop app</p>
                </div>
              ) : (
                connectedProviders.map(([id, provider], index) => (
                  <div
                    key={id}
                    className={clsx(
                      'flex items-center justify-between px-4 py-3',
                      index !== connectedProviders.length - 1 && 'border-b border-border/10'
                    )}
                  >
                    <div>
                      <span className="text-foreground/90 font-medium">{provider.name}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {provider.enabledModels?.length || 0} model
                        {(provider.enabledModels?.length || 0) !== 1 ? 's' : ''} enabled
                      </p>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                  </div>
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
