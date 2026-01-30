import { useEffect, useRef, useState, useCallback } from 'react'
import { ArrowRight } from 'lucide-react'
import audioFile from '../../assets/logo-sting.mp3'
import backgroundUrl from './background.html?url'
import './IntroAnimation.css'

interface IntroAnimationProps {
  onComplete: () => void
}

export default function IntroAnimation({ onComplete }: IntroAnimationProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  const [showText, setShowText] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const [textLetters, setTextLetters] = useState<string[]>([])
  const [fadeOut, setFadeOut] = useState(false)

  const text = "Welcome to Open Chat"

  // Load and play audio
  useEffect(() => {
    const audio = new Audio(audioFile)
    audio.volume = 0.3 // Set a comfortable volume
    audioRef.current = audio

    // Preload audio
    audio.addEventListener('canplaythrough', () => {
      // Audio is ready
    })

    audio.addEventListener('error', (e) => {
      console.warn('Audio failed to load:', e)
      // Continue without audio
    })

    // Start playing audio after a short delay
    const playTimer = setTimeout(() => {
      audio.play().catch(err => {
        console.warn('Audio playback failed:', err)
        // Continue without audio if autoplay is blocked
      })
    }, 500)

    return () => {
      clearTimeout(playTimer)
      audio.pause()
      audio.src = ''
    }
  }, [])

  // Show text animation after 5 seconds
  useEffect(() => {
    const textTimer = setTimeout(() => {
      setShowText(true)
      // Animate letters one by one with reduced delay for smoother animation
      const letters = text.split('')
      letters.forEach((letter, index) => {
        setTimeout(() => {
          setTextLetters(prev => [...prev, letter])
        }, index * 30) // Reduced from 50ms to 30ms for faster, smoother animation
      })
    }, 4500)

    return () => clearTimeout(textTimer)
  }, [])

  // Show continue button after 12 seconds
  useEffect(() => {
    const buttonTimer = setTimeout(() => {
      setShowButton(true)
    }, 10000)

    return () => clearTimeout(buttonTimer)
  }, [])


  // Handle completion
  const handleComplete = useCallback(() => {
    // Fade out animation
    setFadeOut(true)
    
    // Stop audio
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // Complete after fade animation
    setTimeout(() => {
      onComplete()
    }, 1000)
  }, [onComplete])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && showButton) {
        handleComplete()
      }
      // Allow escape to skip intro (for development/testing)
      if (e.key === 'Escape') {
        handleComplete()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showButton, handleComplete])

  return (
    <div className={`intro-animation-overlay ${fadeOut ? 'fade-out' : ''}`}>
      <iframe 
        src={backgroundUrl}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 0,
          backgroundColor: '#000'
        }}
        title="Background Animation"
      />
      
      <div className="intro-content">
        {showText && (
          <h1 className={`intro-title ${showText ? 'visible shimmer' : ''}`}>
            {textLetters.map((letter, index) => (
              <span
                key={index}
                className="letter"
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {letter === ' ' ? '\u00A0' : letter}
              </span>
            ))}
          </h1>
        )}
      </div>

      {showButton && (
        <>
          <button
            className={`intro-continue-button ${showButton ? 'visible' : ''}`}
            onClick={handleComplete}
            aria-label="Continue to app"
          >
            <span>Continue</span>
            <ArrowRight size={20} />
          </button>
          <p className={`intro-hint ${showButton ? 'visible' : ''}`}>
            Press Enter to continue
          </p>
        </>
      )}

    </div>
  )
}