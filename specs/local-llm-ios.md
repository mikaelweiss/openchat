# Local LLM Integration for iOS (MLX Swift)

<!-- SPEC -->

## Summary

Add true on-device LLM inference for iOS using Apple's MLX framework via a Tauri Swift plugin. Users can download pre-approved mobile-optimized models and chat without network connectivity.

## Behaviors

### Provider Management
- Local models appear as a provider type called "Local" in the provider list
- User cannot add "Local" as a provider until at least one model is downloaded
- If user deletes all local models, the "Local" provider is automatically removed
- Local provider shows currently loaded model name and status (loaded/unloaded)

### Model Management
- Settings includes a "Local Models" section showing downloaded models
- Pre-approved model list with mobile-optimized options:
  - Llama 3.2 1B (Q4_K_M) - ~700MB, requires 2GB RAM
  - Phi-3 Mini (Q4_K_M) - ~2.2GB, requires 4GB RAM
  - Qwen2.5 0.5B (Q4_K_M) - ~400MB, requires 1GB RAM
  - SmolLM2 1.7B (Q4_K_M) - ~1GB, requires 3GB RAM
- Models stored in app's Documents folder (survives updates, user-accessible)
- Download shows progress bar with percentage and bytes downloaded
- User can delete models individually to free storage
- Display model size on disk and RAM requirement for each model

### Model Loading
- Prevent loading models that exceed available device RAM (show error message)
- Model loading shows progress indicator (can take 10-30 seconds)
- Only one model can be loaded at a time
- Unloading previous model before loading new one is automatic
- Model unloads automatically when app enters background (memory pressure)

### Inference
- Streaming token-by-token generation matching existing chat UX
- Supports conversation history (multi-turn chat)
- Supports system prompts
- User can abort generation mid-stream (existing stop button)
- Local inference can participate in multi-model responses alongside cloud providers
- Display tokens/second in message metadata after generation completes

### Error Handling
- Network errors during download: show retry button, preserve partial download if possible
- Insufficient storage: show required vs available space before download
- Insufficient RAM: prevent model load, show friendly message with RAM requirements
- Model corruption: detect on load, prompt to re-download
- Generation errors: show error in chat, allow retry

## Out of Scope

- Android support (future phase - would use llama.cpp Rust fallback)
- Custom model imports (only pre-approved models from curated list)
- Model fine-tuning or training
- Ollama integration on mobile (not viable - no native iOS support)
- Apple Foundation Models framework (requires iOS 26+, less flexible)
- Vision/multimodal models (text-only for MVP)

## Architecture

```
React Frontend
    │
    └─ localLlmService.ts ─── invoke() ──→ Tauri Plugin
                                                │
                                                ▼
                                    tauri-plugin-local-llm (iOS)
                                                │
                                                ▼
                                          MLX Swift
                                                │
                                                ▼
                                    Metal + Neural Engine
```

## Changes Required

### New: `src-tauri/tauri-plugin-local-llm/`
**Create:** New Tauri plugin package with iOS Swift implementation

Structure:
```
tauri-plugin-local-llm/
├── Cargo.toml                    # Rust plugin manifest
├── build.rs                      # Build configuration
├── src/
│   ├── lib.rs                    # Plugin registration, command definitions
│   ├── commands.rs               # Tauri command implementations
│   └── models.rs                 # Model metadata and curated list
├── ios/
│   ├── Package.swift             # Swift package manifest
│   └── Sources/
│       ├── LocalLlmPlugin.swift  # Main plugin class
│       ├── ModelManager.swift    # Download, storage, validation
│       └── InferenceEngine.swift # MLX integration, generation
└── permissions/
    └── default.toml              # Plugin permissions
```

### New: `src/services/localLlmService.ts`
**Create:** Frontend service for local LLM operations

```typescript
interface LocalLlmService {
  // Model management
  getAvailableModels(): Promise<ModelInfo[]>
  getDownloadedModels(): Promise<DownloadedModel[]>
  downloadModel(modelId: string, onProgress: (progress: number) => void): Promise<void>
  deleteModel(modelId: string): Promise<void>

  // Inference
  loadModel(modelId: string): Promise<void>
  unloadModel(): Promise<void>
  getLoadedModel(): Promise<string | null>
  generate(options: GenerateOptions): Promise<void>
  abortGeneration(): void

  // Status
  getSystemInfo(): Promise<{ availableRam: number; usedStorage: number }>
}
```

### New: `src/types/localLlm.ts`
**Create:** TypeScript type definitions

```typescript
interface ModelInfo {
  id: string
  name: string
  description: string
  sizeBytes: number
  requiredRamBytes: number
  quantization: string
  downloadUrl: string
}

interface DownloadedModel extends ModelInfo {
  localPath: string
  downloadedAt: Date
}

interface GenerateOptions {
  messages: ChatMessage[]
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
  onToken: (token: string) => void
  onComplete: (stats: GenerationStats) => void
  onError: (error: string) => void
}

interface GenerationStats {
  tokensGenerated: number
  tokensPerSecond: number
  totalTimeMs: number
}
```

