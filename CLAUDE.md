# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open Chat is a modern desktop AI chat application built with Tauri v2, React, TypeScript, and Tailwind CSS. It's designed as a cross-platform client for communicating with various AI providers (Anthropic Claude, OpenAI, local models via Ollama, etc.).

## Development Commands

### Core Commands
- `bun tauri dev` - Start development server with hot reload
- `bun tauri build` - Build production application
- `bun dev` - Start frontend development server only (without Tauri)
- `bun run build` - Build frontend assets only

### Mobile Development
- `bun tauri ios dev` - iOS simulator development
- `bun tauri android dev` - Android emulator development

### Prerequisites
- Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Install Bun: `curl -fsSL https://bun.sh/install | bash`
- Install dependencies: `bun install`

## Architecture

### Data Layer
The app uses a dual-storage approach:
- **SQLite Database** (`src/shared/chatStore.ts`): Manages conversations, messages, and AI provider configurations
- **Key-Value Store** (`src/shared/settingsStore.ts`): User preferences and app settings stored in `settings.json`
- **System Keychain** (`src/utils/secureStorage.ts`): Secure API key storage using `tauri-plugin-keyring-api`

### Core Components Structure
- **App.tsx**: Main application layout with sidebar/chat split view
- **Sidebar** (`src/components/Sidebar/`): Conversation management and navigation
- **Chat** (`src/components/Chat/`): Message display, input, and conversation UI
- **Settings** (`src/components/Settings/`): Provider configuration and app preferences
- **Toast** (`src/components/Toast/`): Global notification system

### State Management
- Uses React hooks and context for local state
- Database operations are asynchronous through singleton instances
- Settings stored in Tauri's persistent key-value store
- API keys secured in system keychain

### Key Features
- **Multi-Provider Support**: Configurable AI providers with different models
- **Conversation Management**: SQLite-backed persistent chat history
- **Keyboard Shortcuts**: Global hotkeys defined in `src/shared/constants.ts`
- **Cross-Platform**: Desktop (Windows, macOS, Linux) and mobile (iOS, Android)
- **Secure API Keys**: System keychain integration
- **Draggable Window**: Custom title bar with drag functionality

### Provider System
AI providers are managed through:
- Database storage of provider configs (`chatStore.ts`)
- Secure API key storage (`secureStorage.ts`) 
- Type definitions in `src/types/provider.ts`
- Model capabilities tracking (vision, audio, files)

### Styling
- Tailwind CSS with custom theme system
- Dark/light/system theme support
- Responsive design with sidebar width persistence
- Custom scrollbars and animations

## Important Notes

### Database Schema
The SQLite database auto-creates tables for:
- `conversations` (id, title, timestamps)
- `messages` (conversation_id, role, content, timestamp)  
- `providers` (name, api_key, base_url, model, is_active)

### Security
- API keys stored in system keychain, never in files
- Database uses foreign key constraints
- No sensitive data in version control

### Platform-Specific
- Window dragging implemented for custom title bar
- iOS/Android mobile builds supported
- Uses Tauri v2 with plugin architecture

## Development Workflow Notes
- Most of the time I have the app running already, so if you try running it, it'll fail. There's already hot-reload, so you can just tell me to look at the app and see if things are fixed instead of running it yourself.

## Build Checks
- When you're done doing anything, run `bun run build` to make sure there aren't any errors

<changelog>
    Before adding a changelog entry, check to see if one already exists for that feature in the unreleased section
    Add changelog entries for user-facing features
    Add changelog entries for bug fixes that affect the user
    Don't add changelog entries for internal non-user facing updates
    Don't add changelog entries when you're making updates to a feature that's already mentioned in the unreleased section
    <format>
        Write from user's perspective: "Fixed issue where..." not "Fixed bug in..."
        One line per change under the appropriate category (Added/Changed/Fixed)
        Be specific but concise
    </format>
</changelog>

## Documentation Libraries
Get documentation using context7 with these library IDs as needed:

### Core Technologies
- **Tauri**: `/tauri-apps/tauri` - Main framework for desktop/mobile apps
- **React**: `/reactjs/react.dev` - UI library 
- **TypeScript**: `/microsoft/typescript` - Language and type system
- **Tailwind CSS**: `/tailwindlabs/tailwindcss.com` - Utility-first CSS framework
- **Vite**: `/vitejs/vite` - Build tool and dev server

### iOS/Swift Development  
- **Swift**: `/swiftlang/swift` - Swift language documentation
- **SwiftUI**: `/zhangyu1818/swiftui.md` - SwiftUI framework (15k+ snippets)

### Rust Development
- **Rust**: `/rust-lang/rust` - Rust language documentation

### Tauri Plugins
- **Tauri Plugins**: `/tauri-apps/plugins-workspace` - All official Tauri plugins
- **Tauri Plugin SQL**: `/tauri-apps/tauri-plugin-sql` - SQLite plugin
- **Tauri Plugin Shell**: `/tauri-apps/tauri-plugin-shell` - Shell commands plugin

### Supporting Libraries
- **React Markdown**: Search for "react-markdown" if needed
- **Lucide React**: Search for "lucide-react" icons if needed
