import { invoke } from '@tauri-apps/api/core'
import { platform } from '@tauri-apps/plugin-os'
import { BaseDirectory, readTextFile, writeTextFile, exists } from '@tauri-apps/plugin-fs'

const SERVICE_NAME = "open-chat"
const KEYS_FILE = "keys.enc"

const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development'

const ENCRYPTION_KEY = "open-chat-2024-secure-key-storage-v1-dev-only"

const keyCache = new Map<string, string>()
let fileKeysData: Record<string, string> = {}
let fileStorageInitialized = false
let cachedPlatform: string | null = null

function getPlatform(): string {
  if (cachedPlatform === null) {
    cachedPlatform = platform()
  }
  return cachedPlatform
}

function shouldUseFileStorage(): boolean {
  const plat = getPlatform()
  return isDev || plat === 'android'
}

function isIOS(): boolean {
  return getPlatform() === 'ios'
}

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

async function loadFileKeys(): Promise<void> {
  try {
    if (await exists(KEYS_FILE, { baseDir: BaseDirectory.AppData })) {
      const encrypted = await readTextFile(KEYS_FILE, { baseDir: BaseDirectory.AppData })
      const decrypted = simpleDecrypt(encrypted)
      if (decrypted) {
        fileKeysData = JSON.parse(decrypted)
        Object.entries(fileKeysData).forEach(([key, value]) => {
          keyCache.set(key, value)
        })
      }
    }
  } catch (error) {
    console.error('Failed to load keys from file:', error)
    fileKeysData = {}
  }
}

async function saveFileKeys(): Promise<void> {
  try {
    const encrypted = simpleEncrypt(JSON.stringify(fileKeysData))
    await writeTextFile(KEYS_FILE, encrypted, { baseDir: BaseDirectory.AppData })
  } catch (error) {
    console.error('Failed to save keys to file:', error)
    throw error
  }
}

async function ensureFileStorageInitialized() {
  if (!fileStorageInitialized) {
    await loadFileKeys()
    fileStorageInitialized = true
  }
}

async function iosKeychainSave(key: string, value: string): Promise<void> {
  await invoke('keychain_save', { key, value })
}

async function iosKeychainGet(key: string): Promise<string | null> {
  try {
    return await invoke<string | null>('keychain_get', { key })
  } catch {
    return null
  }
}

async function iosKeychainDelete(key: string): Promise<void> {
  await invoke('keychain_delete', { key })
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
    if (shouldUseFileStorage()) {
      await ensureFileStorageInitialized()
      fileKeysData[key] = apiKey
      keyCache.set(key, apiKey)
      await saveFileKeys()
      console.log(`Saved API key for ${providerId} to encrypted file`)
    } else if (isIOS()) {
      await iosKeychainSave(key, apiKey)
      keyCache.set(key, apiKey)
      console.log(`Saved API key for ${providerId} to iOS keychain`)
    } else {
      await keyringSet(SERVICE_NAME, key, apiKey)
      keyCache.set(key, apiKey)
      console.log(`Saved API key for ${providerId} to system keyring`)
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
    if (shouldUseFileStorage()) {
      await ensureFileStorageInitialized()
      const value = fileKeysData[key] || null
      if (value) {
        keyCache.set(key, value)
      }
      return value
    } else if (isIOS()) {
      const value = await iosKeychainGet(key)
      if (value) {
        keyCache.set(key, value)
      }
      return value
    } else {
      const value = await keyringGet(SERVICE_NAME, key)
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

    if (shouldUseFileStorage()) {
      await ensureFileStorageInitialized()
      delete fileKeysData[key]
      await saveFileKeys()
      console.log(`Deleted API key for ${providerId} from encrypted file`)
    } else if (isIOS()) {
      await iosKeychainDelete(key)
      console.log(`Deleted API key for ${providerId} from iOS keychain`)
    } else {
      await keyringDelete(SERVICE_NAME, key)
      console.log(`Deleted API key for ${providerId} from system keyring`)
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
    if (shouldUseFileStorage()) {
      await ensureFileStorageInitialized()
      return key in fileKeysData
    } else if (isIOS()) {
      const apiKey = await iosKeychainGet(key)
      return apiKey !== null && apiKey !== undefined && apiKey.trim() !== ''
    } else {
      const apiKey = await keyringGet(SERVICE_NAME, key)
      return apiKey !== null && apiKey !== undefined && apiKey.trim() !== ''
    }
  } catch (error) {
    return false
  }
}
