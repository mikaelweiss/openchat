import { invoke } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'
import { BaseDirectory, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'

const SERVICE_NAME = "open-chat"
const KEYS_FILE = "keys.enc"

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'

const ENCRYPTION_KEY = "open-chat-2024-secure-key-storage-v1-dev-only"

function simpleEncrypt(text: string): string {
  let result = ''
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
    )
  }
  return btoa(result)
}

function simpleDecrypt(encrypted: string): string {
  try {
    const decoded = atob(encrypted)
    let result = ''
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(
        decoded.charCodeAt(i) ^ ENCRYPTION_KEY.charCodeAt(i % ENCRYPTION_KEY.length)
      )
    }
    return result
  } catch (error) {
    console.error('Failed to decrypt:', error)
    return ''
  }
}

const keyCache = new Map<string, string>()
let devKeysData: Record<string, string> = {}
let devInitialized = false
let cachedPlatform: string | null = null

function getPlatformType(): 'mobile' | 'desktop' {
  if (cachedPlatform === null) {
    cachedPlatform = platform()
  }
  return (cachedPlatform === 'ios' || cachedPlatform === 'android') ? 'mobile' : 'desktop'
}

async function loadDevKeys(): Promise<void> {
  try {
    if (await exists(KEYS_FILE, { baseDir: BaseDirectory.AppData })) {
      const encrypted = await readTextFile(KEYS_FILE, { baseDir: BaseDirectory.AppData })
      const decrypted = simpleDecrypt(encrypted)
      if (decrypted) {
        devKeysData = JSON.parse(decrypted)
        Object.entries(devKeysData).forEach(([key, value]) => {
          keyCache.set(key, value)
        })
      }
    }
  } catch (error) {
    console.error('Failed to load dev keys:', error)
    devKeysData = {}
  }
}

async function saveDevKeys(): Promise<void> {
  try {
    const encrypted = simpleEncrypt(JSON.stringify(devKeysData))
    await writeTextFile(KEYS_FILE, encrypted, { baseDir: BaseDirectory.AppData })
  } catch (error) {
    console.error('Failed to save dev keys:', error)
    throw error
  }
}

async function ensureDevInitialized() {
  if (!devInitialized) {
    await loadDevKeys()
    devInitialized = true
  }
}

async function keychainSave(key: string, password: string): Promise<void> {
  await invoke('plugin:keychain|save_item', { key, password })
}

async function keychainGet(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>('plugin:keychain|get_item', { key })
  } catch {
    return null
  }
}

async function keychainDelete(key: string): Promise<void> {
  await invoke('plugin:keychain|remove_item', { key })
}

async function keyringSet(service: string, key: string, password: string): Promise<void> {
  const { setPassword } = await import('tauri-plugin-keyring-api')
  await setPassword(service, key, password)
}

async function keyringGet(service: string, key: string): Promise<string | null> {
  const { getPassword } = await import('tauri-plugin-keyring-api')
  return await getPassword(service, key)
}

async function keyringDelete(service: string, key: string): Promise<void> {
  const { deletePassword } = await import('tauri-plugin-keyring-api')
  await deletePassword(service, key)
}

export async function saveApiKey(providerId: string, apiKey: string): Promise<void> {
  const key = `provider-${providerId}`

  try {
    if (isDev) {
      await ensureDevInitialized()
      devKeysData[key] = apiKey
      keyCache.set(key, apiKey)
      await saveDevKeys()
      console.log(`[DEV MODE] Saved API key for ${providerId} to encrypted file`)
    } else {
      const platformType = getPlatformType()

      if (platformType === 'mobile') {
        await keychainSave(key, apiKey)
        console.log(`Saved API key for ${providerId} to mobile keychain`)
      } else {
        await keyringSet(SERVICE_NAME, key, apiKey)
        console.log(`Saved API key for ${providerId} to system keyring`)
      }
      keyCache.set(key, apiKey)
    }
  } catch (error) {
    console.error(`Failed to save API key for provider ${providerId}:`, error)
    throw new Error(`Failed to save API key: ${error}`)
  }
}

export async function getApiKey(providerId: string): Promise<string | null> {
  const key = `provider-${providerId}`

  if (keyCache.has(key)) {
    return keyCache.get(key) || null
  }

  try {
    if (isDev) {
      await ensureDevInitialized()
      const value = devKeysData[key] || null
      if (value) {
        keyCache.set(key, value)
      }
      return value
    } else {
      const platformType = getPlatformType()
      let value: string | null

      if (platformType === 'mobile') {
        value = await keychainGet(key)
      } else {
        value = await keyringGet(SERVICE_NAME, key)
      }

      if (value) {
        keyCache.set(key, value)
      }
      return value
    }
  } catch (error) {
    console.error(`Failed to get API key for provider ${providerId}:`, error)
    return null
  }
}

export async function deleteApiKey(providerId: string): Promise<void> {
  const key = `provider-${providerId}`

  try {
    keyCache.delete(key)

    if (isDev) {
      await ensureDevInitialized()
      delete devKeysData[key]
      await saveDevKeys()
      console.log(`[DEV MODE] Deleted API key for ${providerId} from encrypted file`)
    } else {
      const platformType = getPlatformType()

      if (platformType === 'mobile') {
        await keychainDelete(key)
        console.log(`Deleted API key for ${providerId} from mobile keychain`)
      } else {
        await keyringDelete(SERVICE_NAME, key)
        console.log(`Deleted API key for ${providerId} from system keyring`)
      }
    }
  } catch (error) {
    console.error(`Failed to delete API key for provider ${providerId}:`, error)
    throw new Error(`Failed to delete API key: ${error}`)
  }
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  const key = `provider-${providerId}`

  if (keyCache.has(key)) {
    return true
  }

  try {
    if (isDev) {
      await ensureDevInitialized()
      return key in devKeysData
    } else {
      const platformType = getPlatformType()
      let apiKey: string | null

      if (platformType === 'mobile') {
        apiKey = await keychainGet(key)
      } else {
        apiKey = await keyringGet(SERVICE_NAME, key)
      }

      return apiKey !== null && apiKey !== undefined && apiKey.trim() !== ''
    }
  } catch (error) {
    return false
  }
}
