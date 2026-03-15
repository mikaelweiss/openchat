import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

/**
 * Fetch wrapper that uses Tauri's HTTP plugin (Rust-side HTTP client).
 * This bypasses CORS restrictions, making it work with any endpoint
 * including self-hosted/LAN servers (e.g. LM Studio over Tailscale).
 */
export const httpFetch: typeof globalThis.fetch = tauriFetch
