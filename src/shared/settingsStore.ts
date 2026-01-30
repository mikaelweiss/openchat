import { Store } from '@tauri-apps/plugin-store'

// Settings Store (Key-Value)
class SettingsStore {
  private store: Store | null = null

  async init() {
    if (!this.store) {
      this.store = await Store.load('settings.json')
    }
    return this.store
  }

  async get<T>(key: string): Promise<T | null> {
    const store = await this.init()
    const result = await store.get<T>(key)
    return result ?? null
  }

  async set<T>(key: string, value: T): Promise<void> {
    const store = await this.init()
    await store.set(key, value)
    await store.save()
  }

  async has(key: string): Promise<boolean> {
    const store = await this.init()
    return await store.has(key)
  }

  async delete(key: string): Promise<boolean> {
    const store = await this.init()
    const result = await store.delete(key)
    await store.save()
    return result
  }

  async clear(): Promise<void> {
    const store = await this.init()
    await store.clear()
    await store.save()
  }
}

// Export singleton instance
export const settings = new SettingsStore()

// Common settings keys (for type safety)
export const SETTINGS_KEYS = {
  THEME: 'theme',
  SEND_MESSAGE: 'sendMessage',
  GLOBAL_HOTKEY: 'globalHotkey',
  SHOW_PRICING: 'showPricing',
  SHOW_CONVERSATION_SETTINGS: 'showConversationSettings',
  PROVIDERS: 'providers',
  HAS_COMPLETED_ONBOARDING: 'hasCompletedOnboarding',
  USER_NAME: 'userName',
  HAS_SHOWN_INTRO: 'hasShownIntro',
  TITLE_GENERATION_MODEL: 'titleGenerationModel',
} as const