import { useState, useEffect } from 'react'
import { platform } from '@tauri-apps/plugin-os'

export type PlatformType = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown'

interface PlatformState {
  platform: PlatformType
  isMobile: boolean
  isIOS: boolean
  isAndroid: boolean
  isDesktop: boolean
  isLoading: boolean
}

let cachedPlatform: PlatformType | null = null

export function usePlatform(): PlatformState {
  const [state, setState] = useState<PlatformState>({
    platform: cachedPlatform || 'unknown',
    isMobile: cachedPlatform === 'ios' || cachedPlatform === 'android',
    isIOS: cachedPlatform === 'ios',
    isAndroid: cachedPlatform === 'android',
    isDesktop: cachedPlatform === 'macos' || cachedPlatform === 'windows' || cachedPlatform === 'linux',
    isLoading: !cachedPlatform
  })

  useEffect(() => {
    if (cachedPlatform) return

    const detectPlatform = async () => {
      try {
        const os = await platform()
        const normalizedPlatform = os.toLowerCase() as PlatformType
        cachedPlatform = normalizedPlatform

        const isMobile = normalizedPlatform === 'ios' || normalizedPlatform === 'android'
        const isDesktop = normalizedPlatform === 'macos' || normalizedPlatform === 'windows' || normalizedPlatform === 'linux'

        setState({
          platform: normalizedPlatform,
          isMobile,
          isIOS: normalizedPlatform === 'ios',
          isAndroid: normalizedPlatform === 'android',
          isDesktop,
          isLoading: false
        })
      } catch (error) {
        console.warn('Failed to detect platform:', error)
        setState(prev => ({ ...prev, isLoading: false }))
      }
    }

    detectPlatform()
  }, [])

  return state
}
