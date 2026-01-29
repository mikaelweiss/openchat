import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { useSettings } from '../../hooks/useSettings'
import WelcomeScreen from './WelcomeScreen'
import ThemeSelectionScreen from './ThemeSelectionScreen'
import NameScreen from './NameScreen'
import HotkeyScreen from './HotkeyScreen'
import ProviderScreen from './ProviderScreen'

interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  isMobile?: boolean
}

type OnboardingScreen = 'welcome' | 'theme' | 'name' | 'hotkey' | 'provider'

export default function OnboardingModal({ isOpen, onClose, isMobile = false }: OnboardingModalProps) {
  const [currentScreen, setCurrentScreen] = useState<OnboardingScreen>('welcome')
  const { handleOnboardingCompletion } = useSettings()

  const screens: OnboardingScreen[] = ['welcome', 'theme', 'name', 'hotkey', 'provider']
  const currentIndex = screens.indexOf(currentScreen)

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      } else if (e.key === 'Enter' && currentScreen === 'welcome') {
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentScreen])

  const handleNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < screens.length) {
      setCurrentScreen(screens[nextIndex])
    } else {
      handleComplete()
    }
  }

  const handleBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) {
      setCurrentScreen(screens[prevIndex])
    }
  }

  const handleComplete = async () => {
    await handleOnboardingCompletion(true)
    onClose()
  }

  const handleClose = async () => {
    // Mark onboarding as completed even if they close early
    await handleOnboardingCompletion(true)
    onClose()
  }

  const handleSkipToEnd = () => {
    setCurrentScreen('provider')
  }

  if (!isOpen) return null

  const renderScreen = () => {
    switch (currentScreen) {
      case 'welcome':
        return <WelcomeScreen onNext={handleNext} />
      case 'theme':
        return <ThemeSelectionScreen onNext={handleNext} onBack={handleBack} />
      case 'name':
        return <NameScreen onNext={handleNext} onBack={handleBack} onSkip={handleSkipToEnd} />
      case 'hotkey':
        return <HotkeyScreen onNext={handleNext} onBack={handleBack} />
      case 'provider':
        return <ProviderScreen onComplete={handleComplete} onBack={handleBack} />
      default:
        return null
    }
  }

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${isMobile ? 'p-0' : 'p-4'}`}
      style={isMobile ? {
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      } : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className={`relative w-full bg-background border border-border shadow-xl overflow-hidden flex flex-col ${
        isMobile ? 'h-full rounded-none' : 'max-w-2xl max-h-[90vh] rounded-lg'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between border-b border-border ${isMobile ? 'p-4' : 'p-6'}`}>
          <div className="flex items-center space-x-3">
            <h2 className={`font-semibold text-foreground ${isMobile ? 'text-lg' : 'text-xl'}`}>Welcome to Open Chat</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-md hover:bg-accent transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close onboarding"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress indicator */}
        <div className={`border-b border-border ${isMobile ? 'px-4 py-2' : 'px-6 py-2'}`}>
          <div className="flex space-x-2">
            {screens.map((screen, index) => (
              <div
                key={screen}
                className={`h-1 flex-1 rounded-full ${
                  index <= currentIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Step {currentIndex + 1} of {screens.length}</span>
          </div>
        </div>

        {/* Content - scrollable */}
        <div className={`flex-1 overflow-y-auto ${isMobile ? 'min-h-0' : 'min-h-[400px]'}`}>
          {renderScreen()}
        </div>
      </div>
    </div>
  )
}