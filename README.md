# Open Chat

<div align="center">
  <img src="public/Logo.png" alt="Open Chat Logo" width="120" height="120">
  <h3>A modern, cross-platform AI chat client</h3>
  <p>Built with Tauri, React, and TypeScript</p>
</div>

## Why Open Chat?

When building Open Chat, there was a clear problem: many existing AI chat applications are frustrating to use, expensive to subscribe to, and don't guarantee your privacy. The goal was to create something better - an app that's simple, user-friendly, and powerful enough to take you as far as you want to go.

Why the name Open Chat? It's straightforward and represents our commitment to transparency. Help us make this app popular enough to get added to Homebrew!

## Features

- **Multi-Provider Support** - Connect to Anthropic, OpenAI, Ollama, and custom endpoints
- **Secure API Key Management** - Keys stored in system keychain, never in files
- **Persistent Conversations** - SQLite database for chat history
- **Cross-Platform** - Desktop (Windows, macOS, Linux) and mobile (iOS, Android)
- **Keyboard Shortcuts** - Quick access to common actions
- **Modern UI** - Dark/light themes with responsive design
- **Model Capabilities** - Automatic detection of vision, audio, and file support
- **Conversation Management** - Organize and search your chat history

## Quick Start

### Prerequisites

1. **Install Rust**
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Install Bun** (if not already installed)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/open-chat.git
   cd open-chat
   ```

2. **Install dependencies**
   ```bash
   bun install
   ```

3. **Run the application**
   ```bash
   bun run dev:desktop
   ```

## Development

### Available Commands

| Command | Description |
|---------|-------------|
| `bun run dev:desktop` | Start development server with hot reload |
| `bun run dev` | Start frontend development server only |
| `bun run build` | Build frontend assets only |
| `bun run dev:ios` | iOS simulator development |
| `bun run dev:android` | Android emulator development |
| `bun run build:ios` | Build iOS application |
| `bun run build:android` | Build Android application |

### Project Structure

```
src/
├── components/          # React components
│   ├── Chat/           # Chat interface components
│   ├── Settings/       # Settings and configuration
│   ├── Sidebar/        # Navigation and conversation list
│   └── Toast/          # Notification system
├── hooks/              # Custom React hooks
├── shared/             # Stores and utilities
│   ├── chatStore.ts    # SQLite database management
│   ├── settingsStore.ts # Key-value settings
│   └── constants.ts    # App constants
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
    └── secureStorage.ts # System keychain integration

src-tauri/              # Rust backend
├── src/                # Rust source code
├── tauri.conf.json     # Tauri configuration
└── Cargo.toml          # Rust dependencies
```

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [WebStorm](https://www.jetbrains.com/webstorm/) + [Rust](https://plugins.jetbrains.com/plugin/8182-rust)

## Configuration

### Adding AI Providers

1. Open Settings (Cmd/Ctrl + ,)
2. Navigate to "Providers" tab
3. Click "Add Provider"
4. Configure endpoint and API key
5. Select available models

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + N | New conversation |
| Cmd/Ctrl + T | New conversation (alt) |
| Cmd/Ctrl + , | Open settings |
| Cmd/Ctrl + / | Show shortcuts |
| Cmd/Ctrl + L | Focus input |
| Cmd/Ctrl + S | Toggle sidebar |
| Esc | Close modals |

## Mobile Development

### iOS Setup

1. **Install Xcode** from the App Store
2. **Install iOS targets**
   ```bash
   rustup target add aarch64-apple-ios aarch64-apple-ios-sim
   ```
3. **Run on simulator**
   ```bash
   bun run dev:ios
   ```

#### iOS Troubleshooting

If the iOS build fails after disconnecting a device or interrupting a build (e.g., "No such file or directory" errors during Xcode library linking), clean the build cache:

```bash
cd src-tauri && cargo clean
```

If that doesn't work, also clear Xcode's derived data:

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData/open-chat-*
```

### Android Setup

1. **Install Android Studio**
2. **Install Android targets**
   ```bash
   rustup target add aarch64-linux-android armv7-linux-androideabi
   ```
3. **Run on emulator**
   ```bash
   bun run dev:android
   ```

## Database Schema

Open Chat uses SQLite for persistent storage:

- **conversations** - Chat sessions with metadata
- **messages** - Individual messages with role and content
- **providers** - AI provider configurations

Settings are stored in a separate key-value store (`settings.json`), and API keys are secured in the system keychain.

## Security

- API keys stored in system keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- No sensitive data stored in configuration files
- Database uses foreign key constraints for data integrity
- Secure inter-process communication between frontend and Tauri backend

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Brand assets and logo usage

The following brand assets are NOT licensed under Apache-2.0. All rights are reserved by Weiss Solutions LLC:

- `src/assets/Logo.svg`
- `public/Logo.png`
- Any other `Logo`-named assets or components
- The name and visual identity "Open Chat" (word mark and logo)
- All application icons referenced in `src-tauri/tauri.conf.json` and generated via Tauri Icon (files under `icons/` when present)

No license or right is granted to use these brand assets, including in product names, domain names, or in ways that imply sponsorship or endorsement. Limited descriptive, non-misleading references to the project name are permitted where necessary to identify the software.

Copyright © Weiss Solutions LLC. Unregistered trademark rights are claimed in the name and logo to the fullest extent permitted by applicable law.

## Support

- Create an [issue](https://github.com/your-username/open-chat/issues) for bug reports
- Start a [discussion](https://github.com/your-username/open-chat/discussions) for questions
- Check the [documentation](https://github.com/your-username/open-chat/wiki) for guides