### New: `src/components/Settings/LocalModelManager.tsx`
**Create:** UI component for managing local models

Features:
- List of pre-approved models with download buttons
- Downloaded models section with delete buttons
- Storage usage display
- RAM compatibility indicators per model
- Download progress bar

### Modify: `src-tauri/Cargo.toml`
**Add:** Plugin dependency

```toml
[dependencies]
tauri-plugin-local-llm = { path = "./tauri-plugin-local-llm" }
```

### Modify: `src-tauri/src/lib.rs`
**Add:** Plugin registration

```rust
.plugin(tauri_plugin_local_llm::init())
```

### Modify: `src/types/provider.ts`
**Add:** Local inference fields to Provider type

```typescript
interface Provider {
  // ... existing fields
  isLocalInference?: boolean
  localModelId?: string
}
```

### Modify: `src/services/chatService.ts:~280`
**Add:** Local inference routing in `sendMessageToSingleModel`

Before the existing HTTP fetch logic, add check:
```typescript
if (modelConfig.isLocalInference) {
  return this.sendMessageToLocalModel(modelConfig, messages, callbacks)
}
```

Add new method `sendMessageToLocalModel` that:
- Calls localLlmService.generate()
- Maps callbacks to existing onStreamChunk/onStreamComplete pattern
- Handles abort via existing AbortController

### Modify: `src/components/Settings/SettingsModal.tsx`
**Add:** Local Models section in settings tabs

### Modify: `src/hooks/useSettings.ts`
**Add:** Functions for local model provider management

- `addLocalProvider(modelId: string)` - Add local provider after model download
- `removeLocalProvider()` - Remove when last model deleted
- Track loaded model state

## Documentation

### MLX Swift LLM Integration

**Relevant packages:**
- `mlx-swift` - Core MLX framework
- `mlx-swift-examples/Libraries/LLM` - LLM utilities

**Loading a model:**
```swift
import LLM

let modelConfiguration = ModelConfiguration(id: "mlx-community/Llama-3.2-1B-Instruct-4bit")
let model = try await LLM.load(configuration: modelConfiguration)
```

**Generating text:**
```swift
let prompt = "Hello, how are you?"
for await token in try model.generate(prompt: prompt) {
    // Stream each token
    print(token, terminator: "")
}
```

**Link:** https://github.com/ml-explore/mlx-swift-examples

### Tauri iOS Plugin Development

**Swift plugin structure:**
```swift
import Tauri

class LocalLlmPlugin: Plugin {
    @objc func loadModel(_ invoke: Invoke) {
        // Implementation
        invoke.resolve(["success": true])
    }
}
```

**FFI for Rust↔Swift:**
```swift
@_silgen_name("local_llm_load_model")
public func loadModel(path: UnsafePointer<CChar>) -> Bool
```

**Link:** https://v2.tauri.app/develop/plugins/develop-mobile/

### Tauri Event Streaming

**Emitting events from plugin:**
```rust
app.emit_all("local_llm_token", TokenPayload { token, model_id })?;
```

**Listening in frontend:**
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen('local_llm_token', (event) => {
  onToken(event.payload.token);
});
```

**Link:** https://v2.tauri.app/develop/calling-rust/#event-system

## Implementation Order

1. **Create plugin scaffold** - Set up tauri-plugin-local-llm directory structure, Cargo.toml, Package.swift
2. **Implement model metadata** - Curated model list with sizes/requirements in Rust
3. **Build Swift ModelManager** - Download, storage, deletion, validation
4. **Build Swift InferenceEngine** - MLX integration, model loading, generation
5. **Wire FFI bridge** - Connect Rust commands to Swift implementations
6. **Create localLlmService.ts** - Frontend service with Tauri invoke calls
7. **Create LocalModelManager.tsx** - Settings UI for model management
8. **Integrate with chatService** - Route local providers to localLlmService
9. **Add provider management** - Auto-add/remove local provider based on models
10. **Polish** - Error handling, progress indicators, memory management

## Testing Checklist

- [ ] Download a model shows progress and completes successfully
- [ ] Downloaded model appears in list with correct size
- [ ] Delete model removes from disk and list
- [ ] Cannot add Local provider without downloaded models
- [ ] Deleting last model removes Local provider
- [ ] Model loads successfully on device with sufficient RAM
- [ ] Model fails to load with helpful error on low-RAM device
- [ ] Generation produces streaming tokens in chat
- [ ] Stop button aborts generation mid-stream
- [ ] Multi-turn conversation maintains context
- [ ] System prompt is respected
- [ ] Local + cloud provider concurrent response works
- [ ] App backgrounding unloads model without crash
- [ ] Tokens/second displayed after generation
