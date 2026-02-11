import { invoke } from '@tauri-apps/api/core'

/**
 * Toggles the mini window visibility
 * @returns Promise<boolean> - true if window is now visible, false if hidden
 */
export async function toggleMiniWindow(): Promise<boolean> {
  try {
    return await invoke<boolean>('toggle_mini_window')
  } catch (error) {
    console.error('Failed to toggle mini window:', error)
    throw error
  }
}

/**
 * Closes the mini window completely (destroys it)
 */
export async function closeMiniWindow(): Promise<void> {
  try {
    await invoke<void>('close_mini_window')
  } catch (error) {
    console.error('Failed to close mini window:', error)
    throw error
  }
}

/**
 * Shows the main window (unhides it from dock/taskbar)
 */
export async function showMainWindow(): Promise<void> {
  try {
    await invoke<void>('show_main_window')
  } catch (error) {
    console.error('Failed to show main window:', error)
    throw error
  }
}

/**
 * Checks if we're currently running in the mini window
 * Uses consistent detection based on URL parameters
 */
export function isMiniWindow(): boolean {
  const params = new URLSearchParams(window.location.search)
  return params.get('window') === 'mini'
}

/**
 * Gets the window type for styling and behavior purposes
 */
export function getWindowType(): 'main' | 'mini' {
  return isMiniWindow() ? 'mini' : 'main'
}

/**
 * Registers a global shortcut for toggling the mini window
 * Returns a cleanup function to unregister the shortcut
 */
export async function registerGlobalShortcut(shortcut: string): Promise<() => Promise<void>> {
  if (!shortcut || shortcut.trim() === '') {
    return async () => {} // No-op cleanup for empty shortcuts
  }

  try {
    await invoke<void>('register_global_shortcut', { shortcut })
    
    // Return cleanup function
    return async () => {
      try {
        await invoke<void>('unregister_global_shortcut', { shortcut })
      } catch (error) {
        console.error('Failed to unregister global shortcut:', error)
      }
    }
  } catch (error) {
    console.error('Failed to register global shortcut:', error)
    throw error
  }
}