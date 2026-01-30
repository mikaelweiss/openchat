import { useState } from 'react'
import { ChevronRight, Sun, Moon, Monitor, Check, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { useSettings } from '../../hooks/useSettings'
import Logo from '../../assets/Logo.svg'

interface MobileOnboardingProps {
  onComplete: () => void
}

type OnboardingStep = 'welcome' | 'theme' | 'provider'

export default function MobileOnboarding({ onComplete }: MobileOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('welcome')
  const { theme, handleThemeChange, handleOnboardingCompletion } = useSettings()

  const handleFinish = async () => {
    await handleOnboardingCompletion(true)
    onComplete()
  }

  const handleSkip = async () => {
    await handleOnboardingCompletion(true)
    onComplete()
  }

  const steps: OnboardingStep[] = ['welcome', 'theme', 'provider']
  const currentIndex = steps.indexOf(currentStep)

  const themeOptions = [
    { value: 'light' as const, label: 'Light', icon: Sun, description: 'Bright and clear' },
    { value: 'dark' as const, label: 'Dark', icon: Moon, description: 'Easy on the eyes' },
    { value: 'system' as const, label: 'System', icon: Monitor, description: 'Follow device' }
  ]

  return (
    <div className="fixed inset-0 z-50 bg-background text-foreground flex flex-col">
      <div className="flex-1 overflow-y-auto">
        {currentStep === 'welcome' && (
          <div className="flex flex-col items-center justify-center min-h-full p-8">
            <img src={Logo} alt="Open Chat" className="h-24 w-24 mb-6" />
            <h1 className="text-2xl font-bold text-foreground mb-2">Welcome to Open Chat</h1>
            <p className="text-center text-muted-foreground mb-8 max-w-xs">
              A modern AI chat app that puts you in control.
            </p>

            <div className="space-y-4 w-full max-w-xs">
              <div className="flex items-start gap-3 p-4 bg-secondary rounded-2xl">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-foreground text-sm">Multiple Providers</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Connect to OpenAI, Anthropic, and more</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-secondary rounded-2xl">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-foreground text-sm">Your API Keys</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Stored securely on your device</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-secondary rounded-2xl">
                <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-foreground text-sm">Cross-Platform</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Desktop, iOS, and Android</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 'theme' && (
          <div className="flex flex-col p-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">Choose Your Theme</h1>
            <p className="text-muted-foreground mb-8">
              How would you like Open Chat to look?
            </p>

            <div className="space-y-3">
              {themeOptions.map(option => {
                const Icon = option.icon
                const isSelected = theme === option.value
                return (
                  <button
                    key={option.value}
                    onClick={() => handleThemeChange(option.value)}
                    className={clsx(
                      'w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all',
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border/20 bg-secondary active:border-primary/50'
                    )}
                  >
                    <div className={clsx(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      isSelected ? 'bg-primary text-white' : 'bg-accent text-muted-foreground'
                    )}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-medium text-foreground">{option.label}</h3>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                    {isSelected && <Check className="h-5 w-5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {currentStep === 'provider' && (
          <div className="flex flex-col p-8">
            <h1 className="text-2xl font-bold text-foreground mb-2">Add a Provider</h1>
            <p className="text-muted-foreground mb-8">
              You can configure AI providers now or later in Settings.
            </p>

            <div className="bg-secondary rounded-2xl p-6 text-center">
              <p className="text-sm text-muted-foreground mb-4">
                To start chatting, you'll need to add at least one AI provider with an API key.
              </p>
              <p className="text-xs text-muted-foreground">
                You can configure providers in Settings after completing setup.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 p-4 border-t border-border/10 glass-nav backdrop-blur-strong">
        <div className="flex gap-2 mb-4">
          {steps.map((_, index) => (
            <div
              key={index}
              className={clsx(
                'h-1 flex-1 rounded-full transition-colors',
                index <= currentIndex ? 'bg-primary' : 'bg-muted'
              )}
            />
          ))}
        </div>

        <div className="flex gap-3">
          {currentIndex > 0 && (
            <button
              onClick={() => setCurrentStep(steps[currentIndex - 1])}
              className="flex-1 px-4 py-3 rounded-2xl bg-secondary text-foreground font-medium active:bg-accent transition-colors"
            >
              Back
            </button>
          )}
          {currentIndex === 0 && (
            <button
              onClick={handleSkip}
              className="px-4 py-3 rounded-2xl text-muted-foreground font-medium active:text-foreground transition-colors"
            >
              Skip
            </button>
          )}
          <button
            onClick={() => {
              if (currentIndex < steps.length - 1) {
                setCurrentStep(steps[currentIndex + 1])
              } else {
                handleFinish()
              }
            }}
            className="flex-1 px-4 py-3 rounded-2xl bg-primary text-white font-medium flex items-center justify-center gap-2 active:bg-primary/90 transition-colors"
          >
            {currentIndex === steps.length - 1 ? 'Get Started' : 'Continue'}
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
