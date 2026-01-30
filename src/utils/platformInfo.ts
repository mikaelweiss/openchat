import { platform, arch, version } from '@tauri-apps/plugin-os'
import { getVersion } from '@tauri-apps/api/app'
import { currentMonitor } from '@tauri-apps/api/window'

export interface PlatformInfo {
  os: string
  osVersion: string
  arch: string
  appVersion: string
  screenWidth?: number
  screenHeight?: number
  scaleFactor?: number
}

class PlatformInfoService {
  private cachedInfo: PlatformInfo | null = null

  public async getPlatformInfo(): Promise<PlatformInfo> {
    if (this.cachedInfo) {
      return this.cachedInfo
    }

    try {
      const [osName, osVersion, archName, appVersion] = await Promise.all([
        platform(),
        version(),
        arch(),
        getVersion()
      ])

      let screenInfo: Partial<PlatformInfo> = {}
      try {
        const monitor = await currentMonitor()
        if (monitor) {
          screenInfo = {
            screenWidth: monitor.size.width,
            screenHeight: monitor.size.height,
            scaleFactor: monitor.scaleFactor
          }
        }
      } catch (error) {
        console.warn('Failed to get monitor info:', error)
      }

      this.cachedInfo = {
        os: osName,
        osVersion,
        arch: archName,
        appVersion,
        ...screenInfo
      }

      return this.cachedInfo
    } catch (error) {
      console.error('Failed to get platform info:', error)
      return {
        os: 'unknown',
        osVersion: 'unknown',
        arch: 'unknown',
        appVersion: 'unknown'
      }
    }
  }

  public clearCache(): void {
    this.cachedInfo = null
  }
}

export const platformInfo = new PlatformInfoService()
export default platformInfo