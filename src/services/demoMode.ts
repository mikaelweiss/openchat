import { Provider } from '../types/provider'

export const DEMO_PROVIDER: Provider = {
  id: 'demo',
  name: 'Open Chat Demo Provider',
  endpoint: '',
  models: ['demo-v1'],
  enabledModels: ['demo-v1'],
  modelCapabilities: {
    'demo-v1': { vision: false, audio: false, files: false, multimodal: false, image: false, thinking: false, tools: false, webSearch: false }
  },
  connected: true,
  isLocal: true,
  hasApiKey: false
}

const DEMO_FUN_FACTS = [
  "Open Chat is a modern AI chat application built with Tauri, React, and TypeScript. It's designed to give you full control over which AI providers you use!",
  "Did you know? Open Chat supports multiple AI providers simultaneously — you can chat with OpenAI, Anthropic, Google, and many more, all from a single app.",
  "Your API keys in Open Chat are stored securely on your device — never in plain text files.",
  "Open Chat is fully cross-platform! It runs natively on macOS, Windows, Linux, iOS, and Android — all from a single codebase powered by Tauri v2.",
  "Open Chat is open source! You can inspect every line of code, contribute features, or fork it to build your own custom AI chat client.",
  "Open Chat supports dark mode, light mode, and automatic system theme detection — your eyes will thank you during those late-night coding sessions.",
  "Open Chat tracks token usage and estimates costs per message, so you always know how much your AI conversations are costing you.",
  "Open Chat supports vision-capable models — you can send images directly in your messages and get AI analysis of screenshots, photos, and diagrams.",
  "Every conversation in Open Chat is stored locally on your device. Your chat history is yours and stays on your machine.",
  "Open Chat supports file attachments including PDFs, code files, and documents — share them with your AI assistant for analysis.",
]

export function getRandomFunFact(): string {
  return DEMO_FUN_FACTS[Math.floor(Math.random() * DEMO_FUN_FACTS.length)]
}
